import { nexdayAdapter } from './nexday';
import { acsAdapter } from './acs';
import { speedexAdapter } from './speedex';
import { genikiAdapter } from './geniki';
import { eltaAdapter } from './elta';
import type { CourierAdapter, CourierProviderMeta } from './types';

const adapters: Record<string, CourierAdapter> = {
  nexday: nexdayAdapter,
  acs: acsAdapter,
  speedex: speedexAdapter,
  geniki: genikiAdapter,
  elta: eltaAdapter,
};

export function getCourierAdapter(providerId: string): CourierAdapter | null {
  return adapters[providerId] || null;
}

export function listAvailableProviders(region?: string): CourierProviderMeta[] {
  const all = Object.values(adapters).map(a => a.meta);
  if (!region) return all;
  return all.filter(m => m.region === region || m.region === 'global');
}

export type { CourierAdapter, CourierProviderMeta } from './types';
export type { CourierProviderConfig, CreateVoucherParams } from './types';
