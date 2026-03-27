// PressCal Pro — Machine Types

import type { UUID, Timestamped, SoftDeletable, OrgScoped } from './common';

export type MachineCategory = 'digital' | 'offset' | 'plotter';

export type DigitalCostMode = 'simple_in' | 'simple_out' | 'precision' | 'indigo' | 'riso';

export interface Machine extends Timestamped, SoftDeletable, OrgScoped {
  id: UUID;
  cat: MachineCategory;
  name: string;
  notes?: string;

  // Dimensions (mm)
  maxW: number;
  maxH: number;
  minW?: number;
  minH?: number;
  maxGsm?: number;
  minGsm?: number;

  // Margins (mm)
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;

  // Category-specific fields
  specs: DigitalSpecs | OffsetSpecs | PlotterSpecs;

  // Depreciation
  includeDepreciation: boolean;
  machineCost?: number;
  machineLifetimePasses?: number;
}

// ─── TONER / INK YIELD ───

export interface ConsumableYield {
  yield: number;   // pages at 5% coverage
  cost: number;    // € per unit
}

// ─── DIGITAL SPECS ───

export interface DigitalSpecs {
  costMode: DigitalCostMode;
  colorStations: number;
  consumableType: 'toner' | 'ink';
  duplexClickMultiplier?: number;  // typically 2 for duplex

  // Click costs (CPC) — used by simple_in, simple_out
  clickA4Color?: number;
  clickA4Bw?: number;
  clickA3Color?: number;
  clickA3Bw?: number;
  clickBannerColor?: number;
  clickBannerBw?: number;

  // Toner yields & costs per channel — CMYK
  tonerC?: ConsumableYield;
  tonerM?: ConsumableYield;
  tonerY?: ConsumableYield;
  tonerK?: ConsumableYield;

  // Extra/specialty colors (station 5+)
  extraColors?: Array<{
    index: number;
    name: string;
    yield: number;
    cost: number;
  }>;

  // ─── PRECISION model: consumable parts ───
  drumC?: ConsumableYield;
  drumM?: ConsumableYield;
  drumY?: ConsumableYield;
  drumK?: ConsumableYield;
  drumExtra?: Array<ConsumableYield>;  // station 5+ drums

  developerType?: 'integrated' | 'separate';
  developerC?: ConsumableYield;
  developerM?: ConsumableYield;
  developerY?: ConsumableYield;
  developerK?: ConsumableYield;

  hasChargeCoronas?: boolean;
  coronaCost?: number;        // € per unit
  coronaLife?: number;        // impressions

  fuserCost?: number;
  fuserLife?: number;
  beltCost?: number;
  beltLife?: number;
  wasteCost?: number;
  wasteLife?: number;

  // ─── INDIGO model ───
  inkCostPerMl?: number;
  impressionCharge?: number;      // flat per impression
  blanketCostIndigo?: number;     // per unit
  blanketLifeIndigo?: number;     // impressions
  pipCost?: number;               // PIP (Photo Imaging Plate)
  pipLife?: number;
  indigoColorModes?: {            // impressions per side by color mode
    cmyk: number;   // 4
    epm: number;    // 3
    ovg: number;    // 7
    bw: number;     // 1
  };

  // ─── RISO model ───
  cartridgeK?: ConsumableYield;
  cartridgeC?: ConsumableYield;
  cartridgeM?: ConsumableYield;
  cartridgeY?: ConsumableYield;
  cartridgeGray?: ConsumableYield;

  // Speed
  speedPpmColor?: number;
  speedPpmBw?: number;
  speedZones?: Array<{
    name: string;
    gsmFrom: number;
    gsmTo: number;
    ppm: number;
    markup: number;
  }>;
}

// ─── OFFSET SPECS ───

export interface OffsetSpecs {
  towers: number;
  speed: number;           // sheets/hour
  perfecting: boolean;
  hasVarnishTower: boolean;
  varnishType?: 'oil' | 'aqueous' | 'uv';
  defaultWaste: number;    // fixed waste sheets
  wastePercent?: number;   // % waste (default 2%)

  // Plates
  plateCost: number;
  includePlates?: boolean; // toggle (off_include_parts)

  // Blankets
  blanketCost: number;
  blanketLife: number;

  // Ink
  inkGm2: number;          // g/m² base ink consumption
  inkPricePerKg?: number;  // €/kg (default 25)

  // Rollers
  rollerCount?: number;
  rollerCost?: number;
  rollerLife?: number;

  // Chemicals
  washPassesPerRun?: number;   // wash cycles
  washMlPerLiter?: number;     // ml per liter of solvent
  inkCleanerCpl?: number;      // cost per liter ink cleaner
  waterCleanerCpl?: number;    // cost per liter water cleaner
  ipaPercent?: number;         // IPA concentration %
  ipaMlPerHour?: number;       // IPA consumption ml/h
  ipaCpl?: number;             // IPA cost per liter

  // Varnish / Coating
  varnishGm2?: number;         // g/m² varnish consumption
  varnishPricePerKg?: number;
  coatingGm2?: number;         // g/m² for aqueous/UV
  coatingPricePerKg?: number;

  // Time
  hourCost: number;
  setupMin: number;
}

export interface PlotterSpecs {
  maxWidth: number;
  inkCostPerMl: number;
  inkMlPerSqm: number;
}
