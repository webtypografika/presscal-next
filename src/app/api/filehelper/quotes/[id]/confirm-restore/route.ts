import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isArchivedPath } from '@/lib/job-folder'
import { authenticateFilehelper } from '../../../auth'

// POST /api/filehelper/quotes/[id]/confirm-restore
// Called by PressKit AFTER it successfully moves the quote folder OUT of `_01 Archive/`.
// Body: { newFolderPath: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const newFolderPath: string | undefined = body?.newFolderPath

  if (!newFolderPath || typeof newFolderPath !== 'string') {
    return NextResponse.json({ error: 'newFolderPath required' }, { status: 400 })
  }

  // Safety: the restored path must NOT be an archive path
  if (isArchivedPath(newFolderPath)) {
    return NextResponse.json(
      { error: 'newFolderPath is still an archive path' },
      { status: 400 },
    )
  }

  const quote = await prisma.quote.findFirst({
    where: { id, orgId: auth.org.id, deletedAt: null },
    select: { id: true },
  })
  if (!quote) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
  }

  await prisma.quote.update({
    where: { id },
    data: { jobFolderPath: newFolderPath },
  })

  return NextResponse.json({ ok: true, jobFolderPath: newFolderPath })
}
