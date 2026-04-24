import type { CourierAdapter, CourierProviderConfig, CreateVoucherParams } from './types';

// Γενική Ταχυδρομική (Geniki Taxydromiki) API
// Docs: https://www.taxydromiki.com/developer
const DEFAULT_BASE = 'https://api.taxydromiki.com/api/v1';

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

export const genikiAdapter: CourierAdapter = {
  meta: {
    id: 'geniki',
    name: 'Γενική Ταχυδρομική',
    region: 'gr',
    defaultBaseUrl: DEFAULT_BASE,
    trackingUrlTemplate: 'https://www.taxydromiki.com/track/{voucherId}',
    authType: 'bearer',
    authHelp: 'Βρείτε το API key στο taxydromiki.com → eServices → API',
  },

  async validateKey(apiKey: string, baseUrl: string): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl || DEFAULT_BASE}/account`, {
        headers: headers(apiKey),
      });
      return res.ok;
    } catch { return false; }
  },

  async createVoucher(config: CourierProviderConfig, params: CreateVoucherParams) {
    const base = config.baseUrl || DEFAULT_BASE;
    const payload = {
      receiver: {
        name: params.receiverName,
        address: params.receiverAddress,
        city: params.receiverCity,
        postalCode: params.receiverZip,
        phone: params.receiverPhone,
      },
      weight: Math.max(0.1, params.weight || 0.5),
      pieces: 1,
      cod: params.cod && params.cod > 0 ? params.cod : undefined,
      reference: params.orderId,
      comments: params.notes || `Παραγγελία ${params.orderId}`,
    };

    const res = await fetch(`${base}/shipments`, {
      method: 'POST',
      headers: headers(config.apiKey),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Αποτυχία δημιουργίας voucher Γενικής');

    const voucherId = data.voucherNumber || data.voucher || data.trackingNumber || '';
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

    const checkpoints = Array.isArray(data.checkpoints) ? data.checkpoints : [];
    const lastStatus = checkpoints.length > 0
      ? checkpoints[checkpoints.length - 1]?.description || 'Άγνωστο'
      : data.status || 'Άγνωστο';
    return { status: lastStatus };
  },

  async printVoucher(config: CourierProviderConfig, voucherId: string, type: 'a4' | 'a6') {
    const base = config.baseUrl || DEFAULT_BASE;
    const format = type === 'a4' ? 'a4' : 'a6';
    const res = await fetch(`${base}/shipments/${voucherId}/label?format=${format}`, {
      headers: headers(config.apiKey),
    });
    if (!res.ok) throw new Error('Αποτυχία εκτύπωσης voucher Γενικής');
    return res.arrayBuffer();
  },
};
