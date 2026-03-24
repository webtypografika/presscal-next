// PressCal Pro — Machine Types

import type { UUID, Timestamped, SoftDeletable, OrgScoped } from './common';

export type MachineCategory = 'digital' | 'offset' | 'plotter';

export type DigitalCostMode = 'simple_in' | 'simple_out' | 'precision';

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

export interface DigitalSpecs {
  costMode: DigitalCostMode;
  colorStations: number;
  consumableType: 'toner' | 'ink';
  duplexClickMultiplier?: number;

  // Click costs (CPC)
  clickA4Color?: number;
  clickA4Bw?: number;
  clickA3Color?: number;
  clickA3Bw?: number;
  clickBannerColor?: number;
  clickBannerBw?: number;

  // Toner yields & costs per channel
  tonerC?: { yield: number; cost: number };
  tonerM?: { yield: number; cost: number };
  tonerY?: { yield: number; cost: number };
  tonerK?: { yield: number; cost: number };

  // Extra/specialty colors
  extraColors?: Array<{
    index: number;
    name: string;
    yield: number;
    cost: number;
  }>;

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

export interface OffsetSpecs {
  towers: number;
  speed: number;
  perfecting: boolean;
  hasVarnishTower: boolean;
  varnishType?: 'oil' | 'aqueous' | 'uv';
  defaultWaste: number;
  inkGm2: number;
  plateCost: number;
  blanketCost: number;
  blanketLife: number;
  hourCost: number;
  setupMin: number;
}

export interface PlotterSpecs {
  maxWidth: number;
  inkCostPerMl: number;
  inkMlPerSqm: number;
}
