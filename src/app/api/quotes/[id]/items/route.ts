import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/quotes/[id]/items — lightweight fetch of quote items (for polling)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const quote = await prisma.quote.findUnique({
      where: { id },
      select: {
        items: true,
        jobFolderPath: true,
        company: { select: { folderPath: true } },
      }
    })

    if (!quote) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({
      items: quote.items,
      jobFolderPath: quote.jobFolderPath,
      companyFolderPath: quote.company?.folderPath || null,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
