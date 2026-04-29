import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toArchivePath } from '@/lib/job-folder'
import { authenticateFilehelper } from '../auth'

/**
 * Build archive path, respecting customer folder boundaries.
 *
 * If sourcePath is inside a company folder, _01 Archive goes inside that folder:
 *   C:\...\aGLARAKI\2026-0016 Golden → C:\...\aGLARAKI\_01 Archive\2026-0016 Golden
 *
 * If sourcePath is in the global root (not inside a company folder), default behaviour:
 *   C:\...\Presscal prints\[QT-2026-0016] ACME → C:\...\Presscal prints\_01 Archive\[QT-2026-0016] ACME
 */
function toArchivePathWithCompany(sourcePath: string, companyFolderPath: string | null | undefined): string {
  if (!companyFolderPath) return toArchivePath(sourcePath)

  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const normSource = norm(sourcePath)
  const normCompany = norm(companyFolderPath)

  if (normSource.startsWith(normCompany + '/')) {
    // Source is inside company folder — archive inside company folder
    const sep = sourcePath.includes('/') ? '/' : '\\'
    const relative = sourcePath.slice(companyFolderPath.replace(/[\\/]+$/, '').length + 1)
    // relative could be "2026-0016 Golden" or "sub\2026-0016 Golden"
    // We want: companyFolder\_01 Archive\relative
    return `${companyFolderPath.replace(/[\\/]+$/, '')}${sep}_01 Archive${sep}${relative}`
  }

  // Not inside company folder — default parent-level archive
  return toArchivePath(sourcePath)
}

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
      company: { select: { folderPath: true } },
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
      destPath: toArchivePathWithCompany(q.pendingArchivePath!, q.company?.folderPath),
    }))

  return NextResponse.json({ items })
}
