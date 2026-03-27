// PressCal Pro — Cost Engine
// Ported from mod_sheet.js — 6 cost models: simple_in, simple_out, precision, indigo, riso, offset
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
  offsetCoating?: boolean;

  // Product pricing (overrides profile markups when present)
  productPricing?: {
    // Offset product
    charge_per_color?: number;     // € per color setup
    min_charge?: number;           // € minimum charge
    extra_pantone?: number;        // € per PMS color
    extra_varnish?: number;        // € varnish surcharge
    hourly_enabled?: boolean;
    hourly_rate?: number;          // € profit/hour
    // Digital product
    price_color?: number;          // € per page (color)
    price_bw?: number;             // € per page (BW)
    discount_step_qty?: number;    // qty for discount step
    discount_step_pct?: number;    // % discount per step
    discount_max?: number;         // % max discount
  };
}

// ─── COVERAGE MULTIPLIERS ───

const COVERAGE: Record<string, number> = {
  low: 0.05,
  mid: 0.15,
  high: 0.30,
  pdf: 1.0,
};

// ─── AREA HELPERS ───

/** A4 area in mm² */
const A4_AREA = 210 * 297;

/** Continuous area multiplier: ratio of sheet area to A4 */
function areaMult(sheetW: number, sheetH: number): number {
  const area = sheetW * sheetH;
  return Math.max(1, area / A4_AREA);
}

/** Discrete size category (for CPC models that use tiered pricing) */
function sheetSizeCategory(w: number, h: number): 'a4' | 'a3' | 'banner' {
  const area = w * h;
  if (area <= A4_AREA * 1.1) return 'a4';
  if (area <= 297 * 420 * 1.1) return 'a3';
  return 'banner';
}

/** Get CPC for a given size & color mode */
function getCpc(specs: DigitalSpecs, sheetW: number, sheetH: number, colorMode: 'color' | 'bw'): number {
  const size = sheetSizeCategory(sheetW, sheetH);
  if (colorMode === 'color') {
    return size === 'a4' ? (specs.clickA4Color || 0)
         : size === 'a3' ? (specs.clickA3Color || 0)
         : (specs.clickBannerColor || 0);
  }
  return size === 'a4' ? (specs.clickA4Bw || 0)
       : size === 'a3' ? (specs.clickA3Bw || 0)
       : (specs.clickBannerBw || 0);
}

/** Coverage multiplier for a specific channel when PDF data exists */
function channelCoverage(
  channel: 'c' | 'm' | 'y' | 'k',
  coverageLevel: string,
  coveragePdf?: { c: number; m: number; y: number; k: number },
): number {
  if (coverageLevel === 'pdf' && coveragePdf) {
    return coveragePdf[channel];
  }
  return COVERAGE[coverageLevel] || 0.15;
}

// ─── MODEL 1: SIMPLE_IN — CPC only ───
// Click cost includes everything (toner bundled). Vendor charges fixed per click.

function digitalSimpleIn(
  specs: DigitalSpecs,
  totalSheets: number,
  sides: 1 | 2,
  sheetW: number,
  sheetH: number,
  colorMode: 'color' | 'bw',
): { total: number; tonerOnly: number } {
  const cpc = getCpc(specs, sheetW, sheetH, colorMode);
  const duplexMult = sides === 2 ? (specs.duplexClickMultiplier || 2) : 1;
  const total = totalSheets * cpc * duplexMult;
  return { total, tonerOnly: 0 }; // toner bundled in CPC
}

// ─── MODEL 2: SIMPLE_OUT — CPC + separate toner ───
// Base CPC + toner cost with coverage multiplier per channel

function digitalSimpleOut(
  specs: DigitalSpecs,
  totalSheets: number,
  sides: 1 | 2,
  sheetW: number,
  sheetH: number,
  colorMode: 'color' | 'bw',
  coverageLevel: string,
  coveragePdf?: { c: number; m: number; y: number; k: number },
): { total: number; tonerOnly: number } {
  const { total: cpcCost } = digitalSimpleIn(specs, totalSheets, sides, sheetW, sheetH, colorMode);
  const sizeMult = areaMult(sheetW, sheetH);
  const faces = sides === 2 ? totalSheets * 2 : totalSheets;

  let tonerPerFace = 0;
  if (colorMode === 'color') {
    const channels: Array<{ yield: ConsumableYield | undefined; ch: 'c' | 'm' | 'y' | 'k' }> = [
      { yield: specs.tonerC, ch: 'c' },
      { yield: specs.tonerM, ch: 'm' },
      { yield: specs.tonerY, ch: 'y' },
      { yield: specs.tonerK, ch: 'k' },
    ];
    for (const { yield: toner, ch } of channels) {
      if (toner && toner.yield > 0) {
        const cov = channelCoverage(ch, coverageLevel, coveragePdf) / 0.05; // normalize to 5% base
        tonerPerFace += (toner.cost / toner.yield) * cov;
      }
    }
  } else {
    if (specs.tonerK && specs.tonerK.yield > 0) {
      const cov = channelCoverage('k', coverageLevel, coveragePdf) / 0.05;
      tonerPerFace = (specs.tonerK.cost / specs.tonerK.yield) * cov;
    }
  }

  const tonerTotal = faces * tonerPerFace * sizeMult;
  return { total: cpcCost + tonerTotal, tonerOnly: tonerTotal };
}

type ConsumableYield = { yield: number; cost: number };

// ─── MODEL 3: PRECISION — Full consumable breakdown ───
// Per-channel toner + drums + developer + corona + fuser + belt + waste

function digitalPrecision(
  specs: DigitalSpecs,
  totalSheets: number,
  sides: 1 | 2,
  sheetW: number,
  sheetH: number,
  colorMode: 'color' | 'bw',
  coverageLevel: string,
  coveragePdf?: { c: number; m: number; y: number; k: number },
): { total: number; tonerOnly: number } {
  const sizeMult = areaMult(sheetW, sheetH);
  const faces = sides === 2 ? totalSheets * 2 : totalSheets;

  // ── Toner cost (coverage-dependent) ──
  let tonerPerFace = 0;
  if (colorMode === 'color') {
    const channels: Array<{ yield: ConsumableYield | undefined; ch: 'c' | 'm' | 'y' | 'k' }> = [
      { yield: specs.tonerC, ch: 'c' },
      { yield: specs.tonerM, ch: 'm' },
      { yield: specs.tonerY, ch: 'y' },
      { yield: specs.tonerK, ch: 'k' },
    ];
    for (const { yield: toner, ch } of channels) {
      if (toner && toner.yield > 0) {
        const cov = channelCoverage(ch, coverageLevel, coveragePdf) / 0.05;
        tonerPerFace += (toner.cost / toner.yield) * cov;
      }
    }
  } else {
    if (specs.tonerK && specs.tonerK.yield > 0) {
      const cov = channelCoverage('k', coverageLevel, coveragePdf) / 0.05;
      tonerPerFace = (specs.tonerK.cost / specs.tonerK.yield) * cov;
    }
  }

  // Extra / specialty colors
  if (specs.extraColors) {
    for (const extra of specs.extraColors) {
      if (extra.yield > 0) {
        tonerPerFace += extra.cost / extra.yield;
      }
    }
  }

  const tonerTotal = faces * tonerPerFace * sizeMult;

  // ── Drums (non-coverage, per face) ──
  let drumPerFace = 0;
  if (colorMode === 'color') {
    const drums = [specs.drumC, specs.drumM, specs.drumY, specs.drumK].filter(Boolean) as ConsumableYield[];
    for (const d of drums) {
      if (d.yield > 0) drumPerFace += d.cost / d.yield;
    }
    // Extra station drums
    if (specs.drumExtra) {
      for (const d of specs.drumExtra) {
        if (d.yield > 0) drumPerFace += d.cost / d.yield;
      }
    }
  } else {
    if (specs.drumK && specs.drumK.yield > 0) {
      drumPerFace = specs.drumK.cost / specs.drumK.yield;
    }
  }

  // ── Developer (non-coverage, skip if integrated) ──
  let devPerFace = 0;
  if (specs.developerType !== 'integrated') {
    if (colorMode === 'color') {
      const devs = [specs.developerC, specs.developerM, specs.developerY, specs.developerK].filter(Boolean) as ConsumableYield[];
      for (const d of devs) {
        if (d.yield > 0) devPerFace += d.cost / d.yield;
      }
    } else {
      if (specs.developerK && specs.developerK.yield > 0) {
        devPerFace = specs.developerK.cost / specs.developerK.yield;
      }
    }
  }

  // ── Corona (non-coverage, per station) ──
  let coronaPerFace = 0;
  if (specs.hasChargeCoronas && specs.coronaCost && specs.coronaLife && specs.coronaLife > 0) {
    const stations = colorMode === 'color' ? specs.colorStations : 1;
    coronaPerFace = (specs.coronaCost * stations) / specs.coronaLife;
  }

  // ── Fuser, Belt, Waste (non-coverage, single unit each) ──
  let sharedPerFace = 0;
  if (specs.fuserCost && specs.fuserLife && specs.fuserLife > 0) {
    sharedPerFace += specs.fuserCost / specs.fuserLife;
  }
  if (specs.beltCost && specs.beltLife && specs.beltLife > 0) {
    sharedPerFace += specs.beltCost / specs.beltLife;
  }
  if (specs.wasteCost && specs.wasteLife && specs.wasteLife > 0) {
    sharedPerFace += specs.wasteCost / specs.wasteLife;
  }

  const nonTonerPerFace = drumPerFace + devPerFace + coronaPerFace + sharedPerFace;
  const nonTonerTotal = faces * nonTonerPerFace * sizeMult;

  return { total: tonerTotal + nonTonerTotal, tonerOnly: tonerTotal };
}

// ─── MODEL 4: INDIGO — Liquid ink ───
// Ink (coverage-dependent) + impression charge + blanket + PIP

function digitalIndigo(
  specs: DigitalSpecs,
  totalSheets: number,
  sides: 1 | 2,
  sheetW: number,
  sheetH: number,
  colorMode: 'color' | 'bw',
  coverageLevel: string,
  coveragePdf?: { c: number; m: number; y: number; k: number },
): { total: number; tonerOnly: number } {
  const sizeMult = areaMult(sheetW, sheetH);
  const faces = sides === 2 ? totalSheets * 2 : totalSheets;

  // Impressions per side based on color mode
  const modes = specs.indigoColorModes || { cmyk: 4, epm: 3, ovg: 7, bw: 1 };
  const impsPerSide = colorMode === 'bw' ? modes.bw : modes.cmyk;

  // Ink cost (coverage-dependent)
  const avgCov = coverageLevel === 'pdf' && coveragePdf
    ? (coveragePdf.c + coveragePdf.m + coveragePdf.y + coveragePdf.k) / 4
    : COVERAGE[coverageLevel] || 0.15;
  const inkPerFace = (specs.inkCostPerMl || 0) * avgCov * sizeMult;
  const inkTotal = faces * inkPerFace;

  // Impression charge (flat per impression)
  const impCharge = (specs.impressionCharge || 0) * faces * impsPerSide;

  // Blanket wear
  let blanketCost = 0;
  if (specs.blanketCostIndigo && specs.blanketLifeIndigo && specs.blanketLifeIndigo > 0) {
    blanketCost = faces * impsPerSide * (specs.blanketCostIndigo / specs.blanketLifeIndigo);
  }

  // PIP (Photo Imaging Plate)
  let pipCost = 0;
  if (specs.pipCost && specs.pipLife && specs.pipLife > 0) {
    pipCost = faces * impsPerSide * (specs.pipCost / specs.pipLife);
  }

  const total = inkTotal + impCharge + blanketCost + pipCost;
  return { total, tonerOnly: inkTotal };
}

// ─── MODEL 5: RISO — Per-color cartridge ───
// All cost is coverage-dependent (cartridge = ink consumption)

function digitalRiso(
  specs: DigitalSpecs,
  totalSheets: number,
  sides: 1 | 2,
  colorMode: 'color' | 'bw',
  coverageLevel: string,
  coveragePdf?: { c: number; m: number; y: number; k: number },
): { total: number; tonerOnly: number } {
  const faces = sides === 2 ? totalSheets * 2 : totalSheets;

  let costPerFace = 0;
  if (colorMode === 'color') {
    const carts: Array<{ cart: ConsumableYield | undefined; ch: 'c' | 'm' | 'y' | 'k' }> = [
      { cart: specs.cartridgeC, ch: 'c' },
      { cart: specs.cartridgeM, ch: 'm' },
      { cart: specs.cartridgeY, ch: 'y' },
      { cart: specs.cartridgeK, ch: 'k' },
    ];
    for (const { cart, ch } of carts) {
      if (cart && cart.yield > 0) {
        const cov = channelCoverage(ch, coverageLevel, coveragePdf) / 0.05;
        costPerFace += (cart.cost / cart.yield) * cov;
      }
    }
    // Optional gray
    if (specs.cartridgeGray && specs.cartridgeGray.yield > 0) {
      costPerFace += specs.cartridgeGray.cost / specs.cartridgeGray.yield;
    }
  } else {
    if (specs.cartridgeK && specs.cartridgeK.yield > 0) {
      const cov = channelCoverage('k', coverageLevel, coveragePdf) / 0.05;
      costPerFace = (specs.cartridgeK.cost / specs.cartridgeK.yield) * cov;
    }
  }

  const total = faces * costPerFace;
  return { total, tonerOnly: total }; // all ink-based
}

// ─── DIGITAL DISPATCHER ───

function calcDigitalCost(input: CostInput, totalSheets: number): number {
  const specs = input.specs as DigitalSpecs;
  let result: { total: number; tonerOnly: number };

  switch (specs.costMode) {
    case 'simple_in':
      result = digitalSimpleIn(specs, totalSheets, input.sides, input.machineMaxW, input.machineMaxH, input.colorMode);
      break;
    case 'simple_out':
      result = digitalSimpleOut(specs, totalSheets, input.sides, input.machineMaxW, input.machineMaxH, input.colorMode, input.coverageLevel, input.coveragePdf);
      break;
    case 'precision':
      result = digitalPrecision(specs, totalSheets, input.sides, input.machineMaxW, input.machineMaxH, input.colorMode, input.coverageLevel, input.coveragePdf);
      break;
    case 'indigo':
      result = digitalIndigo(specs, totalSheets, input.sides, input.machineMaxW, input.machineMaxH, input.colorMode, input.coverageLevel, input.coveragePdf);
      break;
    case 'riso':
      result = digitalRiso(specs, totalSheets, input.sides, input.colorMode, input.coverageLevel, input.coveragePdf);
      break;
    default:
      result = digitalSimpleIn(specs, totalSheets, input.sides, input.machineMaxW, input.machineMaxH, input.colorMode);
  }

  let printCost = result.total;

  // Depreciation
  if (input.includeDepreciation && input.machineCost && input.machineLifetimePasses) {
    const totalFaces = input.sides === 2 ? totalSheets * 2 : totalSheets;
    const depPerFace = input.machineCost / input.machineLifetimePasses;
    printCost += totalFaces * depPerFace;
  }

  // Speed zone markup (heavier paper = slower = more expensive)
  if (specs.speedZones && input.paperGsm) {
    const zone = specs.speedZones.find(z => input.paperGsm >= z.gsmFrom && input.paperGsm <= z.gsmTo);
    if (zone && zone.markup > 0) {
      printCost *= (1 + zone.markup / 100);
    }
  }

  return printCost;
}

// ─── OFFSET COST MODEL ───
// Plates + blanket wear + ink (per-channel) + chemicals + rollers + varnish/coating + hourly

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

  // ── Plates ──
  const plateCost = (specs.includePlates !== false)
    ? totalColors * specs.plateCost
    : 0;

  // ── Blanket wear (coverage-aware) ──
  const blanketCost = specs.blanketLife > 0
    ? totalSheets * totalPasses * (specs.blanketCost / specs.blanketLife)
    : 0;

  // ── Ink cost (per-channel, area-based) ──
  const sheetAreaM2 = (input.machineMaxW * input.machineMaxH) / 1_000_000;
  const inkGm2 = specs.inkGm2 || 1.5;
  const inkPricePerKg = specs.inkPricePerKg || 25;

  let inkCost: number;
  if (input.coverageLevel === 'pdf' && input.coveragePdf) {
    // Per-channel ink cost from PDF coverage
    const { c, m, y, k } = input.coveragePdf;
    const channelCoverages = [c, m, y, k];
    const frontInkPerSheet = channelCoverages.reduce((sum, cov) => {
      return sum + sheetAreaM2 * inkGm2 * cov * (inkPricePerKg / 1000);
    }, 0);
    // Simplified: same ink for back if duplex
    const backInkPerSheet = input.sides === 2 ? frontInkPerSheet : 0;
    inkCost = totalSheets * (frontInkPerSheet + backInkPerSheet);
  } else {
    // Preset coverage
    const coverageMult = COVERAGE[input.coverageLevel] || 0.15;
    const inkPerSheet = sheetAreaM2 * inkGm2 * coverageMult * totalColors * (inkPricePerKg / 1000);
    inkCost = totalSheets * inkPerSheet;
  }

  // ── Roller recovery ──
  let rollerCost = 0;
  if (specs.rollerCount && specs.rollerCost && specs.rollerLife && specs.rollerLife > 0) {
    rollerCost = totalSheets * totalPasses * (specs.rollerCount * specs.rollerCost / specs.rollerLife);
  }

  // ── Chemicals: wash + IPA ──
  let chemicalCost = 0;
  const washPasses = specs.washPassesPerRun || 0;
  if (washPasses > 0) {
    const inkCleaner = specs.inkCleanerCpl || 0;
    const waterCleaner = specs.waterCleanerCpl || 0;
    const washMl = specs.washMlPerLiter || 100;
    chemicalCost += washPasses * (washMl / 1000) * (inkCleaner + waterCleaner);
  }
  // IPA (alcohol for dampening)
  const runHours = totalSheets * totalPasses / (specs.speed || 5000);
  if (specs.ipaMlPerHour && specs.ipaCpl) {
    chemicalCost += runHours * (specs.ipaMlPerHour / 1000) * specs.ipaCpl;
  }

  // ── Varnish ──
  let varnishCost = 0;
  if (input.offsetOilVarnish && specs.hasVarnishTower) {
    const vGm2 = specs.varnishGm2 || inkGm2;
    const vPrice = specs.varnishPricePerKg || inkPricePerKg;
    varnishCost = totalSheets * sheetAreaM2 * vGm2 * (vPrice / 1000);
  }

  // ── Coating (aqueous/UV) ──
  let coatingCost = 0;
  if (input.offsetCoating && specs.coatingGm2 && specs.coatingPricePerKg) {
    coatingCost = totalSheets * sheetAreaM2 * specs.coatingGm2 * (specs.coatingPricePerKg / 1000);
  }

  // ── Run time ──
  const setupMin = specs.setupMin || 15;
  const sheetsPerHour = specs.speed || 5000;
  const totalHours = (setupMin / 60) + runHours;
  const hourlyCost = totalHours * specs.hourCost;

  return plateCost + blanketCost + inkCost + rollerCost + chemicalCost + varnishCost + coatingCost + hourlyCost;
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
    const oSpecs = specs as OffsetSpecs;
    const fixed = oSpecs.defaultWaste || 50;
    const pct = oSpecs.wastePercent || 2;
    return fixed + Math.ceil(totalSheets * (pct / 100));
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

  // ─── PRODUCT PRICING (overrides profile print markup if present) ───
  let chargePrint: number;
  let productPricingApplied = false;
  const pp = input.productPricing;

  if (pp && input.machineCat === 'digital' && (pp.price_color || pp.price_bw)) {
    // Digital product: per-page pricing
    const totalFaces = input.sides === 2 ? totalMachineSheets * 2 : totalMachineSheets;
    const pricePerPage = input.colorMode === 'color' ? (pp.price_color || 0) : (pp.price_bw || 0);
    let productRevenue = totalFaces * pricePerPage;

    // Quantity discount
    if (pp.discount_step_qty && pp.discount_step_pct && input.qty > pp.discount_step_qty) {
      const steps = Math.floor(input.qty / pp.discount_step_qty) - 1;
      const discountPct = Math.min(steps * pp.discount_step_pct, pp.discount_max || 50);
      productRevenue *= (1 - discountPct / 100);
    }

    // Hourly profit
    if (pp.hourly_enabled && pp.hourly_rate) {
      const speedPpm = (input.specs as DigitalSpecs).speedPpmColor || 60;
      const runMinutes = totalFaces / speedPpm;
      productRevenue += (runMinutes / 60) * pp.hourly_rate;
    }

    chargePrint = Math.max(productRevenue, costPrint);
    productPricingApplied = true;
  } else if (pp && input.machineCat === 'offset' && pp.charge_per_color) {
    // Offset product: per-color charge + extras
    const frontColors = (input.offsetFrontCmyk || 4) + (input.offsetFrontPms || 0);
    const backColors = input.sides === 2 ? (input.offsetBackCmyk || 0) + (input.offsetBackPms || 0) : 0;
    let productRevenue = (frontColors + backColors) * pp.charge_per_color;

    // PMS surcharge
    if (pp.extra_pantone) {
      productRevenue += ((input.offsetFrontPms || 0) + (input.offsetBackPms || 0)) * pp.extra_pantone;
    }
    // Varnish surcharge
    if (pp.extra_varnish && input.offsetOilVarnish) {
      productRevenue += pp.extra_varnish;
    }
    // Hourly profit
    if (pp.hourly_enabled && pp.hourly_rate) {
      const oSpecs = input.specs as OffsetSpecs;
      const runHours = totalMachineSheets / (oSpecs.speed || 5000);
      const setupHours = (oSpecs.setupMin || 15) / 60;
      productRevenue += (runHours + setupHours) * pp.hourly_rate;
    }
    // Minimum charge
    if (pp.min_charge) {
      productRevenue = Math.max(productRevenue, pp.min_charge);
    }

    chargePrint = Math.max(productRevenue + costPrint, costPrint);
    productPricingApplied = true;
  } else {
    // Default: profile markup
    chargePrint = Math.max(
      costPrint * (1 + input.printMarkup / 100),
      input.minChargePrint || 0,
    );
  }

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
      productPricingApplied,
      costBreakdown: {
        paperCostPerUnit: input.paperCostPerUnit,
        paperStockSheets: paper.totalStockSheets,
        paperCutsPerStock: Math.ceil(totalMachineSheets / paper.totalStockSheets),
        machineSheets: totalMachineSheets,
        wasteSheets,
        printCostRaw: costPrint,
        printMarkup: input.printMarkup,
        paperMarkup: input.paperMarkup,
      },
    },
  };
}
