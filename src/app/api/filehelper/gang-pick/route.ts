import { NextRequest, NextResponse } from 'next/server'
import { authenticateFilehelper } from '../auth'

// In-memory store for gang file picks (short-lived, consumed once)
const gangPicks = new Map<string, { filePath: string; fileName: string; pickedAt: number }>()

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of gangPicks) {
    if (now - val.pickedAt > 5 * 60 * 1000) gangPicks.delete(key)
  }
}, 60_000)

// POST /api/filehelper/gang-pick — PressKit posts picked file path
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateFilehelper(req)
    if ('error' in auth) return auth.error

    const { quoteId, gangIdx, filePath, fileName } = await req.json()
    if (!quoteId || gangIdx == null || !filePath) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const key = `${quoteId}:${gangIdx}`
    gangPicks.set(key, { filePath, fileName: fileName || filePath.split(/[/\\]/).pop() || 'file.pdf', pickedAt: Date.now() })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// GET /api/filehelper/gang-pick?quoteId=X&gangIdx=N — Calculator polls for picked file
export async function GET(req: NextRequest) {
  const quoteId = req.nextUrl.searchParams.get('quoteId')
  const gangIdx = req.nextUrl.searchParams.get('gangIdx')
  if (!quoteId || gangIdx == null) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const key = `${quoteId}:${gangIdx}`
  const pick = gangPicks.get(key)
  if (!pick) return NextResponse.json({ picked: false })

  // Consume — one-time read
  gangPicks.delete(key)
  return NextResponse.json({ picked: true, filePath: pick.filePath, fileName: pick.fileName })
}
