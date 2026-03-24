// PressCal Pro — Common Types

export type UUID = string;

export interface Timestamped {
  createdAt: Date;
  updatedAt: Date;
}

export interface SoftDeletable {
  deletedAt: Date | null;
}

export interface OrgScoped {
  orgId: UUID;
}

// Currency formatting for Greek market
export const CURRENCY = {
  code: 'EUR',
  symbol: '€',
  locale: 'el-GR',
  vatRate: 24,
} as const;

// Supported languages
export type Locale = 'el' | 'en';
