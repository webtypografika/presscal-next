import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

const ORG_ID = 'default-org';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const conType = searchParams.get('conType');
  const conModule = searchParams.get('conModule');
  const color = searchParams.get('color');
  const machineId = searchParams.get('machineId');

  const where: Record<string, unknown> = {
    orgId: ORG_ID,
    deletedAt: null,
  };
  if (conType) where.conType = conType;
  if (conModule) where.conModule = { in: [conModule, 'shared'] };
  if (color) where.color = color;
  if (machineId) where.machineId = machineId;

  const items = await prisma.consumable.findMany({
    where,
    select: {
      id: true,
      name: true,
      conType: true,
      color: true,
      supplier: true,
      supplierEmail: true,
      unit: true,
      unitSize: true,
      costPerUnit: true,
      costPerBase: true,
      yieldPages: true,
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(items);
}
