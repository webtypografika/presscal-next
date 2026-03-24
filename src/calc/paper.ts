// PressCal Pro — Paper Calculations
// Ported from mod_sheet.js _shGetAreaSizeMult()

/**
 * Continuous area-based size multiplier
 * Reference: A4 = 210 × 297 = 62,370 mm²
 *
 * Examples:
 *   A4 (210×297) → 1.0
 *   A3 (297×420) → 2.0
 *   330×487     → 2.58 (continuous, not bucketed)
 */
export function getAreaSizeMult(w: number, h: number): number {
  const A4_AREA = 210 * 297;
  return (w * h) / A4_AREA;
}

/**
 * Classify sheet size for CPC contract pricing
 * A4 boundary: up to 250×350mm (per vendor contracts)
 */
export function classifySheetSize(w: number, h: number): 'a4' | 'a3' | 'banner' {
  const ls = Math.max(w, h);
  const ss = Math.min(w, h);

  if (ls <= 350 && ss <= 250) return 'a4';
  if (ls <= 500 && ss <= 360) return 'a3';
  return 'banner';
}

/**
 * Calculate how many machine sheets can be cut from one stock sheet
 */
export function calcCutsPerStock(
  stockW: number,
  stockH: number,
  machW: number,
  machH: number
): number {
  // Try both orientations
  const opt1 = Math.floor(stockW / machW) * Math.floor(stockH / machH);
  const opt2 = Math.floor(stockW / machH) * Math.floor(stockH / machW);
  return Math.max(opt1, opt2);
}

/**
 * Calculate paper cost
 */
export function calcPaperCost(
  stockSheets: number,
  costPerSheet: number,
  markupPct: number
): { cost: number; charge: number } {
  const cost = stockSheets * costPerSheet;
  const charge = cost * (1 + markupPct / 100);
  return { cost, charge };
}
