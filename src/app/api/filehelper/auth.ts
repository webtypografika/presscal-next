import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * Authenticate File Helper requests via Bearer token (apiFilehelper on Org).
 * Returns the org or a 401 response.
 */
export async function authenticateFilehelper(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Missing authorization' }, { status: 401 }) }
  }

  const apiKey = authHeader.slice(7)
  if (!apiKey) {
    return { error: NextResponse.json({ error: 'Invalid API key' }, { status: 401 }) }
  }

  try {
    const org = await (prisma as any).org.findFirst({
      where: { apiFilehelper: apiKey }
    })

    if (!org) {
      return { error: NextResponse.json({ error: 'Invalid API key' }, { status: 401 }) }
    }

    return { org }
  } catch (e) {
    console.error('filehelper auth error:', e)
    return { error: NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
  }
}
