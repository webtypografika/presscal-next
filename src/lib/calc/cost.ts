// PressCal Pro — Cost Engine
// Pure functions: take data as arguments, return cost breakdowns

import type { CalculatorResult } from '@/types/calculator';
import type { DigitalSpecs, OffsetSpecs } from '@/types/machine';
import type { ImpositionResult } from '@/types/calculator';
import { cutsPerStockSheet } from './imposition';

// ─── INPUT TYPES ───

export interface CostInput {
  // Machine
  machineCat: 'digital' | 'offset';
  machineMaxW: number;
  machineMaxH: number;
  specs: DigitalSpecs | OffsetSpecs;
  includeDepreciation: boolean;
  machineCost?: number;
  machineLifetimePasses?: number;

  // Paper
  paperW: number;         // stock sheet mm
  paperH: number;         // stock sheet mm
  paperCostPerUnit: number;
  paperGsm: number;

  // Job
  qty: number;
  sides: 1 | 2;
  colorMode: 'color' | 'bw';
  coverageLevel: 'low' | 'mid' | 'high' | 'pdf';
  coveragePdf?: { c: number; m: number; y: number; k: number };

  // Imposition result
  imposition: ImpositionResult;

  // Finishing
  guillotine?: {
    costPerCut?: number;
    costPerKg?: number;
    costPerStack?: number;
    costPerMinute?: number;
    speed?: number;
  };
  lamination?: {
    filmCostPerSqm: number;
    machineSetupCost: number;
    machineRunCostPerSheet: number;
    sides: 1 | 2;
  };
  binding?: {
    type: 'staple' | 'glue' | 'spiral';
    costPerUnit: number;
    setupCost: number;
  };

  // Profile markups
  paperMarkup: number;       // %
  printMarkup: number;       // %
  guillotineMarkup: number;  // %
  lamMarkup: number;         // %
  bindingMarkup: number;     // %
  minChargePrint?: number;
  minChargeGuillotine?: number;
  minChargeLam?: number;
  minChargeBinding?: number;

  // Offset-specific
  offsetFrontCmyk?: number;
  offsetBackCmyk?: number;
  offsetFrontPms?: number;
  offsetBackPms?: number;
  offsetOilVarnish?: boolean;
}

// ─── COVERAGE MULTIPLIERS ───

const COVERAGE: Record<string, number> = {
  low: 0.05,
  mid: 0.15,
  high: 0.30,
  pdf: 1.0, // actual from PDF analysis
};

// ─── DIGITAL COST MODELS ───

/** A4 area in mm² */
const A4_AREA = 210 * 297;
const A3_AREA = 297 * 420;

function sheetSizeCategory(w: number, h: number): 'a4' | 'a3' | 'banner' {
  const area = w * h;
  if (area <= A4_AREA * 1.1) return 'a4';
  if (area <= A3_AREA * 1.1) return 'a3';
  return 'banner';
}

/** simple_in: CPC-only model (click cost includes everything) */
function digitalSimpleIn(
  specs: DigitalSpecs,
  totalFaces: number,
  sheetW: number, sheetH: number,
  colorMode: 'color' | 'bw',
): number {
  const size = sheetSizeCategory(sheetW, sheetH);
  let cpc = 0;
  if (colorMode === 'color') {
    cpc = size === 'a4' ? (specs.clickA4Color || 0)
        : size === 'a3' ? (specs.clickA3Color || 0)
        : (specs.clickBannerColor || 0);
  } else {
    cpc = size === 'a4' ? (specs.clickA4Bw || 0)
        : size === 'a3' ? (specs.clickA3Bw || 0)
        : (specs.clickBannerBw || 0);
  }
  return totalFaces * cpc;
}

/** simple_out: CPC + separate toner cost */
function digitalSimpleOut(
  specs: DigitalSpecs,
  totalFaces: number,
  sheetW: number, sheetH: number,
  colorMode: 'color' | 'bw',
  areaRatio: number,
): number {
  const cpcCost = digitalSimpleIn(specs, totalFaces, sheetW, sheetH, colorMode);

  // Add toner cost based on coverage
  let tonerPerFace = 0;
  if (colorMode === 'color') {
    const channels = [specs.tonerC, specs.tonerM, specs.tonerY, specs.tonerK].filter(Boolean);
    for (const ch of channels) {
      if (ch && ch.yield > 0) {
        tonerPerFace += ch.cost / ch.yield;
      }
    }
  } else {
    if (specs.tonerK && specs.tonerK.yield > 0) {
      tonerPerFace = specs.tonerK.cost / specs.tonerK.yield;
    }
  }

  return cpcCost + totalFaces * tonerPerFace * areaRatio;
}

/** precision: per-channel cost/yield + drum + fuser + belt + waste */
function digitalPrecision(
  specs: DigitalSpecs,
  totalFaces: number,
  colorMode: 'color' | 'bw',
  areaRatio: number,
): number {
  let tonerPerFace = 0;
  let nonTonerPerFace = 0;

  // Toner cost per face (scaled by coverage/area)
  if (colorMode === 'color') {
    const channels = [specs.tonerC, specs.tonerM, specs.tonerY, specs.tonerK].filter(Boolean);
    for (const ch of channels) {
      if (ch && ch.yield > 0) {
        tonerPerFace += ch.cost / ch.yield;
      }
    }
  } else {
    if (specs.tonerK && specs.tonerK.yield > 0) {
      tonerPerFace = specs.tonerK.cost / specs.tonerK.yield;
    }
  }

  // Extra/specialty colors
  if (specs.extraColors) {
    for (const extra of specs.extraColors) {
      if (extra.yield > 0) {
        tonerPerFace += extra.cost / extra.yield;
      }
    }
  }

  // Non-toner: drum, fuser, belt, waste are usually per-face flat costs
  // These would come from consumables linked to the machine
  // For now, assume they're baked into the click cost or handled separately

  return totalFaces * (tonerPerFace * areaRatio + nonTonerPerFace);
}

/** Calculate digital print cost */
function calcDigitalCost(input: CostInput, totalSheets: number): number {
  const specs = input.specs as DigitalSpecs;
  const totalFaces = input.sides === 2 ? totalSheets * 2 : totalSheets;

  // Area ratio: how much of the sheet is covered by pieces
  const impo = input.imposition;
  const piecesArea = impo.ups * impo.pieceW * impo.pieceH;
  const sheetArea = input.machineMaxW * input.machineMaxH;
  const coverageMult = input.coverageLevel === 'pdf'
    ? 1.0
    : COVERAGE[input.coverageLevel] || 0.15;
  const areaRatio = Math.min(1, (piecesArea / sheetArea)) * (coverageMult / 0.05);

  let printCost: number;

  switch (specs.costMode) {
    case 'simple_in':
      printCost = digitalSimpleIn(specs, totalFaces, input.machineMaxW, input.machineMaxH, input.colorMode);
      break;
    case 'simple_out':
      printCost = digitalSimpleOut(specs, totalFaces, input.machineMaxW, input.machineMaxH, input.colorMode, areaRatio);
      break;
    case 'precision':
      printCost = digitalPrecision(specs, totalFaces, input.colorMode, areaRatio);
      break;
    default:
      printCost = digitalSimpleIn(specs, totalFaces, input.machineMaxW, input.machineMaxH, input.colorMode);
  }

  // Depreciation
  if (input.includeDepreciation && input.machineCost && input.machineLifetimePasses) {
    const depPerSheet = input.machineCost / input.machineLifetimePasses;
    printCost += totalFaces * depPerSheet;
  }

  // Speed zone markup
  if (specs.speedZones && input.paperGsm) {
    const zone = specs.speedZones.find(z => input.paperGsm >= z.gsmFrom && input.paperGsm <= z.gsmTo);
    if (zone && zone.markup > 0) {
      printCost *= (1 + zone.markup / 100);
    }
  }

  return printCost;
}

// ─── OFFSET COST MODEL ───

function calcOffsetCost(input: CostInput, totalSheets: number): number {
  const specs = input.specs as OffsetSpecs;

  const frontColors = (input.offsetFrontCmyk || 4) + (input.offsetFrontPms || 0);
  const backColors = input.sides === 2 ? (input.offsetBackCmyk || 4) + (input.offsetBackPms || 0) : 0;
  const totalColors = frontColors + backColors;

  // Passes calculation
  const passesPerSide = Math.ceil(frontColors / specs.towers);
  const backPasses = input.sides === 2 ? Math.ceil(backColors / specs.towers) : 0;
  const totalPasses = specs.perfecting
    ? Math.max(passesPerSide, backPasses)
    : passesPerSide + backPasses;

  // Plate cost
  const plateCost = totalColors * specs.plateCost;

  // Blanket wear
  const blanketCost = totalSheets * totalPasses * (specs.blanketCost / specs.blanketLife);

  // Ink cost (simplified: based on coverage and area)
  const sheetArea = input.machineMaxW * input.machineMaxH / 1_000_000; // m²
  const coverageMult = COVERAGE[input.coverageLevel] || 0.15;
  const inkGm2 = specs.inkGm2 || 1.5;
  const inkPricePerKg = 25; // default, should come from consumables
  const inkCostPerSheet = sheetArea * inkGm2 * coverageMult * totalColors * (inkPricePerKg / 1000);
  const totalInkCost = totalSheets * inkCostPerSheet;

  // Varnish (if oil varnish)
  let varnishCost = 0;
  if (input.offsetOilVarnish && specs.hasVarnishTower) {
    varnishCost = totalSheets * sheetArea * inkGm2 * 0.5 * (inkPricePerKg / 1000);
  }

  // Run time
  const setupMin = specs.setupMin || 15;
  const sheetsPerHour = specs.speed || 5000;
  const runHours = totalSheets * totalPasses / sheetsPerHour;
  const totalHours = (setupMin / 60) + runHours;
  const hourlyCost = totalHours * specs.hourCost;

  return plateCost + blanketCost + totalInkCost + varnishCost + hourlyCost;
}

// ─── PAPER COST ───

function calcPaperCost(input: CostInput, totalMachineSheets: number): { totalStockSheets: number; cost: number } {
  const cuts = cutsPerStockSheet(
    input.paperW, input.paperH,
    input.machineMaxW, input.machineMaxH,
  );
  const totalStockSheets = Math.ceil(totalMachineSheets / cuts);
  return {
    totalStockSheets,
    cost: totalStockSheets * input.paperCostPerUnit,
  };
}

// ─── FINISHING COSTS ───

function calcGuillotineCost(input: CostInput, totalSheets: number): number {
  if (!input.guillotine) return 0;
  const g = input.guillotine;

  // Simplified: cost per cut × estimated cuts
  const cutsPerSheet = (input.imposition.cols + 1) + (input.imposition.rows + 1);
  const totalCuts = totalSheets * cutsPerSheet;

  let cost = 0;
  if (g.costPerCut) cost += totalCuts * g.costPerCut;
  if (g.costPerMinute && g.speed) {
    const minutes = totalCuts / (g.speed || 30);
    cost += minutes * g.costPerMinute;
  }

  return cost;
}

function calcLaminationCost(input: CostInput, totalSheets: number): number {
  if (!input.lamination) return 0;
  const lam = input.lamination;

  const sheetArea = input.machineMaxW * input.machineMaxH / 1_000_000; // m²
  const faces = lam.sides === 2 ? totalSheets * 2 : totalSheets;

  const filmCost = faces * sheetArea * lam.filmCostPerSqm;
  const runCost = faces * lam.machineRunCostPerSheet;
  const setupCost = lam.machineSetupCost;

  return filmCost + runCost + setupCost;
}

function calcBindingCost(input: CostInput): number {
  if (!input.binding) return 0;
  const b = input.binding;
  return b.setupCost + input.qty * b.costPerUnit;
}

// ─── WASTE ───

function calcWasteSheets(totalSheets: number, machineCat: 'digital' | 'offset', specs: DigitalSpecs | OffsetSpecs): number {
  if (machineCat === 'offset') {
    const defaultWaste = (specs as OffsetSpecs).defaultWaste || 50;
    return defaultWaste + Math.ceil(totalSheets * 0.02); // fixed + 2%
  }
  // Digital: minimal waste
  return Math.ceil(totalSheets * 0.01);
}

// ─── MAIN CALCULATOR ───

export function calculateCost(input: CostInput): CalculatorResult {
  const impo = input.imposition;
  const rawMachineSheets = impo.totalSheets || Math.ceil(input.qty / Math.max(impo.ups, 1));

  // Waste
  const wasteSheets = calcWasteSheets(rawMachineSheets, input.machineCat, input.specs);
  const totalMachineSheets = rawMachineSheets + wasteSheets;

  // Paper
  const paper = calcPaperCost(input, totalMachineSheets);

  // Print
  const costPrint = input.machineCat === 'digital'
    ? calcDigitalCost(input, totalMachineSheets)
    : calcOffsetCost(input, totalMachineSheets);

  // Finishing
  const costGuillotine = calcGuillotineCost(input, totalMachineSheets);
  const costLamination = calcLaminationCost(input, totalMachineSheets);
  const costBinding = calcBindingCost(input);
  const costFinishing = costGuillotine + costLamination + costBinding;

  // Total cost
  const totalCost = paper.cost + costPrint + costFinishing;

  // Revenue (apply markups from profile)
  const chargeGuillotine = Math.max(
    costGuillotine * (1 + input.guillotineMarkup / 100),
    input.minChargeGuillotine || 0,
  );
  const chargeLamination = Math.max(
    costLamination * (1 + input.lamMarkup / 100),
    input.minChargeLam || 0,
  );
  const chargeBinding = costBinding * (1 + input.bindingMarkup / 100);
  const chargeFinishing = chargeGuillotine + chargeLamination + chargeBinding;

  const chargePaper = paper.cost * (1 + input.paperMarkup / 100);
  const chargePrint = Math.max(
    costPrint * (1 + input.printMarkup / 100),
    input.minChargePrint || 0,
  );

  const sellPrice = chargePaper + chargePrint + chargeFinishing;
  const profitAmount = sellPrice - totalCost;
  const pricePerPiece = input.qty > 0 ? sellPrice / input.qty : 0;

  // Print model label
  const printModel = input.machineCat === 'digital'
    ? `digital/${(input.specs as DigitalSpecs).costMode}`
    : 'offset';

  return {
    ups: impo.ups,
    cols: impo.cols,
    rows: impo.rows,
    rawMachineSheets,
    wasteSheets,
    totalMachineSheets,
    totalStockSheets: paper.totalStockSheets,
    costPaper: paper.cost,
    costPrint,
    costFinishing,
    costGuillotine,
    costLamination,
    costBinding,
    totalCost,
    chargeFinishing,
    chargeLamination,
    chargeGuillotine,
    profitAmount,
    sellPrice,
    pricePerPiece,
    printModel,
    printDetail: {
      areaRatio: impo.ups * impo.pieceW * impo.pieceH / (input.machineMaxW * input.machineMaxH),
      totalFaces: input.sides === 2 ? totalMachineSheets * 2 : totalMachineSheets,
      wastePercent: impo.wastePercent,
    },
  };
}
