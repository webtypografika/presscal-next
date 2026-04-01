import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateFilehelper } from '../auth'

// GET /api/filehelper/customers — List companies (backward-compatible response shape)
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
      { email: { contains: search, mode: 'insensitive' } },
      { afm: { contains: search } },
      {
        companyContacts: {
          some: {
            contact: {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ]
            }
          }
        }
      }
    ]
  }

  const companies = await prisma.company.findMany({
    where,
    include: {
      companyContacts: {
        where: { isPrimary: true },
        include: { contact: true },
        take: 1,
      },
      _count: { select: { quotes: true } }
    },
    orderBy: { name: 'asc' },
    take: 50
  })

  // Return backward-compatible shape for FileHelper desktop app
  return NextResponse.json(companies.map((c: any) => {
    const primary = c.companyContacts[0]?.contact
    return {
      id: c.id,
      name: c.name,
      company: c.name,  // backward compat
      email: primary?.email || c.email,
      phone: primary?.phone || c.phone,
      tags: c.tags,
      folderPath: c.folderPath,
      quoteCount: c._count.quotes,
      primaryContact: primary ? { name: primary.name, email: primary.email } : null,
    }
  }))
}

// PATCH /api/filehelper/customers — Update company (e.g. set folderPath)
export async function PATCH(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  const { id, ...data } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const result = await prisma.company.updateMany({
    where: { id, orgId: auth.org.id },
    data
  })

  return NextResponse.json({ ok: true, count: result.count })
}
