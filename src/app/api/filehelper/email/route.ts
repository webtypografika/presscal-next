import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getGmailToken } from '@/lib/gmail'
import { authenticateFilehelper } from '../auth'

// POST /api/filehelper/email/send — Send email via Gmail
export async function POST(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  const body = await req.json()
  const { to, subject, body: emailBody, attachments, quoteId, customerId } = body

  if (!to || !subject) {
    return NextResponse.json({ error: 'to and subject required' }, { status: 400 })
  }

  // Find a user with Gmail access in this org
  const user = await (prisma as any).user.findFirst({
    where: { orgId: auth.org.id },
    include: {
      accounts: {
        where: { provider: 'google' },
        select: { id: true }
      }
    }
  })

  if (!user?.accounts?.[0]) {
    return NextResponse.json({ error: 'No Gmail account configured' }, { status: 400 })
  }

  // Get a valid access token (auto-refreshes if expired)
  const accessToken = await getGmailToken(user.id)
  if (!accessToken) {
    return NextResponse.json({ error: 'Gmail token expired and could not be refreshed. Please re-login to PressCal.' }, { status: 401 })
  }

  // Build MIME message
  const boundary = `boundary_${Date.now()}`
  const hasAttachments = attachments && attachments.length > 0

  let mime = ''
  mime += `From: me\r\n`
  mime += `To: ${to}\r\n`
  mime += `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=\r\n`
  mime += `MIME-Version: 1.0\r\n`

  if (hasAttachments) {
    mime += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`
    mime += `--${boundary}\r\n`
    mime += `Content-Type: text/plain; charset=UTF-8\r\n\r\n`
    mime += `${emailBody || ''}\r\n`

    for (const att of attachments) {
      mime += `\r\n--${boundary}\r\n`
      mime += `Content-Type: ${att.contentType || 'application/octet-stream'}\r\n`
      mime += `Content-Transfer-Encoding: base64\r\n`
      mime += `Content-Disposition: attachment; filename="${att.filename}"\r\n\r\n`
      mime += `${att.content}\r\n`
    }

    mime += `\r\n--${boundary}--\r\n`
  } else {
    mime += `Content-Type: text/plain; charset=UTF-8\r\n\r\n`
    mime += emailBody || ''
  }

  // Send via Gmail API
  const raw = Buffer.from(mime).toString('base64url')

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw })
  })

  if (!response.ok) {
    const err = await response.text()
    return NextResponse.json({ error: `Gmail send failed: ${err}` }, { status: 500 })
  }

  const result = await response.json()

  // Link email to quote if provided
  if (quoteId && result.id) {
    try {
      const quote = await (prisma as any).quote.findUnique({ where: { id: quoteId } })
      if (quote) {
        await (prisma as any).quote.update({
          where: { id: quoteId },
          data: {
            linkedEmails: { push: result.id },
            threadId: result.threadId || quote.threadId
          }
        })
      }
    } catch {
      // Non-critical: email sent but linking failed
    }
  }

  return NextResponse.json({ ok: true, messageId: result.id })
}
