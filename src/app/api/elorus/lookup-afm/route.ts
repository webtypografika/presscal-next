import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ORG_ID = 'default-org';
const ELORUS_BASE = 'https://api.elorus.com';
const AADE_URL = 'https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2';

function elorusHeaders(apiKey: string, orgId: string) {
  return {
    Authorization: `Token ${apiKey}`,
    'X-Elorus-Organization': orgId,
    'Content-Type': 'application/json',
  };
}

function buildSoap12Envelope(username: string, password: string, callerAfm: string, lookupAfm: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"
  xmlns:srvc="http://rgwspublic2/RgWsPublic2Service"
  xmlns:typ="http://rgwspublic2/RgWsPublic2">
  <env:Header>
    <srvc:RgWsPublic2InputHeader env:mustUnderstand="true">
      <typ:pUsernameToken>
        <typ:pUsername>${username}</typ:pUsername>
        <typ:pPassword>${password}</typ:pPassword>
      </typ:pUsernameToken>
      <typ:pCalledby>
        <typ:pAfm>${callerAfm}</typ:pAfm>
      </typ:pCalledby>
    </srvc:RgWsPublic2InputHeader>
  </env:Header>
  <env:Body>
    <srvc:rgWsPublic2AfmMethod>
      <srvc:INPUT_REC>
        <typ:afm_called_by>${callerAfm}</typ:afm_called_by>
        <typ:afm_called_for>${lookupAfm}</typ:afm_called_for>
      </srvc:INPUT_REC>
    </srvc:rgWsPublic2AfmMethod>
  </env:Body>
</env:Envelope>`;
}

function extractXmlValue(xml: string, tag: string): string {
  const re = new RegExp(`<[^:]*:?${tag}[^>]*>([^<]*)<`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

// ═══ POST /api/elorus/lookup-afm ═══
export async function POST(req: NextRequest) {
  try {
    const { afm } = await req.json();
    if (!afm || !/^\d{9}$/.test(afm)) {
      return NextResponse.json({ error: 'ΑΦΜ πρέπει να είναι 9 ψηφία' }, { status: 400 });
    }

    const org = await prisma.org.findUnique({ where: { id: ORG_ID } });

    // Step 1: Check Elorus for existing contact with this AFM
    let elorusContactId: string | null = null;
    if (org?.apiElorus && org.elorusOrgId) {
      const hdrs = elorusHeaders(org.apiElorus, org.elorusOrgId);
      const searchRes = await fetch(
        `${ELORUS_BASE}/v1.2/contacts/?search=${afm}&page_size=5&is_client=true`,
        { headers: hdrs },
      );
      if (searchRes.ok) {
        const data = await searchRes.json();
        const match = (data.results || []).find((c: Record<string, string>) => c.tin === afm);
        if (match && match.company && !match.company.startsWith('ΑΦΜ ')) {
          // Found with real data
          return NextResponse.json({
            source: 'elorus_existing',
            elorusContactId: match.id,
            onomasia: match.company || match.display_name || '',
            commer_title: match.company || '',
            doy_descr: '',
            postal_address: '',
            postal_zip_code: '',
            postal_area_description: '',
            email: Array.isArray(match.email) && match.email.length > 0 ? match.email[0].email : '',
          });
        }
        if (match) elorusContactId = match.id;
      }
    }

    // Step 2: Query AADE
    if (!org?.aadeUsername || !org.aadePassword || !org.aadeAfm) {
      return NextResponse.json({ error: 'ΑΑΔΕ credentials δεν έχουν ρυθμιστεί (Ρυθμίσεις → Ενσωματώσεις)' }, { status: 400 });
    }

    const soapBody = buildSoap12Envelope(org.aadeUsername, org.aadePassword, org.aadeAfm, afm);
    console.log('AADE request — user:', org.aadeUsername, 'callerAfm:', org.aadeAfm, 'lookupAfm:', afm);
    console.log('AADE SOAP body:', soapBody.slice(0, 600));
    const aadeRes = await fetch(AADE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml;charset=UTF-8',
      },
      body: soapBody,
    });

    if (!aadeRes.ok) {
      const errBody = await aadeRes.text().catch(() => '');
      console.error('AADE error:', aadeRes.status, errBody.slice(0, 500));
      return NextResponse.json({ error: `ΑΑΔΕ σφάλμα: ${aadeRes.status} — ${aadeRes.statusText}` }, { status: 500 });
    }

    const xml = await aadeRes.text();
    console.log('AADE raw XML (first 1000):', xml.slice(0, 1000));

    // Check for AADE errors — try both prefixed and unprefixed
    const errorCode = extractXmlValue(xml, 'error_code');
    const errorDescr = extractXmlValue(xml, 'error_descr');
    if (errorDescr && errorCode && errorCode !== '0') {
      return NextResponse.json({ error: `ΑΑΔΕ: ${errorDescr}` }, { status: 400 });
    }

    const result = {
      source: 'aade' as const,
      onomasia: extractXmlValue(xml, 'onomasia'),
      commer_title: extractXmlValue(xml, 'commer_title'),
      doy_descr: extractXmlValue(xml, 'doy_descr'),
      postal_address: extractXmlValue(xml, 'postal_address') +
        (extractXmlValue(xml, 'postal_address_no') ? ' ' + extractXmlValue(xml, 'postal_address_no') : ''),
      postal_zip_code: extractXmlValue(xml, 'postal_zip_code'),
      postal_area_description: extractXmlValue(xml, 'postal_area_description'),
      firm_act_descr: extractXmlValue(xml, 'firm_act_descr'),
      elorusContactId: elorusContactId as string | null,
      _debug_xml: xml.slice(0, 800),
      _debug_creds: `user=${org.aadeUsername ? org.aadeUsername.slice(0, 3) + '***' : 'EMPTY'} afm=${org.aadeAfm || 'EMPTY'} pass=${org.aadePassword ? '***set***' : 'EMPTY'}`,
    };

    // Step 3: Create or update Elorus contact with AADE data
    if (org.apiElorus && org.elorusOrgId && result.onomasia) {
      const hdrs = elorusHeaders(org.apiElorus, org.elorusOrgId);
      const contactPayload = {
        client_type: '1',
        company: result.onomasia,
        tin: afm,
        country: 'GR',
        is_client: true,
        active: true,
        addresses: [{
          address: result.postal_address,
          city: result.postal_area_description,
          zip: result.postal_zip_code,
          country: 'GR',
          ad_type: 'bill',
        }],
      };

      if (elorusContactId) {
        // Update existing placeholder
        await fetch(`${ELORUS_BASE}/v1.2/contacts/${elorusContactId}/`, {
          method: 'PATCH', headers: hdrs, body: JSON.stringify(contactPayload),
        });
      } else {
        // Create new
        const createRes = await fetch(`${ELORUS_BASE}/v1.2/contacts/`, {
          method: 'POST', headers: hdrs, body: JSON.stringify(contactPayload),
        });
        if (createRes.ok) {
          const created = await createRes.json();
          result.elorusContactId = created.id;
        }
      }
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error('AFM lookup error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
