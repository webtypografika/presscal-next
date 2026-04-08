import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ORG_ID = 'default-org';
const NEXDAY_BASE = 'https://app.nexday.gr/api/v5.0';

function nexdayHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

async function getOrg() {
  return prisma.org.findUnique({ where: { id: ORG_ID } });
}

// ═══ POST /api/courier ═══
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // ─── GET config ───
    if (action === 'get') {
      const org = await getOrg();
      return NextResponse.json({
        connected: !!(org?.courierApiKey && org.courierProvider),
        provider: org?.courierProvider || null,
        apiKeyMasked: org?.courierApiKey ? '••••' + org.courierApiKey.slice(-4) : null,
      });
    }

    // ─── SAVE config ───
    if (action === 'save') {
      const { apiKey } = body;

      // Validate API key by fetching vouchers
      if (apiKey) {
        const test = await fetch(`${NEXDAY_BASE}/GetVouchers`, { headers: nexdayHeaders(apiKey) });
        if (!test.ok) return NextResponse.json({ error: 'API key δεν είναι έγκυρο' }, { status: 400 });
      }

      await prisma.org.update({
        where: { id: ORG_ID },
        data: {
          courierProvider: 'nexday',
          courierApiKey: apiKey || undefined,
        },
      });
      return NextResponse.json({ ok: true });
    }

    // ─── DISCONNECT ───
    if (action === 'disconnect') {
      await prisma.org.update({
        where: { id: ORG_ID },
        data: {
          courierProvider: null,
          courierApiKey: null,
        },
      });
      return NextResponse.json({ ok: true });
    }

    // ─── CREATE VOUCHER ───
    if (action === 'createVoucher') {
      const org = await getOrg();
      if (!org?.courierApiKey) return NextResponse.json({ error: 'Courier δεν είναι ρυθμισμένο' }, { status: 400 });

      const { quoteId, receiverName, receiverPhone, receiverAddress, receiverCity, receiverZip, weight, cod, notes } = body;
      if (!quoteId) return NextResponse.json({ error: 'quoteId απαιτείται' }, { status: 400 });

      const quote = await prisma.quote.findUnique({ where: { id: quoteId }, select: { id: true, number: true } });
      if (!quote) return NextResponse.json({ error: 'Προσφορά δεν βρέθηκε' }, { status: 404 });

      const payload: Record<string, unknown> = {
        ReceiverName: String(receiverName || '').slice(0, 64),
        ReceiverAddress: receiverAddress,
        ReceiverCity: receiverCity,
        ReceiverPostal: parseInt(receiverZip) || 0,
        ReceiverTelephone: receiverPhone,
        Notes: notes || `Προσφορά ${quote.number}`,
        OrderID: quote.number,
        ParcelWeight: Math.max(1, Math.round(weight || 1)),
      };
      if (cod && cod > 0) payload.Cod = cod;

      const res = await fetch(`${NEXDAY_BASE}/CreateVoucher`, {
        method: 'POST',
        headers: nexdayHeaders(org.courierApiKey),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) return NextResponse.json({ error: data.message || 'Αποτυχία δημιουργίας voucher' }, { status: 500 });

      // Save to quote
      await prisma.quote.update({
        where: { id: quoteId },
        data: {
          courierVoucherId: String(data.voucher),
          courierProvider: 'nexday',
          courierStatus: 'Δημιουργήθηκε',
          courierStatusAt: new Date(),
        },
      });

      return NextResponse.json({ ok: true, voucherId: String(data.voucher) });
    }

    // ─── TRACK VOUCHER ───
    if (action === 'trackVoucher') {
      const org = await getOrg();
      if (!org?.courierApiKey) return NextResponse.json({ error: 'Courier δεν είναι ρυθμισμένο' }, { status: 400 });

      const { quoteId } = body;
      const quote = await prisma.quote.findUnique({ where: { id: quoteId }, select: { courierVoucherId: true } });
      if (!quote?.courierVoucherId) return NextResponse.json({ error: 'Δεν υπάρχει voucher' }, { status: 404 });

      const res = await fetch(`${NEXDAY_BASE}/GetVoucherLastStatus?voucher=${quote.courierVoucherId}`, {
        headers: nexdayHeaders(org.courierApiKey),
      });
      const data = await res.json();

      const status = data.success && data.data ? (data.data.status || 'Άγνωστο') : 'Σφάλμα';
      await prisma.quote.update({
        where: { id: quoteId },
        data: { courierStatus: status, courierStatusAt: new Date() },
      });

      return NextResponse.json({ ok: true, status, voucherId: quote.courierVoucherId });
    }

    // ─── PRINT VOUCHER ───
    if (action === 'printVoucher') {
      const org = await getOrg();
      if (!org?.courierApiKey) return NextResponse.json({ error: 'Courier δεν είναι ρυθμισμένο' }, { status: 400 });

      const { quoteId, type } = body;
      const quote = await prisma.quote.findUnique({ where: { id: quoteId }, select: { courierVoucherId: true } });
      if (!quote?.courierVoucherId) return NextResponse.json({ error: 'Δεν υπάρχει voucher' }, { status: 404 });

      const printType = type === 'a4' ? 'a4' : 'a6';
      const res = await fetch(`${NEXDAY_BASE}/PrintVouchers?type=${printType}&vouchers=${quote.courierVoucherId}`, {
        headers: nexdayHeaders(org.courierApiKey),
      });
      if (!res.ok) return NextResponse.json({ error: 'Αποτυχία εκτύπωσης voucher' }, { status: 500 });

      const pdfBuffer = await res.arrayBuffer();
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
