import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateFilehelper } from '../../../../auth'
import { getGmailToken, getMessage } from '@/lib/gmail'

// GET /api/filehelper/quotes/[id]/emails/messages — Full email messages with attachments
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateFilehelper(req)
    if ('error' in auth) return auth.error

    const { id } = await params

    const quote = await (prisma as any).quote.findFirst({
      where: { id, orgId: auth.org.id },
      select: { linkedEmails: true, threadId: true }
    })

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    if (!quote.linkedEmails?.length) {
      return NextResponse.json({ messages: [] })
    }

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

    // Fetch all linked emails in parallel
    const results = await Promise.allSettled(
      quote.linkedEmails.map((msgId: string) => getMessage(token, msgId))
    )

    const messages = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => ({
        id: r.value.id,
        threadId: r.value.threadId,
        from: r.value.from,
        subject: r.value.subject,
        date: r.value.date,
        attachments: r.value.attachments
      }))

    return NextResponse.json({ messages })
  } catch (e) {
    console.error('filehelper quote emails error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
