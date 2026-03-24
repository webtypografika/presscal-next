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
  notes?: string;
  calcData?: Record<string, unknown>;
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
