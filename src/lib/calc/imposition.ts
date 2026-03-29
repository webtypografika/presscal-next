// PressCal Pro — Imposition Engine
// Ported from mod_imposer.js — all 7 modes with exact algorithms
// Pure functions: no DB, no side effects

import type {
  ImpositionMode, ImpositionResult, ImpositionCell,
  BookletSignatureMap, CutStackPosition, CutStackOrder,
  GangRunData, StepBlock, WorkTurnType,
} from '@/types/calculator';

// ─── SHARED TYPES ───

export interface PrintableArea {
  paperW: number;    // mm
  paperH: number;    // mm
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
}

export interface ImpositionInput {
  mode: ImpositionMode;
  trimW: number;         // finished piece width mm
  trimH: number;         // finished piece height mm
  bleed: number;         // mm each side
  qty: number;
  sides: 1 | 2;
  gutter: number;        // mm between cells
  area: PrintableArea;
  forceUps?: number;
  forceCols?: number;
  forceRows?: number;
  rotation?: number;  // degrees (0-359)

  // Booklet/PB specific
  pages?: number;        // total pages for booklet/PB
  paperThickness?: number; // mm per sheet (for creep)

  // Cut & Stack specific
  stackOrder?: CutStackOrder;
  stackCustomOrder?: Record<number, number>;  // posIdx → stackNum
  stackStartNum?: number;

  // Gang Run specific
  gangCellAssign?: Record<number, number>;     // posIdx → front page
  gangCellAssignBack?: Record<number, number>; // posIdx → back page
  gangCellQty?: Record<number, number>;        // posIdx → qty
  gangAutoOptimize?: boolean;
  gangPageCount?: number;

  // Step Multi specific
  stepBlocks?: StepBlock[];

  // Work & Turn specific
  turnType?: WorkTurnType;
}

// ─── CORE HELPERS ───

/** How many cells fit along `available` mm with given cellSize and gutter */
export function fitCount(available: number, cellSize: number, gutter: number): number {
  if (cellSize <= 0 || available < cellSize) return 0;
  return 1 + Math.floor((available - cellSize) / (cellSize + gutter));
}

/** Printable dimensions from area spec */
export function printable(a: PrintableArea): { w: number; h: number } {
  return {
    w: a.paperW - a.marginLeft - a.marginRight,
    h: a.paperH - a.marginTop - a.marginBottom,
  };
}

/** Try both orientations, return the one with more UPs */
function bestOrientation(
  pw: number, ph: number,
  cellW: number, cellH: number,
  gutter: number,
): { cols: number; rows: number; rotated: boolean } {
  const cols1 = fitCount(pw, cellW, gutter);
  const rows1 = fitCount(ph, cellH, gutter);
  const ups1 = cols1 * rows1;

  const cols2 = fitCount(pw, cellH, gutter);
  const rows2 = fitCount(ph, cellW, gutter);
  const ups2 = cols2 * rows2;

  if (ups2 > ups1) {
    return { cols: cols2, rows: rows2, rotated: true };
  }
  return { cols: cols1, rows: rows1, rotated: false };
}

/** Build cell array for a grid */
function buildCells(
  cols: number, rows: number,
  cellW: number, cellH: number,
  gutter: number,
  offsetX: number, offsetY: number,
  rotation: number = 0,
): ImpositionCell[] {
  const cells: ImpositionCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        col: c,
        row: r,
        x: offsetX + c * (cellW + gutter),
        y: offsetY + r * (cellH + gutter),
        w: cellW,
        h: cellH,
        pageNum: r * cols + c + 1,
        rotation,
      });
    }
  }
  return cells;
}

/** Extract margin info for PDF export */
function marginInfo(a: PrintableArea) {
  const { w, h } = printable(a);
  return {
    marginL: a.marginLeft,
    marginR: a.marginRight,
    marginT: a.marginTop,
    marginB: a.marginBottom,
    printableW: w,
    printableH: h,
  };
}

/** Calculate waste percentage */
function wastePercent(paperW: number, paperH: number, usedW: number, usedH: number): number {
  const total = paperW * paperH;
  if (total <= 0) return 0;
  const used = usedW * usedH;
  return Math.max(0, Math.min(100, ((total - used) / total) * 100));
}

// ═══════════════════════════════════════════════════════════════
// MODE 1: N-Up — generic tiling
// ═══════════════════════════════════════════════════════════════

export function calcNUp(input: ImpositionInput): ImpositionResult {
  const { trimW, trimH, bleed, qty, sides, gutter, area, forceUps, forceCols, forceRows, rotation } = input;

  const rawCellW = trimW + bleed * 2;
  const rawCellH = trimH + bleed * 2;
  const { w: pw, h: ph } = printable(area);

  // Normalize rotation to 0-359
  const rot = ((rotation || 0) % 360 + 360) % 360;
  // 90°-ish or 270°-ish: cells are placed rotated (swap W↔H)
  let isSwapped = (rot > 45 && rot < 135) || (rot > 225 && rot < 315);
  // Cell dimensions after rotation swap
  let cellW = isSwapped ? rawCellH : rawCellW;
  let cellH = isSwapped ? rawCellW : rawCellH;
  // Content rotation applied to rendering
  let contentRotation = rot;

  let cols: number, rows: number;

  if (forceCols && forceRows) {
    cols = forceCols;
    rows = forceRows;
  } else if (forceCols) {
    cols = forceCols;
    rows = fitCount(ph, cellH, gutter);
  } else if (forceRows) {
    rows = forceRows;
    cols = fitCount(pw, cellW, gutter);
  } else if (forceUps) {
    cols = fitCount(pw, cellW, gutter);
    rows = fitCount(ph, cellH, gutter);
    while (cols * rows > forceUps && cols > 1) cols--;
    while (cols * rows > forceUps && rows > 1) rows--;
  } else {
    // Try both orientations, pick the one with more ups
    const best = bestOrientation(pw, ph, cellW, cellH, gutter);
    cols = best.cols;
    rows = best.rows;
    if (best.rotated) {
      // Rotated orientation gives more ups — swap cell dims
      isSwapped = !isSwapped;
      cellW = isSwapped ? rawCellH : rawCellW;
      cellH = isSwapped ? rawCellW : rawCellH;
      contentRotation = (rot + 90) % 360;
    }
  }

  const ups = Math.max(cols * rows, 1);
  const actualCellW = cellW;
  const actualCellH = cellH;
  const rotated = isSwapped;

  const usedW = cols * actualCellW + (cols - 1) * gutter;
  const usedH = rows * actualCellH + (rows - 1) * gutter;

  const rawSheets = Math.ceil(qty / ups);

  const cells = buildCells(
    cols, rows, actualCellW, actualCellH, gutter,
    area.marginLeft, area.marginTop,
    contentRotation,
  );

  return {
    mode: 'nup',
    pageRotation: contentRotation,
    ups,
    cols,
    rows,
    paperW: area.paperW,
    paperH: area.paperH,
    pieceW: actualCellW,
    pieceH: actualCellH,
    trimW,
    trimH,
    rotated,
    wastePercent: wastePercent(area.paperW, area.paperH, usedW, usedH),
    cells,
    totalSheets: rawSheets,
    ...marginInfo(area),
  };
}

// ═══════════════════════════════════════════════════════════════
// MODE 2: Cut & Stack — N-Up grid + stack numbering for NCR/pads
// ═══════════════════════════════════════════════════════════════

/** Build custom order map for a given preset */
function buildCutStackOrder(
  order: CutStackOrder,
  cols: number,
  rows: number,
  customOrder?: Record<number, number>,
): Record<number, number> {
  const map: Record<number, number> = {};

  if (order === 'column') {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        map[r * cols + c] = c * rows + r;
      }
    }
  } else if (order === 'snake') {
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const useC = (r % 2 === 0) ? c : (cols - 1 - c);
        map[r * cols + useC] = n++;
      }
    }
  } else if (order === 'custom' && customOrder) {
    return { ...customOrder };
  }
  // 'row' = default (empty map → posIdx used as-is)

  return map;
}

/** Calculate cut & stack positions with proper numbering */
function calcCutStackPositions(
  cols: number,
  rows: number,
  sheetsNeeded: number,
  order: CutStackOrder,
  customOrder: Record<number, number>,
  startNum: number,
): CutStackPosition[] {
  const ups = cols * rows;
  const hasCustom = Object.keys(customOrder).length === ups;
  const positions: CutStackPosition[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const posIdx = r * cols + c;
      const stackNum = hasCustom ? (customOrder[posIdx] ?? posIdx) : posIdx;
      const posLabel = stackNum + 1;
      const seqFrom = startNum + stackNum * sheetsNeeded;
      const seqTo = startNum + (stackNum + 1) * sheetsNeeded - 1;
      positions.push({ col: c, row: r, posLabel, stackNum, seqFrom, seqTo });
    }
  }

  return positions;
}

export function calcCutStack(input: ImpositionInput): ImpositionResult {
  const result = calcNUp(input);
  const { stackOrder = 'row', stackCustomOrder, stackStartNum = 1 } = input;

  const customOrder = buildCutStackOrder(
    stackOrder,
    result.cols,
    result.rows,
    stackCustomOrder,
  );

  const sheetsNeeded = result.totalSheets || 1;
  const positions = calcCutStackPositions(
    result.cols,
    result.rows,
    sheetsNeeded,
    stackOrder,
    customOrder,
    stackStartNum,
  );

  // Re-assign pageNum on cells to match stack order
  const cells = result.cells.map((cell, idx) => ({
    ...cell,
    pageNum: (positions[idx]?.posLabel) || cell.pageNum,
  }));

  return {
    ...result,
    mode: 'cutstack',
    cells,
    stackPositions: positions,
    stackOrder,
  };
}

// ═══════════════════════════════════════════════════════════════
// MODE 3: Booklet — saddle stitch with signature map + creep
// ═══════════════════════════════════════════════════════════════

/** Build booklet signature map: page assignments for front/back of each sheet */
export function buildBookletSignatureMap(totalPages: number): BookletSignatureMap {
  const padded = Math.ceil(totalPages / 4) * 4;
  const nSheets = padded / 4;
  const sheets: BookletSignatureMap['sheets'] = [];

  for (let i = 0; i < nSheets; i++) {
    sheets.push({
      front: [padded - 2 * i, 2 * i + 1],
      back: [2 * i + 2, padded - 2 * i - 1],
    });
  }

  return { sheets, paddedPages: padded, totalSheets: nSheets };
}

/** Calculate creep per sheet: inner sheets pushed outward by surrounding sheets */
export function calcBookletCreep(totalSheets: number, paperThicknessMM: number): number[] {
  const creep: number[] = [];
  for (let i = 0; i < totalSheets; i++) {
    // Outermost sheet (idx 0): zero creep
    // Inner sheets get more creep
    creep.push(i * paperThicknessMM / 2);
  }
  return creep;
}

export function calcBooklet(input: ImpositionInput): ImpositionResult {
  const { trimW, trimH, bleed, qty, gutter, area, pages: rawPages, paperThickness = 0 } = input;

  // Pages must be multiple of 4
  const pages = Math.ceil((rawPages || 4) / 4) * 4;
  const signatureMap = buildBookletSignatureMap(pages);
  const creepPerSheet = calcBookletCreep(signatureMap.totalSheets, paperThickness);

  // Booklet cell: spine edge has no bleed, face edge has bleed
  const cellW = trimW + bleed; // only face bleed, not spine
  const cellH = trimH + bleed * 2; // top/bottom normal bleed

  const { w: pw, h: ph } = printable(area);

  // A booklet spread = 2 pages side by side (fold at center)
  const spreadW = cellW * 2 + gutter;
  const spreadH = cellH;

  // How many spreads fit on the sheet
  const spreadCols = fitCount(pw, spreadW, gutter);
  const spreadRows = fitCount(ph, spreadH, gutter);
  const spreadsPerSheet = Math.max(spreadCols * spreadRows, 1);

  // Each spread = 4 pages (2 front, 2 back)
  const sheetsNeeded = Math.ceil(signatureMap.totalSheets / spreadsPerSheet);
  const totalSheets = sheetsNeeded * qty;

  const usedW = spreadCols * spreadW + (spreadCols - 1) * gutter;
  const usedH = spreadRows * spreadH + (spreadRows - 1) * gutter;

  // Build cells with page numbers from signature map
  const cells: ImpositionCell[] = [];
  let sigIdx = 0;
  for (let sr = 0; sr < spreadRows; sr++) {
    for (let sc = 0; sc < spreadCols; sc++) {
      if (sigIdx >= signatureMap.sheets.length) break;
      const sig = signatureMap.sheets[sigIdx];
      const baseX = area.marginLeft + sc * (spreadW + gutter);
      const baseY = area.marginTop + sr * (spreadH + gutter);

      // Left page (front left = first element of front pair)
      cells.push({
        col: sc * 2,
        row: sr,
        x: baseX,
        y: baseY,
        w: cellW,
        h: cellH,
        pageNum: sig.front[0],
      });
      // Right page (front right = second element of front pair)
      cells.push({
        col: sc * 2 + 1,
        row: sr,
        x: baseX + cellW,
        y: baseY,
        w: cellW,
        h: cellH,
        pageNum: sig.front[1],
      });
      sigIdx++;
    }
  }

  return {
    mode: 'booklet',
    ups: spreadsPerSheet * 2,
    cols: spreadCols * 2,
    rows: spreadRows,
    paperW: area.paperW,
    paperH: area.paperH,
    pieceW: cellW,
    pieceH: cellH,
    trimW,
    trimH,
    rotated: false,
    wastePercent: wastePercent(area.paperW, area.paperH, usedW, usedH),
    cells,
    totalSheets,
    signatures: signatureMap.totalSheets,
    signatureMap,
    creepPerSheet,
    ...marginInfo(area),
  };
}

// ═══════════════════════════════════════════════════════════════
// MODE 4: Perfect Bound — octavo signatures (4pp, 8pp, 16pp, 32pp)
// ═══════════════════════════════════════════════════════════════

/** PB layout table: signature size → cols × rows per side */
const PB_LAYOUTS: Record<number, { cols: number; rows: number }> = {
  4:  { cols: 2, rows: 1 },
  8:  { cols: 2, rows: 2 },
  16: { cols: 4, rows: 2 },
  32: { cols: 4, rows: 4 },
};

export function calcPerfectBound(input: ImpositionInput): ImpositionResult {
  const { trimW, trimH, bleed, qty, gutter, area, pages: rawPages, paperThickness = 0.1 } = input;

  const pages = rawPages || 16;
  const spineWidth = (pages / 2) * paperThickness;

  const { w: pw, h: ph } = printable(area);
  const sigSizes = [32, 16, 8, 4];

  let bestSigSize = 4;
  for (const sig of sigSizes) {
    const layout = PB_LAYOUTS[sig];
    if (!layout) continue;
    const cellW = trimW + bleed; // spine edge = no bleed
    const cellH = trimH + bleed * 2;
    const neededW = layout.cols * cellW + (layout.cols - 1) * gutter;
    const neededH = layout.rows * cellH + (layout.rows - 1) * gutter;

    if (neededW <= pw && neededH <= ph) {
      bestSigSize = sig;
      break;
    }
  }

  const layout = PB_LAYOUTS[bestSigSize]!;
  const totalSigs = Math.ceil(pages / bestSigSize);
  const cellW = trimW + bleed;
  const cellH = trimH + bleed * 2;

  const usedW = layout.cols * cellW + (layout.cols - 1) * gutter;
  const usedH = layout.rows * cellH + (layout.rows - 1) * gutter;

  const totalSheets = totalSigs * qty;

  // Build cells with PB page numbering
  // Front: pages read across rows; alternating rows rotate 180°
  const cells: ImpositionCell[] = [];
  const pagesPerSide = bestSigSize / 2;
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const idx = r * layout.cols + c;
      // Page numbering for front side of signature
      const pageNum = idx + 1;
      // Alternating rows get 180° rotation for head-to-head
      const rot = (r % 2 === 1) ? 180 : 0;
      cells.push({
        col: c,
        row: r,
        x: area.marginLeft + c * (cellW + gutter),
        y: area.marginTop + r * (cellH + gutter),
        w: cellW,
        h: cellH,
        pageNum,
        rotation: rot,
      });
    }
  }

  return {
    mode: 'perfect_bound',
    ups: layout.cols * layout.rows,
    cols: layout.cols,
    rows: layout.rows,
    paperW: area.paperW,
    paperH: area.paperH,
    pieceW: cellW,
    pieceH: cellH,
    trimW,
    trimH,
    rotated: false,
    wastePercent: wastePercent(area.paperW, area.paperH, usedW, usedH),
    cells,
    totalSheets,
    signatures: totalSigs,
    ...marginInfo(area),
  };
}

// ═══════════════════════════════════════════════════════════════
// MODE 5: Work & Turn / Tumble — split sheet, fit per half, ×2
// ═══════════════════════════════════════════════════════════════

export function calcWorkTurn(input: ImpositionInput): ImpositionResult {
  const { trimW, trimH, bleed, qty, gutter, area, rotation, turnType = 'turn' } = input;

  const rawCellW = trimW + bleed * 2;
  const rawCellH = trimH + bleed * 2;
  const { w: pw, h: ph } = printable(area);
  const rot = ((rotation || 0) % 360 + 360) % 360;

  const cellW = rawCellW;
  const cellH = rawCellH;

  const isTumble = turnType === 'tumble';
  // Turn: left-right split (same gripper), Tumble: top-bottom split (gripper changes)
  const halfW = isTumble ? pw : pw / 2;
  const halfH = isTumble ? ph / 2 : ph;

  // ─── Step 1: Auto-orient — find best base orientation ───
  const cols1 = fitCount(halfW, cellW, gutter);
  const rows1 = fitCount(halfH, cellH, gutter);
  const fit1 = cols1 * rows1;
  const cols2 = fitCount(halfW, cellH, gutter);
  const rows2 = fitCount(halfH, cellW, gutter);
  const fit2 = cols2 * rows2;

  let autoRotated = fit2 > fit1;
  if (autoRotated && fit2 === 0) autoRotated = false;
  if (!autoRotated && fit1 === 0) autoRotated = true;

  const baseCellW = autoRotated ? cellH : cellW;
  const baseCellH = autoRotated ? cellW : cellH;
  const baseRot = autoRotated ? 90 : 0;

  // ─── Step 2: Apply user rotation on top of base ───
  // 90°/270° swap the base cell dims, 0°/180° keep them
  const userSwaps = (rot > 45 && rot < 135) || (rot > 225 && rot < 315);
  const actualCellW = userSwaps ? baseCellH : baseCellW;
  const actualCellH = userSwaps ? baseCellW : baseCellH;

  // Re-compute fit with final cell dimensions
  const cols = fitCount(halfW, actualCellW, gutter);
  const rows = fitCount(halfH, actualCellH, gutter);
  const fitsPerHalf = cols * rows;

  if (fitsPerHalf === 0) {
    return {
      mode: 'workturn', ups: 0, cols: 0, rows: 0,
      paperW: area.paperW, paperH: area.paperH,
      pieceW: actualCellW, pieceH: actualCellH, trimW, trimH,
      rotated: false, wastePercent: 100, cells: [], totalSheets: 0,
      turnType, fitsPerHalf: 0, ...marginInfo(area),
    };
  }

  const ups = Math.max(fitsPerHalf * 2, 1);
  const rawSheets = Math.ceil(qty / ups);
  const rotated = autoRotated || userSwaps;

  // Content rotation: auto-fill so PDF matches cell + user flip
  // If PDF orientation ≠ cell orientation → rotate 90° to fill
  // If user chose 180°/270° → add 180° for "heads out" flip
  const pdfPortrait = cellW <= cellH;
  const finalPortrait = actualCellW <= actualCellH;
  const fillRot = (pdfPortrait !== finalPortrait) ? 90 : 0;
  const flipOffset = (rot >= 135 && rot <= 315) ? 180 : 0;
  const frontRot = (fillRot + flipOffset) % 360;
  // When auto-rotated (fillRot=90): back gets opposite direction → heads outward
  // When natural fit (fillRot=0): back same as front → physical turn handles it
  const backRot = fillRot
    ? ((360 - fillRot) + flipOffset) % 360
    : frontRot;

  const usedW = cols * actualCellW + (cols - 1) * gutter;
  const usedH = rows * actualCellH + (rows - 1) * gutter;

  // Build cells for both halves
  const cells: ImpositionCell[] = [];

  // Center grids within each half
  const gridOffX = (halfW - usedW) / 2;
  const gridOffY = (halfH - usedH) / 2;

  // Signature: same grid in both halves, back content rotated 180° (αντικριστά)
  if (isTumble) {
    // Top half — front (page 1)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({
          col: c, row: r,
          x: area.marginLeft + gridOffX + c * (actualCellW + gutter),
          y: area.marginTop + gridOffY + r * (actualCellH + gutter),
          w: actualCellW, h: actualCellH,
          pageNum: 1,
          rotation: frontRot,
        });
      }
    }
    // Bottom half — back (page 2), same positions + 180° content
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({
          col: c, row: rows + r,
          x: area.marginLeft + gridOffX + c * (actualCellW + gutter),
          y: area.marginTop + halfH + gridOffY + r * (actualCellH + gutter),
          w: actualCellW, h: actualCellH,
          pageNum: 2,
          rotation: backRot,
        });
      }
    }
  } else {
    // Interleave left + right per row (canvas reads row-major)
    for (let r = 0; r < rows; r++) {
      // Left half — front (page 1)
      for (let c = 0; c < cols; c++) {
        cells.push({
          col: c, row: r,
          x: area.marginLeft + gridOffX + c * (actualCellW + gutter),
          y: area.marginTop + gridOffY + r * (actualCellH + gutter),
          w: actualCellW, h: actualCellH,
          pageNum: 1,
          rotation: frontRot,
        });
      }
      // Right half — back (page 2), same positions shifted right + 180° content
      for (let c = 0; c < cols; c++) {
        cells.push({
          col: cols + c, row: r,
          x: area.marginLeft + halfW + gridOffX + c * (actualCellW + gutter),
          y: area.marginTop + gridOffY + r * (actualCellH + gutter),
          w: actualCellW, h: actualCellH,
          pageNum: 2,
          rotation: backRot,
        });
      }
    }
  }

  const totalUsedW = isTumble ? usedW : usedW * 2;
  const totalUsedH = isTumble ? usedH * 2 : usedH;

  return {
    mode: 'workturn',
    ups,
    cols: isTumble ? cols : cols * 2,
    rows: isTumble ? rows * 2 : rows,
    paperW: area.paperW,
    paperH: area.paperH,
    pieceW: actualCellW,
    pieceH: actualCellH,
    trimW,
    trimH,
    rotated,
    wastePercent: wastePercent(area.paperW, area.paperH, totalUsedW, totalUsedH),
    cells,
    totalSheets: rawSheets,
    turnType,
    fitsPerHalf,
    halfCols: cols,
    halfRows: rows,
    ...marginInfo(area),
  };
}

// ═══════════════════════════════════════════════════════════════
// MODE 6: Gang Run — N-Up grid + per-cell page/qty assignment
// ═══════════════════════════════════════════════════════════════

export function calcGangRun(input: ImpositionInput): ImpositionResult {
  // Base grid from N-Up
  const base = calcNUp(input);

  const {
    gangCellAssign = {},
    gangCellAssignBack = {},
    gangCellQty = {},
    gangAutoOptimize = true,
    gangPageCount = 1,
    sides,
  } = input;

  const totalPositions = base.ups;
  const cellAssign: Record<number, number> = { ...gangCellAssign };
  const cellAssignBack: Record<number, number> = { ...gangCellAssignBack };
  const cellQty: Record<number, number> = { ...gangCellQty };

  // Auto-distribute pages to cells if enabled
  if (gangAutoOptimize && gangPageCount > 0) {
    for (let i = 0; i < totalPositions; i++) {
      if (!cellAssign[i]) cellAssign[i] = 1; // front: all page 1
      if (sides === 2 && !cellAssignBack[i]) {
        cellAssignBack[i] = Math.min(i + 2, gangPageCount);
      }
    }
  }

  // Default assignments for unset cells
  for (let j = 0; j < totalPositions; j++) {
    if (!cellQty[j]) cellQty[j] = 1;
    if (!cellAssign[j]) cellAssign[j] = 1;
    if (sides === 2 && !cellAssignBack[j]) {
      cellAssignBack[j] = Math.min(2, gangPageCount);
    }
  }

  // Calculate sheets needed: max sheets required by any page's quantity
  const maxQtyPerPage: Record<number, number> = {};
  for (let k = 0; k < totalPositions; k++) {
    const pg = cellAssign[k] || 1;
    if (!maxQtyPerPage[pg]) maxQtyPerPage[pg] = 0;
    maxQtyPerPage[pg] += (cellQty[k] || 1);
  }

  let gangSheetsNeeded = 1;
  for (const pg in maxQtyPerPage) {
    let positionsForPage = 0;
    for (let m = 0; m < totalPositions; m++) {
      if ((cellAssign[m] || 1) === Number(pg)) positionsForPage++;
    }
    if (positionsForPage > 0) {
      gangSheetsNeeded = Math.max(
        gangSheetsNeeded,
        Math.ceil(maxQtyPerPage[pg] / positionsForPage),
      );
    }
  }

  // Update cells with page assignments
  const cells = base.cells.map((cell, idx) => ({
    ...cell,
    pageNum: cellAssign[idx] || 1,
  }));

  const gangData: GangRunData = {
    cellAssign,
    cellAssignBack,
    cellQty,
    gangSheetsNeeded,
    pageCount: gangPageCount,
  };

  return {
    ...base,
    mode: 'gangrun',
    cells,
    totalSheets: gangSheetsNeeded,
    gangData,
  };
}

// ═══════════════════════════════════════════════════════════════
// MODE 7: Step Multi — custom block-based layout
// ═══════════════════════════════════════════════════════════════

/** Check if two rectangles overlap (AABB) */
function rectsOverlap(
  x1: number, y1: number, w1: number, h1: number,
  x2: number, y2: number, w2: number, h2: number,
): boolean {
  return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
}

/** Find a free position for a new block (try right of / below existing blocks) */
function findFreePosition(
  blockW: number, blockH: number,
  printW: number, printH: number,
  blocks: StepBlock[],
  skipIdx: number,
  gutter: number,
): { x: number; y: number } {
  // Try right of each existing block
  for (let i = 0; i < blocks.length; i++) {
    if (i === skipIdx) continue;
    const b = blocks[i];
    if (b.blockW === 0) continue;
    const testX = b.x + b.blockW + gutter;
    const testY = b.y;
    if (testX + blockW <= printW + 0.1 && testY + blockH <= printH + 0.1) {
      let overlaps = false;
      for (let j = 0; j < blocks.length; j++) {
        if (j === skipIdx || j === i) continue;
        const ob = blocks[j];
        if (ob.blockW === 0) continue;
        if (rectsOverlap(testX, testY, blockW, blockH, ob.x, ob.y, ob.blockW, ob.blockH)) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) return { x: testX, y: testY };
    }
  }

  // Try below each existing block
  for (let i = 0; i < blocks.length; i++) {
    if (i === skipIdx) continue;
    const b = blocks[i];
    if (b.blockH === 0) continue;
    const testX = b.x;
    const testY = b.y + b.blockH + gutter;
    if (testX + blockW <= printW + 0.1 && testY + blockH <= printH + 0.1) {
      let overlaps = false;
      for (let j = 0; j < blocks.length; j++) {
        if (j === skipIdx || j === i) continue;
        const ob = blocks[j];
        if (ob.blockW === 0) continue;
        if (rectsOverlap(testX, testY, blockW, blockH, ob.x, ob.y, ob.blockW, ob.blockH)) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) return { x: testX, y: testY };
    }
  }

  return { x: 0, y: 0 }; // fallback
}

/** Calculate block dimensions and auto-place new blocks */
function calcStepBlocks(
  blocks: StepBlock[],
  printW: number, printH: number,
  gutter: number, bleed: number,
): void {
  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    const rot = block.rotation || 0;
    let tw = block.trimW;
    let th = block.trimH;
    if (rot === 90 || rot === 270) { const tmp = tw; tw = th; th = tmp; }
    const cellW = tw + bleed * 2;
    const cellH = th + bleed * 2;

    const needsAutoCalc = (block.blockW === 0 && !block._manualGrid);

    if (needsAutoCalc) {
      // Available space from block position
      let availW = printW - block.x;
      let availH = printH - block.y;
      let maxC = Math.max(1, Math.floor((availW + gutter) / (cellW + gutter)));
      let maxR = Math.max(1, Math.floor((availH + gutter) / (cellH + gutter)));
      // Validate fit
      if (maxC * cellW + (maxC - 1) * gutter > availW + 0.01) maxC = Math.max(1, maxC - 1);
      if (maxR * cellH + (maxR - 1) * gutter > availH + 0.01) maxR = Math.max(1, maxR - 1);
      block.cols = maxC;
      block.rows = maxR;
    }

    // Update blockW/blockH
    block.blockW = block.cols * cellW + Math.max(0, block.cols - 1) * gutter;
    block.blockH = block.rows * cellH + Math.max(0, block.rows - 1) * gutter;

    // Clamp position to printable area
    if (block.x + block.blockW > printW + 0.1) block.x = Math.max(0, printW - block.blockW);
    if (block.y + block.blockH > printH + 0.1) block.y = Math.max(0, printH - block.blockH);

    // Auto-place new blocks that overlap
    if (needsAutoCalc && bi > 0 && block.x === 0 && block.y === 0) {
      const pos = findFreePosition(block.blockW, block.blockH, printW, printH, blocks, bi, gutter);
      block.x = pos.x;
      block.y = pos.y;

      // Recalc available space at new position
      const availW = printW - block.x;
      const availH = printH - block.y;
      let maxC = Math.max(1, Math.floor((availW + gutter) / (cellW + gutter)));
      let maxR = Math.max(1, Math.floor((availH + gutter) / (cellH + gutter)));
      if (maxC * cellW + (maxC - 1) * gutter > availW + 0.01) maxC = Math.max(1, maxC - 1);
      if (maxR * cellH + (maxR - 1) * gutter > availH + 0.01) maxR = Math.max(1, maxR - 1);
      block.cols = maxC;
      block.rows = maxR;
      block.blockW = block.cols * cellW + Math.max(0, block.cols - 1) * gutter;
      block.blockH = block.rows * cellH + Math.max(0, block.rows - 1) * gutter;
    }
  }
}

/** Snap block position to edges of other blocks */
export function stepSnapToEdges(
  x: number, y: number,
  blockW: number, blockH: number,
  bleed: number,
  otherEdges: { xEdges: number[]; yEdges: number[] },
  threshold: number = 3,
): { x: number; y: number; snapX: number | null; snapY: number | null } {
  let snapX: number | null = null;
  let snapY: number | null = null;
  let bestDx = threshold + 1;
  let bestDy = threshold + 1;

  // Dragged block's trim edges
  const myXEdges = [x + bleed, x + blockW - bleed];
  const myYEdges = [y + bleed, y + blockH - bleed];

  // Find closest X snap
  for (const myE of myXEdges) {
    for (const otherE of otherEdges.xEdges) {
      const dx = Math.abs(myE - otherE);
      if (dx < bestDx) {
        bestDx = dx;
        snapX = otherE;
        x = x + (otherE - myE);
      }
    }
  }

  // Find closest Y snap
  for (const myE of myYEdges) {
    for (const otherE of otherEdges.yEdges) {
      const dy = Math.abs(myE - otherE);
      if (dy < bestDy) {
        bestDy = dy;
        snapY = otherE;
        y = y + (otherE - myE);
      }
    }
  }

  return {
    x, y,
    snapX: bestDx <= threshold ? snapX : null,
    snapY: bestDy <= threshold ? snapY : null,
  };
}

/** Check if a rect overlaps any existing blocks */
export function stepOverlaps(
  x: number, y: number, w: number, h: number,
  blocks: StepBlock[],
  skipIdx: number,
): boolean {
  for (let i = 0; i < blocks.length; i++) {
    if (i === skipIdx) continue;
    const b = blocks[i];
    if (b.blockW === 0) continue;
    if (rectsOverlap(x, y, w, h, b.x, b.y, b.blockW, b.blockH)) return true;
  }
  return false;
}

export function calcStepMulti(input: ImpositionInput): ImpositionResult {
  const { trimW, trimH, bleed, qty, gutter, area } = input;
  const { w: pw, h: ph } = printable(area);

  // Copy blocks to avoid mutating input
  const blocks: StepBlock[] = (input.stepBlocks || []).map(b => ({ ...b }));

  // If no blocks, create a default one
  if (blocks.length === 0) {
    blocks.push({
      pageNum: 1,
      backPageNum: null,
      trimW,
      trimH,
      cols: 1,
      rows: 1,
      rotation: 0,
      x: 0, y: 0,
      blockW: 0, blockH: 0,
    });
  }

  // Calculate block dimensions + auto-place
  calcStepBlocks(blocks, pw, ph, gutter, bleed);

  // Calculate total UPs across all blocks
  let totalUps = 0;
  for (const b of blocks) {
    totalUps += b.cols * b.rows;
  }
  totalUps = Math.max(totalUps, 1);

  // Build cells from all blocks
  const cells: ImpositionCell[] = [];
  for (const block of blocks) {
    const rot = block.rotation || 0;
    let tw = block.trimW;
    let th = block.trimH;
    if (rot === 90 || rot === 270) { const tmp = tw; tw = th; th = tmp; }
    const cellW = tw + bleed * 2;
    const cellH = th + bleed * 2;

    for (let r = 0; r < block.rows; r++) {
      for (let c = 0; c < block.cols; c++) {
        cells.push({
          col: c,
          row: r,
          x: area.marginLeft + block.x + c * (cellW + gutter),
          y: area.marginTop + block.y + r * (cellH + gutter),
          w: cellW,
          h: cellH,
          pageNum: block.pageNum,
          rotation: rot,
        });
      }
    }
  }

  const firstBlock = blocks[0];
  const cellW = trimW + bleed * 2;
  const cellH = trimH + bleed * 2;
  const rawSheets = Math.ceil(qty / totalUps);

  return {
    mode: 'stepmulti',
    ups: totalUps,
    cols: firstBlock?.cols || 1,
    rows: firstBlock?.rows || 1,
    paperW: area.paperW,
    paperH: area.paperH,
    pieceW: cellW,
    pieceH: cellH,
    trimW,
    trimH,
    rotated: false,
    wastePercent: 0, // complex to calculate with multi blocks
    cells,
    totalSheets: rawSheets,
    blocks,
    ...marginInfo(area),
  };
}

// ═══════════════════════════════════════════════════════════════
// DISPATCHER
// ═══════════════════════════════════════════════════════════════

const MODE_MAP: Record<ImpositionMode, (input: ImpositionInput) => ImpositionResult> = {
  nup: calcNUp,
  cutstack: calcCutStack,
  booklet: calcBooklet,
  perfect_bound: calcPerfectBound,
  workturn: calcWorkTurn,
  gangrun: calcGangRun,
  stepmulti: calcStepMulti,
};

export function calcImposition(input: ImpositionInput): ImpositionResult {
  const fn = MODE_MAP[input.mode] || calcNUp;
  return fn(input);
}

// ─── PAPER CUT-DOWN ───

/** How many machine sheets from one stock sheet (try both orientations) */
export function cutsPerStockSheet(
  stockW: number, stockH: number,
  machW: number, machH: number,
): number {
  const c1 = Math.floor(stockW / machW) * Math.floor(stockH / machH);
  const c2 = Math.floor(stockW / machH) * Math.floor(stockH / machW);
  return Math.max(c1, c2, 1);
}
