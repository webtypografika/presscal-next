import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const quoteId = req.nextUrl.searchParams.get('id');
  if (!quoteId) return new Response('Missing id', { status: 400 });

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, orgId: 'default-org', deletedAt: null },
    include: {
      company: {
        include: {
          companyContacts: {
            where: { isPrimary: true },
            include: { contact: true },
            take: 1,
          },
        },
      },
      contact: true,
      customer: true,
    },
  });
  if (!quote) return new Response('Quote not found', { status: 404 });

  const org = await prisma.org.findUnique({
    where: { id: 'default-org' },
    select: {
      name: true, legalName: true, afm: true, doy: true, gemh: true,
      address: true, city: true, postalCode: true, phone: true, email: true, website: true,
      logo: true, quoteTerms: true,
    },
  });

  const items = Array.isArray(quote.items) ? (quote.items as any[]) : [];
  const customerName = quote.company?.name || (quote as any).contact?.name || quote.customer?.name || '';
  const customerAfm = quote.company?.afm || quote.customer?.afm || '';
  const customerDoy = (quote.company as any)?.doy || '';
  const customerLegalName = (quote.company as any)?.legalName || '';
  const customerAddress = [
    (quote.company as any)?.address,
    (quote.company as any)?.city,
    (quote.company as any)?.zip,
  ].filter(Boolean).join(', ');
  const customerEmail = quote.company?.email || (quote as any).contact?.email || quote.customer?.email || '';
  const customerPhone = quote.company?.phone || (quote as any).contact?.phone || quote.customer?.phone || '';
  const primaryContact = quote.company?.companyContacts?.[0]?.contact;

  const fmt = (n: number) => new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(n);
  const fmtDate = (d: Date) => new Date(d).toLocaleDateString('el-GR');

  // Logo as base64 data URI
  let logoHtml = `<span style="font-size:18px;font-weight:800;">${org?.legalName || org?.name || ''}</span>`;
  try {
    if (org?.logo) {
      const logoPath = path.join(process.cwd(), 'public', org.logo);
      if (fs.existsSync(logoPath)) {
        const buf = fs.readFileSync(logoPath);
        const ext = path.extname(logoPath).replace('.', '');
        const mime = ext === 'svg' ? 'svg+xml' : ext === 'png' ? 'png' : 'jpeg';
        logoHtml = `<img src="data:image/${mime};base64,${buf.toString('base64')}" style="height:44px;width:auto;">`;
      }
    }
  } catch {}

  // Parse terms
  let termsRaw: any = org?.quoteTerms;
  if (typeof termsRaw === 'string') try { termsRaw = JSON.parse(termsRaw); } catch {}
  const terms: string[] = Array.isArray(termsRaw)
    ? termsRaw.map((t: any) => typeof t === 'string' ? t : (t.text || t.title || '')).filter(Boolean)
    : [];

  // Build items rows
  const itemRows = items.map((item: any, i: number) => {
    const unitPrice = item.qty ? (item.finalPrice || 0) / item.qty : 0;
    const desc = item.description ? `<div class="desc">${esc(item.description)}</div>` : '';
    const specs = (item.calcData?.paperName || item.calcData?.colors || item.calcData?.finishing)
      ? `<div class="specs">${esc([item.calcData?.paperName, item.calcData?.colors, item.calcData?.finishing].filter(Boolean).join(' · '))}</div>`
      : '';
    return `<tr>
      <td style="color:#94a3b8">${i + 1}</td>
      <td><div style="font-weight:600">${esc(item.name || '—')}</div>${desc}${specs}</td>
      <td class="r">${item.qty || ''}</td>
      <td class="r">${esc(item.unit || 'τεμ')}</td>
      <td class="r">${item.qty ? fmt(unitPrice) : ''}</td>
      <td class="r" style="font-weight:600">${fmt(item.finalPrice || 0)}</td>
    </tr>`;
  }).join('');

  const termsHtml = terms.length > 0
    ? `<div class="terms">
        <h3>Όροι &amp; Προϋποθέσεις</h3>
        <ol>${terms.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
      </div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Προσφορά ${esc(quote.number)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&subset=greek,latin&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'DM Sans',Arial,Helvetica,sans-serif; color:#1e293b; font-size:11px; line-height:1.5; background:#fff; }
  .page { max-width:210mm; margin:0 auto; padding:16mm 18mm 12mm; }

  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; padding-bottom:14px; border-bottom:2.5px solid #f58220; }
  .quote-badge { text-align:right; }
  .quote-badge .number { font-size:18px; font-weight:800; color:#f58220; }
  .quote-badge .date { font-size:10px; color:#64748b; margin-top:2px; }
  .quote-badge .label { font-size:9px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; }

  .details { display:flex; gap:24px; margin-bottom:20px; }
  .details .col { flex:1; }
  .details .col-title { font-size:8px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px; }
  .details .name { font-size:13px; font-weight:700; margin-bottom:3px; }
  .details .legal { font-size:10px; color:#475569; margin-bottom:2px; }
  .details .info { font-size:10px; color:#475569; line-height:1.7; }
  .details .info span { display:block; }

  .quote-title { font-size:13px; font-weight:600; margin-bottom:12px; color:#334155; }

  table.items { width:100%; border-collapse:collapse; margin-bottom:16px; }
  table.items th { text-align:left; padding:7px 8px; font-size:9px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; border-bottom:2px solid #e2e8f0; background:#f8fafc; }
  table.items th.r { text-align:right; }
  table.items td { padding:8px; font-size:11px; border-bottom:1px solid #f1f5f9; vertical-align:top; }
  table.items td.r { text-align:right; }
  table.items .desc { font-size:9.5px; color:#64748b; margin-top:2px; }
  table.items .specs { font-size:9px; color:#94a3b8; margin-top:1px; }
  table.items tr:last-child td { border-bottom:2px solid #e2e8f0; }

  .totals { display:flex; justify-content:flex-end; margin-bottom:24px; }
  .totals table { border-collapse:collapse; }
  .totals td { padding:3px 10px; font-size:11px; }
  .totals td.label { text-align:right; color:#64748b; }
  .totals td.value { text-align:right; font-weight:600; min-width:90px; }
  .totals .grand td { font-size:15px; font-weight:800; color:#f58220; padding-top:6px; border-top:2px solid #e2e8f0; }

  .terms { margin-bottom:20px; }
  .terms h3 { font-size:9px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px; }
  .terms ol { padding-left:16px; font-size:9.5px; color:#64748b; line-height:1.8; }

  .footer { border-top:1px solid #e2e8f0; padding-top:10px; display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; }

  /* Toolbar */
  .toolbar { position:fixed; top:0; left:0; right:0; z-index:100; background:#1e293b; padding:10px 20px; display:flex; align-items:center; gap:10px; box-shadow:0 2px 12px rgba(0,0,0,0.3); }
  .toolbar button { padding:8px 20px; border-radius:6px; border:none; font-size:13px; font-weight:600; cursor:pointer; font-family:inherit; }
  .btn-back { background:transparent; color:#94a3b8; border:1px solid #475569 !important; }
  .btn-print { background:#f58220; color:#fff; }
  .toolbar .title { color:#cbd5e1; font-size:13px; margin-left:auto; }

  @media screen { .page { margin-top:56px; } }
  @media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .page { padding:10mm 14mm 8mm; max-width:none; margin-top:0; }
    .toolbar { display:none !important; }
    @page { size:A4; margin:0; }
  }
</style>
</head>
<body>

<div class="toolbar">
  <button class="btn-back" onclick="history.back()">← Πίσω</button>
  <button class="btn-print" onclick="window.print()">Εκτύπωση / PDF</button>
  <span class="title">Προσφορά ${esc(quote.number)}</span>
</div>

<div class="page">
  <div class="header">
    <div>${logoHtml}</div>
    <div class="quote-badge">
      <div class="label">Προσφορά</div>
      <div class="number">${esc(quote.number)}</div>
      <div class="date">${fmtDate(quote.date)}</div>
    </div>
  </div>

  <div class="details">
    <div class="col">
      <div class="col-title">Από</div>
      <div class="name">${esc(org?.legalName || org?.name || '')}</div>
      <div class="info">
        ${org?.afm ? `<span>ΑΦΜ: ${esc(org.afm)}${org.doy ? ` · ΔΟΥ: ${esc(org.doy)}` : ''}</span>` : ''}
        ${org?.gemh ? `<span>ΓΕΜΗ: ${esc(org.gemh)}</span>` : ''}
        ${(org?.address || org?.city) ? `<span>${esc([org?.address, org?.city, org?.postalCode].filter(Boolean).join(', '))}</span>` : ''}
        ${org?.phone ? `<span>Τηλ: ${esc(org.phone)}</span>` : ''}
        ${org?.email ? `<span>${esc(org.email)}</span>` : ''}
        ${org?.website ? `<span>${esc(org.website)}</span>` : ''}
      </div>
    </div>
    <div class="col">
      <div class="col-title">Προς</div>
      <div class="name">${esc(customerName || '—')}</div>
      ${customerLegalName && customerLegalName !== customerName ? `<div class="legal">${esc(customerLegalName)}</div>` : ''}
      <div class="info">
        ${customerAfm ? `<span>ΑΦΜ: ${esc(customerAfm)}${customerDoy ? ` · ΔΟΥ: ${esc(customerDoy)}` : ''}</span>` : ''}
        ${customerAddress ? `<span>${esc(customerAddress)}</span>` : ''}
        ${primaryContact ? `<span>Υπόψη: ${esc(primaryContact.name)}${primaryContact.email ? ` · ${esc(primaryContact.email)}` : ''}</span>` : ''}
        ${!primaryContact && customerEmail ? `<span>${esc(customerEmail)}</span>` : ''}
        ${customerPhone ? `<span>Τηλ: ${esc(customerPhone)}</span>` : ''}
      </div>
    </div>
  </div>

  ${quote.title ? `<div class="quote-title">${esc(quote.title)}</div>` : ''}

  <table class="items">
    <thead>
      <tr>
        <th style="width:5%">#</th>
        <th>Περιγραφή</th>
        <th class="r" style="width:10%">Ποσ.</th>
        <th class="r" style="width:10%">Μονάδα</th>
        <th class="r" style="width:14%">Τιμή/μον.</th>
        <th class="r" style="width:14%">Σύνολο</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td class="label">Υποσύνολο</td><td class="value">${fmt(quote.subtotal)}</td></tr>
      <tr><td class="label">ΦΠΑ ${quote.vatRate}%</td><td class="value">${fmt(quote.vatAmount)}</td></tr>
      <tr class="grand"><td class="label">Σύνολο</td><td class="value">${fmt(quote.grandTotal)}</td></tr>
    </table>
  </div>

  ${termsHtml}

  <div class="footer">
    <span>${esc(org?.legalName || org?.name || '')}${org?.afm ? ` · ΑΦΜ ${esc(org.afm)}` : ''}</span>
    <span>${esc(org?.phone || '')}${org?.email ? ` · ${esc(org.email)}` : ''}</span>
  </div>
</div>

</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
