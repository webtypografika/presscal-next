import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ORG_ID = 'default-org';
const ELORUS_BASE = 'https://api.elorus.com';

function headers(apiKey: string, orgId: string) {
  return {
    Authorization: `Token ${apiKey}`,
    'X-Elorus-Organization': orgId,
    'Content-Type': 'application/json',
  };
}

async function getOrg() {
  const org = await prisma.org.findUnique({ where: { id: ORG_ID } });
  if (!org?.apiElorus || !org.elorusOrgId) return null;
  return org;
}

// ═══ POST /api/elorus/contacts ═══
// Actions: search | create
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;
    const org = await getOrg();
    if (!org) return NextResponse.json({ error: 'Elorus δεν είναι ρυθμισμένο' }, { status: 400 });
    const hdrs = headers(org.apiElorus!, org.elorusOrgId!);

    // ─── SEARCH contacts ───
    if (action === 'search') {
      const { search } = body;
      if (!search || search.length < 2) return NextResponse.json({ contacts: [] });

      const res = await fetch(
        `${ELORUS_BASE}/v1.2/contacts/?search=${encodeURIComponent(search)}&page_size=20&is_client=true`,
        { headers: hdrs },
      );
      if (!res.ok) return NextResponse.json({ error: 'Elorus search failed' }, { status: 500 });
      const data = await res.json();
      const contacts = (data.results || []).map((c: Record<string, unknown>) => ({
        id: c.id,
        display_name: c.display_name,
        company: c.company,
        tin: c.vat_number || c.tin || '',
        email: Array.isArray(c.email) && c.email.length > 0 ? (c.email[0] as Record<string, string>).email : '',
      }));
      return NextResponse.json({ contacts });
    }

    // ─── CREATE contact ───
    if (action === 'create') {
      const { company, firstName, afm, doy, email, phone, address, city, zip, profession } = body;
      if (!afm || afm.length !== 9) return NextResponse.json({ error: 'ΑΦΜ πρέπει να είναι 9 ψηφία' }, { status: 400 });
      if (!company && !firstName) return NextResponse.json({ error: 'Εταιρεία ή Όνομα απαιτείται' }, { status: 400 });

      const payload: Record<string, unknown> = {
        client_type: company ? '1' : '2',
        company: company || '',
        first_name: firstName || '',
        vat_number: afm,
        tin: afm,
        tin_authority: doy || '',
        profession: profession || '',
        is_client: true,
        is_supplier: false,
        active: true,
      };
      if (email) payload.email = [{ email, primary: true }];
      if (phone) payload.phones = [{ number: phone, primary: true }];
      if (address || city || zip) {
        payload.addresses = [{
          address: address || '-', address_line: address || '-', city: city || '-', zip: zip || '-',
          country: 'GR', ad_type: 'bill',
        }];
      }

      const res = await fetch(`${ELORUS_BASE}/v1.2/contacts/`, {
        method: 'POST', headers: hdrs, body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error('Elorus create contact error:', err);
        return NextResponse.json({ error: 'Αποτυχία δημιουργίας επαφής' }, { status: 500 });
      }
      const contact = await res.json();
      return NextResponse.json({
        ok: true,
        contact: {
          id: contact.id,
          display_name: contact.display_name,
          company: contact.company,
          tin: contact.tin,
        },
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('Elorus contacts error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
