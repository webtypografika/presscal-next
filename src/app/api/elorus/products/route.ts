import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';

const ORG_ID = 'default-org';
const ELORUS_BASE = 'https://api.elorus.com';

function elorusHeaders(apiKey: string, orgId: string) {
  return {
    Authorization: `Token ${apiKey}`,
    'X-Elorus-Organization': orgId,
    'Content-Type': 'application/json',
  };
}

// ═══ POST /api/elorus/products ═══
// Actions: import | push | pushNew
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    const org = await prisma.org.findUnique({ where: { id: ORG_ID } });
    if (!org || !org.apiElorus || !org.elorusOrgId) {
      return NextResponse.json({ error: 'Elorus δεν είναι συνδεδεμένο' }, { status: 400 });
    }

    const headers = elorusHeaders(org.apiElorus, org.elorusOrgId);

    // ─── IMPORT: Fetch all products from Elorus → create/update local ───
    if (action === 'import') {
      let allProducts: Record<string, unknown>[] = [];
      let url: string | null = `${ELORUS_BASE}/v1.2/products/?page_size=100`;

      while (url) {
        const res: Response = await fetch(url, { headers });
        if (!res.ok) {
          const errText = await res.text();
          return NextResponse.json({ error: `Elorus error: ${res.status} ${errText}` }, { status: 500 });
        }
        const data: { results?: Record<string, unknown>[]; next?: string } = await res.json();
        const results = data.results || [];
        allProducts = allProducts.concat(results);
        url = data.next || null;
      }

      // Get existing local catalog products keyed by elorusProductId
      const existing = await prisma.product.findMany({
        where: { orgId: ORG_ID, productType: 'catalog', elorusProductId: { not: null } },
      });
      const byElorusId = new Map(existing.map(p => [p.elorusProductId!, p]));

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const sampleRaw: Record<string, unknown>[] = [];

      for (const ep of allProducts) {
        if (ep.active === false) { skipped++; continue; }

        const elorusId = ep.id as string;
        const title = (ep.title as string) || 'Χωρίς τίτλο';
        const description = (ep.description as string) || '';
        const code = (ep.code as string) || '';
        const unitValue = parseFloat(String(ep.unit_value || '0'));
        const taxes = (ep.taxes as string[]) || [];
        const unitMeasure = (ep.unit_measure as string) || '';

        // Keep first 3 raw samples for debugging — include ALL raw fields
        if (sampleRaw.length < 3) {
          sampleRaw.push({ rawKeys: Object.keys(ep), rawSample: JSON.parse(JSON.stringify(ep)) });
        }

        const local = byElorusId.get(elorusId);
        if (local) {
          // Update existing
          await prisma.product.update({
            where: { id: local.id },
            data: {
              name: title,
              description,
              sku: code || null,
              sellPrice: unitValue || null,
              unit: resolveUnitLabel(unitMeasure, org),
              elorusTaxId: taxes[0] || null,
              elorusUnitId: unitMeasure || null,
              elorusSyncedAt: new Date(),
            },
          });
          updated++;
        } else {
          // Create new catalog product
          await prisma.product.create({
            data: {
              orgId: ORG_ID,
              name: title,
              description,
              productType: 'catalog',
              archetype: 'custom',
              sku: code || null,
              sellPrice: unitValue || null,
              unit: resolveUnitLabel(unitMeasure, org),
              elorusProductId: elorusId,
              elorusTaxId: taxes[0] || null,
              elorusUnitId: unitMeasure || null,
              elorusSyncedAt: new Date(),
            },
          });
          created++;
        }
      }

      return NextResponse.json({ ok: true, created, updated, skipped, total: allProducts.length, sampleRaw });
    }

    // ─── PUSH: Push existing local product to Elorus ───
    if (action === 'push') {
      const { productId } = body;
      if (!productId) return NextResponse.json({ error: 'productId required' }, { status: 400 });

      const product = await prisma.product.findFirst({
        where: { id: productId, orgId: ORG_ID, deletedAt: null },
      });
      if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

      const payload: Record<string, unknown> = {
        title: product.name,
        description: product.description || '',
        code: product.sku || '',
        unit_value: String(product.sellPrice || 0),
        active: true,
      };
      if (product.elorusTaxId) payload.taxes = [product.elorusTaxId];
      else if (org.elorusDefaultTaxId) payload.taxes = [org.elorusDefaultTaxId];
      if (product.elorusUnitId) payload.unit_measure = product.elorusUnitId;

      let elorusId = product.elorusProductId;

      if (elorusId) {
        // Update existing Elorus product
        const res = await fetch(`${ELORUS_BASE}/v1.2/products/${elorusId}/`, {
          method: 'PUT', headers, body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errText = await res.text();
          return NextResponse.json({ error: `Elorus update failed: ${errText}` }, { status: 500 });
        }
      } else {
        // Create new Elorus product
        const res = await fetch(`${ELORUS_BASE}/v1.2/products/`, {
          method: 'POST', headers, body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errText = await res.text();
          return NextResponse.json({ error: `Elorus create failed: ${errText}` }, { status: 500 });
        }
        const created = await res.json();
        elorusId = created.id;
      }

      // Update local record
      await prisma.product.update({
        where: { id: productId },
        data: { elorusProductId: elorusId, elorusSyncedAt: new Date() },
      });

      return NextResponse.json({ ok: true, elorusProductId: elorusId });
    }

    // ─── DEBUG: check what's in DB ───
    if (action === 'debug') {
      const products = await prisma.product.findMany({
        where: { orgId: ORG_ID, productType: 'catalog', deletedAt: null },
        select: { id: true, name: true, sellPrice: true, unit: true, elorusProductId: true },
        take: 5,
        orderBy: { name: 'asc' },
      });
      return NextResponse.json({ products });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('Elorus products API error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Map Elorus unit measure ID to Greek label
function resolveUnitLabel(unitId: string, org: Record<string, unknown>): string {
  if (!unitId) return 'τεμ';
  const unitMeasures = (org.elorusUnitMeasures as { id: string; title: string }[]) || [];
  const match = unitMeasures.find(u => u.id === unitId);
  return match?.title || 'τεμ';
}
