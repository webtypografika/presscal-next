import type { CourierAdapter, CourierProviderConfig, CreateVoucherParams } from './types';

// ΕΛΤΑ Courier API
// Docs: https://www.elta-courier.gr/developer
const DEFAULT_BASE = 'https://api.elta-courier.gr/api/v1';

function headers(apiKey: string) {
  return {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };
}

export const eltaAdapter: CourierAdapter = {
  meta: {
    id: 'elta',
    name: 'ΕΛΤΑ Courier',
    region: 'gr',
    defaultBaseUrl: DEFAULT_BASE,
    trackingUrlTemplate: 'https://www.elta-courier.gr/track?number={voucherId}',
    authType: 'apikey',
    authHelp: 'Βρείτε το API key στο elta-courier.gr → eShop → API Integration',
  },

  async validateKey(apiKey: string, baseUrl: string): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl || DEFAULT_BASE}/account/info`, {
        headers: headers(apiKey),
      });
      return res.ok;
    } catch { return false; }
  },

  async createVoucher(config: CourierProviderConfig, params: CreateVoucherParams) {
    const base = config.baseUrl || DEFAULT_BASE;
    const payload = {
      recipient: {
        name: params.receiverName,
        address: params.receiverAddress,
        city: params.receiverCity,
        zip: params.receiverZip,
        phone: params.receiverPhone,
      },
      parcel: {
        weight: Math.max(0.1, params.weight || 0.5),
        pieces: 1,
      },
      cod: params.cod && params.cod > 0 ? { amount: params.cod } : undefined,
      reference: params.orderId,
      notes: params.notes || `Παραγγελία ${params.orderId}`,
    };

    const res = await fetch(`${base}/shipments`, {
      method: 'POST',
      headers: headers(config.apiKey),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Αποτυχία δημιουργίας ΕΛΤΑ voucher');

    const voucherId = data.trackingNumber || data.voucherNumber || data.voucher || '';
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
      ? events[events.length - 1]?.status || events[events.length - 1]?.description || 'Άγνωστο'
      : data.status || 'Άγνωστο';
    return { status: lastStatus };
  },

  async printVoucher(config: CourierProviderConfig, voucherId: string, type: 'a4' | 'a6') {
    const base = config.baseUrl || DEFAULT_BASE;
    const format = type === 'a4' ? 'A4' : 'LABEL';
    const res = await fetch(`${base}/shipments/${voucherId}/print?format=${format}`, {
      headers: headers(config.apiKey),
    });
    if (!res.ok) throw new Error('Αποτυχία εκτύπωσης ΕΛΤΑ voucher');
    return res.arrayBuffer();
  },
};
