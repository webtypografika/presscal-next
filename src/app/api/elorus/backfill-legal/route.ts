import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ORG_ID = 'default-org';
const ELORUS_BASE = 'https://api.elorus.com';

// One-time backfill: fetch legal names from Elorus for companies with AFM but no legalName
export async function POST() {
  try {
    const org = await prisma.org.findUnique({ where: { id: ORG_ID } });
    if (!org?.apiElorus || !org.elorusOrgId) {
      return NextResponse.json({ error: 'Elorus not configured' }, { status: 400 });
    }

    const hdrs = {
      Authorization: `Token ${org.apiElorus}`,
      'X-Elorus-Organization': org.elorusOrgId,
      'Content-Type': 'application/json',
    };

    // Get all companies with AFM but no legalName
    const companies = await prisma.company.findMany({
      where: { orgId: ORG_ID, deletedAt: null, afm: { not: null }, legalName: null },
      select: { id: true, afm: true, name: true },
    });

    let updated = 0;
    let notFound = 0;
    const errors: string[] = [];

    for (const company of companies) {
      if (!company.afm) continue;
      try {
        const res = await fetch(
          `${ELORUS_BASE}/v1.2/contacts/?search=${company.afm}&page_size=5&is_client=true`,
          { headers: hdrs },
        );
        if (!res.ok) { errors.push(`${company.afm}: HTTP ${res.status}`); continue; }

        const data = await res.json();
        const match = (data.results || []).find((c: any) => c.tin === company.afm);

        if (match && match.company && !match.company.startsWith('ΑΦΜ ')) {
          const changes: Record<string, string> = { legalName: match.company };

          // Also fill fiscal address from Elorus if available
          const addr = Array.isArray(match.addresses) ? match.addresses[0] : null;
          if (addr) {
            if (addr.address) changes.fiscalAddress = addr.address;
            if (addr.city) changes.fiscalCity = addr.city;
            if (addr.zip) changes.fiscalZip = addr.zip;
          }

          // Store elorusContactId if not already stored
          await prisma.company.update({
            where: { id: company.id },
            data: { ...changes, elorusContactId: match.id },
          });
          updated++;
        } else {
          notFound++;
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        errors.push(`${company.afm}: ${(e as Error).message}`);
      }
    }

    return NextResponse.json({ total: companies.length, updated, notFound, errors });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
