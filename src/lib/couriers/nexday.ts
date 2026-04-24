import type { CourierAdapter, CourierProviderConfig, CreateVoucherParams } from './types';

const DEFAULT_BASE = 'https://app.nexday.gr/api/v5.0';

function headers(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
}

export const nexdayAdapter: CourierAdapter = {
  meta: {
    id: 'nexday',
    name: 'NexDay (Hermes)',
    defaultBaseUrl: DEFAULT_BASE,
    trackingUrlTemplate: 'https://tracking.nexday.gr/?voucher={voucherId}',
    authType: 'bearer',
    authHelp: 'Βρείτε το API key στο app.nexday.gr → Ρυθμίσεις → API',
  },

  async validateKey(apiKey: string, baseUrl: string): Promise<boolean> {
    const res = await fetch(`${baseUrl || DEFAULT_BASE}/GetVouchers`, { headers: headers(apiKey) });
    return res.ok;
  },

  async createVoucher(config: CourierProviderConfig, params: CreateVoucherParams) {
    const base = config.baseUrl || DEFAULT_BASE;
    const payload: Record<string, unknown> = {
      ReceiverName: String(params.receiverName || '').slice(0, 64),
      ReceiverAddress: params.receiverAddress,
      ReceiverCity: params.receiverCity,
      ReceiverPostal: parseInt(params.receiverZip) || 0,
      ReceiverTelephone: params.receiverPhone,
      Notes: params.notes || `Προσφορά ${params.orderId}`,
      OrderID: params.orderId,
      ParcelWeight: Math.max(1, Math.round(params.weight || 1)),
    };
    if (params.cod && params.cod > 0) payload.Cod = params.cod;

    const res = await fetch(`${base}/CreateVoucher`, {
      method: 'POST',
      headers: headers(config.apiKey),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Αποτυχία δημιουργίας voucher');
    return { voucherId: String(data.voucher) };
  },

  async trackVoucher(config: CourierProviderConfig, voucherId: string) {
    const base = config.baseUrl || DEFAULT_BASE;
    const res = await fetch(`${base}/GetVoucherLastStatus?voucher=${voucherId}`, {
      headers: headers(config.apiKey),
    });
    const data = await res.json();
    return { status: data.success && data.data ? (data.data.status || 'Άγνωστο') : 'Σφάλμα' };
  },

  async printVoucher(config: CourierProviderConfig, voucherId: string, type: 'a4' | 'a6') {
    const base = config.baseUrl || DEFAULT_BASE;
    const res = await fetch(`${base}/PrintVouchers?type=${type}&vouchers=${voucherId}`, {
      headers: headers(config.apiKey),
    });
    if (!res.ok) throw new Error('Αποτυχία εκτύπωσης voucher');
    return res.arrayBuffer();
  },
};
