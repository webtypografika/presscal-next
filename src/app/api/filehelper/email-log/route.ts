import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateFilehelper } from '../auth'

// POST /api/filehelper/email-log — Log a directly-sent email for history
export async function POST(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  const body = await req.json()
  const { to, subject, body: emailBody, attachmentNames, quoteId, sentDirect } = body

  if (!to || !subject) {
    return NextResponse.json({ error: 'to and subject required' }, { status: 400 })
  }

  // Link to quote if provided (same pattern as /api/filehelper/email)
  if (quoteId) {
    try {
      const quote = await (prisma as any).quote.findUnique({ where: { id: quoteId } })
      if (quote) {
        // Store a synthetic log entry in quote notes or linkedEmails
        const logEntry = `[Direct SMTP] To: ${to} | Subject: ${subject}${attachmentNames?.length ? ` | Files: ${attachmentNames.join(', ')}` : ''}`
        const existingNotes = quote.notes || ''
        const timestamp = new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens' })
        await (prisma as any).quote.update({
          where: { id: quoteId },
          data: {
            notes: existingNotes
              ? `${existingNotes}\n\n--- ${timestamp} ---\n${logEntry}`
              : `--- ${timestamp} ---\n${logEntry}`,
          }
        })
      }
    } catch {
      // Non-critical — don't block the caller
    }
  }

  return NextResponse.json({ ok: true })
}
