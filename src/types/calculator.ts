// PressCal Pro — Calculator Types

import type { UUID } from './common';

export type ImpositionMode = 'nup' | 'booklet' | 'perfect_bound' | 'cutstack' | 'workturn' | 'gangrun' | 'stepmulti';

export type CoverageLevel = 'low' | 'mid' | 'high' | 'pdf';

export type CutStackOrder = 'row' | 'column' | 'snake' | 'custom';

export type WorkTurnType = 'turn' | 'tumble';

export interface CalculatorInput {
  machineId: UUID;
  machineSheetW?: number;   // override machine sheet LS (mm)
  machineSheetH?: number;   // override machine sheet SS (mm)
  feedEdge?: 'sef' | 'lef'; // feed direction
  paperId: UUID;
  productId?: UUID;
  jobW: number;           // trim width mm
  jobH: number;           // trim height mm
  qty: number;
  originalQty?: number;   // actual product pieces (e.g. 30 pads) when qty is sheets
  sides: 1 | 2;
  colorMode: 'color' | 'bw';
  bleed: number;          // mm
  wasteFixed?: number;    // extra machine sheets (φύλλα μοντάζ)

  // Imposition
  impositionMode: ImpositionMode;
  impoRotation: 0 | 90 | 180 | 270;
  impoDuplexOrient: 'h2h' | 'h2f' | 'h2f_cols';
  impoGutter: number;
  impoGutterY?: number;
  impoBleed: number;
  impoForceUps?: number;
  impoForceCols?: number;
  impoForceRows?: number;
  impoTurnType?: WorkTurnType;
  impoCropMarks: boolean;
  pages?: number;
  paperThickness?: number;

  // Gang Run
  gangPageCount?: number;
  gangCellAssign?: Record<number, number>;
  gangJobQty?: Record<number, number>;
  gangAutoOptimize?: boolean;

  // Cut & Stack
  stackOrder?: 'row' | 'column' | 'snake';
  stackStartNum?: number;

  // Step Multi
  stepBlocks?: unknown[]; // StepBlock[] — untyped here to avoid circular import

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
  creaseMachineId?: UUID;
  creaseCount?: number;         // creases per sheet (per-crease charge mode)
  foldMachineId?: UUID;
  foldType?: string;            // fold type key (half | cz | gate | ...)
  gatherMachineId?: UUID;
  gatherSignatures?: number;    // signatures per book (per-signature charge mode)
  customMachineIds?: UUID[];    // multiple custom postpress machines selected

  // Cover (independent calculator)
  cover?: {
    coverWidth: number;
    coverHeight: number;
    coverBleed?: number;
    machineId?: UUID;
    paperId?: UUID;
    colorMode: 'color' | 'bw';
    sides: 1 | 2;
    coverageLevel: CoverageLevel;
    platesFront?: number;
    platesBack?: number;
    pmsFront?: number;
    pmsBack?: number;
    lamMachineId?: UUID;
    lamFilmId?: UUID;
    lamSides?: 1 | 2;
    guillotineId?: UUID;
    pages: number;
    wasteFixed?: number;
  };

  // Per-job overrides
  overrides?: {
    paperPriceOverride?: number;
    plateDiscount?: number;
    hourlyOverride?: number;
    guillotineDiscount?: number;
    lamDiscount?: number;
    bindingDiscount?: number;
    extraPerPiece?: number;
    extraPerSheet?: number;
    extraPerFace?: number;
    extraFixed?: number;
  };
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
  costCrease: number;
  costFold: number;
  costGather: number;
  costCustom: number;
  totalCost: number;

  // Revenue
  chargeFinishing: number;
  chargeLamination: number;
  chargeGuillotine: number;
  chargeCrease: number;
  chargeFold: number;
  chargeGather: number;
  chargeCustom: number;
  customBreakdown?: Array<{ id: string; name: string; charge: number }>;
  extraCharges: number;
  profitAmount: number;
  sellPrice: number;
  pricePerPiece: number;

  // Lamination
  lamWarnings?: string[];

  // Debug
  printModel: string;
  printDetail: Record<string, unknown>;
}

export interface ImpositionCell {
  col: number;
  row: number;
  x: number;      // cell top-left (includes bleed)
  y: number;
  w: number;       // cell width (trim + bleedL + bleedR)
  h: number;       // cell height (trim + bleedT + bleedB)
  pageNum?: number;
  rotation?: number;
  // Per-side bleed (asymmetric: internal sides may be 0 or reduced)
  bleedL: number;  // mm
  bleedR: number;
  bleedT: number;
  bleedB: number;
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

// ─── PERFECT BOUND SIGNATURE ───

export interface PBSignature {
  startPage: number;       // first page of this signature (1-indexed)
  actualPages: number;     // actual pages (may be < sigSize if last sig)
  signatureMap: {
    front: number[][];     // front[row][col] = local page number
    back: number[][];      // back[row][col] = local page number
  };
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

  // Warning: grid extends beyond printable area (into machine margins)
  marginWarning?: boolean;

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
  spreadDown?: number;
  sigsPerSheet?: number;
  spineOffset?: number;
  rowGap?: number;
  pageRotation?: number;
  headToHead?: boolean;
  pageCount?: number;

  // Perfect Bound-specific
  spineWidth?: number;
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
  pbSignatures?: PBSignature[];
  sigSize?: number;

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
  halfCols?: number;
  halfRows?: number;

  // Duplex orientation (h2f = alternate rows flipped 180°, h2f_cols = alternate cols)
  duplexOrient?: 'h2h' | 'h2f' | 'h2f_cols';
}
