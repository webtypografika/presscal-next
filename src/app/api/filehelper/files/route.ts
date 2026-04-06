import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateFilehelper } from '../auth'

// GET /api/filehelper/files — List file links
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateFilehelper(req)
    if ('error' in auth) return auth.error

    const params = req.nextUrl.searchParams
    const quoteId = params.get('quoteId')
    const customerId = params.get('customerId')

    const where: any = { orgId: auth.org.id }
    if (quoteId) where.quoteId = quoteId
    if (customerId) where.customerId = customerId

    const links = await (prisma as any).fileLink.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    // Include folder path when querying by quoteId
    let folderPath: string | null = null
    const target = params.get('target') // 'global' | 'customer'
    if (quoteId) {
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId },
        select: { number: true, title: true, company: { select: { name: true, folderPath: true } } },
      })
      if (quote) {
        const { buildJobFolderPath } = await import('@/lib/job-folder')
        const useCustomerFolder = target === 'customer' && quote.company?.folderPath
        folderPath = buildJobFolderPath({
          globalRoot: auth.org.jobFolderRoot || null,
          companyFolderPath: useCustomerFolder ? quote.company!.folderPath : null,
          companyName: quote.company?.name || 'Πελάτης',
          quoteNumber: quote.number,
          quoteTitle: quote.title,
        })
      }
    }

    return NextResponse.json({ files: links, folderPath })
  } catch (e) {
    console.error('filehelper files error:', e)
    return NextResponse.json({ error: (e as Error).message, stack: (e as Error).stack }, { status: 500 })
  }
}

// POST /api/filehelper/files/link — Create a file link
export async function POST(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  const body = await req.json()
  const { fileName, filePath, fileType, fileSize, source, quoteId, customerId, notes, preflightStatus, thumbnail } = body

  if (!fileName || !filePath) {
    return NextResponse.json({ error: 'fileName and filePath required' }, { status: 400 })
  }

  const link = await (prisma as any).fileLink.create({
    data: {
      orgId: auth.org.id,
      fileName,
      filePath,
      fileType: fileType || '',
      fileSize: fileSize || 0,
      source: source || 'local',
      quoteId: quoteId || null,
      customerId: customerId || null,
      notes: notes || null,
      preflightStatus: preflightStatus || null,
      thumbnail: thumbnail || null
    }
  })

  return NextResponse.json(link)
}

// DELETE /api/filehelper/files — Delete a file link (by id in query)
export async function DELETE(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  await (prisma as any).fileLink.delete({
    where: { id, orgId: auth.org.id }
  })

  return NextResponse.json({ ok: true })
}
