'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

const ORG_ID = 'default-org';
const reval = () => revalidatePath('/office');

// ─── PROJECTS ───

export async function getProjects() {
  return prisma.orgProject.findMany({
    where: { orgId: ORG_ID },
    include: { _count: { select: { items: true } } },
    orderBy: [{ archived: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function createProject(title: string, color?: string, icon?: string) {
  const maxSort = await prisma.orgProject.aggregate({ where: { orgId: ORG_ID }, _max: { sortOrder: true } });
  const project = await prisma.orgProject.create({
    data: { orgId: ORG_ID, title, color: color || null, icon: icon || null, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
  });
  reval();
  return project;
}

export async function updateProject(id: string, data: { title?: string; color?: string; icon?: string; archived?: boolean }) {
  await prisma.orgProject.update({ where: { id }, data });
  reval();
}

export async function deleteProject(id: string) {
  await prisma.orgProject.delete({ where: { id } });
  reval();
}

export async function reorderProjects(ids: string[]) {
  await prisma.$transaction(
    ids.map((id, i) => prisma.orgProject.update({ where: { id }, data: { sortOrder: i } }))
  );
  reval();
}

// ─── ITEMS ───

export async function getItems(projectId: string) {
  return prisma.orgItem.findMany({
    where: { projectId, orgId: ORG_ID },
    include: {
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true } },
      calendarEvents: { select: { id: true, title: true, startAt: true, type: true, completed: true }, orderBy: { startAt: 'asc' } },
    },
    orderBy: [{ completed: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function createItem(projectId: string, title: string) {
  const maxSort = await prisma.orgItem.aggregate({ where: { projectId }, _max: { sortOrder: true } });
  const item = await prisma.orgItem.create({
    data: { orgId: ORG_ID, projectId, title, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
  });
  reval();
  return item;
}

export async function updateItem(id: string, data: {
  title?: string; notes?: string; tags?: string[]; priority?: string;
  deadline?: Date | null; completed?: boolean; completedAt?: Date | null;
  checklist?: unknown; companyId?: string | null; contactId?: string | null;
  linkedEmails?: string[];
}) {
  // Auto-set completedAt
  if (data.completed === true && !data.completedAt) data.completedAt = new Date();
  if (data.completed === false) data.completedAt = null;

  // Build Prisma-compatible update (relations use connect/disconnect)
  const update: Record<string, unknown> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.notes !== undefined) update.notes = data.notes;
  if (data.tags !== undefined) update.tags = data.tags;
  if (data.priority !== undefined) update.priority = data.priority;
  if (data.deadline !== undefined) update.deadline = data.deadline;
  if (data.completed !== undefined) update.completed = data.completed;
  if (data.completedAt !== undefined) update.completedAt = data.completedAt;
  if (data.checklist !== undefined) update.checklist = data.checklist ?? undefined;
  if (data.linkedEmails !== undefined) update.linkedEmails = data.linkedEmails;
  if (data.companyId !== undefined) {
    update.company = data.companyId ? { connect: { id: data.companyId } } : { disconnect: true };
  }
  if (data.contactId !== undefined) {
    update.contact = data.contactId ? { connect: { id: data.contactId } } : { disconnect: true };
  }

  await prisma.orgItem.update({ where: { id }, data: update });
  reval();
}

export async function deleteItem(id: string) {
  await prisma.orgItem.delete({ where: { id } });
  reval();
}

export async function toggleItem(id: string) {
  const item = await prisma.orgItem.findUnique({ where: { id }, select: { completed: true } });
  if (!item) return;
  await prisma.orgItem.update({
    where: { id },
    data: { completed: !item.completed, completedAt: !item.completed ? new Date() : null },
  });
  reval();
}

export async function reorderItems(ids: string[]) {
  await prisma.$transaction(
    ids.map((id, i) => prisma.orgItem.update({ where: { id }, data: { sortOrder: i } }))
  );
  reval();
}

// ─── EMAIL LINKING ───

export async function linkEmailToItem(itemId: string, messageId: string) {
  const item = await prisma.orgItem.findUnique({ where: { id: itemId }, select: { linkedEmails: true } });
  if (!item) return;
  const emails = item.linkedEmails || [];
  if (!emails.includes(messageId)) {
    await prisma.orgItem.update({ where: { id: itemId }, data: { linkedEmails: [...emails, messageId] } });
    reval();
  }
}

export async function unlinkEmailFromItem(itemId: string, messageId: string) {
  const item = await prisma.orgItem.findUnique({ where: { id: itemId }, select: { linkedEmails: true } });
  if (!item) return;
  await prisma.orgItem.update({
    where: { id: itemId },
    data: { linkedEmails: (item.linkedEmails || []).filter(e => e !== messageId) },
  });
  reval();
}

// ─── HELPERS ───

export async function getCompaniesForPicker() {
  return prisma.company.findMany({
    where: { orgId: ORG_ID, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export async function getContactsForPicker() {
  return prisma.contact.findMany({
    where: { orgId: ORG_ID, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}
