import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateFilehelper } from '../../../../auth'
import { getGmailToken, getAttachment } from '@/lib/gmail'

// GET /api/filehelper/emails/[messageId]/attachments/[attId] — Download attachment binary
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string; attId: string }> }
) {
  try {
    const auth = await authenticateFilehelper(req)
    if ('error' in auth) return auth.error

    const { messageId, attId } = await params
    const mime = req.nextUrl.searchParams.get('mime') || 'application/octet-stream'
    const filename = req.nextUrl.searchParams.get('filename') || 'attachment'

    // Find a user with Gmail access in this org
    const user = await (prisma as any).user.findFirst({
      where: { orgId: auth.org.id },
      include: {
        accounts: {
          where: { provider: 'google' },
          select: { userId: true }
        }
      }
    })

    if (!user?.accounts?.[0]) {
      return NextResponse.json({ error: 'No Gmail account configured' }, { status: 400 })
    }

    const token = await getGmailToken(user.id)
    if (!token) {
      return NextResponse.json({ error: 'Gmail token expired' }, { status: 401 })
    }

    const base64Data = await getAttachment(token, messageId, attId)
    const buffer = Buffer.from(base64Data, 'base64')

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': String(buffer.length)
      }
    })
  } catch (e) {
    console.error('filehelper attachment error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
