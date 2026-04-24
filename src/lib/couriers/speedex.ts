import type { CourierAdapter, CourierProviderConfig, CreateVoucherParams } from './types';

// Speedex Courier API
// Docs: https://developer.speedex.gr/
const DEFAULT_BASE = 'https://api.speedex.gr/api';

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

export const speedexAdapter: CourierAdapter = {
  meta: {
    id: 'speedex',
    name: 'Speedex Courier',
    region: 'gr',
    defaultBaseUrl: DEFAULT_BASE,
    trackingUrlTemplate: 'https://www.speedex.gr/el/track-and-trace/?voucher={voucherId}',
    authType: 'bearer',
    authHelp: 'Βρείτε το API key στο Speedex → My Account → API Settings',
  },

  async validateKey(apiKey: string, baseUrl: string): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl || DEFAULT_BASE}/shipments?page=1&pageSize=1`, {
        headers: headers(apiKey),
      });
      return res.ok;
    } catch { return false; }
  },

  async createVoucher(config: CourierProviderConfig, params: CreateVoucherParams) {
    const base = config.baseUrl || DEFAULT_BASE;
    const payload = {
      consignee: {
        name: params.receiverName,
        address: params.receiverAddress,
        city: params.receiverCity,
        zipCode: params.receiverZip,
        phone: params.receiverPhone,
      },
      packages: [{
        weight: Math.max(0.1, params.weight || 0.5),
        pieces: 1,
      }],
      cashOnDelivery: params.cod && params.cod > 0 ? params.cod : undefined,
      reference: params.orderId,
      notes: params.notes || `Παραγγελία ${params.orderId}`,
    };

    const res = await fetch(`${base}/shipments`, {
      method: 'POST',
      headers: headers(config.apiKey),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Αποτυχία δημιουργίας Speedex voucher');

    const voucherId = data.voucherNumber || data.voucher || data.id || '';
    if (!voucherId) throw new Error('Δεν επιστράφηκε αριθμός voucher');
    return { voucherId: String(voucherId) };
  },

  async trackVoucher(config: CourierProviderConfig, voucherId: string) {
    const base = config.baseUrl || DEFAULT_BASE;
    const res = await fetch(`${base}/tracking/${voucherId}`, {
      headers: headers(config.apiKey),
    });
    const data = await res.json();
    if (!res.ok) return { status: 'Άγνωστο' };

    const events = Array.isArray(data.events) ? data.events : [];
    const lastStatus = events.length > 0
      ? events[events.length - 1]?.description || 'Άγνωστο'
      : data.status || 'Άγνωστο';
    return { status: lastStatus };
  },

  async printVoucher(config: CourierProviderConfig, voucherId: string, type: 'a4' | 'a6') {
    const base = config.baseUrl || DEFAULT_BASE;
    const format = type === 'a4' ? 'A4' : 'A6';
    const res = await fetch(`${base}/shipments/${voucherId}/label?format=${format}`, {
      headers: headers(config.apiKey),
    });
    if (!res.ok) throw new Error('Αποτυχία εκτύπωσης Speedex voucher');
    return res.arrayBuffer();
  },
};
