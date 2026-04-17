import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateFilehelper } from '../../auth'

// GET /api/filehelper/quotes/[id] — Get single quote with items
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  const { id } = await params

  const quote = await (prisma as any).quote.findFirst({
    where: { id, orgId: auth.org.id, deletedAt: null },
    include: {
      company: { select: { name: true, folderPath: true } },
      contact: { select: { name: true, email: true, folderPath: true } },
      customer: { select: { name: true } },
    },
  })

  if (!quote) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
  }

  const items = Array.isArray(quote.items) ? quote.items : []

  return NextResponse.json({
    id: quote.id,
    number: quote.number,
    status: quote.status,
    title: quote.title,
    description: quote.description,
    jobFolderPath: quote.jobFolderPath,
    companyId: quote.companyId,
    companyName: quote.company?.name || quote.customer?.name || null,
    companyFolderPath: quote.company?.folderPath || null,
    contactName: quote.contact?.name || null,
    contactFolderPath: quote.contact?.folderPath || null,
    grandTotal: quote.grandTotal,
    date: quote.date,
    items: items.map((it: any) => ({
      id: it.id,
      name: it.name,
      description: it.description,
      qty: it.qty,
      unit: it.unit,
      linkedFile: it.linkedFile || null,
      calcData: it.calcData ? {
        width: it.calcData.width,
        height: it.calcData.height,
        paperName: it.calcData.paperName,
        machineName: it.calcData.machineName,
        impositionMode: it.calcData.impositionMode,
        sides: it.calcData.sides,
        colors: it.calcData.colors,
      } : null,
    })),
  })
}
