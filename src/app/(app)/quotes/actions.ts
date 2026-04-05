'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { normalize, normalizeGreeklish } from '@/lib/search';

const ORG_ID = 'default-org';

// ─── LIST ───

export async function getQuotes() {
  return prisma.quote.findMany({
    where: { orgId: ORG_ID, deletedAt: null },
    include: {
      company: {
        include: {
          companyContacts: {
            where: { isPrimary: true },
            include: { contact: true },
            take: 1,
          },
        },
      },
      // DEPRECATED: keep for backward compat during transition
      customer: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getQuote(id: string) {
  return prisma.quote.findFirst({
    where: { id, orgId: ORG_ID, deletedAt: null },
    include: {
      company: {
        include: {
          companyContacts: {
            include: { contact: true },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
        },
      },
      contact: true,
      quoteRecipients: {
        include: { contact: true },
      },
      customer: true,
      fileLinks: {
        orderBy: { createdAt: 'desc' },
      },
    },
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
  companyId?: string;
  contactId?: string;
  customerId?: string;  // DEPRECATED — still accepted, maps to companyId
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
  recipientContactIds?: string[];  // contact IDs to add as recipients
}) {
  const number = await nextQuoteNumber();
  // Validate companyId exists in Company table
  let companyId: string | null = null;
  const candidateId = data.companyId || data.customerId || null;
  if (candidateId) {
    const exists = await prisma.company.findUnique({ where: { id: candidateId }, select: { id: true } });
    if (exists) companyId = candidateId;
  }
  const quote = await prisma.quote.create({
    data: {
      orgId: ORG_ID,
      number,
      status: 'draft',
      companyId,
      contactId: data.contactId || null,
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
  // Add recipients
  if (data.recipientContactIds?.length) {
    for (const contactId of data.recipientContactIds) {
      await prisma.quoteRecipient.create({
        data: { quoteId: quote.id, contactId, type: 'to' },
      }).catch(() => {}); // ignore duplicates
    }
  }

  revalidatePath('/quotes');
  return quote;
}

// ─── UPDATE ───

export async function updateQuote(id: string, data: {
  companyId?: string | null;
  contactId?: string | null;
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
  // Separate companyId/customerId/contactId from other fields to avoid FK issues
  const { companyId, contactId, customerId, items, ...rest } = data;
  const updateData: Record<string, unknown> = { ...rest };
  if (items !== undefined) updateData.items = items as any;
  if (companyId !== undefined) updateData.companyId = companyId || null;
  if (contactId !== undefined) updateData.contactId = contactId || null;
  // Don't set customerId to a company ID — only set if it's actually a Customer record
  // During transition, leave customerId untouched unless explicitly null
  if (customerId === null) updateData.customerId = null;

  const quote = await prisma.quote.update({
    where: { id },
    data: updateData,
  });
  revalidatePath('/quotes');
  return quote;
}

// ─── DELETE ───

export async function deleteQuote(id: string) {
  await prisma.quote.delete({ where: { id } });
  revalidatePath('/quotes');
}

// ─── STATUS ───

export async function updateQuoteStatus(id: string, status: string) {
  const data: Record<string, unknown> = { status };
  if (status === 'sent') data.sentAt = new Date();
  if (status === 'completed') data.completedAt = new Date();

  // Auto-promote to first job stage when approved
  if (status === 'approved') {
    const org = await prisma.org.findUnique({ where: { id: ORG_ID }, select: { jobStages: true, jobFolderRoot: true } });
    const stages = (org?.jobStages as any[]) || [];
    const firstStage = stages[0]?.id || 'files';
    data.jobStage = firstStage;
    data.jobStageUpdatedAt = new Date();
    data.approvedAt = new Date();

    // Compute job folder path
    const quote = await prisma.quote.findUnique({
      where: { id },
      select: { number: true, title: true, company: { select: { name: true, folderPath: true } } },
    });
    if (quote) {
      const { buildJobFolderPath } = await import('@/lib/job-folder');
      data.jobFolderPath = buildJobFolderPath({
        globalRoot: org?.jobFolderRoot || null,
        companyFolderPath: quote.company?.folderPath || null,
        companyName: quote.company?.name || 'Πελάτης',
        quoteNumber: quote.number,
        quoteTitle: quote.title,
      });
    }
  }

  await prisma.quote.update({ where: { id }, data });
  revalidatePath('/quotes');
  revalidatePath('/jobs');
  revalidatePath('/');
}

// ─── LINK EMAIL ───

export async function linkEmailToQuote(quoteId: string, messageId: string, threadId: string) {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId }, select: { linkedEmails: true, threadId: true } });
  if (!quote) throw new Error('Quote not found');

  let linked = quote.linkedEmails || [];

  // Try to fetch all messages in the thread so the full conversation is linked
  try {
    const { getGmailToken, getThread } = await import('@/lib/gmail');
    const { getServerSession } = await import('next-auth');
    const { authOptions } = await import('@/lib/auth');
    const session = await getServerSession(authOptions);
    const userId = (session?.user as Record<string, unknown>)?.id as string;
    if (userId) {
      const token = await getGmailToken(userId);
      if (token) {
        const threadMsgIds = await getThread(token, threadId);
        for (const id of threadMsgIds) {
          if (!linked.includes(id)) linked.push(id);
        }
      }
    }
  } catch {
    // Fallback: just link the single message
    if (!linked.includes(messageId)) linked.push(messageId);
  }

  // Ensure at least the clicked message is linked
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

// ─── COMPANIES (for selector) ───

export async function getCompaniesForQuotes(search?: string) {
  const where: any = { orgId: ORG_ID, deletedAt: null };
  if (search?.trim()) {
    const norm = normalize(search.trim());
    const greeklish = normalizeGreeklish(search.trim());
    const variants = [search.trim(), norm, greeklish].filter((v, i, a) => a.indexOf(v) === i);
    where.OR = variants.flatMap(s => [
      { name: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      { afm: { contains: s } },
      { companyContacts: { some: { contact: { OR: [
        { name: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
      ] } } } },
    ]);
  }
  return prisma.company.findMany({
    where,
    include: {
      companyContacts: {
        include: { contact: true },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: { name: 'asc' },
    take: 30,
  });
}

export async function searchContacts(search?: string) {
  const where: any = { orgId: ORG_ID, deletedAt: null };
  if (search?.trim()) {
    const s = search.trim();
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      { phone: { contains: s } },
    ];
  }
  return prisma.contact.findMany({
    where,
    include: {
      companyContacts: {
        include: { company: { select: { id: true, name: true } } },
        take: 3,
      },
    },
    orderBy: { name: 'asc' },
    take: 20,
  });
}

export async function createCompanyQuick(data: {
  name: string;
  email?: string;
  phone?: string;
  afm?: string;
  contactName?: string;  // auto-create a primary contact
  contactEmail?: string;
}) {
  const company = await prisma.company.create({
    data: {
      orgId: ORG_ID,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      afm: data.afm || null,
    },
  });

  // Auto-create primary contact if provided
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

  revalidatePath('/quotes');
  revalidatePath('/companies');
  return company;
}

// ─── QUOTE RECIPIENTS ───

export async function addQuoteRecipient(quoteId: string, contactId: string, type: 'to' | 'cc' = 'to') {
  await prisma.quoteRecipient.create({
    data: { quoteId, contactId, type },
  }).catch(() => {}); // ignore duplicates
  revalidatePath(`/quotes/${quoteId}`);
}

export async function removeQuoteRecipient(quoteId: string, contactId: string) {
  await prisma.quoteRecipient.deleteMany({
    where: { quoteId, contactId },
  });
  revalidatePath(`/quotes/${quoteId}`);
}

// ─── DEPRECATED: keep for backward compat ───

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
}) {
  // Create as Company + Contact in new model
  const company = await prisma.company.create({
    data: {
      orgId: ORG_ID,
      name: data.company || data.name,
      email: data.email || null,
      phone: data.phone || null,
    },
  });
  const contact = await prisma.contact.create({
    data: {
      orgId: ORG_ID,
      name: data.name,
      email: data.email || null,
      role: data.company ? 'employee' : 'contact',
    },
  });
  await prisma.companyContact.create({
    data: { companyId: company.id, contactId: contact.id, isPrimary: true },
  });
  revalidatePath('/quotes');
  revalidatePath('/companies');
  // Return company-like object for backward compat
  return { id: company.id, name: company.name, company: company.name, email: company.email };
}

export async function createCompanyFromElorus(data: {
  name: string;
  afm?: string;
  doy?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  zip?: string;
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
      elorusContactId: data.elorusContactId || null,
    },
  });
  revalidatePath('/quotes');
  revalidatePath('/companies');
  return { id: company.id, name: company.name };
}

export async function updateCustomer(id: string, data: Record<string, unknown>) {
  // Try updating as Company first (new model), fall back to old Customer
  try {
    const company = await prisma.company.update({
      where: { id },
      data: {
        name: data.name as string | undefined,
        afm: data.afm as string | undefined,
        doy: data.doy as string | undefined,
        address: data.address as string | undefined,
        city: data.city as string | undefined,
        zip: data.zip as string | undefined,
        phone: data.phone as string | undefined,
        email: data.email as string | undefined,
        notes: data.notes as string | undefined,
        folderPath: data.folderPath as string | undefined,
      },
    });
    revalidatePath('/quotes');
    revalidatePath('/companies');
    return company;
  } catch {
    // Fallback to old Customer table
    const customer = await prisma.customer.update({ where: { id }, data: data as any });
    revalidatePath('/quotes');
    return customer;
  }
}

// ─── SAVE EMAIL ATTACHMENTS TO STORAGE ───

export async function saveEmailAttachments(quoteId: string, messageIds: string[]) {
  try {
    console.log('[saveEmailAttachments] start, quoteId:', quoteId, 'messages:', messageIds.length);
    // Find a user with Google OAuth in this org
    const account = await prisma.account.findFirst({
      where: { provider: 'google', user: { orgId: ORG_ID } },
      select: { userId: true },
    });
    if (!account) { console.log('[saveEmailAttachments] no google account found'); return { saved: 0 }; }

    const { getGmailToken, getMessage, getAttachment } = await import('@/lib/gmail');
    const token = await getGmailToken(account.userId);
    if (!token) { console.log('[saveEmailAttachments] no gmail token'); return { saved: 0 }; }

    const fs = await import('fs/promises');
    const path = await import('path');

    const dir = path.join(process.cwd(), 'public', 'storage', 'quotes', quoteId);
    await fs.mkdir(dir, { recursive: true });

    let saved = 0;
    const fileLinks: { name: string; path: string; type: string; size: number }[] = [];

    for (const msgId of messageIds) {
      try {
        const msg = await getMessage(token, msgId);
        if (!msg.attachments?.length) continue;

        for (const att of msg.attachments) {
          if (!att.id || !att.filename) continue;

          // Sanitize filename
          const safeName = att.filename.replace(/[<>:"|?*]/g, '_');
          const filePath = path.join(dir, safeName);

          // Skip if already exists
          try { await fs.access(filePath); continue; } catch { /* doesn't exist, good */ }

          // Download from Gmail
          const b64 = await getAttachment(token, msgId, att.id);
          const buffer = Buffer.from(b64, 'base64');
          await fs.writeFile(filePath, buffer);

          const ext = safeName.split('.').pop()?.toLowerCase() || '';
          const webPath = `/storage/quotes/${quoteId}/${safeName}`;

          // Generate base64 thumbnail for images
          let thumbnail: string | null = null;
          const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
          if (imageExts.has(ext)) {
            const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
            const b64Data = buffer.toString('base64');
            const candidate = `data:${mime};base64,${b64Data}`;
            if (candidate.length <= 200_000) thumbnail = candidate;
          }

          // Create FileLink record
          const quote = await prisma.quote.findUnique({ where: { id: quoteId }, select: { orgId: true } });
          if (quote) {
            await prisma.fileLink.create({
              data: {
                orgId: quote.orgId,
                fileName: safeName,
                filePath: webPath,
                fileType: ext,
                fileSize: buffer.length,
                source: 'email',
                quoteId,
                thumbnail,
              },
            });
          }

          fileLinks.push({ name: safeName, path: webPath, type: ext, size: buffer.length });
          saved++;
        }
      } catch (e) { console.error('[saveEmailAttachments] message error:', (e as Error).message); }
    }

    console.log('[saveEmailAttachments] done, saved:', saved);
    return { saved, files: fileLinks };
  } catch (e) {
    console.error('[saveEmailAttachments] fatal error:', (e as Error).message);
    return { saved: 0 };
  }
}

// ─── GET LINKED EMAIL MAP ───

export async function getLinkedEmailMap(): Promise<Record<string, string>> {
  const quotes = await prisma.quote.findMany({
    where: { orgId: ORG_ID, deletedAt: null, linkedEmails: { isEmpty: false } },
    select: { number: true, linkedEmails: true },
  });
  const map: Record<string, string> = {};
  for (const q of quotes) {
    for (const emailId of (q.linkedEmails || [])) {
      map[emailId] = q.number;
    }
  }
  return map;
}
