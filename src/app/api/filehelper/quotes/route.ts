import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateFilehelper } from '../auth'

// GET /api/filehelper/quotes — List quotes (with search/filter)
export async function GET(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  const params = req.nextUrl.searchParams
  const status = params.get('status')
  const search = params.get('search')

  const where: any = {
    orgId: auth.org.id,
    deletedAt: null
  }

  if (status) where.status = status
  if (search) {
    where.OR = [
      { number: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } }
    ]
  }

  const quotes = await (prisma as any).quote.findMany({
    where,
    include: { customer: { select: { name: true } } },
    orderBy: { date: 'desc' },
    take: 50
  })

  return NextResponse.json(quotes.map((q: any) => ({
    id: q.id,
    number: q.number,
    status: q.status,
    title: q.title,
    description: q.description,
    customerId: q.customerId,
    customerName: q.customer?.name || null,
    grandTotal: q.grandTotal,
    jobStage: q.jobStage,
    jobPriority: q.jobPriority,
    deadline: q.deadline,
    date: q.date,
    sentAt: q.sentAt
  })))
}
