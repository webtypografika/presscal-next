'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

const ORG_ID = 'default-org';

export async function getOrg() {
  return prisma.org.findUnique({ where: { id: ORG_ID } });
}

export async function updateOrg(data: Record<string, unknown>) {
  try {
    // Build SET clause dynamically
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(data)) {
      fields.push(`"${key}" = $${idx}`);
      values.push(value);
      idx++;
    }
    if (fields.length === 0) return { ok: true };
    values.push(ORG_ID);
    await prisma.$queryRawUnsafe(
      `UPDATE "Org" SET ${fields.join(', ')}, "updatedAt" = NOW() WHERE id = $${idx}`,
      ...values
    );
    revalidatePath('/settings');
    revalidatePath('/inventory');
    return { ok: true };
  } catch (e) {
    console.error('updateOrg error:', e);
    return { ok: false, error: (e as Error).message };
  }
}
