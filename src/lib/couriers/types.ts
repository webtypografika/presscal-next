// ─── MULTI-COURIER ADAPTER INTERFACE ───

export interface CourierProviderConfig {
  id: string;        // 'nexday' | 'acs' | 'speedex' etc.
  apiKey: string;
  baseUrl?: string;   // override default API URL
}

export interface CourierProviderMeta {
  id: string;
  name: string;
  defaultBaseUrl: string;
  trackingUrlTemplate: string;  // '{voucherId}' placeholder
  authType: 'bearer' | 'basic' | 'apikey';
  authHelp?: string;  // instructions for where to find the API key
}

export interface CreateVoucherParams {
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  receiverCity: string;
  receiverZip: string;
  weight: number;
  cod?: number;
  notes?: string;
  orderId: string;  // quote number
}

export interface CourierAdapter {
  meta: CourierProviderMeta;
  validateKey(apiKey: string, baseUrl: string): Promise<boolean>;
  createVoucher(config: CourierProviderConfig, params: CreateVoucherParams): Promise<{ voucherId: string }>;
  trackVoucher(config: CourierProviderConfig, voucherId: string): Promise<{ status: string }>;
  printVoucher(config: CourierProviderConfig, voucherId: string, type: 'a4' | 'a6'): Promise<ArrayBuffer>;
}
