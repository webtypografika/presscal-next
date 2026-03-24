// PressCal Pro — Shared Calculation Engine
// Pure TypeScript, no DOM — works on client AND server

export { getAreaSizeMult, classifySheetSize } from './paper';
export type { CalculatorInput, CalculatorResult, ImpositionResult } from '../types/calculator';

/**
 * Main calculation entry point
 * Mirrors the old _shCalcQuoteInner() pipeline
 *
 * TODO: Port from mod_sheet.js during Phase 6
 */
// export function calculateJob(input: CalculatorInput, machine: Machine, paper: Material): CalculatorResult {
//   1. Calculate imposition (ups, cols, rows, sheets needed)
//   2. Calculate paper cost
//   3. Calculate print cost (dispatch to cost model)
//   4. Calculate finishing costs
//   5. Apply profile markup
//   6. Return totals
// }
