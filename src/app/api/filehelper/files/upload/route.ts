import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, access } from 'fs/promises'
import { join, extname } from 'path'
import { prisma } from '@/lib/db'
import { authenticateFilehelper } from '../../auth'

const ALLOWED_EXT = new Set(['.pdf', '.ai', '.psd', '.eps', '.tiff', '.tif', '.jpg', '.jpeg', '.png', '.svg', '.indd', '.cdr', '.docx', '.xlsx'])
const MAX_SIZE = 50 * 1024 * 1024 // 50MB

// POST /api/filehelper/files/upload
export async function POST(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const target = formData.get('target') as string // 'customer' | 'quote'
    const targetId = formData.get('targetId') as string
    const quoteId = formData.get('quoteId') as string | null
    const itemId = formData.get('itemId') as string | null
    const notes = formData.get('notes') as string | null

    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
    if (!target || !targetId) return NextResponse.json({ error: 'target and targetId required' }, { status: 400 })
    if (target !== 'customer' && target !== 'quote') return NextResponse.json({ error: 'target must be customer or quote' }, { status: 400 })

    // Validate extension
    const ext = extname(file.name).toLowerCase()
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json({ error: `Μη αποδεκτός τύπος αρχείου: ${ext}` }, { status: 400 })
    }

    // Validate size
    const bytes = await file.arrayBuffer()
    if (bytes.byteLength > MAX_SIZE) {
      return NextResponse.json({ error: 'Μέγιστο μέγεθος 50MB' }, { status: 400 })
    }

    // Build storage path
    const subDir = target === 'customer' ? `customers/${targetId}` : `quotes/${targetId}`
    const storageDir = join(process.cwd(), 'public', 'storage', subDir)
    await mkdir(storageDir, { recursive: true })

    // Handle filename collisions
    let filename = file.name.replace(/[^a-zA-Z0-9._\-\u0370-\u03FF\u0400-\u04FF]/g, '_') // safe chars + Greek/Cyrillic
    const fullPath = join(storageDir, filename)
    try {
      await access(fullPath)
      // File exists — add timestamp
      const base = filename.substring(0, filename.length - ext.length)
      filename = `${base}-${Date.now()}${ext}`
    } catch {
      // File doesn't exist — ok
    }

    await writeFile(join(storageDir, filename), Buffer.from(bytes))

    const webPath = `/storage/${subDir}/${filename}`
    const fileType = ext.replace('.', '')

    // Create FileLink record
    const fileLink = await (prisma as any).fileLink.create({
      data: {
        orgId: auth.org.id,
        fileName: file.name,
        filePath: webPath,
        fileType,
        fileSize: bytes.byteLength,
        source: 'upload',
        quoteId: target === 'quote' ? targetId : (quoteId || null),
        customerId: target === 'customer' ? targetId : null,
        notes: notes || null,
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
              linkedFile: {
                name: file.name,
                path: webPath,
                type: fileType,
                size: bytes.byteLength,
              }
            }
            await prisma.quote.update({ where: { id: quoteId }, data: { items: items as any } })
          }
        }
      } catch (e) {
        console.error('Auto-link to quote item failed:', e)
      }
    }

    // Build calculator URL
    const calcParams = new URLSearchParams()
    calcParams.set('filePath', webPath)
    calcParams.set('fileName', file.name)
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
      filePath: webPath,
      fileName: file.name,
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

    // Delete physical file if in storage
    if (link.filePath?.startsWith('/storage/')) {
      const { unlink } = await import('fs/promises')
      const fullPath = join(process.cwd(), 'public', link.filePath)
      try { await unlink(fullPath) } catch {}
    }

    await (prisma as any).fileLink.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('File delete error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
