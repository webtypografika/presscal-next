import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toArchivePath } from '@/lib/job-folder'
import { authenticateFilehelper } from '../auth'

// GET /api/filehelper/pending-archives
// Polled by FileHelper to discover jobs that need folder archiving.
// Returns a list of { quoteId, sourcePath, destPath } for the caller to process.
// After moving each folder, FileHelper calls POST /api/filehelper/quotes/[id]/confirm-archive.
export async function GET(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  const quotes = await prisma.quote.findMany({
    where: {
      orgId: auth.org.id,
      pendingArchivePath: { not: null },
    },
    select: {
      id: true,
      number: true,
      pendingArchivePath: true,
    },
    orderBy: { completedAt: 'asc' },
    take: 50,
  })

  const items = quotes
    .filter((q) => q.pendingArchivePath)
    .map((q) => ({
      quoteId: q.id,
      number: q.number,
      sourcePath: q.pendingArchivePath!,
      destPath: toArchivePath(q.pendingArchivePath!),
    }))

  return NextResponse.json({ items })
}
