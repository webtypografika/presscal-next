// PressCal Pro — Calculator Types

import type { UUID } from './common';

export type ImpositionMode = 'nup' | 'booklet' | 'perfect_bound' | 'cutstack' | 'workturn' | 'gangrun' | 'stepmulti';

export type CoverageLevel = 'low' | 'mid' | 'high' | 'pdf';

export interface CalculatorInput {
  machineId: UUID;
  paperId: UUID;
  jobW: number;           // trim width mm
  jobH: number;           // trim height mm
  qty: number;
  sides: 1 | 2;
  colorMode: 'color' | 'bw';
  bleed: number;          // mm

  // Imposition
  impositionMode: ImpositionMode;
  impoRotation: 0 | 90 | 180 | 270;
  impoDuplexOrient: 'h2h' | 'h2f';
  impoGutter: number;
  impoBleed: number;
  impoForceUps?: number;
  impoCropMarks: boolean;

  // Offset
  offsetFrontCmyk?: number;
  offsetBackCmyk?: number;
  offsetFrontPms?: number;
  offsetBackPms?: number;
  offsetOilVarnish?: boolean;

  // Digital specialty
  specialtyColors?: Record<string, boolean>;
  coverageLevel: CoverageLevel;
  coveragePdf?: { c: number; m: number; y: number; k: number };

  // Finishing
  guillotineId?: UUID;
  lamMachineId?: UUID;
  lamFilmId?: UUID;
  lamSides?: 1 | 2;
  bindingType?: '' | 'staple' | 'glue' | 'spiral';
  bindingMachineId?: UUID;
}

export interface CalculatorResult {
  // Sheet counts
  ups: number;
  cols: number;
  rows: number;
  rawMachineSheets: number;
  wasteSheets: number;
  totalMachineSheets: number;
  totalStockSheets: number;

  // Costs
  costPaper: number;
  costPrint: number;
  costFinishing: number;
  costGuillotine: number;
  costLamination: number;
  costBinding: number;
  totalCost: number;

  // Revenue
  chargeFinishing: number;
  chargeLamination: number;
  chargeGuillotine: number;
  profitAmount: number;
  sellPrice: number;
  pricePerPiece: number;

  // Debug
  printModel: string;
  printDetail: Record<string, unknown>;
}

export interface ImpositionCell {
  col: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
  pageNum?: number;
  rotation?: number;
}

export interface ImpositionResult {
  mode: ImpositionMode;
  ups: number;
  cols: number;
  rows: number;
  paperW: number;
  paperH: number;
  pieceW: number;
  pieceH: number;
  trimW: number;
  trimH: number;
  rotated: boolean;
  wastePercent: number;
  cells: ImpositionCell[];
  totalSheets?: number;
  signatures?: number;
}
