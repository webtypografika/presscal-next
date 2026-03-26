import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGmailToken, listMessages } from '@/lib/gmail';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as Record<string, unknown>)?.id as string;
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const token = await getGmailToken(userId);
    if (!token) return NextResponse.json({ error: 'No Gmail token' }, { status: 401 });

    const params = req.nextUrl.searchParams;
    const result = await listMessages(token, {
      maxResults: Number(params.get('maxResults')) || 20,
      q: params.get('q') || undefined,
      pageToken: params.get('pageToken') || undefined,
      labelIds: params.get('labelIds')?.split(',').filter(Boolean) || undefined,
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
