'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { normalize, normalizeGreeklish } from '@/lib/search';

const ORG_ID = 'default-org';

// ─── COMPANIES ───

export async function getCompanies(opts?: { search?: string; skip?: number; take?: number }) {
  const take = opts?.take ?? 50;
  const skip = opts?.skip ?? 0;
  const search = opts?.search?.trim();

  const where: any = { orgId: ORG_ID, deletedAt: null };
  if (search) {
    // Use both original and normalized (accent-stripped) for matching
    const norm = normalize(search);
    const greeklish = normalizeGreeklish(search);
    const variants = [search, norm, greeklish].filter((v, i, a) => a.indexOf(v) === i);

    where.OR = variants.flatMap(s => [
      { name: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      { afm: { contains: s } },
      { phone: { contains: s } },
      { companyContacts: { some: { contact: { OR: [
        { name: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s } },
        { mobile: { contains: s } },
      ] } } } },
    ]);
  }

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      include: {
        companyContacts: {
          include: { contact: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        _count: { select: { quotes: true } },
      },
      orderBy: { name: 'asc' },
      skip,
      take,
    }),
    prisma.company.count({ where }),
  ]);

  return { companies, total, hasMore: skip + take < total };
}

export async function getCompany(id: string) {
  return prisma.company.findFirst({
    where: { id, orgId: ORG_ID, deletedAt: null },
    include: {
      companyContacts: {
        include: { contact: true },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      },
      quotes: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

export async function createCompany(data: {
  name: string;
  afm?: string;
  doy?: string;
  address?: string;
  city?: string;
  zip?: string;
  phone?: string;
  email?: string;
  website?: string;
  notes?: string;
  tags?: string[];
  folderPath?: string;
}) {
  const company = await prisma.company.create({
    data: {
      orgId: ORG_ID,
      name: data.name,
      afm: data.afm || null,
      doy: data.doy || null,
      address: data.address || null,
      city: data.city || null,
      zip: data.zip || null,
      phone: data.phone || null,
      email: data.email || null,
      website: data.website || null,
      notes: data.notes || '',
      tags: data.tags ?? [],
      folderPath: data.folderPath || null,
    },
    include: {
      companyContacts: { include: { contact: true } },
      _count: { select: { quotes: true } },
    },
  });
  revalidatePath('/companies');
  revalidatePath('/quotes');
  return company;
}

export async function updateCompany(id: string, data: {
  name?: string;
  afm?: string | null;
  doy?: string | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  notes?: string;
  tags?: string[];
  folderPath?: string | null;
}) {
  const company = await prisma.company.update({
    where: { id },
    data,
    include: {
      companyContacts: { include: { contact: true } },
      _count: { select: { quotes: true } },
    },
  });
  revalidatePath('/companies');
  revalidatePath('/quotes');
  return company;
}

export async function deleteCompany(id: string) {
  await prisma.company.delete({ where: { id } });
  revalidatePath('/companies');
  revalidatePath('/quotes');
}

// ─── CONTACTS ───

export async function getContacts() {
  return prisma.contact.findMany({
    where: { orgId: ORG_ID, deletedAt: null },
    include: {
      companyContacts: {
        include: { company: true },
      },
    },
    orderBy: { name: 'asc' },
  });
}

export async function createContact(data: {
  name: string;
  email?: string;
  phone?: string;
  mobile?: string;
  notes?: string;
  role?: string;
  companyId?: string;  // auto-link to this company
  isPrimary?: boolean;
}) {
  const contact = await prisma.contact.create({
    data: {
      orgId: ORG_ID,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      mobile: data.mobile || null,
      notes: data.notes || '',
      role: data.role || 'contact',
    },
  });

  // Auto-link to company if provided
  if (data.companyId) {
    await prisma.companyContact.create({
      data: {
        companyId: data.companyId,
        contactId: contact.id,
        role: data.role || 'employee',
        isPrimary: data.isPrimary ?? false,
      },
    });
  }

  revalidatePath('/companies');
  return contact;
}

export async function updateContact(id: string, data: {
  name?: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  notes?: string;
  role?: string;
}) {
  const contact = await prisma.contact.update({
    where: { id },
    data,
  });
  revalidatePath('/companies');
  return contact;
}

export async function deleteContact(id: string) {
  await prisma.contact.delete({ where: { id } });
  revalidatePath('/companies');
}

// ─── COMPANY ↔ CONTACT LINKS ───

export async function linkContactToCompany(data: {
  companyId: string;
  contactId: string;
  role?: string;
  isPrimary?: boolean;
}) {
  const link = await prisma.companyContact.create({
    data: {
      companyId: data.companyId,
      contactId: data.contactId,
      role: data.role || 'employee',
      isPrimary: data.isPrimary ?? false,
    },
  });
  revalidatePath('/companies');
  return link;
}

export async function unlinkContactFromCompany(companyId: string, contactId: string) {
  await prisma.companyContact.deleteMany({
    where: { companyId, contactId },
  });
  revalidatePath('/companies');
}

export async function setPrimaryContact(companyId: string, contactId: string) {
  // Unset all others
  await prisma.companyContact.updateMany({
    where: { companyId },
    data: { isPrimary: false },
  });
  // Set this one
  await prisma.companyContact.updateMany({
    where: { companyId, contactId },
    data: { isPrimary: true },
  });
  revalidatePath('/companies');
}

// ─── SEARCH (for dropdowns) ───

export async function searchCompanies(q: string) {
  if (!q.trim()) return [];
  const term = q.trim().toLowerCase();
  return prisma.company.findMany({
    where: {
      orgId: ORG_ID,
      deletedAt: null,
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { afm: { contains: term } },
        { phone: { contains: term } },
      ],
    },
    include: {
      companyContacts: {
        where: { isPrimary: true },
        include: { contact: true },
        take: 1,
      },
    },
    take: 20,
    orderBy: { name: 'asc' },
  });
}

export async function matchContactByEmail(email: string) {
  if (!email.trim()) return null;
  const contact = await prisma.contact.findFirst({
    where: {
      orgId: ORG_ID,
      deletedAt: null,
      email: { equals: email.trim(), mode: 'insensitive' },
    },
    include: {
      companyContacts: {
        include: { company: true },
      },
    },
  });
  if (contact) return contact;

  // Fallback: search company email
  const company = await prisma.company.findFirst({
    where: {
      orgId: ORG_ID,
      deletedAt: null,
      email: { equals: email.trim(), mode: 'insensitive' },
    },
    include: {
      companyContacts: {
        where: { isPrimary: true },
        include: { contact: true },
        take: 1,
      },
    },
  });
  if (company) return { id: company.companyContacts[0]?.contact?.id, name: company.name, email: company.email, companyContacts: [{ company, role: 'company', isPrimary: true }] };
  return null;
}
