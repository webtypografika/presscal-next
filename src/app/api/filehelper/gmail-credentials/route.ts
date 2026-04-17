import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getGmailToken } from '@/lib/gmail'
import { authenticateFilehelper } from '../auth'

// GET /api/filehelper/gmail-credentials — Return fresh Gmail OAuth access token
export async function GET(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  // Find a user with Gmail access in this org
  const user = await (prisma as any).user.findFirst({
    where: { orgId: auth.org.id },
    include: {
      accounts: {
        where: { provider: 'google' },
        select: { id: true }
      }
    }
  })

  if (!user?.accounts?.[0]) {
    return NextResponse.json({ error: 'No Gmail account configured' }, { status: 400 })
  }

  // Get a valid access token (auto-refreshes if expired)
  const accessToken = await getGmailToken(user.id)
  if (!accessToken) {
    return NextResponse.json({ error: 'Gmail token expired and could not be refreshed. Please re-login to PressCal.' }, { status: 401 })
  }

  return NextResponse.json({
    accessToken,
    email: user.email,
  })
}
