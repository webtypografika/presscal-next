// PressCal Pro — Imposition Engine
// Pure functions: no DB, no side effects

import type { ImpositionMode, ImpositionResult, ImpositionCell } from '@/types/calculator';

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
  rotation?: 0 | 90 | 180 | 270;
  // booklet/PB specific
  pages?: number;        // total pages for booklet/PB
  paperThickness?: number; // mm per sheet (for creep)
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

/** Calculate waste percentage */
function wastePercent(paperW: number, paperH: number, usedW: number, usedH: number): number {
  const total = paperW * paperH;
  if (total <= 0) return 0;
  const used = usedW * usedH;
  return Math.max(0, Math.min(100, ((total - used) / total) * 100));
}

// ─── MODE FUNCTIONS ───

/** N-Up: generic tiling */
export function calcNUp(input: ImpositionInput): ImpositionResult {
  const { trimW, trimH, bleed, qty, sides, gutter, area, forceUps, forceCols, forceRows } = input;

  const cellW = trimW + bleed * 2;
  const cellH = trimH + bleed * 2;
  const { w: pw, h: ph } = printable(area);

  let cols: number, rows: number, rotated: boolean;

  if (forceCols && forceRows) {
    cols = forceCols;
    rows = forceRows;
    rotated = false;
  } else if (forceUps) {
    // Try to find best grid for forced UPs
    const best = bestOrientation(pw, ph, cellW, cellH, gutter);
    cols = best.cols;
    rows = best.rows;
    rotated = best.rotated;
    // Adjust to match forced UPs if possible
    while (cols * rows > forceUps && cols > 1) cols--;
    while (cols * rows > forceUps && rows > 1) rows--;
  } else {
    ({ cols, rows, rotated } = bestOrientation(pw, ph, cellW, cellH, gutter));
  }

  const ups = Math.max(cols * rows, 1);
  const actualCellW = rotated ? cellH : cellW;
  const actualCellH = rotated ? cellW : cellH;

  const usedW = cols * actualCellW + (cols - 1) * gutter;
  const usedH = rows * actualCellH + (rows - 1) * gutter;

  const rawSheets = Math.ceil(qty / ups);
  const totalSheets = sides === 2 ? rawSheets : rawSheets;

  const cells = buildCells(
    cols, rows, actualCellW, actualCellH, gutter,
    area.marginLeft, area.marginTop,
  );

  return {
    mode: 'nup',
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
  };
}

/** Cut & Stack: same grid as N-Up, sequential numbering for NCR/pads */
export function calcCutStack(input: ImpositionInput): ImpositionResult {
  const result = calcNUp(input);

  // Re-assign page numbers for stack numbering
  const sheetsNeeded = result.totalSheets || 1;
  const cells = result.cells.map((cell, idx) => ({
    ...cell,
    pageNum: cell.pageNum, // posIdx for stack ordering
  }));

  return {
    ...result,
    mode: 'cutstack',
    cells,
  };
}

/** Booklet: saddle stitch — asymmetric bleed (spine=0, face=bleed) */
export function calcBooklet(input: ImpositionInput): ImpositionResult {
  const { trimW, trimH, bleed, qty, sides, gutter, area, pages: rawPages, paperThickness = 0 } = input;

  // Pages must be multiple of 4
  const pages = Math.ceil((rawPages || 4) / 4) * 4;
  const signatures = pages / 4; // sheets in signature

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
  const sheetsNeeded = Math.ceil(signatures / spreadsPerSheet);
  // Total copies
  const totalSheets = sheetsNeeded * qty;

  const usedW = spreadCols * spreadW + (spreadCols - 1) * gutter;
  const usedH = spreadRows * spreadH + (spreadRows - 1) * gutter;

  // Build cells for one spread
  const cells: ImpositionCell[] = [];
  for (let sr = 0; sr < spreadRows; sr++) {
    for (let sc = 0; sc < spreadCols; sc++) {
      const baseX = area.marginLeft + sc * (spreadW + gutter);
      const baseY = area.marginTop + sr * (spreadH + gutter);
      // Left page
      cells.push({
        col: sc * 2,
        row: sr,
        x: baseX,
        y: baseY,
        w: cellW,
        h: cellH,
        pageNum: cells.length + 1,
      });
      // Right page
      cells.push({
        col: sc * 2 + 1,
        row: sr,
        x: baseX + cellW,
        y: baseY,
        w: cellW,
        h: cellH,
        pageNum: cells.length + 1,
      });
    }
  }

  return {
    mode: 'booklet',
    ups: spreadsPerSheet * 2, // pages per sheet side
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
    signatures,
  };
}

/** Perfect Bound: octavo signatures */
export function calcPerfectBound(input: ImpositionInput): ImpositionResult {
  const { trimW, trimH, bleed, qty, gutter, area, pages: rawPages, paperThickness = 0.1 } = input;

  const pages = rawPages || 16;
  const spineWidth = (pages / 2) * paperThickness;

  // Test signature sizes, pick largest that fits
  const sigSizes = [32, 16, 8, 4];
  const { w: pw, h: ph } = printable(area);

  let bestSigSize = 4;
  for (const sig of sigSizes) {
    // For a sig-page signature: pages per side of sheet
    const pagesPerSide = sig / 2;
    // Layout: rows × cols of page cells
    const pCols = sig <= 4 ? 2 : sig <= 8 ? 2 : sig <= 16 ? 4 : 4;
    const pRows = pagesPerSide / pCols;

    const cellW = trimW + bleed; // spine edge = no bleed
    const cellH = trimH + bleed * 2;

    const neededW = pCols * cellW + (pCols - 1) * gutter;
    const neededH = pRows * cellH + (pRows - 1) * gutter;

    if (neededW <= pw && neededH <= ph) {
      bestSigSize = sig;
      break;
    }
  }

  const totalSigs = Math.ceil(pages / bestSigSize);
  const pagesPerSide = bestSigSize / 2;
  const pCols = bestSigSize <= 4 ? 2 : bestSigSize <= 8 ? 2 : bestSigSize <= 16 ? 4 : 4;
  const pRows = Math.ceil(pagesPerSide / pCols);

  const cellW = trimW + bleed;
  const cellH = trimH + bleed * 2;

  const usedW = pCols * cellW + (pCols - 1) * gutter;
  const usedH = pRows * cellH + (pRows - 1) * gutter;

  // Total sheets = sigs × copies
  const sheetsPerCopy = totalSigs;
  const totalSheets = sheetsPerCopy * qty;

  // Build cells for one sig
  const cells = buildCells(
    pCols, pRows, cellW, cellH, gutter,
    area.marginLeft, area.marginTop,
  );

  return {
    mode: 'perfect_bound',
    ups: pCols * pRows,
    cols: pCols,
    rows: pRows,
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
  };
}

/** Work & Turn: split sheet in half, fit per half, ups = fitsPerHalf × 2 */
export function calcWorkTurn(input: ImpositionInput): ImpositionResult {
  const { trimW, trimH, bleed, qty, gutter, area } = input;

  const cellW = trimW + bleed * 2;
  const cellH = trimH + bleed * 2;
  const { w: pw, h: ph } = printable(area);

  // Work & Turn: split sheet left-right
  const halfW = pw / 2;

  // Try normal orientation
  const cols1 = fitCount(halfW, cellW, gutter);
  const rows1 = fitCount(ph, cellH, gutter);
  const ups1 = cols1 * rows1 * 2;

  // Try rotated
  const cols2 = fitCount(halfW, cellH, gutter);
  const rows2 = fitCount(ph, cellW, gutter);
  const ups2 = cols2 * rows2 * 2;

  let cols: number, rows: number, rotated: boolean;
  if (ups2 > ups1) {
    cols = cols2; rows = rows2; rotated = true;
  } else {
    cols = cols1; rows = rows1; rotated = false;
  }

  const ups = Math.max(cols * rows * 2, 1);
  const rawSheets = Math.ceil(qty / ups);

  const actualCellW = rotated ? cellH : cellW;
  const actualCellH = rotated ? cellW : cellH;

  const usedW = cols * actualCellW + (cols - 1) * gutter;
  const usedH = rows * actualCellH + (rows - 1) * gutter;

  // Build cells for both halves
  const cells: ImpositionCell[] = [];
  // Left half
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        col: c,
        row: r,
        x: area.marginLeft + c * (actualCellW + gutter),
        y: area.marginTop + r * (actualCellH + gutter),
        w: actualCellW,
        h: actualCellH,
        pageNum: r * cols + c + 1,
      });
    }
  }
  // Right half (mirror)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        col: cols + c,
        row: r,
        x: area.marginLeft + halfW + gutter + c * (actualCellW + gutter),
        y: area.marginTop + r * (actualCellH + gutter),
        w: actualCellW,
        h: actualCellH,
        pageNum: r * cols + c + 1, // same page nums — it's the back
        rotation: 180,
      });
    }
  }

  return {
    mode: 'workturn',
    ups,
    cols: cols * 2,
    rows,
    paperW: area.paperW,
    paperH: area.paperH,
    pieceW: actualCellW,
    pieceH: actualCellH,
    trimW,
    trimH,
    rotated,
    wastePercent: wastePercent(area.paperW, area.paperH, usedW * 2 + gutter, usedH),
    cells,
    totalSheets: rawSheets,
  };
}

// ─── DISPATCHER ───

const MODE_MAP: Record<ImpositionMode, (input: ImpositionInput) => ImpositionResult> = {
  nup: calcNUp,
  cutstack: calcCutStack,
  booklet: calcBooklet,
  perfect_bound: calcPerfectBound,
  workturn: calcWorkTurn,
  gangrun: calcNUp,      // Gang run uses N-Up grid, sheets calculated differently per-product
  stepmulti: calcNUp,    // Step multi uses N-Up base, blocks assigned manually
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
