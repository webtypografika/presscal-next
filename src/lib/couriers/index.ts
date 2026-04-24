import { nexdayAdapter } from './nexday';
import type { CourierAdapter, CourierProviderMeta } from './types';

const adapters: Record<string, CourierAdapter> = {
  nexday: nexdayAdapter,
};

export function getCourierAdapter(providerId: string): CourierAdapter | null {
  return adapters[providerId] || null;
}

export function listAvailableProviders(): CourierProviderMeta[] {
  return Object.values(adapters).map(a => a.meta);
}

export type { CourierAdapter, CourierProviderMeta } from './types';
export type { CourierProviderConfig, CreateVoucherParams } from './types';
