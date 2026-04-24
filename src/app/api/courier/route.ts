import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCourierAdapter, listAvailableProviders } from '@/lib/couriers';
import type { CourierProviderConfig } from '@/lib/couriers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGmailToken, sendGmail } from '@/lib/gmail';

const ORG_ID = 'default-org';

async function getOrg() {
  return prisma.org.findUnique({ where: { id: ORG_ID } });
}

// Parse courierProviders JSON safely
function parseProviders(org: any): CourierProviderConfig[] {
  if (!org?.courierProviders) return [];
  if (Array.isArray(org.courierProviders)) return org.courierProviders;
  try { return JSON.parse(org.courierProviders); } catch { return []; }
}

function findProvider(providers: CourierProviderConfig[], providerId: string): CourierProviderConfig | undefined {
  return providers.find(p => p.id === providerId);
}

// ═══ POST /api/courier ═══
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // ─── GET PROVIDERS ───
    if (action === 'get') {
      const org = await getOrg();
      const providers = parseProviders(org);
      const available = listAvailableProviders();
      return NextResponse.json({
        providers: providers.map(p => ({
          id: p.id,
          apiKeyMasked: p.apiKey ? '••••' + p.apiKey.slice(-4) : '',
          baseUrl: p.baseUrl || null,
        })),
        defaultId: org?.courierDefaultId || null,
        available,
      });
    }

    // ─── SAVE PROVIDER ───
    if (action === 'save') {
      const { providerId, apiKey, baseUrl } = body;
      if (!providerId || !apiKey) return NextResponse.json({ error: 'providerId και apiKey απαιτούνται' }, { status: 400 });

      const adapter = getCourierAdapter(providerId);
      if (!adapter) return NextResponse.json({ error: `Άγνωστος provider: ${providerId}` }, { status: 400 });

      // Validate key
      const valid = await adapter.validateKey(apiKey, baseUrl || adapter.meta.defaultBaseUrl);
      if (!valid) return NextResponse.json({ error: 'API key δεν είναι έγκυρο' }, { status: 400 });

      const org = await getOrg();
      const providers = parseProviders(org);
      const existing = providers.findIndex(p => p.id === providerId);
      const entry: CourierProviderConfig = { id: providerId, apiKey, baseUrl: baseUrl || undefined };

      if (existing >= 0) providers[existing] = entry;
      else providers.push(entry);

      // If first provider, set as default
      const defaultId = org?.courierDefaultId || providerId;

      await prisma.org.update({
        where: { id: ORG_ID },
        data: { courierProviders: providers as any, courierDefaultId: defaultId },
      });
      return NextResponse.json({ ok: true });
    }

    // ─── REMOVE PROVIDER ───
    if (action === 'remove') {
      const { providerId } = body;
      const org = await getOrg();
      const providers = parseProviders(org).filter(p => p.id !== providerId);
      const defaultId = org?.courierDefaultId === providerId
        ? (providers[0]?.id || null)
        : org?.courierDefaultId;

      await prisma.org.update({
        where: { id: ORG_ID },
        data: { courierProviders: providers as any, courierDefaultId: defaultId },
      });
      return NextResponse.json({ ok: true });
    }

    // ─── SET DEFAULT ───
    if (action === 'setDefault') {
      const { providerId } = body;
      await prisma.org.update({
        where: { id: ORG_ID },
        data: { courierDefaultId: providerId },
      });
      return NextResponse.json({ ok: true });
    }

    // ─── CREATE VOUCHER ───
    if (action === 'createVoucher') {
      const org = await getOrg();
      const providers = parseProviders(org);
      const providerId = body.providerId || org?.courierDefaultId;
      if (!providerId) return NextResponse.json({ error: 'Δεν υπάρχει ρυθμισμένος courier' }, { status: 400 });

      const config = findProvider(providers, providerId);
      if (!config) return NextResponse.json({ error: `Provider "${providerId}" δεν βρέθηκε` }, { status: 400 });

      const adapter = getCourierAdapter(providerId);
      if (!adapter) return NextResponse.json({ error: `Adapter "${providerId}" δεν υπάρχει` }, { status: 400 });

      const { quoteId, receiverName, receiverPhone, receiverAddress, receiverCity, receiverZip, weight, cod, notes } = body;
      if (!quoteId) return NextResponse.json({ error: 'quoteId απαιτείται' }, { status: 400 });

      const quote = await prisma.quote.findUnique({
        where: { id: quoteId },
        select: { id: true, number: true, companyId: true, contactId: true, company: { select: { email: true, name: true } }, contact: { select: { email: true, name: true } } },
      });
      if (!quote) return NextResponse.json({ error: 'Προσφορά δεν βρέθηκε' }, { status: 404 });

      const { voucherId } = await adapter.createVoucher(config, {
        receiverName, receiverPhone, receiverAddress, receiverCity, receiverZip,
        weight, cod: cod > 0 ? cod : undefined, notes,
        orderId: quote.number,
      });

      await prisma.quote.update({
        where: { id: quoteId },
        data: {
          courierVoucherId: voucherId,
          courierProvider: providerId,
          courierStatus: 'Δημιουργήθηκε',
          courierStatusAt: new Date(),
        },
      });

      // Send tracking email (best-effort — don't fail the voucher if email fails)
      try {
        const trackingUrl = adapter.meta.trackingUrlTemplate.replace('{voucherId}', voucherId);
        const recipientEmail = quote.contact?.email || quote.company?.email;
        const recipientName = quote.contact?.name || quote.company?.name || receiverName;
        if (recipientEmail) {
          const session = await getServerSession(authOptions);
          const userId = (session?.user as any)?.id;
          const userEmail = session?.user?.email || '';
          if (userId) {
            const token = await getGmailToken(userId);
            if (token) {
              const orgName = org?.legalName || org?.name || 'PressCal';
              const subject = `Αποστολή ${quote.number} — ${adapter.meta.name}`;
              const html = buildTrackingEmailHtml({
                orgName,
                quoteNumber: quote.number,
                courierName: adapter.meta.name,
                voucherId,
                trackingUrl,
                recipientName,
              });
              await sendGmail(token, userEmail, recipientEmail, subject, html);
            }
          }
        }
      } catch (e) {
        console.error('Tracking email failed (non-critical):', e);
      }

      return NextResponse.json({ ok: true, voucherId });
    }

    // ─── TRACK VOUCHER ───
    if (action === 'trackVoucher') {
      const { quoteId } = body;
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId },
        select: { courierVoucherId: true, courierProvider: true },
      });
      if (!quote?.courierVoucherId || !quote.courierProvider) {
        return NextResponse.json({ error: 'Δεν υπάρχει voucher' }, { status: 404 });
      }

      const org = await getOrg();
      const providers = parseProviders(org);
      const config = findProvider(providers, quote.courierProvider);
      if (!config) return NextResponse.json({ error: 'Provider δεν βρέθηκε' }, { status: 400 });

      const adapter = getCourierAdapter(quote.courierProvider);
      if (!adapter) return NextResponse.json({ error: 'Adapter δεν βρέθηκε' }, { status: 400 });

      const { status } = await adapter.trackVoucher(config, quote.courierVoucherId);
      await prisma.quote.update({
        where: { id: quoteId },
        data: { courierStatus: status, courierStatusAt: new Date() },
      });

      return NextResponse.json({ ok: true, status, voucherId: quote.courierVoucherId });
    }

    // ─── PRINT VOUCHER ───
    if (action === 'printVoucher') {
      const { quoteId, type } = body;
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId },
        select: { courierVoucherId: true, courierProvider: true },
      });
      if (!quote?.courierVoucherId || !quote.courierProvider) {
        return NextResponse.json({ error: 'Δεν υπάρχει voucher' }, { status: 404 });
      }

      const org = await getOrg();
      const providers = parseProviders(org);
      const config = findProvider(providers, quote.courierProvider);
      if (!config) return NextResponse.json({ error: 'Provider δεν βρέθηκε' }, { status: 400 });

      const adapter = getCourierAdapter(quote.courierProvider);
      if (!adapter) return NextResponse.json({ error: 'Adapter δεν βρέθηκε' }, { status: 400 });

      const pdfBuffer = await adapter.printVoucher(config, quote.courierVoucherId, type === 'a4' ? 'a4' : 'a6');
      return new Response(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="voucher-${quote.courierVoucherId}.pdf"`,
        },
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('Courier API error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// ─── TRACKING EMAIL HTML ───
function buildTrackingEmailHtml(opts: {
  orgName: string;
  quoteNumber: string;
  courierName: string;
  voucherId: string;
  trackingUrl: string;
  recipientName: string;
}) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f1f5f9;">
<div style="max-width:520px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <div style="background:#10b981;padding:20px 28px;color:#fff;">
    <h1 style="margin:0;font-size:18px;font-weight:600;">
      <span style="margin-right:8px;">📦</span>Η αποστολή σας ξεκίνησε!
    </h1>
  </div>
  <div style="padding:24px 28px;">
    <p style="margin:0 0 16px;color:#334155;font-size:15px;">
      Αγαπητέ/ή ${opts.recipientName},
    </p>
    <p style="margin:0 0 20px;color:#475569;font-size:14px;">
      Η παραγγελία σας <strong>${opts.quoteNumber}</strong> αποστέλλεται μέσω <strong>${opts.courierName}</strong>.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px;">
      <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Αριθμός αποστολής</div>
      <div style="font-size:18px;font-weight:700;color:#0f172a;font-family:monospace;">${opts.voucherId}</div>
    </div>
    <a href="${opts.trackingUrl}" target="_blank" style="display:block;text-align:center;background:#10b981;color:#fff;padding:14px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
      Παρακολούθηση αποστολής →
    </a>
    <p style="margin:20px 0 0;color:#94a3b8;font-size:12px;text-align:center;">
      ${opts.orgName}
    </p>
  </div>
</div>
</body></html>`;
}
