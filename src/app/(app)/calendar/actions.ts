'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

const ORG_ID = 'default-org';

// ─── GET EVENTS (real + virtual quote deadlines) ───

export async function getEvents(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const [events, quotes] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: {
        orgId: ORG_ID,
        deletedAt: null,
        startAt: { gte: startDate, lte: endDate },
      },
      include: {
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
        quote: { select: { id: true, number: true, title: true } },
      },
      orderBy: { startAt: 'asc' },
    }),
    // Virtual events: quote deadlines in range
    prisma.quote.findMany({
      where: {
        orgId: ORG_ID,
        deletedAt: null,
        deadline: { gte: startDate, lte: endDate },
        status: { notIn: ['completed', 'cancelled'] },
      },
      select: {
        id: true,
        number: true,
        title: true,
        deadline: true,
        jobPriority: true,
        company: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Convert quote deadlines to virtual events
  const virtualEvents = quotes.map(q => ({
    id: `deadline-${q.id}`,
    title: `${q.number} ${q.company?.name || q.title || ''}`.trim(),
    type: 'deadline' as const,
    startAt: q.deadline!,
    endAt: null,
    allDay: true,
    color: q.jobPriority === 'rush' ? '#ef4444' : q.jobPriority === 'urgent' ? '#fb923c' : '#60a5fa',
    quoteId: q.id,
    quote: { id: q.id, number: q.number, title: q.title },
    companyId: q.company?.id || null,
    company: q.company,
    contactId: null,
    contact: null,
    notes: '',
    completed: false,
    virtual: true,
  }));

  return [...events.map(e => ({ ...e, virtual: false })), ...virtualEvents];
}

// ─── SEARCH helpers for dropdowns ───

export async function searchCompaniesForCalendar(q: string) {
  if (!q.trim()) return [];
  return prisma.company.findMany({
    where: {
      orgId: ORG_ID,
      deletedAt: null,
      name: { contains: q.trim(), mode: 'insensitive' },
    },
    select: { id: true, name: true },
    take: 15,
    orderBy: { name: 'asc' },
  });
}

export async function searchQuotesForCalendar(q: string) {
  if (!q.trim()) return [];
  const term = q.trim();
  return prisma.quote.findMany({
    where: {
      orgId: ORG_ID,
      deletedAt: null,
      OR: [
        { number: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { company: { name: { contains: term, mode: 'insensitive' } } },
      ],
    },
    select: { id: true, number: true, title: true, company: { select: { name: true } } },
    take: 15,
    orderBy: { createdAt: 'desc' },
  });
}

// ─── CREATE ───

export async function createEvent(data: {
  title: string;
  type?: string;
  startAt: string;
  endAt?: string | null;
  allDay?: boolean;
  color?: string | null;
  quoteId?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  notes?: string;
}) {
  const event = await prisma.calendarEvent.create({
    data: {
      orgId: ORG_ID,
      title: data.title,
      type: data.type || 'appointment',
      startAt: new Date(data.startAt),
      endAt: data.endAt ? new Date(data.endAt) : null,
      allDay: data.allDay ?? false,
      color: data.color || null,
      quoteId: data.quoteId || null,
      companyId: data.companyId || null,
      contactId: data.contactId || null,
      notes: data.notes || '',
    },
  });
  revalidatePath('/calendar');
  return event;
}

// ─── UPDATE ───

export async function updateEvent(id: string, data: {
  title?: string;
  type?: string;
  startAt?: string;
  endAt?: string | null;
  allDay?: boolean;
  color?: string | null;
  quoteId?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  notes?: string;
  completed?: boolean;
}) {
  const updateData: any = { ...data };
  if (data.startAt) updateData.startAt = new Date(data.startAt);
  if (data.endAt !== undefined) updateData.endAt = data.endAt ? new Date(data.endAt) : null;

  const event = await prisma.calendarEvent.update({
    where: { id },
    data: updateData,
  });
  revalidatePath('/calendar');
  return event;
}

// ─── DELETE (soft) ───

export async function deleteEvent(id: string) {
  await prisma.calendarEvent.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath('/calendar');
}
