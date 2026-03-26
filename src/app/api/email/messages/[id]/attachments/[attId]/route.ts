import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGmailToken, getAttachment } from '@/lib/gmail';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; attId: string }> }) {
  try {
    const { id, attId } = await params;
    const session = await getServerSession(authOptions);
    const userId = (session?.user as Record<string, unknown>)?.id as string;
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const token = await getGmailToken(userId);
    if (!token) return NextResponse.json({ error: 'No Gmail token' }, { status: 401 });

    const base64Data = await getAttachment(token, id, attId);

    // If ?raw query param, return binary download
    const filename = req.nextUrl.searchParams.get('filename') || 'attachment';
    const mime = req.nextUrl.searchParams.get('mime') || 'application/octet-stream';

    const buffer = Buffer.from(base64Data, 'base64');
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
