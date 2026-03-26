import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { prisma } from '@/lib/db';

const ORG_ID = 'default-org';

interface OrderItem {
  name: string;
  dims: string;
  qty: string;
}

interface OrderPayload {
  to: string;
  supplier: string;
  items: OrderItem[];
  delivery: 'pickup' | 'deliver';
  notes: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as OrderPayload;
    const org = await prisma.org.findUnique({ where: { id: ORG_ID } });
    if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 500 });

    const gmailUser = org.email;
    const gmailPass = org.apiGmail;
    if (!gmailUser || !gmailPass) {
      return NextResponse.json({ error: 'Ρυθμίστε Gmail email & App Password στις Ρυθμίσεις → Ενσωματώσεις' }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailPass },
    });

    const deliveryText = body.delivery === 'pickup'
      ? 'Θα παραλάβουμε εμείς.'
      : `Παρακαλούμε αποστείλατε στη διεύθυνσή μας.`;

    const itemRows = body.items.map(item => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b">${item.name}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;text-align:center">${item.dims}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:700;color:#f58220;text-align:center">${item.qty || '—'}</td>
      </tr>
    `).join('');

    const companyBlock = [
      org.legalName, org.afm ? `ΑΦΜ: ${org.afm}` : '',
      org.doy ? `ΔΟΥ: ${org.doy}` : '',
      [org.address, org.city, org.postalCode].filter(Boolean).join(', '),
      org.phone ? `Τηλ: ${org.phone}` : '',
      org.email ? `Email: ${org.email}` : '',
    ].filter(Boolean).map(l => `<div style="font-size:13px;color:#475569;line-height:1.8">${l}</div>`).join('');

    const logoHtml = org.logo
      ? `<img src="${org.logo}" alt="${org.legalName || ''}" style="max-height:60px;max-width:200px;margin-bottom:10px" />`
      : '';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif">
<div style="max-width:640px;margin:20px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:28px 32px;text-align:center">
    ${logoHtml}
    <h1 style="margin:0;font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.02em">Παραγγελία Χαρτιών</h1>
    <p style="margin:6px 0 0;font-size:13px;color:#94a3b8">Προς: ${body.supplier}</p>
  </div>

  <!-- Items table -->
  <div style="padding:24px 32px">
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0">Χαρτί</th>
          <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0">Διαστάσεις</th>
          <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0">Ποσότητα</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
  </div>

  <!-- Delivery + Notes -->
  <div style="padding:0 32px 24px">
    <div style="background:#f8fafc;border-radius:8px;padding:14px 18px;margin-bottom:12px">
      <span style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em">Παράδοση</span>
      <p style="margin:4px 0 0;font-size:14px;color:#1e293b;font-weight:600">${deliveryText}</p>
    </div>
    ${body.notes ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px">
      <span style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.04em">Σημειώσεις</span>
      <p style="margin:4px 0 0;font-size:14px;color:#78350f">${body.notes}</p>
    </div>
    ` : ''}
  </div>

  <!-- Company info footer -->
  <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px">
    <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Στοιχεία Αποστολέα</div>
    ${companyBlock}
  </div>

  <!-- Branding -->
  <div style="text-align:center;padding:14px;background:#1e293b">
    <span style="font-size:11px;color:#475569">Powered by <strong style="color:#f58220">PressCal Pro</strong></span>
  </div>
</div>
</body>
</html>`;

    await transporter.sendMail({
      from: `"${org.legalName || 'PressCal'}" <${gmailUser}>`,
      to: body.to,
      subject: `Παραγγελία Χαρτιών — ${org.legalName || 'PressCal'}`,
      html,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Send order error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
