'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

// TODO: get orgId from session — hardcoded for now
const ORG_ID = 'default-org';

// Ensure org exists
async function ensureOrg() {
  await prisma.org.upsert({
    where: { id: ORG_ID },
    update: {},
    create: { id: ORG_ID, name: 'My Print Shop' },
  });
}

export async function getMachines() {
  await ensureOrg();
  return prisma.machine.findMany({
    where: { orgId: ORG_ID, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getMachine(id: string) {
  return prisma.machine.findUnique({ where: { id } });
}

export async function createMachine(data: {
  name: string;
  cat: string;
  notes?: string;
  maxLS?: number;
  maxSS?: number;
  minLS?: number;
  minSS?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  specs?: object;
}) {
  await ensureOrg();
  const machine = await prisma.machine.create({
    data: {
      orgId: ORG_ID,
      name: data.name,
      cat: data.cat,
      notes: data.notes ?? '',
      maxLS: data.maxLS ?? null,
      maxSS: data.maxSS ?? null,
      minLS: data.minLS ?? null,
      minSS: data.minSS ?? null,
      marginTop: data.marginTop ?? null,
      marginBottom: data.marginBottom ?? null,
      marginLeft: data.marginLeft ?? null,
      marginRight: data.marginRight ?? null,
      specs: data.specs ?? {},
    },
  });
  revalidatePath('/machines');
  return machine;
}

export async function updateMachine(
  id: string,
  data: {
    name?: string;
    cat?: string;
    notes?: string;
    maxLS?: number | null;
    maxSS?: number | null;
    minLS?: number | null;
    minSS?: number | null;
    marginTop?: number | null;
    marginBottom?: number | null;
    marginLeft?: number | null;
    marginRight?: number | null;
    specs?: object;
  }
) {
  const machine = await prisma.machine.update({
    where: { id },
    data,
  });
  revalidatePath('/machines');
  return machine;
}

export async function deleteMachine(id: string) {
  await prisma.machine.delete({ where: { id } });
  revalidatePath('/machines');
}
