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
      contact: true,
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

// ─── WRAPPERS — delegate to companies/actions ───

export async function searchContacts(search?: string) {
  const mod = await import('../companies/actions');
  return mod.searchContacts(search);
}

export async function createCompanyQuick(data: {
  name: string; email?: string; phone?: string; afm?: string;
  contactName?: string; contactEmail?: string;
}) {
  const mod = await import('../companies/actions');
  return mod.createCompanyQuick(data);
}

export async function createCompanyFromElorus(data: {
  name: string; afm?: string; doy?: string; email?: string; phone?: string;
  address?: string; city?: string; zip?: string; elorusContactId?: string;
}) {
  const mod = await import('../companies/actions');
  return mod.createCompanyFromElorus(data);
}

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

// ─── DEPRECATED COMPAT WRAPPERS ───
// These delegate to companies/actions for the new Company+Contact model

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
  const { createCompanyQuick } = await import('../companies/actions');
  const company = await createCompanyQuick({
    name: data.company || data.name,
    email: data.email,
    phone: data.phone,
    contactName: data.name,
    contactEmail: data.email,
  });
  return { id: company.id, name: company.name, company: company.name, email: company.email };
}

export async function updateCustomer(id: string, data: Record<string, unknown>) {
  const { updateCompany } = await import('../companies/actions');
  return updateCompany(id, data as any);
}

// ─── SAVE EMAIL ATTACHMENTS TO STORAGE ───

export async function saveEmailAttachments(quoteId: string, messageIds: string[]) {
  try {
    // Find a user with Google OAuth in this org
    const account = await prisma.account.findFirst({
      where: { provider: 'google', user: { orgId: ORG_ID } },
      select: { userId: true },
    });
    if (!account) return { saved: 0 };

    const { getGmailToken, getMessage } = await import('@/lib/gmail');
    const token = await getGmailToken(account.userId);
    if (!token) return { saved: 0 };

    // Check for existing fileLinks to avoid duplicates
    const existing = await prisma.fileLink.findMany({
      where: { quoteId, source: 'email' },
      select: { filePath: true },
    });
    const existingPaths = new Set(existing.map(f => f.filePath));

    let saved = 0;

    for (const msgId of messageIds) {
      try {
        const msg = await getMessage(token, msgId);
        if (!msg.attachments?.length) continue;

        for (const att of msg.attachments) {
          if (!att.filename || !att.id) continue;

          // Store email ref as filePath — PressKit uses /api/filehelper/emails/... with Bearer auth
          const downloadPath = `/api/filehelper/emails/${msgId}/attachments/${att.id}?filename=${encodeURIComponent(att.filename)}&mime=${encodeURIComponent(att.mimeType || 'application/octet-stream')}`;

          // Skip duplicates
          if (existingPaths.has(downloadPath)) continue;

          const ext = att.filename.split('.').pop()?.toLowerCase() || '';

          // For images, fetch and create base64 thumbnail
          let thumbnail: string | null = null;
          const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
          if (imageExts.has(ext) && att.size < 200_000) {
            try {
              const { getAttachment } = await import('@/lib/gmail');
              const b64 = await getAttachment(token, msgId, att.id);
              const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
              thumbnail = `data:${mime};base64,${b64}`;
            } catch { /* thumbnail is optional */ }
          }

          await prisma.fileLink.create({
            data: {
              orgId: ORG_ID,
              fileName: att.filename,
              filePath: downloadPath,
              fileType: ext,
              fileSize: att.size || 0,
              source: 'email',
              quoteId,
              thumbnail,
            },
          });

          existingPaths.add(downloadPath);
          saved++;
        }
      } catch (e) { console.error('[saveEmailAttachments] message error:', msgId, (e as Error).message); }
    }

    return { saved };
  } catch (e) {
    console.error('[saveEmailAttachments] fatal error:', (e as Error).message);
    return { saved: 0 };
  }
}

// ─── UPDATE FILELINK THUMBNAIL ───

export async function updateFileLinkThumbnail(id: string, thumbnail: string) {
  await prisma.fileLink.update({
    where: { id },
    data: { thumbnail },
  });
}

// ─── GET LINKED EMAIL MAP ───

export async function getLinkedEmailMap(): Promise<Record<string, { number: string; id: string }>> {
  const quotes = await prisma.quote.findMany({
    where: { orgId: ORG_ID, deletedAt: null, linkedEmails: { isEmpty: false } },
    select: { id: true, number: true, linkedEmails: true },
  });
  const map: Record<string, { number: string; id: string }> = {};
  for (const q of quotes) {
    for (const emailId of (q.linkedEmails || [])) {
      map[emailId] = { number: q.number, id: q.id };
    }
  }
  return map;
}
