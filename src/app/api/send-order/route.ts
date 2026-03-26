import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { authOptions } from '@/lib/auth';
import { getGmailToken, sendGmail } from '@/lib/gmail';
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
    const session = await getServerSession(authOptions);
    const userId = (session?.user as Record<string, unknown>)?.id as string;
    if (!userId) return NextResponse.json({ error: 'Δεν είστε συνδεδεμένος' }, { status: 401 });

    const body = await req.json() as OrderPayload;
    const org = await prisma.org.findUnique({ where: { id: ORG_ID } });

    // Get Gmail token from user's OAuth
    const accessToken = await getGmailToken(userId);
    if (!accessToken) {
      return NextResponse.json({ error: 'Gmail access δεν βρέθηκε. Κάντε logout και login ξανά για να δώσετε permission αποστολής email.' }, { status: 400 });
    }

    const fromEmail = session?.user?.email || '';
    const deliveryText = body.delivery === 'pickup'
      ? 'Θα παραλάβουμε εμείς.'
      : 'Παρακαλούμε αποστείλατε στη διεύθυνσή μας.';

    const itemRows = body.items.map(item => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b">${item.name}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;text-align:center">${item.dims}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:700;color:#f58220;text-align:center">${item.qty || '—'}</td>
      </tr>
    `).join('');

    const companyBlock = org ? [
      org.legalName, org.afm ? `ΑΦΜ: ${org.afm}` : '',
      org.doy ? `ΔΟΥ: ${org.doy}` : '',
      [org.address, org.city, org.postalCode].filter(Boolean).join(', '),
      org.phone ? `Τηλ: ${org.phone}` : '',
      org.email ? `Email: ${org.email}` : '',
    ].filter(Boolean).map(l => `<div style="font-size:13px;color:#475569;line-height:1.8">${l}</div>`).join('') : '';

    // Embed logo as base64 data URI for email compatibility
    let logoHtml = '';
    if (org?.logo) {
      try {
        const logoPath = org.logo.startsWith('/') ? org.logo.split('?')[0] : org.logo;
        if (logoPath.startsWith('/uploads/')) {
          const filePath = join(process.cwd(), 'public', logoPath);
          const fileBuffer = await readFile(filePath);
          const ext = logoPath.split('.').pop() || 'png';
          const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
          const b64 = fileBuffer.toString('base64');
          logoHtml = `<img src="data:${mime};base64,${b64}" alt="${org.legalName || ''}" style="max-height:60px;max-width:200px;margin-bottom:10px" />`;
        } else if (org.logo.startsWith('data:')) {
          logoHtml = `<img src="${org.logo}" alt="${org.legalName || ''}" style="max-height:60px;max-width:200px;margin-bottom:10px" />`;
        }
      } catch { /* no logo */ }
    }

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif">
<div style="max-width:640px;margin:20px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

  <div style="background:#ffffff;border-bottom:2px solid #e2e8f0;padding:28px 32px;text-align:center">
    ${logoHtml}
    <h1 style="margin:0;font-size:20px;font-weight:800;color:#1e293b">Παραγγελία Χαρτιών</h1>
    <p style="margin:6px 0 0;font-size:13px;color:#64748b">Προς: ${body.supplier}</p>
  </div>

  <div style="padding:24px 32px">
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0">ΧΑΡΤΙ</th>
          <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0">ΔΙΑΣΤΑΣΕΙΣ</th>
          <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0">ΠΟΣΟΤΗΤΑ</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>

  <div style="padding:0 32px 24px">
    <div style="background:#f8fafc;border-radius:8px;padding:14px 18px;margin-bottom:12px">
      <span style="font-size:11px;font-weight:700;color:#64748b">ΠΑΡΑΔΟΣΗ</span>
      <p style="margin:4px 0 0;font-size:14px;color:#1e293b;font-weight:600">${deliveryText}</p>
    </div>
    ${body.notes ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px">
      <span style="font-size:11px;font-weight:700;color:#92400e">ΣΗΜΕΙΩΣΕΙΣ</span>
      <p style="margin:4px 0 0;font-size:14px;color:#78350f">${body.notes}</p>
    </div>` : ''}
  </div>

  <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px">
    <div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.05em;margin-bottom:6px">ΣΤΟΙΧΕΙΑ ΑΠΟΣΤΟΛΕΑ</div>
    ${companyBlock}
  </div>

  <div style="text-align:center;padding:14px;background:#f8fafc;border-top:1px solid #e2e8f0">
    <span style="font-size:11px;color:#94a3b8">Powered by <a href="https://www.presscal.com" style="color:#f58220;font-weight:700;text-decoration:none">PressCal Pro</a></span>
  </div>
</div>
</body>
</html>`;

    const subject = `Παραγγελία Χαρτιών${org?.legalName ? ` — ${org.legalName}` : ''}`;
    const result = await sendGmail(accessToken, fromEmail, body.to, subject, html);

    if (result.ok) {
      return NextResponse.json({ ok: true });
    } else {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
  } catch (e) {
    console.error('Send order error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
