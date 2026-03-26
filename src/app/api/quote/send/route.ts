import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGmailToken, sendGmail } from '@/lib/gmail';
import { prisma } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as Record<string, unknown>)?.id as string;
    const userEmail = session?.user?.email || '';
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const token = await getGmailToken(userId);
    if (!token) return NextResponse.json({ error: 'No Gmail token' }, { status: 401 });

    const body = await req.json();
    const { quoteId, to, cc, lang = 'el', customSubject, customMessage } = body;
    if (!quoteId || !to) return NextResponse.json({ error: 'Missing quoteId or recipient' }, { status: 400 });

    // Fetch quote with customer
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: { customer: true, org: true },
    });
    if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });

    const org = quote.org;
    const items = Array.isArray(quote.items) ? quote.items as any[] : [];
    const customerName = quote.customer?.name || quote.customer?.company || to;

    // Build subject
    const subject = customSubject || (lang === 'en'
      ? `Quote ${quote.number} — ${org?.legalName || org?.name || 'PressCal'}`
      : `Προσφορά ${quote.number} — ${org?.legalName || org?.name || 'PressCal'}`);

    // Try to load logo as base64
    let logoDataUri = '';
    try {
      if (org?.logo) {
        const logoPath = path.join(process.cwd(), 'public', org.logo);
        if (fs.existsSync(logoPath)) {
          const buf = fs.readFileSync(logoPath);
          const ext = path.extname(logoPath).replace('.', '');
          logoDataUri = `data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${buf.toString('base64')}`;
        }
      }
    } catch {}

    // i18n labels
    const t = lang === 'en' ? {
      greeting: `Dear ${customerName},`,
      intro: 'Please find our quote below:',
      product: 'Product', qty: 'Qty', price: 'Price',
      subtotal: 'Subtotal', vat: 'VAT', total: 'Total',
      terms: 'Terms & Conditions',
      termsText: 'This quote is valid for 30 days from the date of issue. Prices include delivery within the city. Payment: 50% advance, 50% on delivery.',
      bank: 'Bank Details',
      footer: 'Thank you for your trust.',
      powered: 'Powered by PressCal',
    } : {
      greeting: `Αγαπητέ/ή ${customerName},`,
      intro: 'Σας αποστέλλουμε την προσφορά μας:',
      product: 'Προϊόν', qty: 'Ποσ.', price: 'Τιμή',
      subtotal: 'Υποσύνολο', vat: 'ΦΠΑ', total: 'Σύνολο',
      terms: 'Όροι & Προϋποθέσεις',
      termsText: 'Η προσφορά ισχύει για 30 ημέρες από την ημερομηνία έκδοσης. Οι τιμές περιλαμβάνουν παράδοση εντός πόλεως. Πληρωμή: 50% προκαταβολή, 50% στην παράδοση.',
      bank: 'Τραπεζικά Στοιχεία',
      footer: 'Ευχαριστούμε για την εμπιστοσύνη σας.',
      powered: 'Powered by PressCal',
    };

    // Format currency
    const fmt = (n: number) => new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(n);

    // Build HTML email
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
<div style="max-width:640px;margin:0 auto;padding:24px;">

  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px;background:#0f172a;border-radius:12px 12px 0 0;">
    <div style="display:flex;align-items:center;gap:12px;">
      ${logoDataUri ? `<img src="${logoDataUri}" alt="Logo" style="height:36px;width:auto;">` : ''}
      <span style="color:#f1f5f9;font-size:18px;font-weight:800;">${org?.legalName || org?.name || 'PressCal'}</span>
    </div>
    <span style="color:#f58220;font-size:14px;font-weight:700;">${quote.number}</span>
  </div>

  <!-- Company details bar -->
  <div style="padding:10px 24px;background:#1e293b;color:#94a3b8;font-size:11px;display:flex;gap:16px;flex-wrap:wrap;">
    ${org?.afm ? `<span>ΑΦΜ: ${org.afm}</span>` : ''}
    ${org?.doy ? `<span>ΔΟΥ: ${org.doy}</span>` : ''}
    ${org?.address ? `<span>${org.address}${org.city ? ', ' + org.city : ''}${org.postalCode ? ' ' + org.postalCode : ''}</span>` : ''}
    ${org?.phone ? `<span>Τηλ: ${org.phone}</span>` : ''}
    ${org?.email ? `<span>${org.email}</span>` : ''}
  </div>

  <!-- Body -->
  <div style="background:#ffffff;padding:28px 24px;">
    <p style="font-size:14px;margin:0 0 6px;">${t.greeting}</p>
    <p style="font-size:13px;color:#64748b;margin:0 0 20px;">${customMessage || t.intro}</p>

    <!-- Items table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="text-align:left;padding:8px 10px;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;">${t.product}</th>
          <th style="text-align:right;padding:8px 10px;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;">${t.qty}</th>
          <th style="text-align:right;padding:8px 10px;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;">${t.price}</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item: any) => `
        <tr>
          <td style="padding:10px;font-size:13px;border-bottom:1px solid #f1f5f9;">${item.name || '—'}${item.notes ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">${item.notes}</div>` : ''}</td>
          <td style="text-align:right;padding:10px;font-size:13px;border-bottom:1px solid #f1f5f9;">${item.qty || ''} ${item.unit || ''}</td>
          <td style="text-align:right;padding:10px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${fmt(item.finalPrice || 0)}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <!-- Totals -->
    <div style="text-align:right;margin-bottom:24px;">
      <div style="font-size:12px;color:#64748b;margin-bottom:4px;">${t.subtotal}: ${fmt(quote.subtotal)}</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:4px;">${t.vat} ${quote.vatRate}%: ${fmt(quote.vatAmount)}</div>
      <div style="font-size:20px;font-weight:800;color:#f58220;">${t.total}: ${fmt(quote.grandTotal)}</div>
    </div>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">

    <!-- Terms -->
    <p style="font-size:11px;font-weight:700;color:#64748b;margin:0 0 4px;">${t.terms}</p>
    <p style="font-size:11px;color:#94a3b8;margin:0 0 16px;line-height:1.5;">${t.termsText}</p>

    <p style="font-size:13px;color:#1e293b;margin:20px 0 0;">${t.footer}</p>
  </div>

  <!-- Footer -->
  <div style="padding:14px 24px;background:#f8fafc;border-radius:0 0 12px 12px;text-align:center;">
    <span style="font-size:10px;color:#94a3b8;">${t.powered}</span>
    ${org?.website ? `<span style="font-size:10px;color:#94a3b8;"> · ${org.website}</span>` : ''}
  </div>
</div>
</body>
</html>`;

    // Send via Gmail
    const result = await sendGmail(token, userEmail, to, subject, html, {
      cc: cc || undefined,
      threadId: quote.threadId || undefined,
    });

    if (!result.ok) return NextResponse.json({ error: result.error || 'Send failed' }, { status: 500 });

    // Update quote: status → sent, log email, snapshot company profile
    await prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: quote.status === 'draft' || quote.status === 'new' || quote.status === 'editing' ? 'sent' : quote.status,
        sentAt: new Date(),
        companyProfile: {
          name: org?.name, legalName: org?.legalName, afm: org?.afm, doy: org?.doy,
          address: org?.address, city: org?.city, phone: org?.phone, email: org?.email,
          website: org?.website, logo: org?.logo,
        },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Send quote error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
