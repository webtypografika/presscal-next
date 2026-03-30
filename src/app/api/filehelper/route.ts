import { NextRequest, NextResponse } from 'next/server'
import { authenticateFilehelper } from './auth'

// GET /api/filehelper/status — Check connection and return org info
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateFilehelper(req)
    if ('error' in auth) return auth.error

    return NextResponse.json({
      ok: true,
      orgName: auth.org.name
    })
  } catch (e) {
    console.error('filehelper status error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
