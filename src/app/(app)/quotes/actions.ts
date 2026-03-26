'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

const ORG_ID = 'default-org';

// ─── LIST ───

export async function getQuotes() {
  return prisma.quote.findMany({
    where: { orgId: ORG_ID, deletedAt: null },
    include: { customer: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getQuote(id: string) {
  return prisma.quote.findFirst({
    where: { id, orgId: ORG_ID, deletedAt: null },
    include: { customer: true },
  });
}

// ─── NEXT NUMBER ───

async function nextQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `QT-${year}-`;
  const last = await prisma.quote.findFirst({
    where: { orgId: ORG_ID, number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  const seq = last ? parseInt(last.number.replace(prefix, ''), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// ─── CREATE ───

export async function createQuote(data: {
  customerId?: string;
  title?: string;
  description?: string;
  notes?: string;
  items?: unknown[];
  subtotal?: number;
  vatRate?: number;
  vatAmount?: number;
  grandTotal?: number;
  totalCost?: number;
  totalProfit?: number;
}) {
  const number = await nextQuoteNumber();
  const quote = await prisma.quote.create({
    data: {
      orgId: ORG_ID,
      number,
      status: 'draft',
      customerId: data.customerId || null,
      title: data.title || null,
      description: data.description || null,
      notes: data.notes || null,
      items: (data.items ?? []) as any,
      subtotal: data.subtotal ?? 0,
      vatRate: data.vatRate ?? 24,
      vatAmount: data.vatAmount ?? 0,
      grandTotal: data.grandTotal ?? 0,
      totalCost: data.totalCost ?? 0,
      totalProfit: data.totalProfit ?? 0,
    },
  });
  revalidatePath('/quotes');
  return quote;
}

// ─── UPDATE ───

export async function updateQuote(id: string, data: {
  customerId?: string | null;
  title?: string | null;
  description?: string | null;
  notes?: string | null;
  status?: string;
  items?: unknown[];
  subtotal?: number;
  vatRate?: number;
  vatAmount?: number;
  grandTotal?: number;
  totalCost?: number;
  totalProfit?: number;
}) {
  const quote = await prisma.quote.update({
    where: { id },
    data: {
      ...data,
      items: data.items !== undefined ? (data.items as any) : undefined,
    },
  });
  revalidatePath('/quotes');
  return quote;
}

// ─── DELETE (soft) ───

export async function deleteQuote(id: string) {
  await prisma.quote.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath('/quotes');
}

// ─── STATUS ───

export async function updateQuoteStatus(id: string, status: string) {
  const data: Record<string, unknown> = { status };
  if (status === 'sent') data.sentAt = new Date();
  if (status === 'completed') data.completedAt = new Date();
  await prisma.quote.update({ where: { id }, data });
  revalidatePath('/quotes');
}

// ─── LINK EMAIL ───

export async function linkEmailToQuote(quoteId: string, messageId: string, threadId: string) {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId }, select: { linkedEmails: true, threadId: true } });
  if (!quote) throw new Error('Quote not found');
  const linked = quote.linkedEmails || [];
  if (!linked.includes(messageId)) linked.push(messageId);
  await prisma.quote.update({
    where: { id: quoteId },
    data: { linkedEmails: linked, threadId: quote.threadId || threadId },
  });
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath('/quotes');
}

export async function unlinkEmailFromQuote(quoteId: string, messageId: string) {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId }, select: { linkedEmails: true } });
  if (!quote) throw new Error('Quote not found');
  const linked = (quote.linkedEmails || []).filter(id => id !== messageId);
  await prisma.quote.update({ where: { id: quoteId }, data: { linkedEmails: linked } });
  revalidatePath(`/quotes/${quoteId}`);
}

// ─── CUSTOMERS (for selector) ───

export async function getCustomers() {
  return prisma.customer.findMany({
    where: { orgId: ORG_ID, deletedAt: null },
    orderBy: { name: 'asc' },
  });
}

export async function createCustomer(data: {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  afm?: string;
  doy?: string;
  address?: string;
  city?: string;
  zip?: string;
  notes?: string;
}) {
  const customer = await prisma.customer.create({
    data: { orgId: ORG_ID, ...data },
  });
  revalidatePath('/quotes');
  return customer;
}
