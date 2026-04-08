import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';

const ORG_ID = 'default-org';
const ELORUS_BASE = 'https://api.elorus.com';

function elorusHeaders(apiKey: string, orgId: string) {
  return {
    Authorization: `Token ${apiKey}`,
    'X-Elorus-Organization': orgId,
    'Content-Type': 'application/json',
  };
}

function masked(key: string) {
  if (!key || key.length < 8) return '••••';
  return '••••' + key.slice(-6);
}

// ─── Fetch doc types & taxes from Elorus ───
async function fetchElorusMetadata(apiKey: string, orgId: string) {
  const headers = elorusHeaders(apiKey, orgId);
  const [dtRes, txRes, umRes] = await Promise.all([
    fetch(`${ELORUS_BASE}/v1.2/documenttypes/?page_size=100`, { headers }),
    fetch(`${ELORUS_BASE}/v1.2/taxes/?page_size=100`, { headers }),
    fetch(`${ELORUS_BASE}/v1.2/unitofmeasurement/?page_size=100`, { headers }),
  ]);
  if (!dtRes.ok || !txRes.ok) return null;
  const dtData = await dtRes.json();
  const txData = await txRes.json();
  const docTypes = (dtData.results || []).map((d: Record<string, string>) => ({
    id: d.id, title: d.title, category: d.category,
  }));
  const taxes = (txData.results || []).map((t: Record<string, string>) => ({
    id: t.id, title: t.title, percentage: t.percentage,
  }));
  let unitMeasures: { id: string; title: string; v1Id?: string }[] = [];
  if (umRes.ok) {
    const umData = await umRes.json();
    const all = umData.results || [];
    unitMeasures = all
      .filter((u: Record<string, unknown>) => u.active !== false)
      .map((u: Record<string, unknown>) => ({ id: String(u.id), title: (u.title as string) || String(u.id), symbol: (u.symbol as string) || '' }));
  }
  // Fetch v1.1 units to get their simple numeric IDs, then match by title
  try {
    const v1Res = await fetch(`${ELORUS_BASE}/v1.1/unitmeasures/`, { headers });
    if (v1Res.ok) {
      const v1Data = await v1Res.json();
      const v1Units = v1Data.results || v1Data || [];
      for (const um of unitMeasures) {
        const match = (Array.isArray(v1Units) ? v1Units : []).find((v: any) => v.title === um.title);
        if (match) um.v1Id = String(match.id);
      }
    }
  } catch { /* non-critical */ }
  return { docTypes, taxes, unitMeasures };
}

// ═══ POST /api/elorus ═══
// Actions: get | save | saveDefaults | refresh | disconnect
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    const org = await prisma.org.findUnique({ where: { id: ORG_ID } });
    if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });

    // ─── GET: return current settings ───
    if (action === 'get') {
      const configured = !!(org.apiElorus && org.elorusOrgId);
      return NextResponse.json({
        configured,
        orgName: org.elorusOrgName ?? '',
        orgId: org.elorusOrgId ?? '',
        orgSlug: org.elorusOrgSlug ?? '',
        apiKeyMasked: org.apiElorus ? masked(org.apiElorus) : '',
        defaultDocType: org.elorusDefaultDocType ?? '',
        defaultTaxId: org.elorusDefaultTaxId ?? '',
        defaultMyDataType: org.elorusDefaultMyData ?? '',
        defaultClassCategory: org.elorusDefaultClassCat ?? '',
        defaultClassType: org.elorusDefaultClassType ?? '',
        aadeConfigured: !!(org.aadeUsername && org.aadeAfm),
        aadeUsername: org.aadeUsername ?? '',
        aadeAfm: org.aadeAfm ?? '',
        docTypes: org.elorusDocTypes ?? [],
        taxes: org.elorusTaxes ?? [],
        unitMeasures: org.elorusUnitMeasures ?? [],
        defaultUnitId: org.elorusDefaultUnitId ?? '',
        unitMap: (org as any).elorusUnitMap ?? {},
        selectedUnits: (org as any).elorusSelectedUnits ?? [],
      });
    }

    // ─── SAVE: validate API key + org, fetch metadata ───
    if (action === 'save') {
      const { apiKey, orgId: elorusOrgId, orgSlug } = body;
      if (!apiKey || !elorusOrgId) {
        return NextResponse.json({ error: 'API Key και Organization ID απαιτούνται' }, { status: 400 });
      }

      // Validate connection
      const testRes = await fetch(`${ELORUS_BASE}/v1.2/contacts/?page_size=1`, {
        headers: elorusHeaders(apiKey, elorusOrgId),
      });
      if (!testRes.ok) {
        return NextResponse.json({ error: 'Αποτυχία σύνδεσης — ελέγξτε API Key και Organization ID' }, { status: 400 });
      }

      // Get org name from Elorus
      let orgName = '';
      try {
        const orgRes = await fetch(`${ELORUS_BASE}/v1.2/organization/`, {
          headers: elorusHeaders(apiKey, elorusOrgId),
        });
        if (orgRes.ok) {
          const orgData = await orgRes.json();
          orgName = orgData.name || orgData.legal_name || '';
        }
      } catch { /* non-critical */ }

      // Fetch docTypes + taxes
      const meta = await fetchElorusMetadata(apiKey, elorusOrgId);

      await prisma.org.update({
        where: { id: ORG_ID },
        data: {
          apiElorus: apiKey,
          elorusOrgId: elorusOrgId,
          elorusOrgSlug: orgSlug || null,
          elorusOrgName: orgName || null,
          elorusDocTypes: meta?.docTypes ?? [],
          elorusTaxes: meta?.taxes ?? [],
          elorusUnitMeasures: meta?.unitMeasures ?? [],
        },
      });

      return NextResponse.json({
        ok: true,
        orgName,
        apiKeyMasked: masked(apiKey),
        docTypes: meta?.docTypes ?? [],
        taxes: meta?.taxes ?? [],
        unitMeasures: meta?.unitMeasures ?? [],
      });
    }

    // ─── SAVE DEFAULTS: doc type, tax, mydata, classification, AADE ───
    if (action === 'saveDefaults') {
      const data: Record<string, string | null> = {};
      if (body.defaultDocType !== undefined) data.elorusDefaultDocType = body.defaultDocType || null;
      if (body.defaultTaxId !== undefined) data.elorusDefaultTaxId = body.defaultTaxId || null;
      if (body.defaultMyDataType !== undefined) data.elorusDefaultMyData = body.defaultMyDataType || null;
      if (body.defaultClassCategory !== undefined) data.elorusDefaultClassCat = body.defaultClassCategory || null;
      if (body.defaultClassType !== undefined) data.elorusDefaultClassType = body.defaultClassType || null;
      if (body.defaultUnitId !== undefined) data.elorusDefaultUnitId = body.defaultUnitId || null;
      if (body.selectedUnits !== undefined) (data as any).elorusSelectedUnits = body.selectedUnits || null;
      if (body.unitMap !== undefined) (data as any).elorusUnitMap = body.unitMap || null;
      if (body.aadeUsername !== undefined) data.aadeUsername = body.aadeUsername || null;
      if (body.aadePassword !== undefined) data.aadePassword = body.aadePassword || null;
      if (body.aadeAfm !== undefined) data.aadeAfm = body.aadeAfm || null;

      await prisma.org.update({ where: { id: ORG_ID }, data });
      return NextResponse.json({ ok: true });
    }

    // ─── REFRESH: re-fetch docTypes + taxes ───
    if (action === 'refresh') {
      if (!org.apiElorus || !org.elorusOrgId) {
        return NextResponse.json({ error: 'Δεν υπάρχει σύνδεση Elorus' }, { status: 400 });
      }
      const meta = await fetchElorusMetadata(org.apiElorus, org.elorusOrgId);
      if (!meta) return NextResponse.json({ error: 'Αποτυχία ανανέωσης' }, { status: 500 });

      await prisma.org.update({
        where: { id: ORG_ID },
        data: { elorusDocTypes: meta.docTypes, elorusTaxes: meta.taxes, elorusUnitMeasures: meta.unitMeasures },
      });
      return NextResponse.json({ ok: true, docTypes: meta.docTypes, taxes: meta.taxes, unitMeasures: meta.unitMeasures });
    }

    // ─── DEBUG: OPTIONS on v1.1 invoices ───
    if (action === 'debugInvoice') {
      if (!org.apiElorus || !org.elorusOrgId) return NextResponse.json({ error: 'Not connected' }, { status: 400 });
      const hdrs = elorusHeaders(org.apiElorus, org.elorusOrgId);
      const res = await fetch(`${ELORUS_BASE}/v1.1/invoices/`, { method: 'OPTIONS', headers: hdrs });
      const data = await res.json();
      const unitField = data?.actions?.POST?.items?.child?.children?.unit_measure;
      return NextResponse.json({ unitField });
    }

    // ─── DISCONNECT: clear all Elorus settings ───
    if (action === 'disconnect') {
      await prisma.org.update({
        where: { id: ORG_ID },
        data: {
          apiElorus: null, elorusOrgId: null, elorusOrgSlug: null, elorusOrgName: null,
          elorusDefaultDocType: null, elorusDefaultTaxId: null, elorusDefaultMyData: null,
          elorusDefaultClassCat: null, elorusDefaultClassType: null,
          elorusDocTypes: Prisma.JsonNull, elorusTaxes: Prisma.JsonNull, elorusUnitMeasures: Prisma.JsonNull,
          elorusDefaultUnitId: null,
        },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('Elorus API error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
