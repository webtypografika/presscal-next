'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

const ORG_ID = 'default-org';

// ─── MATERIALS ───

export async function getMaterials() {
  return prisma.material.findMany({
    where: { orgId: ORG_ID, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createMaterial(data: {
  name: string;
  cat: string;
  groupName?: string;
  subtype?: string;
  supplier?: string;
  supplierEmail?: string;
  notes?: string;
  width?: number | null;
  height?: number | null;
  thickness?: number | null;
  grain?: string;
  rollLength?: number | null;
  costPerUnit?: number | null;
  markup?: number | null;
  sellPerUnit?: number | null;
  unit?: string;
  stock?: number | null;
  stockTarget?: number | null;
  stockAlert?: number | null;
  specs?: object;
}) {
  const material = await prisma.material.create({
    data: { orgId: ORG_ID, ...data, specs: data.specs ?? {} },
  });
  revalidatePath('/inventory');
  return material;
}

export async function updateMaterial(id: string, data: Record<string, unknown>) {
  const material = await prisma.material.update({ where: { id }, data });
  revalidatePath('/inventory');
  return material;
}

export async function deleteMaterial(id: string) {
  await prisma.material.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath('/inventory');
}

// ─── CONSUMABLES ───

export async function getConsumables() {
  return prisma.consumable.findMany({
    where: { orgId: ORG_ID, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { machine: { select: { id: true, name: true } } },
  });
}

export async function createConsumable(data: {
  name: string;
  conType: string;
  conModule: string;
  color?: string;
  groupName?: string;
  supplier?: string;
  supplierEmail?: string;
  notes?: string;
  machineId?: string | null;
  unit?: string;
  unitSize?: number | null;
  costPerUnit?: number | null;
  costPerBase?: number | null;
  yieldPages?: number | null;
  stock?: number | null;
  stockTarget?: number | null;
  stockAlert?: number | null;
}) {
  const consumable = await prisma.consumable.create({
    data: { orgId: ORG_ID, ...data },
  });
  revalidatePath('/inventory');
  return consumable;
}

export async function updateConsumable(id: string, data: Record<string, unknown>) {
  const consumable = await prisma.consumable.update({ where: { id }, data });
  revalidatePath('/inventory');
  return consumable;
}

export async function deleteConsumable(id: string) {
  await prisma.consumable.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath('/inventory');
}
