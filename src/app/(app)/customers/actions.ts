'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

const ORG_ID = 'default-org';

// ─── LIST ───

export async function getCustomers() {
  return prisma.customer.findMany({
    where: { orgId: ORG_ID, deletedAt: null },
    include: { _count: { select: { quotes: true } } },
    orderBy: { name: 'asc' },
  });
}

// ─── SINGLE ───

export async function getCustomer(id: string) {
  return prisma.customer.findFirst({
    where: { id, orgId: ORG_ID, deletedAt: null },
    include: {
      quotes: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

// ─── CREATE ───

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
  contacts?: unknown[];
  tags?: string[];
}) {
  const customer = await prisma.customer.create({
    data: {
      orgId: ORG_ID,
      name: data.name,
      company: data.company || null,
      email: data.email || null,
      phone: data.phone || null,
      mobile: data.mobile || null,
      afm: data.afm || null,
      doy: data.doy || null,
      address: data.address || null,
      city: data.city || null,
      zip: data.zip || null,
      notes: data.notes || '',
      contacts: (data.contacts ?? []) as any,
      tags: data.tags ?? [],
    },
    include: { _count: { select: { quotes: true } } },
  });
  revalidatePath('/customers');
  revalidatePath('/quotes');
  return customer;
}

// ─── UPDATE ───

export async function updateCustomer(id: string, data: {
  name?: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  afm?: string | null;
  doy?: string | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  notes?: string;
  contacts?: unknown[];
  tags?: string[];
}) {
  const customer = await prisma.customer.update({
    where: { id },
    data: {
      ...data,
      contacts: data.contacts !== undefined ? (data.contacts as any) : undefined,
    },
    include: { _count: { select: { quotes: true } } },
  });
  revalidatePath('/customers');
  revalidatePath('/quotes');
  return customer;
}

// ─── DELETE (soft) ───

export async function deleteCustomer(id: string) {
  await prisma.customer.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath('/customers');
  revalidatePath('/quotes');
}

// ─── BULK CREATE ───

export async function bulkCreateCustomers(rows: {
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
}[]) {
  let count = 0;
  for (const row of rows) {
    if (!row.name?.trim()) continue;
    await prisma.customer.create({
      data: {
        orgId: ORG_ID,
        name: row.name.trim(),
        company: row.company?.trim() || null,
        email: row.email?.trim() || null,
        phone: row.phone?.trim() || null,
        mobile: row.mobile?.trim() || null,
        afm: row.afm?.trim() || null,
        doy: row.doy?.trim() || null,
        address: row.address?.trim() || null,
        city: row.city?.trim() || null,
        zip: row.zip?.trim() || null,
        notes: row.notes?.trim() || '',
        contacts: [],
        tags: [],
      },
    });
    count++;
  }
  revalidatePath('/customers');
  revalidatePath('/quotes');
  return { count };
}

// ─── BULK DELETE (soft) ───

export async function bulkDeleteCustomers(ids: string[]) {
  await prisma.customer.updateMany({
    where: { id: { in: ids } },
    data: { deletedAt: new Date() },
  });
  revalidatePath('/customers');
  revalidatePath('/quotes');
}
