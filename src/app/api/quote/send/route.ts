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
    console.log('quoteTerms from DB:', typeof org?.quoteTerms, JSON.stringify(org?.quoteTerms)?.substring(0, 200));
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
      intro: 'Please find our quote below. To proceed, click the button at the bottom to review and select the products you wish to approve.',
      product: 'Product', qty: 'Qty', price: 'Price',
      subtotal: 'Subtotal', vat: 'VAT', total: 'Total',
      terms: 'Terms & Conditions',
      termsText: 'This quote is valid for 30 days from the date of issue. Prices include delivery within the city. Payment: 50% advance, 50% on delivery.',
      bank: 'Bank Details',
      footer: 'Thank you for your trust.',
      powered: 'Powered by PressCal',
      ctaTitle: 'How to approve this quote',
      ctaStep1: 'Click the button below to open the approval page',
      ctaStep2: 'Select the products you wish to approve',
      ctaStep3: 'Confirm your selection — we will begin production immediately',
      ctaNote: 'Please do not reply to this email. Use the button below to approve.',
      ctaButton: 'Review & Select Products →',
    } : {
      greeting: `Αγαπητέ/ή ${customerName},`,
      intro: 'Σας αποστέλλουμε την προσφορά μας. Για να προχωρήσετε, πατήστε το κουμπί στο τέλος του email για να επιλέξετε τα προϊόντα που εγκρίνετε.',
      product: 'Προϊόν', qty: 'Ποσ.', price: 'Τιμή',
      subtotal: 'Υποσύνολο', vat: 'ΦΠΑ', total: 'Σύνολο',
      terms: 'Όροι & Προϋποθέσεις',
      termsText: 'Η προσφορά ισχύει για 30 ημέρες από την ημερομηνία έκδοσης. Οι τιμές περιλαμβάνουν παράδοση εντός πόλεως. Πληρωμή: 50% προκαταβολή, 50% στην παράδοση.',
      bank: 'Τραπεζικά Στοιχεία',
      footer: 'Ευχαριστούμε για την εμπιστοσύνη σας.',
      powered: 'Powered by PressCal',
      ctaTitle: 'Πώς να εγκρίνετε την προσφορά',
      ctaStep1: 'Πατήστε το παρακάτω κουμπί για να ανοίξετε τη σελίδα έγκρισης',
      ctaStep2: 'Επιλέξτε τα προϊόντα που θέλετε να εγκρίνετε',
      ctaStep3: 'Επιβεβαιώστε την επιλογή σας — θα ξεκινήσουμε αμέσως την παραγωγή',
      ctaNote: 'Παρακαλούμε μην απαντήσετε σε αυτό το email. Χρησιμοποιήστε αποκλειστικά το παρακάτω κουμπί.',
      ctaButton: 'Επιλογή & Έγκριση Προϊόντων →',
    };

    // Format currency
    const fmt = (n: number) => new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(n);

    // Base URL for approve landing page
    const baseUrl = process.env.NEXTAUTH_URL || req.nextUrl.origin;
    const approveAllUrl = `${baseUrl}/api/quote/approve?quoteId=${quoteId}`;

    // Build HTML email
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
<div style="max-width:640px;margin:0 auto;padding:24px;">

  <!-- Header -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px 12px 0 0;border-bottom:1px solid #e2e8f0;">
    <tr>
      <td style="padding:20px 24px;">${logoDataUri ? `<img src="${logoDataUri}" alt="Logo" style="height:36px;width:auto;">` : ''}</td>
      <td style="padding:20px 24px;text-align:right;"><span style="color:#f58220;font-size:14px;font-weight:700;">${quote.number}</span></td>
    </tr>
  </table>

  <!-- Company details -->
  <div style="padding:16px 24px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;">
    <div style="font-weight:800;color:#1e293b;font-size:13px;margin-bottom:8px;">${org?.legalName || org?.name || ''}</div>
    <table style="font-size:11px;color:#64748b;line-height:1.8;">
      ${org?.afm ? `<tr><td style="padding-right:12px;font-weight:600;color:#94a3b8;">ΑΦΜ</td><td>${org.afm}${org.doy ? ` · ΔΟΥ: ${org.doy}` : ''}</td></tr>` : ''}
      ${org?.address || org?.city ? `<tr><td style="padding-right:12px;font-weight:600;color:#94a3b8;">Διεύθυνση</td><td>${[org.address, org.city, org.postalCode].filter(Boolean).join(', ')}</td></tr>` : ''}
      ${org?.phone ? `<tr><td style="padding-right:12px;font-weight:600;color:#94a3b8;">Τηλ</td><td>${org.phone}</td></tr>` : ''}
      ${org?.email || org?.website ? `<tr><td style="padding-right:12px;font-weight:600;color:#94a3b8;">Email</td><td>${[org.email, org.website].filter(Boolean).join(' · ')}</td></tr>` : ''}
    </table>
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

    <!-- CTA Section -->
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px 24px;margin-bottom:24px;">
      <p style="font-size:13px;font-weight:700;color:#15803d;margin:0 0 12px;">${t.ctaTitle}</p>
      <table style="font-size:12px;color:#475569;line-height:1.8;margin-bottom:14px;">
        <tr><td style="padding-right:8px;vertical-align:top;color:#16a34a;font-weight:700;">1.</td><td>${t.ctaStep1}</td></tr>
        <tr><td style="padding-right:8px;vertical-align:top;color:#16a34a;font-weight:700;">2.</td><td>${t.ctaStep2}</td></tr>
        <tr><td style="padding-right:8px;vertical-align:top;color:#16a34a;font-weight:700;">3.</td><td>${t.ctaStep3}</td></tr>
      </table>
      <div style="text-align:center;margin-bottom:12px;">
        <a href="${approveAllUrl}" style="display:inline-block;padding:14px 40px;border-radius:10px;background:#16a34a;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">${t.ctaButton}</a>
      </div>
      <p style="font-size:11px;color:#94a3b8;margin:0;text-align:center;font-style:italic;">⚠ ${t.ctaNote}</p>
    </div>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">

    <!-- Terms -->
    ${(() => {
      let raw = org?.quoteTerms;
      if (typeof raw === 'string') try { raw = JSON.parse(raw); } catch {}
      const terms: string[] = Array.isArray(raw)
        ? raw.map((t: any) => typeof t === 'string' ? t : (t.text || t.title || '')).filter(Boolean)
        : [];
      if (terms.length > 0) {
        return `<p style="font-size:11px;font-weight:700;color:#64748b;margin:0 0 8px;">${t.terms}</p>
        <ol style="font-size:11px;color:#64748b;margin:0 0 16px;padding-left:18px;line-height:1.8;">
          ${terms.map(text => `<li style="margin-bottom:4px;">${text}</li>`).join('')}
        </ol>`;
      }
      return `<p style="font-size:11px;font-weight:700;color:#64748b;margin:0 0 4px;">${t.terms}</p>
    <p style="font-size:11px;color:#94a3b8;margin:0 0 16px;line-height:1.5;">${t.termsText}</p>`;
    })()}

    <p style="font-size:13px;color:#1e293b;margin:20px 0 0;">${t.footer}</p>
  </div>

  <!-- Footer -->
  <div style="padding:14px 24px;background:#f8fafc;border-radius:0 0 12px 12px;text-align:center;border-top:1px solid #e2e8f0;">
    <span style="font-size:10px;color:#94a3b8;">${t.powered} · </span><a href="https://www.presscal.com" style="font-size:10px;color:#94a3b8;">www.presscal.com</a>
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

    // Reset item statuses to pending on re-send
    const resetItems = items.map((item: any) => ({ ...item, status: 'pending' }));

    // Update quote: status → sent, reset items, log email, snapshot company profile
    await prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: 'sent',
        items: resetItems as any,
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
