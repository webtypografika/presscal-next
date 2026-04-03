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

function buildSoapEnvelope(username: string, password: string, callerAfm: string, lookupAfm: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:rgws="http://gr/gsis/rgwspublic/RgWsPublic2.wsdl"
  xmlns:rgt="http://gr/gsis/rgwspublic/RgWsPublic2Types.xsd">
  <soap:Header>
    <rgws:RgWsPublic2InputHeader>
      <rgt:pUsernameToken>
        <rgt:pUsername>${username}</rgt:pUsername>
        <rgt:pPassword>${password}</rgt:pPassword>
      </rgt:pUsernameToken>
      <rgt:pCalledby>
        <rgt:pAfm>${callerAfm}</rgt:pAfm>
      </rgt:pCalledby>
    </rgws:RgWsPublic2InputHeader>
  </soap:Header>
  <soap:Body>
    <rgws:rgWsPublic2AfmMethod>
      <rgws:INPUT_REC>
        <rgt:afm_called_by/>
        <rgt:afm_called_for>${lookupAfm}</rgt:afm_called_for>
      </rgws:INPUT_REC>
    </rgws:rgWsPublic2AfmMethod>
  </soap:Body>
</soap:Envelope>`;
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

    const soapBody = buildSoapEnvelope(org.aadeUsername, org.aadePassword, org.aadeAfm, afm);
    const aadeRes = await fetch(AADE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
      body: soapBody,
    });

    if (!aadeRes.ok) {
      const errBody = await aadeRes.text().catch(() => '');
      console.error('AADE error:', aadeRes.status, errBody.slice(0, 500));
      return NextResponse.json({ error: `ΑΑΔΕ σφάλμα: ${aadeRes.status} — ${aadeRes.statusText}` }, { status: 500 });
    }

    const xml = await aadeRes.text();

    // Check for AADE errors
    const errorDescr = extractXmlValue(xml, 'error_descr');
    if (errorDescr) {
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
