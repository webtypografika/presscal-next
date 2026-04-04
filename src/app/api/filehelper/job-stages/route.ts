import { NextRequest, NextResponse } from 'next/server'
import { authenticateFilehelper } from '../auth'

// GET /api/filehelper/job-stages — List all configured job stages
export async function GET(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  const stages: any[] = Array.isArray(auth.org.jobStages) ? auth.org.jobStages : []

  return NextResponse.json(
    stages.map((s: any, i: number) => ({
      id: s.id,
      name: s.label,
      icon: s.icon || null,
      color: s.color || null,
      order: i
    }))
  )
}
