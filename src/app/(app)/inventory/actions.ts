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

export async function bulkDeleteMaterials(ids: string[]) {
  const result = await prisma.material.updateMany({
    where: { id: { in: ids } },
    data: { deletedAt: new Date() },
  });
  revalidatePath('/inventory');
  return result.count;
}

export async function bulkUpdateMaterials(ids: string[], data: Record<string, unknown>) {
  const result = await prisma.material.updateMany({
    where: { id: { in: ids } },
    data,
  });
  revalidatePath('/inventory');
  return result.count;
}

export async function deleteAllMaterials() {
  const result = await prisma.material.updateMany({
    where: { orgId: ORG_ID, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  revalidatePath('/inventory');
  return result.count;
}

// ─── BULK IMPORT MATERIALS ───

export interface BulkMaterialRow {
  name: string;
  cat: string;
  groupName?: string;
  subtype?: string;
  supplier?: string;
  supplierEmail?: string;
  width?: number | null;
  height?: number | null;
  thickness?: number | null;
  grain?: string;
  costPerUnit?: number | null;
  markup?: number | null;
  unit?: string;
}

export async function bulkCreateMaterials(rows: BulkMaterialRow[]) {
  // Get existing materials for dedup
  const existing = await prisma.material.findMany({
    where: { orgId: ORG_ID, deletedAt: null },
    select: { id: true, name: true, width: true, height: true, thickness: true },
  });

  const key = (n: string, w: number, h: number, t: number) =>
    `${n.toLowerCase().trim()}|${w}|${h}|${t}`;

  const existingMap = new Map<string, string>();
  for (const m of existing) {
    existingMap.set(key(m.name, m.width ?? 0, m.height ?? 0, m.thickness ?? 0), m.id);
  }

  let added = 0, updated = 0, skipped = 0;

  for (const row of rows) {
    if (!row.name?.trim()) { skipped++; continue; }

    const k = key(row.name, row.width ?? 0, row.height ?? 0, row.thickness ?? 0);
    const existingId = existingMap.get(k);

    if (existingId) {
      // Update cost + supplier if changed
      await prisma.material.update({
        where: { id: existingId },
        data: {
          costPerUnit: row.costPerUnit,
          ...(row.supplier ? { supplier: row.supplier } : {}),
          ...(row.supplierEmail ? { supplierEmail: row.supplierEmail } : {}),
        },
      });
      updated++;
    } else {
      await prisma.material.create({
        data: {
          orgId: ORG_ID,
          name: row.name.trim(),
          cat: row.cat || 'sheet',
          groupName: row.groupName,
          subtype: row.subtype,
          supplier: row.supplier,
          supplierEmail: row.supplierEmail,
          width: row.width,
          height: row.height,
          thickness: row.thickness,
          grain: row.grain,
          costPerUnit: row.costPerUnit,
          markup: row.markup ?? 30,
          unit: row.unit ?? 'φύλλο',
          specs: {},
        },
      });
      existingMap.set(k, 'new'); // prevent dups within same batch
      added++;
    }
  }

  revalidatePath('/inventory');
  return { added, updated, skipped };
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
