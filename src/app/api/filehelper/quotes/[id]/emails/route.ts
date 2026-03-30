import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateFilehelper } from '../../../auth'

// GET /api/filehelper/quotes/[id]/emails — Get email threads linked to a quote
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  return NextResponse.json({
    threadId: quote.threadId,
    linkedEmails: quote.linkedEmails || []
  })
}
