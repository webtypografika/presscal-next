import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// ONE-TIME cleanup: delete email-sourced FileLinks with wrong filePath
// DELETE this file after running once
export async function GET() {
  const deleted = await prisma.fileLink.deleteMany({
    where: {
      source: 'email',
      filePath: { startsWith: '/api/email/messages/' },
    },
  });
  return NextResponse.json({ deleted: deleted.count });
}
