import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as Record<string, unknown>)?.id as string;
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { gmailId } = await req.json();
  if (!gmailId) return NextResponse.json({ error: 'Missing gmailId' }, { status: 400 });

  await prisma.dismissedEmail.upsert({
    where: { userId_gmailId: { userId, gmailId } },
    create: { userId, gmailId },
    update: {},
  });

  return NextResponse.json({ ok: true });
}
