// PressCal Pro — Calculator Types

import type { UUID } from './common';

export type ImpositionMode = 'nup' | 'booklet' | 'perfect_bound' | 'cutstack' | 'workturn' | 'gangrun' | 'stepmulti';

export type CoverageLevel = 'low' | 'mid' | 'high' | 'pdf';

export type CutStackOrder = 'row' | 'column' | 'snake' | 'custom';

export type WorkTurnType = 'turn' | 'tumble';

export interface CalculatorInput {
  machineId: UUID;
  paperId: UUID;
  productId?: UUID;
  jobW: number;           // trim width mm
  jobH: number;           // trim height mm
  qty: number;
  sides: 1 | 2;
  colorMode: 'color' | 'bw';
  bleed: number;          // mm
  wasteFixed?: number;    // extra machine sheets (φύλλα μοντάζ)

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

// ─── BOOKLET SIGNATURE MAP ───

export interface BookletSignatureSheet {
  front: [number, number];  // [leftPage, rightPage]
  back: [number, number];   // [leftPage, rightPage]
}

export interface BookletSignatureMap {
  sheets: BookletSignatureSheet[];
  paddedPages: number;
  totalSheets: number;
}

// ─── CUT & STACK POSITION ───

export interface CutStackPosition {
  col: number;
  row: number;
  posLabel: number;    // 1-indexed display number
  stackNum: number;    // 0-indexed stack order
  seqFrom: number;     // starting sequential number
  seqTo: number;       // ending sequential number
}

// ─── GANG RUN ───

export interface GangRunData {
  cellAssign: Record<number, number>;      // posIdx → front page number
  cellAssignBack: Record<number, number>;  // posIdx → back page number
  cellQty: Record<number, number>;         // posIdx → copies
  gangSheetsNeeded: number;
  pageCount: number;
}

// ─── STEP MULTI BLOCK ───

export interface StepBlock {
  pageNum: number;
  backPageNum: number | null;
  trimW: number;
  trimH: number;
  cols: number;
  rows: number;
  rotation: 0 | 90 | 180 | 270;
  x: number;       // position in printable area (mm)
  y: number;
  blockW: number;  // computed: cols × cellW + gutters
  blockH: number;  // computed: rows × cellH + gutters
  _manualGrid?: boolean;
}

// ─── IMPOSITION RESULT ───

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

  // Margins (mm)
  marginL?: number;
  marginR?: number;
  marginT?: number;
  marginB?: number;

  // Offset (mm)
  offsetX?: number;
  offsetY?: number;

  // Printable area (mm)
  printableW?: number;
  printableH?: number;

  // Booklet-specific
  signatureMap?: BookletSignatureMap;
  creepPerSheet?: number[];
  spreadsAcross?: number;
  sigsPerSheet?: number;
  spineOffset?: number;
  rowGap?: number;
  pageRotation?: number;
  headToHead?: boolean;
  pageCount?: number;

  // Perfect Bound-specific
  gapVmm?: number;
  gapHmm?: number;
  sigsAcross?: number;
  sigsDown?: number;
  blockGapH?: number;
  blockGapV?: number;
  numSigs?: number;
  canRepeat?: boolean;
  totalPressSheets?: number;
  bodyPages?: number;

  // Cut & Stack-specific
  stackPositions?: CutStackPosition[];
  stackOrder?: CutStackOrder;

  // Gang Run-specific
  gangData?: GangRunData;

  // Step Multi-specific
  blocks?: StepBlock[];

  // Work & Turn-specific
  turnType?: WorkTurnType;
  fitsPerHalf?: number;
}
