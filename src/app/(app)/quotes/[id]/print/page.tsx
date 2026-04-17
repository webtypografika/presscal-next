export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import fs from 'fs';
import path from 'path';
import { PrintToolbar } from './print-toolbar';

export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const quote = await prisma.quote.findFirst({
    where: { id, orgId: 'default-org', deletedAt: null },
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
  if (!quote) redirect('/quotes');

  const org = await prisma.org.findUnique({
    where: { id: 'default-org' },
    select: {
      name: true, legalName: true, afm: true, doy: true, gemh: true, profession: true,
      address: true, city: true, postalCode: true, phone: true, email: true, website: true,
      logo: true, quoteTerms: true,
    },
  });

  const items = Array.isArray(quote.items) ? (quote.items as any[]) : [];
  const customerName = quote.company?.name || (quote as any).contact?.name || quote.customer?.name || '';
  const customerAfm = quote.company?.afm || quote.customer?.afm || '';
  const customerDoy = (quote.company as any)?.doy || '';
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

  // Parse terms
  let termsRaw = org?.quoteTerms;
  if (typeof termsRaw === 'string') try { termsRaw = JSON.parse(termsRaw); } catch {}
  const terms: string[] = Array.isArray(termsRaw)
    ? termsRaw.map((t: any) => typeof t === 'string' ? t : (t.text || t.title || '')).filter(Boolean)
    : [];

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>Προσφορά {quote.number}</title>
        <style dangerouslySetInnerHTML={{ __html: `
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
            color: #1e293b; font-size: 11px; line-height: 1.5;
            background: #fff;
          }
          .page {
            max-width: 210mm; margin: 0 auto; padding: 16mm 18mm 12mm;
          }

          /* Header */
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #f58220; }
          .logo img { height: 44px; width: auto; }
          .quote-badge { text-align: right; }
          .quote-badge .number { font-size: 18px; font-weight: 800; color: #f58220; }
          .quote-badge .date { font-size: 10px; color: #64748b; margin-top: 2px; }
          .quote-badge .label { font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }

          /* Two-column details */
          .details { display: flex; gap: 24px; margin-bottom: 20px; }
          .details .col { flex: 1; }
          .details .col-title { font-size: 8px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
          .details .name { font-size: 13px; font-weight: 700; margin-bottom: 3px; }
          .details .info { font-size: 10px; color: #475569; line-height: 1.7; }
          .details .info span { display: block; }

          /* Items table */
          table.items { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          table.items th {
            text-align: left; padding: 7px 8px; font-size: 9px; font-weight: 700;
            color: #64748b; text-transform: uppercase; letter-spacing: 0.04em;
            border-bottom: 2px solid #e2e8f0; background: #f8fafc;
          }
          table.items th.r { text-align: right; }
          table.items td { padding: 8px; font-size: 11px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
          table.items td.r { text-align: right; }
          table.items .desc { font-size: 9.5px; color: #64748b; margin-top: 2px; }
          table.items .specs { font-size: 9px; color: #94a3b8; margin-top: 1px; }
          table.items tr:last-child td { border-bottom: 2px solid #e2e8f0; }

          /* Totals */
          .totals { display: flex; justify-content: flex-end; margin-bottom: 24px; }
          .totals table { border-collapse: collapse; }
          .totals td { padding: 3px 10px; font-size: 11px; }
          .totals td.label { text-align: right; color: #64748b; }
          .totals td.value { text-align: right; font-weight: 600; min-width: 90px; }
          .totals .grand td { font-size: 15px; font-weight: 800; color: #f58220; padding-top: 6px; border-top: 2px solid #e2e8f0; }

          /* Terms */
          .terms { margin-bottom: 20px; }
          .terms h3 { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
          .terms ol { padding-left: 16px; font-size: 9.5px; color: #64748b; line-height: 1.8; }

          /* Footer */
          .footer { border-top: 1px solid #e2e8f0; padding-top: 10px; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }

          /* Print styles */
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page { padding: 10mm 14mm 8mm; max-width: none; }
            .no-print { display: none !important; }
            @page { size: A4; margin: 0; }
          }

          @media print { .no-print { display: none !important; } }
          @media screen { .page { margin-top: 56px; } }
        `}} />
      </head>
      <body>
        {/* Toolbar — hidden on print */}
        <PrintToolbar quoteNumber={quote.number} />

        <div className="page">
          {/* Header */}
          <div className="header">
            <div className="logo">
              {logoDataUri && <img src={logoDataUri} alt="Logo" />}
              {!logoDataUri && <span style={{ fontSize: 16, fontWeight: 800 }}>{org?.legalName || org?.name || ''}</span>}
            </div>
            <div className="quote-badge">
              <div className="label">Προσφορά</div>
              <div className="number">{quote.number}</div>
              <div className="date">{fmtDate(quote.date)}</div>
            </div>
          </div>

          {/* Company + Customer details */}
          <div className="details">
            <div className="col">
              <div className="col-title">Από</div>
              <div className="name">{org?.legalName || org?.name || ''}</div>
              <div className="info">
                {org?.afm && <span>ΑΦΜ: {org.afm}{org.doy ? ` · ΔΟΥ: ${org.doy}` : ''}</span>}
                {org?.gemh && <span>ΓΕΜΗ: {org.gemh}</span>}
                {(org?.address || org?.city) && <span>{[org.address, org.city, org.postalCode].filter(Boolean).join(', ')}</span>}
                {org?.phone && <span>Τηλ: {org.phone}</span>}
                {org?.email && <span>{org.email}</span>}
                {org?.website && <span>{org.website}</span>}
              </div>
            </div>
            <div className="col">
              <div className="col-title">Προς</div>
              <div className="name">{customerName || '—'}</div>
              <div className="info">
                {customerAfm && <span>ΑΦΜ: {customerAfm}{customerDoy ? ` · ΔΟΥ: ${customerDoy}` : ''}</span>}
                {customerAddress && <span>{customerAddress}</span>}
                {primaryContact && <span>Υπόψη: {primaryContact.name}{primaryContact.email ? ` · ${primaryContact.email}` : ''}</span>}
                {!primaryContact && customerEmail && <span>{customerEmail}</span>}
                {customerPhone && <span>Τηλ: {customerPhone}</span>}
              </div>
            </div>
          </div>

          {/* Quote title */}
          {quote.title && (
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#334155' }}>
              {quote.title}
            </div>
          )}

          {/* Items table */}
          <table className="items">
            <thead>
              <tr>
                <th style={{ width: '5%' }}>#</th>
                <th>Περιγραφή</th>
                <th className="r" style={{ width: '10%' }}>Ποσ.</th>
                <th className="r" style={{ width: '10%' }}>Μονάδα</th>
                <th className="r" style={{ width: '14%' }}>Τιμή/μον.</th>
                <th className="r" style={{ width: '14%' }}>Σύνολο</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, i: number) => {
                const unitPrice = item.qty ? (item.finalPrice || 0) / item.qty : 0;
                return (
                  <tr key={i}>
                    <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.name || '—'}</div>
                      {item.description && <div className="desc">{item.description}</div>}
                      {(item.calcData?.paperName || item.calcData?.colors || item.calcData?.finishing) && (
                        <div className="specs">{[item.calcData?.paperName, item.calcData?.colors, item.calcData?.finishing].filter(Boolean).join(' · ')}</div>
                      )}
                    </td>
                    <td className="r">{item.qty || ''}</td>
                    <td className="r">{item.unit || 'τεμ'}</td>
                    <td className="r">{item.qty ? fmt(unitPrice) : ''}</td>
                    <td className="r" style={{ fontWeight: 600 }}>{fmt(item.finalPrice || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals */}
          <div className="totals">
            <table>
              <tbody>
                <tr>
                  <td className="label">Υποσύνολο</td>
                  <td className="value">{fmt(quote.subtotal)}</td>
                </tr>
                <tr>
                  <td className="label">ΦΠΑ {quote.vatRate}%</td>
                  <td className="value">{fmt(quote.vatAmount)}</td>
                </tr>
                <tr className="grand">
                  <td className="label">Σύνολο</td>
                  <td className="value">{fmt(quote.grandTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Terms */}
          {terms.length > 0 && (
            <div className="terms">
              <h3>Όροι & Προϋποθέσεις</h3>
              <ol>
                {terms.map((t, i) => <li key={i}>{t}</li>)}
              </ol>
            </div>
          )}

          {/* Footer */}
          <div className="footer">
            <span>{org?.legalName || org?.name || ''}{org?.afm ? ` · ΑΦΜ ${org.afm}` : ''}</span>
            <span>{org?.phone || ''}{org?.email ? ` · ${org.email}` : ''}</span>
          </div>
        </div>
      </body>
    </html>
  );
}
