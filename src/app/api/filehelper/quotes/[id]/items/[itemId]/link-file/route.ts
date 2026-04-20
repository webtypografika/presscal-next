import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateFilehelper } from '../../../../../auth'

// POST /api/filehelper/quotes/[id]/items/[itemId]/link-file
// Links a file from FileHelper to a specific quote item, with metadata
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const auth = await authenticateFilehelper(req)
    if ('error' in auth) return auth.error

    const { id, itemId } = await params
    const fileData = await req.json()

    // Fetch quote
    const quote = await (prisma as any).quote.findFirst({
      where: { id, orgId: auth.org.id },
      select: { items: true }
    })

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // Update the specific item with linked file
    const items = (quote.items as any[]) || []
    const itemIndex = items.findIndex((i: any) => i.id === itemId)

    if (itemIndex === -1) {
      console.error('link-file: Item not found', { quoteId: id, itemId, availableIds: items.map((i: any) => i.id) })
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    items[itemIndex].linkedFile = {
      path: fileData.path,
      name: fileData.name,
      type: fileData.type,
      size: fileData.size,
      width: fileData.width,
      height: fileData.height,
      pages: fileData.pages,
      colors: fileData.colors,
      dpi: fileData.dpi,
      bleed: fileData.bleed,
    }

    // If file has dimensions, also update item name hint
    await (prisma as any).quote.update({
      where: { id },
      data: { items }
    })

    return NextResponse.json({ ok: true, linkedFile: items[itemIndex].linkedFile })
  } catch (e) {
    console.error('link-file error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
