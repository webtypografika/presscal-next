import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { fuzzySearchIds, orderByIds } from '@/lib/search-server'
import { authenticateFilehelper } from '../auth'

// GET /api/filehelper/customers — List companies (backward-compatible response shape)
export async function GET(req: NextRequest) {
  const auth = await authenticateFilehelper(req)
  if ('error' in auth) return auth.error

  const search = req.nextUrl.searchParams.get('search')

  let companies: any[]
  if (search?.trim()) {
    // Fuzzy search across company + linked contacts
    const [companyIds, contactIds] = await Promise.all([
      fuzzySearchIds('Company', auth.org.id, search, 50),
      fuzzySearchIds('Contact', auth.org.id, search, 50),
    ])
    let viaContact: string[] = []
    if (contactIds.length > 0) {
      const links = await prisma.companyContact.findMany({
        where: { contactId: { in: contactIds } },
        select: { companyId: true },
      })
      viaContact = links.map(l => l.companyId)
    }
    const seen = new Set<string>()
    const ids: string[] = []
    for (const id of [...companyIds, ...viaContact]) {
      if (!seen.has(id)) { seen.add(id); ids.push(id) }
    }
    const rows = ids.length === 0 ? [] : await prisma.company.findMany({
      where: { id: { in: ids.slice(0, 50) }, deletedAt: null },
      include: {
        companyContacts: { where: { isPrimary: true }, include: { contact: true }, take: 1 },
        _count: { select: { quotes: true } },
      },
    })
    companies = orderByIds(rows, ids.slice(0, 50))
  } else {
    companies = await prisma.company.findMany({
      where: { orgId: auth.org.id, deletedAt: null },
      include: {
        companyContacts: { where: { isPrimary: true }, include: { contact: true }, take: 1 },
        _count: { select: { quotes: true } },
      },
      orderBy: { name: 'asc' },
      take: 50,
    })
  }

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
