// PressCal Pro — Imposition Engine
// Ported from mod_imposer.js — all 7 modes with exact algorithms
// Pure functions: no DB, no side effects

import type {
  ImpositionMode, ImpositionResult, ImpositionCell,
  BookletSignatureMap, BookletSignatureSheet, CutStackPosition, CutStackOrder,
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

/** How many trims fit along `available` mm (trim-based fitting).
 *  Total = 2*bleed + N*trimSize + (N-1)*gutter <= available */
export function fitCount(available: number, trimSize: number, bleed: number, gutter: number): number {
  const needed = 2 * bleed + trimSize;
  if (trimSize <= 0 || available < needed) return 0;
  const step = trimSize + gutter;
  if (step <= 0) return 1;
  return 1 + Math.floor((available - needed) / step);
}

/** Legacy fitCount for modes that pass cellSize + cellGap directly */
export function fitCountLegacy(available: number, cellSize: number, gutter: number): number {
  if (cellSize <= 0 || available < cellSize) return 0;
  const step = cellSize + gutter;
  if (step <= 0) return 1;
  return 1 + Math.floor((available - cellSize) / step);
}

/** Printable dimensions from area spec */
export function printable(a: PrintableArea): { w: number; h: number } {
  return {
    w: a.paperW - a.marginLeft - a.marginRight,
    h: a.paperH - a.marginTop - a.marginBottom,
  };
}

/** Progressive internal bleed: how much bleed a cell gets on a side facing another cell.
 *  gutter=0 → 0 (μονοτομή), gutter<2*bleed → gutter/2, gutter>=2*bleed → full bleed */
export function internalBleed(gutter: number, bleed: number): number {
  if (gutter <= 0) return 0;
  if (gutter >= 2 * bleed) return bleed;
  return gutter / 2;
}

/** Try both orientations, return the one with more UPs */
function bestOrientation(
  pw: number, ph: number,
  trimW: number, trimH: number,
  bleed: number, gutter: number,
): { cols: number; rows: number; rotated: boolean } {
  const cols1 = fitCount(pw, trimW, bleed, gutter);
  const rows1 = fitCount(ph, trimH, bleed, gutter);
  const ups1 = cols1 * rows1;

  const cols2 = fitCount(pw, trimH, bleed, gutter);
  const rows2 = fitCount(ph, trimW, bleed, gutter);
  const ups2 = cols2 * rows2;

  if (ups2 > ups1) {
    return { cols: cols2, rows: rows2, rotated: true };
  }
  return { cols: cols1, rows: rows1, rotated: false };
}

/** Build cell array with asymmetric per-cell bleed.
 *  Positions based on trim grid; each cell's bleed depends on its neighbours. */
function buildCells(
  cols: number, rows: number,
  trimW: number, trimH: number,
  bleed: number, gutter: number,
  gridStartX: number, gridStartY: number,
  rotation: number = 0,
): ImpositionCell[] {
  const intBleed = internalBleed(gutter, bleed);
  const cells: ImpositionCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const bL = c === 0 ? bleed : intBleed;
      const bR = c === cols - 1 ? bleed : intBleed;
      const bT = r === 0 ? bleed : intBleed;
      const bB = r === rows - 1 ? bleed : intBleed;
      // Trim position on the regular grid
      const trimX = gridStartX + c * (trimW + gutter);
      const trimY = gridStartY + r * (trimH + gutter);
      cells.push({
        col: c,
        row: r,
        x: trimX - bL,
        y: trimY - bT,
        w: trimW + bL + bR,
        h: trimH + bT + bB,
        pageNum: r * cols + c + 1,
        rotation,
        bleedL: bL, bleedR: bR, bleedT: bT, bleedB: bB,
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

  const { w: pw, h: ph } = printable(area);

  // Always fit on FULL paper dimensions — margins are advisory, not restrictive
  const isForced = !!(forceUps || forceCols || forceRows);
  const fitW = area.paperW;
  const fitH = area.paperH;

  // Normalize rotation to 0-359
  const rot = ((rotation || 0) % 360 + 360) % 360;
  // 90°-ish or 270°-ish: swap trim dimensions
  let isSwapped = (rot > 45 && rot < 135) || (rot > 225 && rot < 315);
  let tW = isSwapped ? trimH : trimW;
  let tH = isSwapped ? trimW : trimH;
  let contentRotation = rot;

  let cols: number, rows: number;

  if (forceCols && forceRows) {
    cols = forceCols;
    rows = forceRows;
  } else if (forceCols) {
    cols = forceCols;
    rows = fitCount(fitH, tH, bleed, gutter);
  } else if (forceRows) {
    rows = forceRows;
    cols = fitCount(fitW, tW, bleed, gutter);
  } else if (forceUps) {
    cols = fitCount(fitW, tW, bleed, gutter);
    rows = fitCount(fitH, tH, bleed, gutter);
    if (cols === 0) cols = 1;
    if (rows === 0) rows = 1;
    while (cols * rows > forceUps && cols > 1) cols--;
    while (cols * rows > forceUps && rows > 1) rows--;
  } else {
    // Try both orientations, pick the one with more ups
    const best = bestOrientation(area.paperW, area.paperH, tW, tH, bleed, gutter);
    cols = best.cols;
    rows = best.rows;
    if (best.rotated) {
      isSwapped = !isSwapped;
      tW = isSwapped ? trimH : trimW;
      tH = isSwapped ? trimW : trimH;
      contentRotation = (rot + 90) % 360;
    }
  }

  const ups = Math.max(cols * rows, 1);
  const rotated = isSwapped;

  // Total footprint: 2*bleed (external) + N*trim + (N-1)*gutter
  const usedW = 2 * bleed + cols * tW + (cols - 1) * gutter;
  const usedH = 2 * bleed + rows * tH + (rows - 1) * gutter;

  const rawSheets = Math.ceil(qty / ups);

  // Center the trim grid in printable area (margins define center, not fitting limits)
  const cenAreaW = pw;
  const cenAreaH = ph;
  const cenBaseX = area.marginLeft;
  const cenBaseY = area.marginTop;
  const trimGridW = cols * tW + (cols - 1) * gutter;
  const trimGridH = rows * tH + (rows - 1) * gutter;
  const gridStartX = cenBaseX + (cenAreaW - trimGridW) / 2;
  const gridStartY = cenBaseY + (cenAreaH - trimGridH) / 2;

  const cells = buildCells(
    cols, rows, tW, tH, bleed, gutter,
    gridStartX, gridStartY,
    contentRotation,
  );

  // pieceW/H = max cell size (external cell: trim + 2*bleed) for backward compat
  const maxCellW = tW + 2 * bleed;
  const maxCellH = tH + 2 * bleed;

  // Check if grid extends into machine margins
  const marginWarning = usedW > pw || usedH > ph;

  return {
    mode: 'nup',
    pageRotation: contentRotation,
    ups,
    cols,
    rows,
    paperW: area.paperW,
    paperH: area.paperH,
    pieceW: maxCellW,
    pieceH: maxCellH,
    trimW: tW,
    trimH: tH,
    rotated,
    wastePercent: wastePercent(area.paperW, area.paperH, usedW, usedH),
    cells,
    totalSheets: rawSheets,
    marginWarning,
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
    // Each inner sheet adds one paper thickness of creep
    creep.push(i * paperThicknessMM);
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

  // How many spreads fit on the sheet (booklet uses its own cell model)
  const spreadCols = fitCountLegacy(pw, spreadW, gutter);
  const spreadRows = fitCountLegacy(ph, spreadH, gutter);
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
      // Booklet: left page has face bleed on left, spine=0 on right
      cells.push({
        col: sc * 2,
        row: sr,
        x: baseX,
        y: baseY,
        w: cellW,
        h: cellH,
        pageNum: sig.front[0],
        bleedL: bleed, bleedR: 0, bleedT: bleed, bleedB: bleed,
      });
      // Right page (front right = second element of front pair)
      // Booklet: right page has spine=0 on left, face bleed on right
      cells.push({
        col: sc * 2 + 1,
        row: sr,
        x: baseX + cellW,
        y: baseY,
        w: cellW,
        h: cellH,
        pageNum: sig.front[1],
        bleedL: 0, bleedR: bleed, bleedT: bleed, bleedB: bleed,
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
    pageCount: rawPages || 4,
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

/** Standard octavo fold patterns — local page numbers (1-indexed) within a signature.
 *  3-right-angle-fold imposition standard. */
const PB_PAGE_MAP: Record<number, { front: number[][]; back: number[][] }> = {
  4: {
    front: [[4, 1]],
    back:  [[2, 3]],
  },
  8: {
    front: [[5, 4], [8, 1]],
    back:  [[3, 6], [2, 7]],
  },
  16: {
    front: [[13, 4, 1, 16], [12, 5, 8, 9]],
    back:  [[15, 2, 3, 14], [10, 7, 6, 11]],
  },
  32: {
    front: [
      [29, 4, 5, 28],
      [20, 13, 12, 21],
      [17, 16, 9, 24],
      [32, 1, 8, 25],
    ],
    back: [
      [27, 6, 3, 30],
      [22, 11, 14, 19],
      [23, 10, 15, 18],
      [26, 7, 2, 31],
    ],
  },
};

export function calcPerfectBound(input: ImpositionInput): ImpositionResult {
  const { trimW, trimH, bleed, qty, gutter, area, pages: rawPages, paperThickness = 0.1 } = input;

  const pages = rawPages || 16;
  const spineWidth = (pages / 2) * paperThickness;

  const { w: pw, h: ph } = printable(area);
  const sigSizes = [32, 16, 8, 4];

  // Find largest signature size that fits on the sheet
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
  const paddedPages = Math.ceil(pages / bestSigSize) * bestSigSize;
  const totalSigs = paddedPages / bestSigSize;
  const cellW = trimW + bleed;
  const cellH = trimH + bleed * 2;

  // One signature block dimensions
  const numPairs = Math.ceil(layout.cols / 2);
  const pairW = 2 * cellW;
  const blockW = numPairs * pairW + (numPairs > 1 ? gutter : 0);
  const blockH = layout.rows * cellH + (layout.rows > 1 ? gutter : 0);

  // How many signature blocks fit on the press sheet
  const blockGapH = 3; // mm between sig blocks horizontal
  const blockGapV = 3; // mm between sig blocks vertical
  const sigsAcross = Math.max(1, Math.floor((pw + blockGapH) / (blockW + blockGapH)));
  const sigsDown = Math.max(1, Math.floor((ph + blockGapV) / (blockH + blockGapV)));
  const sigsPerSheet = sigsAcross * sigsDown;

  const canRepeat = sigsPerSheet >= totalSigs;
  const totalPressSheets = canRepeat ? 1 : Math.ceil(totalSigs / sigsPerSheet);
  const totalSheets = totalPressSheets * qty;

  // Grid dimensions for canvas (one block)
  const usedW = blockW;
  const usedH = blockH;
  const cenOffX = area.marginLeft + (pw - usedW) / 2;
  const cenOffY = area.marginTop + (ph - usedH) / 2;

  // ─── Build structured signatures using standard octavo fold pattern ───
  const foldMap = PB_PAGE_MAP[bestSigSize];
  const pbSignatures: import('@/types/calculator').PBSignature[] = [];
  const navSheets: BookletSignatureMap['sheets'] = [];

  for (let s = 0; s < totalSigs; s++) {
    const sigStartPage = s * bestSigSize + 1;
    const actualPages = Math.min(bestSigSize, pages - s * bestSigSize);

    // Build front/back grids with absolute page numbers for export
    const front: number[][] = foldMap.front.map(row => row.map(p => p));
    const back: number[][] = foldMap.back.map(row => row.map(p => p));

    pbSignatures.push({ startPage: sigStartPage, actualPages, signatureMap: { front, back } });

    // Build navigator sheet pairs from the fold map
    // Each pair of adjacent columns forms a spread (fold line between them)
    for (let r = 0; r < layout.rows; r++) {
      for (let p = 0; p < numPairs; p++) {
        const c0 = p * 2;
        const c1 = p * 2 + 1;
        const fl = foldMap.front[r][c0], fr = foldMap.front[r][c1];
        const bl = foldMap.back[r][c0], br = foldMap.back[r][c1];
        navSheets.push({
          front: [sigStartPage + fl - 1, sigStartPage + fr - 1],
          back: [sigStartPage + bl - 1, sigStartPage + br - 1],
        });
      }
    }
  }

  // Navigator signature map
  const signatureMap: BookletSignatureMap = {
    sheets: navSheets,
    paddedPages,
    totalSheets: navSheets.length,
  };

  // Build cells for canvas preview (first signature, front side)
  const cells: ImpositionCell[] = [];
  if (foldMap) {
    for (let r = 0; r < layout.rows; r++) {
      for (let c = 0; c < layout.cols; c++) {
        const localPage = foldMap.front[r]?.[c] ?? 0;
        const pageNum = localPage; // local page within first signature
        const rot = (r % 2 === 1) ? 180 : 0;
        cells.push({
          col: c, row: r,
          x: cenOffX + c * (cellW + gutter),
          y: cenOffY + r * (cellH + gutter),
          w: cellW, h: cellH,
          pageNum,
          rotation: rot,
          bleedL: bleed, bleedR: bleed, bleedT: bleed, bleedB: bleed,
        });
      }
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
    numSigs: totalSigs,
    signatureMap,
    spineWidth,
    pageCount: pages,
    sigSize: bestSigSize,
    // Multi-sig grid
    sigsAcross,
    sigsDown,
    sigsPerSheet,
    blockGapH,
    blockGapV,
    gapVmm: numPairs > 1 ? gutter : 0,
    gapHmm: layout.rows > 1 ? gutter : 0,
    canRepeat,
    totalPressSheets,
    pbSignatures,
    ...marginInfo(area),
  };
}

// ═══════════════════════════════════════════════════════════════
// MODE 5: Work & Turn / Tumble — split sheet, fit per half, ×2
// ═══════════════════════════════════════════════════════════════

export function calcWorkTurn(input: ImpositionInput): ImpositionResult {
  const { trimW, trimH, bleed, qty, gutter, area, rotation, turnType = 'turn' } = input;

  const { w: pw, h: ph } = printable(area);
  const rot = ((rotation || 0) % 360 + 360) % 360;

  const isTumble = turnType === 'tumble';
  // Fit on full paper halves (margins are advisory, not restrictive)
  const halfW = isTumble ? area.paperW : area.paperW / 2;
  const halfH = isTumble ? area.paperH / 2 : area.paperH;

  // ─── Step 1: Auto-orient — find best base orientation ───
  let tW = trimW, tH = trimH;
  const cols1 = fitCount(halfW, tW, bleed, gutter);
  const rows1 = fitCount(halfH, tH, bleed, gutter);
  const fit1 = cols1 * rows1;
  const cols2 = fitCount(halfW, tH, bleed, gutter);
  const rows2 = fitCount(halfH, tW, bleed, gutter);
  const fit2 = cols2 * rows2;

  let autoRotated = fit2 > fit1;
  if (autoRotated && fit2 === 0) autoRotated = false;
  if (!autoRotated && fit1 === 0) autoRotated = true;

  if (autoRotated) { const tmp = tW; tW = tH; tH = tmp; }

  // ─── Step 2: Apply user rotation on top of base ───
  const userSwaps = (rot > 45 && rot < 135) || (rot > 225 && rot < 315);
  if (userSwaps) { const tmp = tW; tW = tH; tH = tmp; }

  // Re-compute fit with final trim dimensions
  const cols = fitCount(halfW, tW, bleed, gutter);
  const rows = fitCount(halfH, tH, bleed, gutter);
  const fitsPerHalf = cols * rows;

  if (fitsPerHalf === 0) {
    const maxCellW = tW + 2 * bleed;
    const maxCellH = tH + 2 * bleed;
    return {
      mode: 'workturn', ups: 0, cols: 0, rows: 0,
      paperW: area.paperW, paperH: area.paperH,
      pieceW: maxCellW, pieceH: maxCellH, trimW: tW, trimH: tH,
      rotated: false, wastePercent: 100, cells: [], totalSheets: 0,
      turnType, fitsPerHalf: 0, ...marginInfo(area),
    };
  }

  const ups = Math.max(fitsPerHalf * 2, 1);
  const rawSheets = Math.ceil(qty / ups);
  const rotated = autoRotated || userSwaps;

  // Content rotation
  const origCellW = trimW + bleed * 2;
  const origCellH = trimH + bleed * 2;
  const pdfPortrait = origCellW <= origCellH;
  const finalPortrait = tW <= tH;
  const fillRot = (pdfPortrait !== finalPortrait) ? 90 : 0;
  const flipOffset = (rot >= 135 && rot <= 315) ? 180 : 0;
  const frontRot = (fillRot + flipOffset) % 360;
  const backRot = fillRot
    ? ((360 - fillRot) + flipOffset) % 360
    : frontRot;

  // Trim grid per half
  const trimGridW = cols * tW + (cols - 1) * gutter;
  const trimGridH = rows * tH + (rows - 1) * gutter;

  // Center in printable half (margins define center)
  const printHalfW = isTumble ? pw : pw / 2;
  const printHalfH = isTumble ? ph / 2 : ph;
  const gridOffX = (printHalfW - trimGridW) / 2;
  const gridOffY = (printHalfH - trimGridH) / 2;

  const intBleed = internalBleed(gutter, bleed);

  // Build cells with asymmetric bleed
  const cells: ImpositionCell[] = [];
  const buildHalfCells = (baseX: number, baseY: number, pageNum: number, cellRot: number, colOffset: number, rowOffset: number) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const bL = c === 0 ? bleed : intBleed;
        const bR = c === cols - 1 ? bleed : intBleed;
        const bT = r === 0 ? bleed : intBleed;
        const bB = r === rows - 1 ? bleed : intBleed;
        const trimX = baseX + gridOffX + c * (tW + gutter);
        const trimY = baseY + gridOffY + r * (tH + gutter);
        cells.push({
          col: colOffset + c, row: rowOffset + r,
          x: trimX - bL, y: trimY - bT,
          w: tW + bL + bR, h: tH + bT + bB,
          pageNum, rotation: cellRot,
          bleedL: bL, bleedR: bR, bleedT: bT, bleedB: bB,
        });
      }
    }
  };

  if (isTumble) {
    buildHalfCells(area.marginLeft, area.marginTop, 1, frontRot, 0, 0);
    buildHalfCells(area.marginLeft, area.marginTop + printHalfH, 2, backRot, 0, rows);
  } else {
    // Interleave left + right per row
    for (let r = 0; r < rows; r++) {
      // Left half cells
      for (let c = 0; c < cols; c++) {
        const bL = c === 0 ? bleed : intBleed;
        const bR = c === cols - 1 ? bleed : intBleed;
        const bT = r === 0 ? bleed : intBleed;
        const bB = r === rows - 1 ? bleed : intBleed;
        const trimX = area.marginLeft + gridOffX + c * (tW + gutter);
        const trimY = area.marginTop + gridOffY + r * (tH + gutter);
        cells.push({
          col: c, row: r,
          x: trimX - bL, y: trimY - bT,
          w: tW + bL + bR, h: tH + bT + bB,
          pageNum: 1, rotation: frontRot,
          bleedL: bL, bleedR: bR, bleedT: bT, bleedB: bB,
        });
      }
      // Right half cells
      for (let c = 0; c < cols; c++) {
        const bL = c === 0 ? bleed : intBleed;
        const bR = c === cols - 1 ? bleed : intBleed;
        const bT = r === 0 ? bleed : intBleed;
        const bB = r === rows - 1 ? bleed : intBleed;
        const trimX = area.marginLeft + printHalfW + gridOffX + c * (tW + gutter);
        const trimY = area.marginTop + gridOffY + r * (tH + gutter);
        cells.push({
          col: cols + c, row: r,
          x: trimX - bL, y: trimY - bT,
          w: tW + bL + bR, h: tH + bT + bB,
          pageNum: 2, rotation: backRot,
          bleedL: bL, bleedR: bR, bleedT: bT, bleedB: bB,
        });
      }
    }
  }

  const usedPerHalf = 2 * bleed + trimGridW;
  const usedPerHalfH = 2 * bleed + trimGridH;
  const totalUsedW = isTumble ? usedPerHalf : usedPerHalf * 2;
  const totalUsedH = isTumble ? usedPerHalfH * 2 : usedPerHalfH;
  const marginWarning = totalUsedW > pw || totalUsedH > ph;
  const maxCellW = tW + 2 * bleed;
  const maxCellH = tH + 2 * bleed;

  return {
    mode: 'workturn',
    ups,
    cols: isTumble ? cols : cols * 2,
    rows: isTumble ? rows * 2 : rows,
    paperW: area.paperW,
    paperH: area.paperH,
    pieceW: maxCellW,
    pieceH: maxCellH,
    trimW: tW,
    trimH: tH,
    rotated,
    wastePercent: wastePercent(area.paperW, area.paperH, totalUsedW, totalUsedH),
    cells,
    totalSheets: rawSheets,
    marginWarning,
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
  // Precompute cell sizes per block
  const cellSizes = blocks.map(block => {
    const rot = block.rotation || 0;
    let tw = block.trimW, th = block.trimH;
    if (rot === 90 || rot === 270) { const tmp = tw; tw = th; th = tmp; }
    return { cellW: tw + bleed * 2, cellH: th + bleed * 2 };
  });

  // Collect which blocks need auto-calc
  const autoBlocks = blocks.map((b, i) => b.blockW === 0 && !b._manualGrid ? i : -1).filter(i => i >= 0);
  const N = autoBlocks.length;

  if (N === 1) {
    // Single auto-block: fill the entire sheet
    const bi = autoBlocks[0];
    const block = blocks[bi];
    const { cellW, cellH } = cellSizes[bi];
    const availW = printW - block.x;
    const availH = printH - block.y;
    block.cols = Math.max(1, Math.floor((availW + gutter) / (cellW + gutter)));
    block.rows = Math.max(1, Math.floor((availH + gutter) / (cellH + gutter)));
    if (block.cols * cellW + (block.cols - 1) * gutter > availW + 0.01) block.cols = Math.max(1, block.cols - 1);
    if (block.rows * cellH + (block.rows - 1) * gutter > availH + 0.01) block.rows = Math.max(1, block.rows - 1);
    block.blockW = block.cols * cellW + Math.max(0, block.cols - 1) * gutter;
    block.blockH = block.rows * cellH + Math.max(0, block.rows - 1) * gutter;
  } else if (N > 1) {
    // Multiple auto-blocks: stack vertically, each gets a fair share of height
    // Allocate strips: divide printH into N strips
    const stripH = (printH - (N - 1) * gutter) / N;
    let curY = 0;

    for (let ai = 0; ai < N; ai++) {
      const bi = autoBlocks[ai];
      const block = blocks[bi];
      const { cellW, cellH } = cellSizes[bi];

      block.x = 0;
      block.y = curY;

      // Max cols in full width
      let maxC = Math.max(1, Math.floor((printW + gutter) / (cellW + gutter)));
      if (maxC * cellW + (maxC - 1) * gutter > printW + 0.01) maxC = Math.max(1, maxC - 1);

      // Max rows in this strip
      let maxR = Math.max(1, Math.floor((stripH + gutter) / (cellH + gutter)));
      if (maxR * cellH + (maxR - 1) * gutter > stripH + 0.01) maxR = Math.max(1, maxR - 1);

      block.cols = maxC;
      block.rows = maxR;
      block.blockW = maxC * cellW + Math.max(0, maxC - 1) * gutter;
      block.blockH = maxR * cellH + Math.max(0, maxR - 1) * gutter;

      curY += block.blockH + gutter;
    }
  }

  // Handle manual blocks + clamp positions
  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    const { cellW, cellH } = cellSizes[bi];

    if (block.blockW === 0) {
      block.blockW = block.cols * cellW + Math.max(0, block.cols - 1) * gutter;
      block.blockH = block.rows * cellH + Math.max(0, block.rows - 1) * gutter;
    }

    if (block.x + block.blockW > printW + 0.1) block.x = Math.max(0, printW - block.blockW);
    if (block.y + block.blockH > printH + 0.1) block.y = Math.max(0, printH - block.blockH);
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
          bleedL: bleed, bleedR: bleed, bleedT: bleed, bleedB: bleed,
        });
      }
    }
  }

  const firstBlock = blocks[0];
  const fbTrimW = firstBlock?.trimW || trimW;
  const fbTrimH = firstBlock?.trimH || trimH;
  const cellW = fbTrimW + bleed * 2;
  const cellH = fbTrimH + bleed * 2;
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
    trimW: fbTrimW,
    trimH: fbTrimH,
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
