// PressCal Pro — Quote Types

import type { UUID, Timestamped, SoftDeletable, OrgScoped } from './common';

export type QuoteStatus = 'new' | 'draft' | 'sent' | 'approved' | 'partial' | 'rejected' | 'completed' | 'cancelled';

export type QuoteItemType = 'calculator' | 'manual' | 'catalog';

export interface QuoteLineItem {
  id: string;
  name: string;
  type: QuoteItemType;
  qty: number;
  unit: string;
  unitPrice: number;
  finalPrice: number;
  cost: number;
  profit: number;
  priceLocked?: boolean;
  notes?: string;
  calcData?: Record<string, unknown>;
  // Linked file from FileHelper
  linkedFile?: {
    path: string;
    name: string;
    type: string;       // pdf, ai, psd, etc.
    size: number;
    width?: number;     // mm (TrimBox for PDFs)
    height?: number;    // mm
    pages?: number;
    colors?: string;    // e.g. "4/4", "4/0", "CMYK"
    dpi?: number;
    bleed?: number;     // mm
  };
}

export interface Quote extends Timestamped, SoftDeletable, OrgScoped {
  id: UUID;
  number: string;
  customerId?: UUID;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerCompany?: string;
  title?: string;
  description?: string;
  notes?: string;
  status: QuoteStatus;
  source?: string;
  items: QuoteLineItem[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  grandTotal: number;
  totalCost: number;
  totalProfit: number;

  // Job board
  jobStageId?: string;
  jobStageUpdatedAt?: Date;

  // Email
  threadId?: string;
  linkedEmails?: string[];
  emailsLog?: Array<{ to: string; sentAt: string; subject: string }>;

  // Approval
  approvalToken?: string;
  approvedAt?: Date;
  approvedItems?: string[];
  rejectedItems?: string[];
  partialApproval: boolean;

  // Elorus
  elorusInvoiceId?: string;
  elorusInvoiceUrl?: string;
  elorusContactId?: string;

  // Dates
  date: Date;
  sentAt?: Date;
  completedAt?: Date;
}
