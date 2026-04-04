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

  // Build stage lookup from org's custom stages
  const stages: { id: string; label: string }[] = Array.isArray(auth.org.jobStages) ? auth.org.jobStages : []
  const stageMap = new Map(stages.map((s: any) => [s.id, s.label]))

  const jobs = await (prisma as any).quote.findMany({
    where,
    include: { customer: { select: { name: true } }, company: { select: { name: true, folderPath: true } } },
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
    customerName: j.company?.name || j.customer?.name || null,
    companyFolderPath: j.company?.folderPath || null,
    jobStage: j.jobStage,
    jobStageName: stageMap.get(j.jobStage) || j.jobStage,
    jobFolderPath: j.jobFolderPath || null,
    jobPriority: j.jobPriority || 'normal',
    deadline: j.deadline,
    items: j.items
  })))
}
