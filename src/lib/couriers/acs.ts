import type { CourierAdapter, CourierProviderConfig, CreateVoucherParams } from './types';

// ACS Courier API
// Docs: https://www.acscourier.net/el/ACS-eCommerce
const DEFAULT_BASE = 'https://webservices.acscourier.net/ACSRestServices/api';

function headers(apiKey: string) {
  return {
    'AcsApiKey': apiKey,
    'Content-Type': 'application/json',
  };
}

export const acsAdapter: CourierAdapter = {
  meta: {
    id: 'acs',
    name: 'ACS Courier',
    region: 'gr',
    defaultBaseUrl: DEFAULT_BASE,
    trackingUrlTemplate: 'https://www.acscourier.net/el/track-and-trace?p={voucherId}',
    authType: 'apikey',
    authHelp: 'Βρείτε το API key στο ACS eCommerce → Ρυθμίσεις → API Keys',
  },

  async validateKey(apiKey: string, baseUrl: string): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl || DEFAULT_BASE}/ACSAutoRest/GetACSAccountInfo`, {
        method: 'POST',
        headers: headers(apiKey),
        body: JSON.stringify({}),
      });
      return res.ok;
    } catch { return false; }
  },

  async createVoucher(config: CourierProviderConfig, params: CreateVoucherParams) {
    const base = config.baseUrl || DEFAULT_BASE;
    const payload = {
      ACSValueAddedService_CashOnDelivery: params.cod && params.cod > 0 ? String(params.cod) : '',
      ACSValueAddedService_CashOnDeliveryCode: params.cod && params.cod > 0 ? '1' : '',
      Receiver_Name: params.receiverName,
      Receiver_Address: params.receiverAddress,
      Receiver_City: params.receiverCity,
      Receiver_Zipcode: params.receiverZip,
      Receiver_Phone: params.receiverPhone,
      Item_Weight: Math.max(0.1, params.weight || 0.5),
      Item_Pieces: 1,
      Item_Comments: params.notes || `Παραγγελία ${params.orderId}`,
      Delivery_Notes: params.notes || '',
      Reference_Key1: params.orderId,
    };

    const res = await fetch(`${base}/ACSAutoRest/CreateVoucher`, {
      method: 'POST',
      headers: headers(config.apiKey),
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!data.ACSOutputResponce?.IsSuccess) {
      throw new Error(data.ACSOutputResponce?.ErrorMessage || 'Αποτυχία δημιουργίας ACS voucher');
    }

    const voucherId = data.ACSOutputResponce?.ACSValueOutput?.VoucherNo
      || data.ACSOutputResponce?.ACSValueOutput?.Voucher_No
      || '';
    if (!voucherId) throw new Error('Δεν επιστράφηκε αριθμός voucher');
    return { voucherId: String(voucherId) };
  },

  async trackVoucher(config: CourierProviderConfig, voucherId: string) {
    const base = config.baseUrl || DEFAULT_BASE;
    const res = await fetch(`${base}/ACSAutoRest/GetVoucherTrackingDetails`, {
      method: 'POST',
      headers: headers(config.apiKey),
      body: JSON.stringify({ Voucher_No: voucherId }),
    });
    const data = await res.json();
    const details = data.ACSOutputResponce?.ACSValueOutput?.TrackingDetails;
    const lastStatus = Array.isArray(details) && details.length > 0
      ? details[details.length - 1]?.StatusDescription || 'Άγνωστο'
      : 'Άγνωστο';
    return { status: lastStatus };
  },

  async printVoucher(config: CourierProviderConfig, voucherId: string, type: 'a4' | 'a6') {
    const base = config.baseUrl || DEFAULT_BASE;
    const res = await fetch(`${base}/ACSAutoRest/PrintVoucher`, {
      method: 'POST',
      headers: headers(config.apiKey),
      body: JSON.stringify({
        Voucher_No: voucherId,
        Print_Type: type === 'a4' ? '1' : '2',
      }),
    });
    if (!res.ok) throw new Error('Αποτυχία εκτύπωσης ACS voucher');

    const data = await res.json();
    const pdfBase64 = data.ACSOutputResponce?.ACSValueOutput?.Voucher_PDF;
    if (!pdfBase64) throw new Error('Δεν επιστράφηκε PDF');

    const binary = atob(pdfBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  },
};
