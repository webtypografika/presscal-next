import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isArchivedPath } from '@/lib/job-folder'
import { authenticateFilehelper } from '../../../auth'

// POST /api/filehelper/quotes/[id]/confirm-archive
// Called by PressKit AFTER it successfully moves the quote folder into `_01 Archive/`.
// PressKit passes the new absolute path in the body; we update the DB jobFolderPath.
//
// If PressKit's move fails (EBUSY, permission denied, user cancelled, etc.), it
// simply does NOT call this endpoint, so the DB keeps pointing to the original
// path and the Open Folder button still works. No rollback needed.
//
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

  // Safety: refuse paths that don't look like archive paths
  if (!isArchivedPath(newFolderPath)) {
    return NextResponse.json(
      { error: 'newFolderPath is not an archive path' },
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
