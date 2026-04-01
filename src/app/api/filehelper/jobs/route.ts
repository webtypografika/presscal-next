import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateFilehelper } from '../auth'

// GET /api/filehelper/jobs — List active jobs
export async function GET(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  const stage = req.nextUrl.searchParams.get('stage')

  const where: any = {
    orgId: auth.org.id,
    status: { in: ['approved', 'partial'] },
    jobStage: { not: null },
    deletedAt: null
  }

  if (stage) where.jobStage = stage

  const jobs = await (prisma as any).quote.findMany({
    where,
    include: { customer: { select: { name: true } }, company: { select: { name: true } } },
    orderBy: [
      { jobPriority: 'asc' },
      { deadline: 'asc' }
    ],
    take: 50
  })

  return NextResponse.json(jobs.map((j: any) => ({
    id: j.id,
    number: j.number,
    title: j.title,
    customerName: j.customer?.name || null,
    jobStage: j.jobStage,
    jobPriority: j.jobPriority || 'normal',
    deadline: j.deadline,
    items: j.items
  })))
}
