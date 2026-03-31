'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

const ORG_ID = 'default-org';

async function ensureOrg() {
  await prisma.org.upsert({
    where: { id: ORG_ID },
    update: {},
    create: { id: ORG_ID, name: 'My Print Shop' },
  });
}

export async function getPostpressMachines() {
  await ensureOrg();
  return prisma.postpressMachine.findMany({
    where: { orgId: ORG_ID, deletedAt: null },
    orderBy: [{ subtype: 'asc' }, { name: 'asc' }],
  });
}

export async function createPostpressMachine(data: {
  name: string;
  cat: string;
  subtype: string;
  notes?: string;
  setupCost?: number | null;
  speed?: number | null;
  minCharge?: number | null;
  hourlyRate?: number | null;
  specs?: object;
}) {
  await ensureOrg();
  const machine = await prisma.postpressMachine.create({
    data: {
      orgId: ORG_ID,
      name: data.name,
      cat: data.cat,
      subtype: data.subtype,
      notes: data.notes ?? '',
      setupCost: data.setupCost ?? null,
      speed: data.speed ?? null,
      minCharge: data.minCharge ?? null,
      hourlyRate: data.hourlyRate ?? null,
      specs: data.specs ?? {},
    },
  });
  revalidatePath('/postpress');
  return machine;
}

export async function updatePostpressMachine(
  id: string,
  data: {
    name?: string;
    cat?: string;
    subtype?: string;
    notes?: string;
    setupCost?: number | null;
    speed?: number | null;
    minCharge?: number | null;
    hourlyRate?: number | null;
    specs?: object;
  }
) {
  const machine = await prisma.postpressMachine.update({
    where: { id },
    data,
  });
  revalidatePath('/postpress');
  return machine;
}

export async function deletePostpressMachine(id: string) {
  await prisma.postpressMachine.delete({ where: { id } });
  revalidatePath('/postpress');
}
