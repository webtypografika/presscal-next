import { NextRequest, NextResponse } from 'next/server'
import { extname } from 'path'
import { prisma } from '@/lib/db'
import { authenticateFilehelper } from '../../auth'

const ALLOWED_EXT = new Set(['.pdf', '.ai', '.psd', '.eps', '.tiff', '.tif', '.jpg', '.jpeg', '.png', '.svg', '.indd', '.cdr', '.docx', '.xlsx'])

// POST /api/filehelper/files/upload
// PressKit sends metadata only — file stays local, served via PressKit localhost:17824
export async function POST(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  try {
    const body = await req.json()
    const { fileName, filePath, fileSize, target, targetId, quoteId, itemId, notes, thumbnail } = body

    if (!fileName || !filePath) return NextResponse.json({ error: 'fileName and filePath required' }, { status: 400 })
    if (!target || !targetId) return NextResponse.json({ error: 'target and targetId required' }, { status: 400 })

    const ext = extname(fileName).toLowerCase()
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json({ error: `Μη αποδεκτός τύπος αρχείου: ${ext}` }, { status: 400 })
    }

    const fileType = ext.replace('.', '')

    // Create FileLink record (metadata only — file lives on PressKit's local filesystem)
    const fileLink = await (prisma as any).fileLink.create({
      data: {
        orgId: auth.org.id,
        fileName,
        filePath,
        fileType,
        fileSize: fileSize || 0,
        source: 'upload',
        quoteId: target === 'quote' ? targetId : (quoteId || null),
        customerId: target === 'customer' ? targetId : null,
        notes: notes || null,
        thumbnail: thumbnail || null,
      }
    })

    // If quoteId + itemId provided, auto-link to quote item
    if (quoteId && itemId) {
      try {
        const quote = await prisma.quote.findUnique({ where: { id: quoteId } })
        if (quote) {
          const items = (quote.items as any[]) || []
          const idx = items.findIndex((i: any) => i.id === itemId)
          if (idx >= 0) {
            items[idx] = {
              ...items[idx],
              linkedFile: { name: fileName, path: filePath, type: fileType, size: fileSize || 0 }
            }
            await prisma.quote.update({ where: { id: quoteId }, data: { items: items as any } })
          }
        }
      } catch (e) {
        console.error('Auto-link to quote item failed:', e)
      }
    }

    // Build calculator URL — filePath is local, Calculator loads via PressKit localhost:17824
    const calcParams = new URLSearchParams()
    calcParams.set('filePath', filePath)
    calcParams.set('fileName', fileName)
    const resolvedQuoteId = target === 'quote' ? targetId : quoteId
    if (resolvedQuoteId) calcParams.set('quoteId', resolvedQuoteId)
    if (itemId) calcParams.set('itemId', itemId)

    // Resolve customer folder path
    let customerFolderPath: string | null = null
    try {
      const resolvedQId = target === 'quote' ? targetId : quoteId
      if (resolvedQId) {
        const q = await prisma.quote.findUnique({ where: { id: resolvedQId }, include: { customer: true } })
        if (q?.customer && (q.customer as any).folderPath) {
          customerFolderPath = (q.customer as any).folderPath
        }
      } else if (target === 'customer') {
        const c = await (prisma as any).customer.findUnique({ where: { id: targetId } })
        if (c?.folderPath) customerFolderPath = c.folderPath
      }
    } catch {}

    return NextResponse.json({
      ok: true,
      fileLink,
      filePath,
      fileName,
      customerFolderPath,
      calculatorUrl: `/calculator?${calcParams.toString()}`,
    })
  } catch (e) {
    console.error('File upload error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// DELETE /api/filehelper/files/upload?id=xxx
export async function DELETE(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  try {
    const link = await (prisma as any).fileLink.findFirst({ where: { id, orgId: auth.org.id } })
    if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await (prisma as any).fileLink.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('File delete error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
