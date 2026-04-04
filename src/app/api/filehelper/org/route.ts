import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateFilehelper } from '../auth'

// PATCH /api/filehelper/org — Update org settings from FileHelper
export async function PATCH(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  const body = await req.json()

  const allowed: Record<string, true> = { jobFolderRoot: true }
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (allowed[k]) data[k] = v
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  await prisma.org.update({ where: { id: auth.org.id }, data })
  return NextResponse.json({ ok: true })
}

// GET /api/filehelper/org — Get org settings relevant to FileHelper
export async function GET(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  const org = await prisma.org.findUnique({
    where: { id: auth.org.id },
    select: { name: true, jobFolderRoot: true, jobStages: true },
  })

  return NextResponse.json(org)
}
