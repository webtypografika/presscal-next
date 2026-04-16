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
  gangCellQty?: Record<number, number>;        // posIdx → qty (legacy per-cell)
  gangJobQty?: Record<number, number>;         // 1-based page/job → total qty wanted (preferred)
  gangAutoOptimize?: boolean;
  gangPageCount?: number;

  // Step Multi specific
  stepBlocks?: StepBlock[];

  // Work & Turn specific
  turnType?: WorkTurnType;

  // Duplex orientation (front-side grid flip)
  duplexOrient?: 'h2h' | 'h2f';
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
  duplexOrient?: 'h2h' | 'h2f',
): ImpositionCell[] {
  const intBleed = internalBleed(gutter, bleed);
  const isH2F = duplexOrient === 'h2f';
  const cells: ImpositionCell[] = [];
  for (let r = 0; r < rows; r++) {
    // H2F: alternate rows get +180° rotation
    const rowRot = (isH2F && r % 2 === 1) ? (rotation + 180) % 360 : rotation;
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
        rotation: rowRot,
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
  const { trimW, trimH, bleed, qty, sides, gutter, area, forceUps, forceCols, forceRows, rotation, duplexOrient } = input;

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
    duplexOrient,
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
    duplexOrient,
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
  const { trimW, trimH, bleed, qty, gutter, area, pages: rawPages, paperThickness = 0, rotation } = input;

  // Pages must be multiple of 4
  const pages = Math.ceil((rawPages || 4) / 4) * 4;
  const signatureMap = buildBookletSignatureMap(pages);
  const creepPerSheet = calcBookletCreep(signatureMap.totalSheets, paperThickness);

  // Spread rotation: 0 = spine vertical (natural), 90 = spine horizontal
  const rot = ((rotation || 0) % 360 + 360) % 360;
  const blockRotated = (rot >= 45 && rot < 135) || (rot >= 225 && rot < 315);

  // Booklet cell: spine edge has no bleed, face edge has bleed
  const cellW = trimW + bleed; // only face bleed, not spine
  const cellH = trimH + bleed * 2; // top/bottom normal bleed

  const { w: pw, h: ph } = printable(area);

  // A booklet spread = 2 pages side by side (fold at center). The two pages
  // share the spine with NO gap — the spread occupies exactly 2·cellW horizontally.
  // Inter-spread gap is handled separately via the `gutter` step in the tiling loop.
  const spreadWnat = cellW * 2;
  const spreadHnat = cellH;
  const spreadW = blockRotated ? spreadHnat : spreadWnat;
  const spreadH = blockRotated ? spreadWnat : spreadHnat;

  // How many spreads fit on the sheet (booklet uses its own cell model)
  const spreadCols = fitCountLegacy(pw, spreadW, gutter);
  const spreadRows = fitCountLegacy(ph, spreadH, gutter);
  const spreadsPerSheet = Math.max(spreadCols * spreadRows, 1);

  // Traditional 2-up booklet imposition: the SAME signature is printed in every
  // spread slot of a press sheet — 2× or 4× copies at once. Each press sheet
  // equals one signature; the number of impressions per sig drops by sigsPerSheet.
  const sheetsNeeded = signatureMap.totalSheets;
  const totalSheets = sheetsNeeded * Math.ceil(qty / spreadsPerSheet);

  const usedW = spreadCols * spreadW + Math.max(0, spreadCols - 1) * gutter;
  const usedH = spreadRows * spreadH + Math.max(0, spreadRows - 1) * gutter;

  // Build cells with page numbers from signature map. Use sig 0 as the preview
  // default — the navigator / activeSigSheet override swaps to the selected sig.
  // Center spread grid in printable area
  const cenOffX = area.marginLeft + (pw - usedW) / 2;
  const cenOffY = area.marginTop + (ph - usedH) / 2;
  const cells: ImpositionCell[] = [];
  const previewSig = signatureMap.sheets[0];
  for (let sr = 0; sr < spreadRows; sr++) {
    for (let sc = 0; sc < spreadCols; sc++) {
      const sig = previewSig; // same sig repeated across every slot on the sheet
      const baseX = cenOffX + sc * (spreadW + gutter);
      const baseY = cenOffY + sr * (spreadH + gutter);

      // Natural cell positions within spread (spine vertical): L at (0,0), R at (cellW, 0)
      const natL = { x: 0, y: 0, bL: bleed, bR: 0, bT: bleed, bB: bleed };
      const natR = { x: cellW, y: 0, bL: 0, bR: bleed, bT: bleed, bB: bleed };

      let L: { x: number; y: number; w: number; h: number; rot: number; bL: number; bR: number; bT: number; bB: number };
      let R: typeof L;

      if (blockRotated) {
        // Rotate 90° CW within the natural spread frame (spreadWnat × spreadHnat).
        // A rect (x, y, w, h) rotated 90° CW becomes (H - y - h, x) with size (h, w).
        // Bleeds rotate CW: B→L, L→T, T→R, R→B — keeping the spine (bR=0 on L,
        // bL=0 on R) on the inner edge where the two pages meet after rotation.
        L = {
          x: baseX + (spreadHnat - natL.y - cellH),
          y: baseY + natL.x,
          w: cellH, h: cellW, rot: 90,
          bL: natL.bB, bR: natL.bT, bT: natL.bL, bB: natL.bR,
        };
        R = {
          x: baseX + (spreadHnat - natR.y - cellH),
          y: baseY + natR.x,
          w: cellH, h: cellW, rot: 90,
          bL: natR.bB, bR: natR.bT, bT: natR.bL, bB: natR.bR,
        };
      } else {
        L = { x: baseX + natL.x, y: baseY + natL.y, w: cellW, h: cellH, rot: 0,
              bL: natL.bL, bR: natL.bR, bT: natL.bT, bB: natL.bB };
        R = { x: baseX + natR.x, y: baseY + natR.y, w: cellW, h: cellH, rot: 0,
              bL: natR.bL, bR: natR.bR, bT: natR.bT, bB: natR.bB };
      }

      cells.push({
        col: sc * 2, row: sr,
        x: L.x, y: L.y, w: L.w, h: L.h,
        pageNum: sig.front[0], rotation: L.rot,
        bleedL: L.bL, bleedR: L.bR, bleedT: L.bT, bleedB: L.bB,
      });
      cells.push({
        col: sc * 2 + 1, row: sr,
        x: R.x, y: R.y, w: R.w, h: R.h,
        pageNum: sig.front[1], rotation: R.rot,
        bleedL: R.bL, bleedR: R.bR, bleedT: R.bT, bleedB: R.bB,
      });
    }
  }

  return {
    mode: 'booklet',
    ups: spreadsPerSheet * 2,
    cols: blockRotated ? spreadCols : spreadCols * 2,
    rows: blockRotated ? spreadRows * 2 : spreadRows,
    paperW: area.paperW,
    paperH: area.paperH,
    pieceW: blockRotated ? cellH : cellW,
    pieceH: blockRotated ? cellW : cellH,
    trimW,
    trimH,
    rotated: blockRotated,
    pageRotation: rot,
    wastePercent: wastePercent(area.paperW, area.paperH, usedW, usedH),
    cells,
    totalSheets,
    signatures: signatureMap.totalSheets,
    signatureMap,
    creepPerSheet,
    pageCount: rawPages || 4,
    // Export layout (consumed by pdf-export.ts exportBooklet)
    spreadsAcross: spreadCols,
    sigsPerSheet: spreadsPerSheet,
    spineOffset: gutter,
    rowGap: gutter,
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
  const { trimW, trimH, bleed, qty, gutter, area, pages: rawPages, paperThickness = 0.1, rotation } = input;

  const pages = rawPages || 16;
  const spineWidth = (pages / 2) * paperThickness;

  // Block rotation: 0 = spine vertical (natural), 90 = spine horizontal
  const rot = ((rotation || 0) % 360 + 360) % 360;
  const blockRotated = (rot >= 45 && rot < 135) || (rot >= 225 && rot < 315);

  const { w: pw, h: ph } = printable(area);
  const sigSizes = [32, 16, 8, 4];

  // Find largest signature size that fits, honouring the chosen block orientation
  let bestSigSize = 4;
  for (const sig of sigSizes) {
    const lay = PB_LAYOUTS[sig];
    if (!lay) continue;
    const cW = trimW + bleed; // spine edge = no bleed
    const cH = trimH + bleed * 2;
    const nP = Math.ceil(lay.cols / 2);
    const bW0 = nP * 2 * cW + (nP > 1 ? gutter : 0);
    const bH0 = lay.rows * cH + (lay.rows > 1 ? gutter : 0);
    const checkW = blockRotated ? bH0 : bW0;
    const checkH = blockRotated ? bW0 : bH0;
    if (checkW <= pw && checkH <= ph) {
      bestSigSize = sig;
      break;
    }
  }

  const layout = PB_LAYOUTS[bestSigSize]!;
  const paddedPages = Math.ceil(pages / bestSigSize) * bestSigSize;
  const totalSigs = paddedPages / bestSigSize;
  const cellW = trimW + bleed;
  const cellH = trimH + bleed * 2;

  // Natural (unrotated) block dimensions
  const numPairs = Math.ceil(layout.cols / 2);
  const pairW = 2 * cellW;
  const blockWnat = numPairs * pairW + (numPairs > 1 ? gutter : 0);
  const blockHnat = layout.rows * cellH + (layout.rows > 1 ? gutter : 0);
  // Effective block dimensions on sheet (after rotation)
  const blockW = blockRotated ? blockHnat : blockWnat;
  const blockH = blockRotated ? blockWnat : blockHnat;

  // How many signature blocks fit on the press sheet
  const blockGapH = 3; // mm between sig blocks horizontal
  const blockGapV = 3; // mm between sig blocks vertical
  const sigsAcross = Math.max(1, Math.floor((pw + blockGapH) / (blockW + blockGapH)));
  const sigsDown = Math.max(1, Math.floor((ph + blockGapV) / (blockH + blockGapV)));
  const sigsPerSheet = sigsAcross * sigsDown;

  const canRepeat = sigsPerSheet >= totalSigs;
  const totalPressSheets = canRepeat ? 1 : Math.ceil(totalSigs / sigsPerSheet);
  const totalSheets = totalPressSheets * qty;

  // Overall grid footprint (all blocks + inter-block gaps)
  const totalGridW = sigsAcross * blockW + Math.max(0, sigsAcross - 1) * blockGapH;
  const totalGridH = sigsDown * blockH + Math.max(0, sigsDown - 1) * blockGapV;
  const gridStartX = area.marginLeft + (pw - totalGridW) / 2;
  const gridStartY = area.marginTop + (ph - totalGridH) / 2;

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

  // Build cells for ALL blocks on the press sheet (sigsAcross × sigsDown).
  // Each block shows the fold pattern (canvas uses the active signature for actual page numbers).
  const cells: ImpositionCell[] = [];
  if (foldMap) {
    const interPairGap = numPairs > 1 ? gutter : 0;
    const halfwayMark = Math.floor(layout.rows / 2);

    for (let by = 0; by < sigsDown; by++) {
      for (let bx = 0; bx < sigsAcross; bx++) {
        const blockOrigX = gridStartX + bx * (blockW + blockGapH);
        const blockOrigY = gridStartY + by * (blockH + blockGapV);

        for (let r = 0; r < layout.rows; r++) {
          for (let c = 0; c < layout.cols; c++) {
            const localPage = foldMap.front[r]?.[c] ?? 0;
            const rowFromBottom = layout.rows - 1 - r;
            // Gripper row (bottom) heads-up; alternate every row going up.
            const natRot = (rowFromBottom % 2 === 1) ? 180 : 0;
            const pairIdx = Math.floor(c / 2);
            const colInPair = c % 2;
            // Cell position/size in NATURAL (unrotated) block frame (origin = block top-left)
            const natX = pairIdx * (pairW + interPairGap) + colInPair * cellW;
            const isInBottomHalf = layout.rows > 1 && r >= halfwayMark;
            const natY = r * cellH + (isInBottomHalf ? gutter : 0);
            const bL0 = colInPair === 0 ? bleed : 0;
            const bR0 = colInPair === 1 ? bleed : 0;
            const bT0 = bleed;
            const bB0 = bleed;

            let finalX: number, finalY: number, finalW: number, finalH: number;
            let finalRot: number;
            let bL: number, bR: number, bT: number, bB: number;

            if (blockRotated) {
              // Rotate 90° CW inside a (blockWnat × blockHnat) → (blockHnat × blockWnat) frame:
              // rect (x, y, w, h) → new top-left (H - y - h, x), new size (h, w).
              // Bleeds rotate CW: B→L, L→T, T→R, R→B (keeps spine edges aligned
              // with the page neighbours in the rotated layout).
              finalX = blockOrigX + (blockHnat - natY - cellH);
              finalY = blockOrigY + natX;
              finalW = cellH;
              finalH = cellW;
              finalRot = (natRot + 90) % 360;
              bL = bB0; bR = bT0; bT = bL0; bB = bR0;
            } else {
              finalX = blockOrigX + natX;
              finalY = blockOrigY + natY;
              finalW = cellW;
              finalH = cellH;
              finalRot = natRot;
              bL = bL0; bR = bR0; bT = bT0; bB = bB0;
            }

            cells.push({
              col: c, row: r,
              x: finalX, y: finalY,
              w: finalW, h: finalH,
              pageNum: localPage,
              rotation: finalRot,
              bleedL: bL, bleedR: bR,
              bleedT: bT, bleedB: bB,
            });
          }
        }
      }
    }
  }

  return {
    mode: 'perfect_bound',
    ups: layout.cols * layout.rows * sigsPerSheet,
    cols: layout.cols,
    rows: layout.rows,
    paperW: area.paperW,
    paperH: area.paperH,
    pieceW: blockRotated ? cellH : cellW,
    pieceH: blockRotated ? cellW : cellH,
    trimW,
    trimH,
    rotated: blockRotated,
    pageRotation: rot,
    wastePercent: wastePercent(area.paperW, area.paperH, totalGridW, totalGridH),
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
  const { trimW, trimH, bleed, qty, gutter, area, rotation, turnType = 'turn', forceCols, forceRows } = input;

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

  // Re-compute fit with final trim dimensions. forceCols/forceRows override the auto-fit
  // (interpreted as PER-HALF for W&T, since the layout is split between two halves).
  const autoCols = fitCount(halfW, tW, bleed, gutter);
  const autoRows = fitCount(halfH, tH, bleed, gutter);
  const cols = forceCols && forceCols > 0 ? forceCols : autoCols;
  const rows = forceRows && forceRows > 0 ? forceRows : autoRows;
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
    gangJobQty = {},
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
    }
  }

  // Default assignments for unset cells.
  // Duplex: back side uses the SAME job as front by default (each job's PDF has its own front+back pages).
  for (let j = 0; j < totalPositions; j++) {
    if (!cellQty[j]) cellQty[j] = 1;
    if (!cellAssign[j]) cellAssign[j] = 1;
    if (sides === 2 && !cellAssignBack[j]) {
      cellAssignBack[j] = cellAssign[j];
    }
  }

  // Sheets needed: for each job, job.qty / cellsAssignedToJob = sheets to satisfy that job.
  // Overall sheets = max over all jobs (the slowest job drives the press run).
  //
  // Preferred input: gangJobQty[1-based page] = total copies wanted for that job.
  // Fallback (legacy): take the MAX of cellQty values for cells of that page (NOT sum —
  // multiple cells of the same job produce copies in parallel, they don't add up).
  const cellsPerPage: Record<number, number> = {};
  const qtyPerPage: Record<number, number> = {};
  for (let k = 0; k < totalPositions; k++) {
    const pg = cellAssign[k] || 1;
    cellsPerPage[pg] = (cellsPerPage[pg] || 0) + 1;
    const cellContribution = gangJobQty[pg] ?? cellQty[k] ?? 1;
    qtyPerPage[pg] = Math.max(qtyPerPage[pg] || 0, cellContribution);
  }

  let gangSheetsNeeded = 1;
  for (const pg in qtyPerPage) {
    const cells = cellsPerPage[pg] || 1;
    gangSheetsNeeded = Math.max(gangSheetsNeeded, Math.ceil(qtyPerPage[pg] / cells));
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
