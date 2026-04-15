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
    const details: string[] = [];

    for (const company of companies) {
      if (!company.afm) continue;
      try {
        // Search Elorus by AFM
        const res = await fetch(
          `${ELORUS_BASE}/v1.2/contacts/?search=${company.afm}&page_size=5&is_client=true`,
          { headers: hdrs },
        );
        if (!res.ok) { details.push(`${company.afm}: HTTP ${res.status}`); continue; }

        const data = await res.json();
        const results = data.results || [];

        // Try exact TIN match first, then take single result if only one
        let match = results.find((c: any) => c.tin === company.afm);
        if (!match && results.length === 1) {
          match = results[0]; // AFM search returned exactly 1 result — use it
        }

        if (match && match.company && !match.company.startsWith('ΑΦΜ ')) {
          // Fetch full contact detail to get addresses
          const detailRes = await fetch(
            `${ELORUS_BASE}/v1.2/contacts/${match.id}/`,
            { headers: hdrs },
          );
          const full = detailRes.ok ? await detailRes.json() : match;

          const changes: Record<string, string> = { legalName: full.company || match.company };

          // Fill fiscal address from detail
          const addr = Array.isArray(full.addresses) && full.addresses.length > 0 ? full.addresses[0] : null;
          if (addr) {
            if (addr.address) changes.fiscalAddress = addr.address;
            if (addr.city) changes.fiscalCity = addr.city;
            if (addr.zip) changes.fiscalZip = addr.zip;
          }

          await prisma.company.update({
            where: { id: company.id },
            data: { ...changes, elorusContactId: match.id },
          });
          details.push(`✓ ${company.afm} → ${changes.legalName}${addr ? ` (${addr.address}, ${addr.city})` : ''}`);
          updated++;
        } else {
          details.push(`✗ ${company.afm} (${company.name}): not found in Elorus`);
          notFound++;
        }

        await new Promise(r => setTimeout(r, 250));
      } catch (e) {
        details.push(`✗ ${company.afm}: ${(e as Error).message}`);
      }
    }

    return NextResponse.json({ total: companies.length, updated, notFound, details });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
