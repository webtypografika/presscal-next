'use server';

import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';

const ORG_ID = 'default-org';

export async function getProducts() {
  return prisma.product.findMany({
    where: { orgId: ORG_ID, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createProduct(data: {
  name: string;
  archetype: string;
  pages?: number;
  sheetsPerPad?: number;
  bodyPages?: number;
  customMult?: number;
  offset?: Record<string, unknown>;
  digital?: Record<string, unknown>;
  finishing?: unknown[];
}) {
  return prisma.product.create({
    data: {
      orgId: ORG_ID,
      name: data.name,
      archetype: data.archetype,
      pages: data.pages || null,
      sheetsPerPad: data.sheetsPerPad || null,
      bodyPages: data.bodyPages || null,
      customMult: data.customMult || null,
      offset: (data.offset || {}) as Prisma.InputJsonValue,
      digital: (data.digital || {}) as Prisma.InputJsonValue,
      finishing: (data.finishing || []) as Prisma.InputJsonValue,
    },
  });
}

export async function updateProduct(id: string, data: {
  name?: string;
  archetype?: string;
  pages?: number | null;
  sheetsPerPad?: number | null;
  bodyPages?: number | null;
  customMult?: number | null;
  offset?: Record<string, unknown>;
  digital?: Record<string, unknown>;
  finishing?: unknown[];
}) {
  const update: Prisma.ProductUpdateInput = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.archetype !== undefined) update.archetype = data.archetype;
  if (data.pages !== undefined) update.pages = data.pages;
  if (data.sheetsPerPad !== undefined) update.sheetsPerPad = data.sheetsPerPad;
  if (data.bodyPages !== undefined) update.bodyPages = data.bodyPages;
  if (data.customMult !== undefined) update.customMult = data.customMult;
  if (data.offset !== undefined) update.offset = data.offset as Prisma.InputJsonValue;
  if (data.digital !== undefined) update.digital = data.digital as Prisma.InputJsonValue;
  if (data.finishing !== undefined) update.finishing = data.finishing as Prisma.InputJsonValue;

  return prisma.product.update({
    where: { id },
    data: update,
  });
}

export async function deleteProduct(id: string) {
  return prisma.product.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
