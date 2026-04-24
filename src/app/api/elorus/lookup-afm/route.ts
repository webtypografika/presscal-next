import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { doyToElorusCode, elorusCodeToDoyName } from '@/lib/elorus-doy-map';
import { normalizeAfm } from '@/lib/normalize-afm';

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
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
  xmlns:rgws="http://rgwspublic2/RgWsPublic2Service"
  xmlns:rg="http://rgwspublic2/RgWsPublic2">
  <soap:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${username}</wsse:Username>
        <wsse:Password>${password}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <rgws:rgWsPublic2AfmMethod>
      <rgws:INPUT_REC>
        <rg:afm_called_by>${callerAfm}</rg:afm_called_by>
        <rg:afm_called_for>${lookupAfm}</rg:afm_called_for>
      </rgws:INPUT_REC>
    </rgws:rgWsPublic2AfmMethod>
  </soap:Body>
</soap:Envelope>`;
}

function extractXmlValue(xml: string, tag: string): string {
  // Match <tag>value</tag> or <prefix:tag>value</prefix:tag> — exact tag name with boundary
  const re = new RegExp(`<(?:[^:>]*:)?${tag}(?=[\\s>/])(?:\\s[^>]*)?>([^<]+)</`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

// ═══ POST /api/elorus/lookup-afm ═══
export async function POST(req: NextRequest) {
  try {
    const { afm: rawAfm } = await req.json();
    const afm = normalizeAfm(rawAfm);
    if (!afm || !/^\d{9}$/.test(afm)) {
      return NextResponse.json({ error: 'ΑΦΜ πρέπει να είναι 9 ψηφία' }, { status: 400 });
    }

    const org = await prisma.org.findUnique({ where: { id: ORG_ID } });

    // Step 1: Check Elorus for existing contact with this AFM
    let elorusContactId: string | null = null;
    if (org?.apiElorus && org.elorusOrgId) {
      const hdrs = elorusHeaders(org.apiElorus, org.elorusOrgId);

      // Try exact vat_number filter first, then generic search as fallback
      let match: Record<string, any> | undefined;
      for (const url of [
        `${ELORUS_BASE}/v1.2/contacts/?vat_number=${afm}&page_size=5`,
        `${ELORUS_BASE}/v1.2/contacts/?search=${afm}&page_size=5&is_client=true`,
      ]) {
        if (match) break;
        const res = await fetch(url, { headers: hdrs });
        if (res.ok) {
          const data = await res.json();
          match = (data.results || []).find((c: Record<string, string>) => normalizeAfm(c.vat_number || c.tin) === afm);
        }
      }

      if (match && match.company && !match.company.startsWith('ΑΦΜ ')) {
        // Found with real data — extract address from Elorus record
        const addr = Array.isArray(match.addresses) && match.addresses.length > 0 ? match.addresses[0] : null;
        const contactName = [match.first_name, match.last_name].filter(Boolean).join(' ').trim() || match.company || match.display_name || '';
        const primaryEmail = Array.isArray(match.email) && match.email.length > 0 ? match.email[0].email : '';
        return NextResponse.json({
          source: 'elorus_existing',
          elorusContactId: match.id,
          onomasia: match.company || match.display_name || '',
          commer_title: match.company || '',
          doy_descr: match.tax_office_name || elorusCodeToDoyName(match.tax_office) || '',
          postal_address: addr?.address || addr?.address_line || '',
          postal_zip_code: addr?.zip || '',
          postal_area_description: addr?.city || '',
          firm_act_descr: match.profession || '',
          email: primaryEmail,
          contactName: contactName || '',
          contactEmail: primaryEmail,
          phone: match.phone || '',
        });
      }
      if (match) elorusContactId = match.id;
    }

    // Step 2: Query AADE
    if (!org?.aadeUsername || !org.aadePassword || !org.aadeAfm) {
      return NextResponse.json({ error: 'ΑΑΔΕ credentials δεν έχουν ρυθμιστεί (Ρυθμίσεις → Ενσωματώσεις)' }, { status: 400 });
    }

    const soapBody = buildSoap12Envelope(org.aadeUsername, org.aadePassword, org.aadeAfm, afm);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const aadeRes = await fetch(AADE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
      body: soapBody,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!aadeRes.ok) {
      const errBody = await aadeRes.text().catch(() => '');
      console.error('AADE error:', aadeRes.status, errBody.slice(0, 500));
      return NextResponse.json({ error: `ΑΑΔΕ σφάλμα: ${aadeRes.status} — ${aadeRes.statusText}` }, { status: 500 });
    }

    const xml = await aadeRes.text();

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
    };

    // Step 3: Create or update Elorus contact with AADE data
    if (org.apiElorus && org.elorusOrgId && result.onomasia) {
      const hdrs = elorusHeaders(org.apiElorus, org.elorusOrgId);
      const contactPayload = {
        client_type: 1,
        company: result.onomasia,
        vat_number: afm,
        tax_office: doyToElorusCode(result.doy_descr) || '',
        profession: result.firm_act_descr || '',
        country: 'GR',
        is_client: true,
        is_supplier: false,
        active: true,
        addresses: [{
          address: result.postal_address || '-',
          address_line: result.postal_address || '-',
          city: result.postal_area_description || '-',
          zip: result.postal_zip_code || '-',
          country: 'GR',
          ad_type: 'bill',
        }],
      };

      if (elorusContactId) {
        // Update existing placeholder
        const patchRes = await fetch(`${ELORUS_BASE}/v1.2/contacts/${elorusContactId}/`, {
          method: 'PATCH', headers: hdrs, body: JSON.stringify(contactPayload),
        });
        if (!patchRes.ok) console.error('[Elorus] PATCH contact failed:', patchRes.status, await patchRes.text().catch(() => ''));
      } else {
        // Create new
        let createRes = await fetch(`${ELORUS_BASE}/v1.2/contacts/`, {
          method: 'POST', headers: hdrs, body: JSON.stringify(contactPayload),
        });
        // Fallback: if tax_office fails, retry without it
        if (!createRes.ok && contactPayload.tax_office) {
          const errText = await createRes.text().catch(() => '');
          if (errText.includes('tax_office')) {
            console.warn('[Elorus] tax_office rejected, retrying without it:', contactPayload.tax_office);
            const { tax_office, ...payloadWithout } = contactPayload;
            createRes = await fetch(`${ELORUS_BASE}/v1.2/contacts/`, {
              method: 'POST', headers: hdrs, body: JSON.stringify(payloadWithout),
            });
          }
        }
        if (createRes.ok) {
          const created = await createRes.json();
          result.elorusContactId = created.id;
        } else {
          const errText = await createRes.text().catch(() => '');
          console.error('[Elorus] CREATE contact failed:', createRes.status, errText);
          return NextResponse.json({ error: `[lookup-afm create] ${createRes.status} — ${errText.slice(0, 300)}` }, { status: 500 });
        }
      }
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error('AFM lookup error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
