import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGmailToken, sendGmail } from '@/lib/gmail';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as Record<string, unknown>)?.id as string;
    const userEmail = session?.user?.email || '';
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const token = await getGmailToken(userId);
    if (!token) return NextResponse.json({ error: 'No Gmail token' }, { status: 401 });

    const body = await req.json();
    const { to, cc, subject, body: htmlBody, inReplyTo, threadId, attachments } = body;

    if (!to) return NextResponse.json({ error: 'No recipient' }, { status: 400 });

    const result = await sendGmail(token, userEmail, to, subject || '(no subject)', htmlBody || '', {
      cc: cc || undefined,
      inReplyTo: inReplyTo || undefined,
      threadId: threadId || undefined,
      attachments: attachments || undefined,
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
