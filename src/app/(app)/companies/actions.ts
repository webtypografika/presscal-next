'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { fuzzySearchIds, orderByIds } from '@/lib/search';

const ORG_ID = 'default-org';

// ─── COMPANIES ───

export async function getCompanies(opts?: { search?: string; skip?: number; take?: number }) {
  const take = opts?.take ?? 50;
  const skip = opts?.skip ?? 0;
  const search = opts?.search?.trim();

  // Fuzzy-search path: fetch ranked IDs (accents, case, greeklish, typos), then include relations.
  // Pagination is applied after the fuzzy ranking.
  if (search) {
    const ids = await fuzzySearchIds('Company', ORG_ID, search, 500);
    const total = ids.length;
    const pageIds = ids.slice(skip, skip + take);
    if (pageIds.length === 0) return { companies: [], total, hasMore: false };
    const rows = await prisma.company.findMany({
      where: { id: { in: pageIds } },
      include: {
        companyContacts: {
          include: { contact: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        _count: { select: { quotes: true } },
      },
    });
    return { companies: orderByIds(rows, pageIds), total, hasMore: skip + take < total };
  }

  // Default listing (no search): alphabetical, paginated.
  const where = { orgId: ORG_ID, deletedAt: null };
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
  revalidatePath('/contacts');
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
  revalidatePath('/contacts');
  revalidatePath('/quotes');
  return company;
}

export async function deleteCompany(id: string) {
  await prisma.company.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath('/contacts');
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

  revalidatePath('/contacts');
  return contact;
}

export async function updateContact(id: string, data: {
  name?: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  notes?: string;
  role?: string;
  folderPath?: string | null;
}) {
  const contact = await prisma.contact.update({
    where: { id },
    data,
  });
  revalidatePath('/contacts');
  return contact;
}

export async function deleteContact(id: string) {
  await prisma.contact.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath('/contacts');
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
  revalidatePath('/contacts');
  return link;
}

export async function unlinkContactFromCompany(companyId: string, contactId: string) {
  await prisma.companyContact.deleteMany({
    where: { companyId, contactId },
  });
  revalidatePath('/contacts');
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
  revalidatePath('/contacts');
}

// ─── SEARCH (for dropdowns) ───

export async function searchCompanies(q: string) {
  const ids = await fuzzySearchIds('Company', ORG_ID, q, 20);
  if (ids.length === 0) return [];
  const rows = await prisma.company.findMany({
    where: { id: { in: ids } },
    include: {
      companyContacts: {
        where: { isPrimary: true },
        include: { contact: true },
        take: 1,
      },
    },
  });
  return orderByIds(rows, ids);
}

// ─── CONTACTS WITH COMPANIES (for People tab) ───

export async function getContactsWithCompanies(opts?: { search?: string; skip?: number; take?: number }) {
  const take = opts?.take ?? 50;
  const skip = opts?.skip ?? 0;
  const search = opts?.search?.trim();

  // Fuzzy path: search matches contact OR their company name (via companyContacts).
  if (search) {
    const [contactIds, companyIds] = await Promise.all([
      fuzzySearchIds('Contact', ORG_ID, search, 500),
      fuzzySearchIds('Company', ORG_ID, search, 500),
    ]);

    // Contacts linked to any matching company
    let viaCompany: string[] = [];
    if (companyIds.length > 0) {
      const links = await prisma.companyContact.findMany({
        where: { companyId: { in: companyIds } },
        select: { contactId: true },
      });
      viaCompany = links.map(l => l.contactId);
    }

    // Dedupe preserving contact-match order first (better relevance)
    const seen = new Set<string>();
    const mergedIds: string[] = [];
    for (const id of [...contactIds, ...viaCompany]) {
      if (!seen.has(id)) { seen.add(id); mergedIds.push(id); }
    }

    const total = mergedIds.length;
    const pageIds = mergedIds.slice(skip, skip + take);
    if (pageIds.length === 0) return { contacts: [], total, hasMore: false };

    const rows = await prisma.contact.findMany({
      where: { id: { in: pageIds }, deletedAt: null },
      include: {
        companyContacts: { include: { company: { select: { id: true, name: true } } } },
        _count: { select: { quotes: true } },
      },
    });
    return { contacts: orderByIds(rows, pageIds), total, hasMore: skip + take < total };
  }

  // Default listing
  const where = { orgId: ORG_ID, deletedAt: null };
  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: {
        companyContacts: { include: { company: { select: { id: true, name: true } } } },
        _count: { select: { quotes: true } },
      },
      orderBy: { name: 'asc' },
      skip,
      take,
    }),
    prisma.contact.count({ where }),
  ]);

  return { contacts, total, hasMore: skip + take < total };
}

// ─── SEARCH CONTACTS (greeklish-aware, for dropdowns) ───

export async function searchContacts(search?: string) {
  if (!search?.trim()) {
    return prisma.contact.findMany({
      where: { orgId: ORG_ID, deletedAt: null },
      include: { companyContacts: { include: { company: { select: { id: true, name: true } } }, take: 3 } },
      orderBy: { name: 'asc' },
      take: 20,
    });
  }
  const ids = await fuzzySearchIds('Contact', ORG_ID, search, 20);
  if (ids.length === 0) return [];
  const rows = await prisma.contact.findMany({
    where: { id: { in: ids } },
    include: { companyContacts: { include: { company: { select: { id: true, name: true } } }, take: 3 } },
  });
  return orderByIds(rows, ids);
}

// ─── CREATE COMPANY FROM ELORUS ───

export async function createCompanyFromElorus(data: {
  name: string;
  afm?: string;
  doy?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  zip?: string;
  folderPath?: string;
  elorusContactId?: string;
}) {
  const company = await prisma.company.create({
    data: {
      orgId: ORG_ID,
      name: data.name,
      afm: data.afm || null,
      doy: data.doy || null,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      city: data.city || null,
      zip: data.zip || null,
      folderPath: data.folderPath || null,
      elorusContactId: data.elorusContactId || null,
    },
  });
  revalidatePath('/contacts');
  revalidatePath('/quotes');
  return { id: company.id, name: company.name };
}

// ─── CREATE COMPANY QUICK ───

export async function createCompanyQuick(data: {
  name: string;
  email?: string;
  phone?: string;
  afm?: string;
  folderPath?: string;
  contactName?: string;
  contactEmail?: string;
}) {
  const company = await prisma.company.create({
    data: {
      orgId: ORG_ID,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      afm: data.afm || null,
      folderPath: data.folderPath || null,
    },
  });

  if (data.contactName) {
    const contact = await prisma.contact.create({
      data: {
        orgId: ORG_ID,
        name: data.contactName,
        email: data.contactEmail || data.email || null,
        role: 'employee',
      },
    });
    await prisma.companyContact.create({
      data: { companyId: company.id, contactId: contact.id, isPrimary: true, role: 'employee' },
    });
  }

  revalidatePath('/contacts');
  revalidatePath('/quotes');
  return company;
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
