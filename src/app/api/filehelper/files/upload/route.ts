import { NextRequest, NextResponse } from 'next/server'
import { extname } from 'path'
import { put, del } from '@vercel/blob'
import { prisma } from '@/lib/db'
import { authenticateFilehelper } from '../../auth'

const ALLOWED_EXT = new Set(['.pdf', '.ai', '.psd', '.eps', '.tiff', '.tif', '.jpg', '.jpeg', '.png', '.svg', '.indd', '.cdr', '.docx', '.xlsx'])
const MAX_SIZE = 50 * 1024 * 1024 // 50MB

// POST /api/filehelper/files/upload
// Supports two modes:
// 1. Small files (<4MB): direct multipart upload with file in formData
// 2. Large files: two-step — first POST without file to get presigned URL, then PUT to blob
export async function POST(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  try {
    const contentType = req.headers.get('content-type') || ''

    // Mode 2: JSON request for presigned URL (large files)
    if (contentType.includes('application/json')) {
      const body = await req.json()
      const { fileName, target, targetId, quoteId, itemId, notes, fileSize } = body

      if (!fileName || !target || !targetId) {
        return NextResponse.json({ error: 'fileName, target, targetId required' }, { status: 400 })
      }

      const ext = extname(fileName).toLowerCase()
      if (!ALLOWED_EXT.has(ext)) {
        return NextResponse.json({ error: `Μη αποδεκτός τύπος αρχείου: ${ext}` }, { status: 400 })
      }
      if (fileSize && fileSize > MAX_SIZE) {
        return NextResponse.json({ error: 'Μέγιστο μέγεθος 50MB' }, { status: 400 })
      }

      // Generate a presigned upload URL via Vercel Blob client token
      const { handleUpload } = await import('@vercel/blob/client')
      const subDir = target === 'customer' ? `customers/${targetId}` : `quotes/${targetId}`
      const safeName = fileName.replace(/[^a-zA-Z0-9._\-\u0370-\u03FF\u0400-\u04FF]/g, '_')
      const pathname = `${subDir}/${safeName}`

      // Use put with a placeholder to get the URL pattern, then return upload instructions
      // Actually, for PressKit (non-browser client), use server-side streaming upload
      return NextResponse.json({
        mode: 'stream',
        uploadUrl: `/api/filehelper/files/upload/stream`,
        pathname,
        metadata: { target, targetId, quoteId, itemId, notes, fileName },
      })
    }

    // Mode 1: Direct multipart upload (small files)
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const target = formData.get('target') as string
    const targetId = formData.get('targetId') as string
    const quoteId = formData.get('quoteId') as string | null
    const itemId = formData.get('itemId') as string | null
    const notes = formData.get('notes') as string | null

    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
    if (!target || !targetId) return NextResponse.json({ error: 'target and targetId required' }, { status: 400 })
    if (target !== 'customer' && target !== 'quote') return NextResponse.json({ error: 'target must be customer or quote' }, { status: 400 })

    const ext = extname(file.name).toLowerCase()
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json({ error: `Μη αποδεκτός τύπος αρχείου: ${ext}` }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Μέγιστο μέγεθος 50MB' }, { status: 400 })
    }

    // Upload to Vercel Blob
    const subDir = target === 'customer' ? `customers/${targetId}` : `quotes/${targetId}`
    const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u0370-\u03FF\u0400-\u04FF]/g, '_')
    const blob = await put(`${subDir}/${safeName}`, file, { access: 'public' })

    const webPath = blob.url
    const fileType = ext.replace('.', '')

    // Generate base64 thumbnail for images
    let thumbnail: string | null = null
    const imageExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'])
    if (imageExts.has(ext) && file.size < 200_000) {
      const bytes = await file.arrayBuffer()
      const b64 = Buffer.from(bytes).toString('base64')
      const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
      thumbnail = `data:${mime};base64,${b64}`
    }

    return NextResponse.json(await createFileLinkAndRespond({
      orgId: auth.org.id, fileName: file.name, webPath, fileType, fileSize: file.size,
      target, targetId, quoteId, itemId, notes, thumbnail,
    }))
  } catch (e) {
    console.error('File upload error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// PUT /api/filehelper/files/upload — Stream upload for large files
// PressKit sends: PUT with binary body + query params for metadata
export async function PUT(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  try {
    const params = req.nextUrl.searchParams
    const fileName = params.get('fileName') || 'upload'
    const target = params.get('target') || 'quote'
    const targetId = params.get('targetId') || ''
    const quoteId = params.get('quoteId') || null
    const itemId = params.get('itemId') || null
    const notes = params.get('notes') || null

    if (!targetId) return NextResponse.json({ error: 'targetId required' }, { status: 400 })

    const ext = extname(fileName).toLowerCase()
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json({ error: `Μη αποδεκτός τύπος αρχείου: ${ext}` }, { status: 400 })
    }

    // Stream body directly to Vercel Blob (no 4.5MB limit)
    const subDir = target === 'customer' ? `customers/${targetId}` : `quotes/${targetId}`
    const safeName = fileName.replace(/[^a-zA-Z0-9._\-\u0370-\u03FF\u0400-\u04FF]/g, '_')

    const body = req.body
    if (!body) return NextResponse.json({ error: 'No body' }, { status: 400 })

    const blob = await put(`${subDir}/${safeName}`, body, { access: 'public' })
    const fileType = ext.replace('.', '')

    return NextResponse.json(await createFileLinkAndRespond({
      orgId: auth.org.id, fileName, webPath: blob.url, fileType, fileSize: blob.size,
      target, targetId, quoteId, itemId, notes, thumbnail: null,
    }))
  } catch (e) {
    console.error('Stream upload error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// Shared helper to create FileLink + auto-link + build response
async function createFileLinkAndRespond(opts: {
  orgId: string; fileName: string; webPath: string; fileType: string; fileSize: number;
  target: string; targetId: string; quoteId: string | null; itemId: string | null;
  notes: string | null; thumbnail: string | null;
}) {
  const { orgId, fileName, webPath, fileType, fileSize, target, targetId, quoteId, itemId, notes, thumbnail } = opts

  const fileLink = await (prisma as any).fileLink.create({
    data: {
      orgId,
      fileName,
      filePath: webPath,
      fileType,
      fileSize,
      source: 'upload',
      quoteId: target === 'quote' ? targetId : (quoteId || null),
      customerId: target === 'customer' ? targetId : null,
      notes: notes || null,
      thumbnail,
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
            linkedFile: { name: fileName, path: webPath, type: fileType, size: fileSize }
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

  return {
    ok: true,
    fileLink,
    filePath: webPath,
    fileName,
    customerFolderPath,
    calculatorUrl: `/calculator?${calcParams.toString()}`,
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

    // Delete from Vercel Blob
    if (link.filePath?.includes('.vercel-storage.com') || link.filePath?.includes('.blob.')) {
      try { await del(link.filePath) } catch {}
    }

    await (prisma as any).fileLink.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('File delete error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
