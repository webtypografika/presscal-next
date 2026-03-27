import { prisma } from '@/lib/db';
import { NextRequest } from 'next/server';

const ORG_ID = 'default-org';

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email');
  if (!email) return Response.json({ customer: null });

  // Match by primary email (case-insensitive)
  const customer = await prisma.customer.findFirst({
    where: {
      orgId: ORG_ID,
      deletedAt: null,
      email: { equals: email, mode: 'insensitive' },
    },
    select: {
      id: true, name: true, company: true, email: true, phone: true,
      quotes: {
        where: { deletedAt: null },
        select: { id: true, number: true, status: true, grandTotal: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  return Response.json({ customer });
}
