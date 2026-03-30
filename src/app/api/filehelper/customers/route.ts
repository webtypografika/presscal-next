import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateFilehelper } from '../auth'

// GET /api/filehelper/customers — List customers (with search)
export async function GET(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  const search = req.nextUrl.searchParams.get('search')

  const where: any = {
    orgId: auth.org.id,
    deletedAt: null
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { company: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } }
    ]
  }

  const customers = await (prisma as any).customer.findMany({
    where,
    include: {
      _count: { select: { quotes: true } }
    },
    orderBy: { name: 'asc' },
    take: 50
  })

  return NextResponse.json(customers.map((c: any) => ({
    id: c.id,
    name: c.name,
    company: c.company,
    email: c.email,
    phone: c.phone,
    tags: c.tags,
    quoteCount: c._count.quotes
  })))
}
