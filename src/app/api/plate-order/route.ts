import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ORG_ID = 'default-org';

// ═══ GET — list plate orders ═══
export async function GET() {
  const orders = await prisma.plateOrder.findMany({
    where: { orgId: ORG_ID, deletedAt: null },
    select: {
      id: true, orderType: true, status: true,
      supplierName: true, supplierEmail: true,
      items: true, jobDescription: true, pdfFileName: true,
      totalCost: true, notes: true,
      sentAt: true, receivedAt: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return Response.json(orders);
}

// ═══ POST — record plate order (email sent via Firebase) ═══
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const order = await prisma.plateOrder.create({
      data: {
        orgId: ORG_ID,
        orderType: body.orderType || 'platemaker_service',
        status: 'sent',
        supplierName: body.supplierName || '',
        supplierEmail: body.supplierEmail || '',
        items: body.items || [],
        jobDescription: body.jobDescription || null,
        pdfFileName: body.pdfFileName || null,
        notes: body.notes || '',
        sentAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, orderId: order.id });
  } catch (e) {
    console.error('Plate order error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// ═══ PATCH — update order status ═══
export async function PATCH(req: NextRequest) {
  try {
    const { id, status } = await req.json();
    const data: Record<string, unknown> = { status };
    if (status === 'received') data.receivedAt = new Date();
    await prisma.plateOrder.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
