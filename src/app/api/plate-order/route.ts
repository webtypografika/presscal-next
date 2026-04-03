import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { authOptions } from '@/lib/auth';
import { getGmailToken, sendGmail } from '@/lib/gmail';
import { prisma } from '@/lib/db';

export const maxDuration = 30;

const ORG_ID = 'default-org';

interface PlateItem {
  name: string;
  plateSize: string;
  qty: number;
  color?: string;
}

interface PlateOrderPayload {
  orderType: 'platemaker_service' | 'plate_material';
  supplierName: string;
  supplierEmail: string;
  items: PlateItem[];
  jobDescription?: string;
  notes?: string;
  delivery?: 'pickup' | 'deliver';
  // PDF as base64 (platemaker service only)
  pdfBase64?: string;
  pdfFileName?: string;
}

// ═══ GET — list plate orders ═══
export async function GET() {
  const orders = await prisma.plateOrder.findMany({
    where: { orgId: ORG_ID, deletedAt: null },
    select: {
      id: true, orderType: true, status: true,
      supplierName: true, supplierEmail: true,
      items: true, jobDescription: true, pdfFileName: true,
      totalCost: true, notes: true,
      sentAt: true, receivedAt: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return Response.json(orders);
}

// ═══ POST — send plate order email + create record ═══
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as Record<string, unknown>)?.id as string;
    if (!userId) return NextResponse.json({ error: 'Δεν είστε συνδεδεμένος' }, { status: 401 });

    const body = await req.json() as PlateOrderPayload;
    const org = await prisma.org.findUnique({ where: { id: ORG_ID } });

    const accessToken = await getGmailToken(userId);
    if (!accessToken) {
      return NextResponse.json({ error: 'Gmail access δεν βρέθηκε. Κάντε logout/login.' }, { status: 400 });
    }

    const fromEmail = session?.user?.email || '';
    const isService = body.orderType === 'platemaker_service';

    const deliveryText = body.delivery === 'pickup'
      ? 'Θα παραλάβουμε εμείς.'
      : body.delivery === 'deliver'
        ? 'Παρακαλούμε αποστείλατε στη διεύθυνσή μας.'
        : '';

    const itemRows = body.items.map(item => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b">${item.name}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;text-align:center">${item.plateSize}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:700;color:#f58220;text-align:center">${item.qty}</td>
        ${item.color ? `<td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;text-align:center">${item.color}</td>` : ''}
      </tr>
    `).join('');

    const companyBlock = org ? [
      org.legalName, org.afm ? `ΑΦΜ: ${org.afm}` : '',
      org.doy ? `ΔΟΥ: ${org.doy}` : '',
      [org.address, org.city, org.postalCode].filter(Boolean).join(', '),
      org.phone ? `Τηλ: ${org.phone}` : '',
      org.email ? `Email: ${org.email}` : '',
    ].filter(Boolean).map(l => `<div style="font-size:13px;color:#475569;line-height:1.8">${l}</div>`).join('') : '';

    // Logo
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

    const title = isService ? 'Εκτύπωση Τσίγκων' : 'Παραγγελία Τσίγκων';
    const colorCol = body.items.some(i => i.color) ? '<th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0">ΧΡΩΜΑ</th>' : '';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif">
<div style="max-width:640px;margin:20px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

  <div style="background:#ffffff;border-bottom:2px solid #e2e8f0;padding:28px 32px;text-align:center">
    ${logoHtml}
    <h1 style="margin:0;font-size:20px;font-weight:800;color:#1e293b">${title}</h1>
    <p style="margin:6px 0 0;font-size:13px;color:#64748b">Προς: ${body.supplierName}</p>
  </div>

  ${body.jobDescription ? `
  <div style="padding:16px 32px 0">
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px 18px">
      <span style="font-size:11px;font-weight:700;color:#0369a1">ΕΡΓΑΣΙΑ</span>
      <p style="margin:4px 0 0;font-size:14px;color:#0c4a6e">${body.jobDescription}</p>
    </div>
  </div>` : ''}

  <div style="padding:24px 32px">
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0">${isService ? 'ΤΣΙΓΚΟΣ' : 'ΥΛΙΚΟ'}</th>
          <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0">ΔΙΑΣΤΑΣΕΙΣ</th>
          <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0">ΠΟΣΟΤΗΤΑ</th>
          ${colorCol}
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>

  <div style="padding:0 32px 24px">
    ${deliveryText ? `
    <div style="background:#f8fafc;border-radius:8px;padding:14px 18px;margin-bottom:12px">
      <span style="font-size:11px;font-weight:700;color:#64748b">ΠΑΡΑΔΟΣΗ</span>
      <p style="margin:4px 0 0;font-size:14px;color:#1e293b;font-weight:600">${deliveryText}</p>
    </div>` : ''}
    ${body.notes ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px">
      <span style="font-size:11px;font-weight:700;color:#92400e">ΣΗΜΕΙΩΣΕΙΣ</span>
      <p style="margin:4px 0 0;font-size:14px;color:#78350f">${body.notes}</p>
    </div>` : ''}
    ${isService && body.pdfFileName ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;margin-top:12px">
      <span style="font-size:11px;font-weight:700;color:#166534">ΣΥΝΗΜΜΕΝΟ</span>
      <p style="margin:4px 0 0;font-size:14px;color:#14532d"><i>📎</i> ${body.pdfFileName}</p>
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

    const subject = `${title}${org?.legalName ? ` — ${org.legalName}` : ''}`;

    // Attachments
    const attachments: Array<{ filename: string; mimeType: string; data: string }> = [];
    if (isService && body.pdfBase64 && body.pdfFileName) {
      attachments.push({
        filename: body.pdfFileName,
        mimeType: 'application/pdf',
        data: body.pdfBase64,
      });
    }

    const result = await sendGmail(accessToken, fromEmail, body.supplierEmail, subject, html,
      attachments.length > 0 ? { attachments } : undefined,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Create order record
    const order = await prisma.plateOrder.create({
      data: {
        orgId: ORG_ID,
        orderType: body.orderType,
        status: 'sent',
        supplierName: body.supplierName,
        supplierEmail: body.supplierEmail,
        items: body.items as any,
        jobDescription: body.jobDescription || null,
        pdfFileName: body.pdfFileName || null,
        notes: body.notes || '',
        sentAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, orderId: order.id });
  } catch (e) {
    console.error('Plate order error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// ═══ PATCH — update order status ═══
export async function PATCH(req: NextRequest) {
  try {
    const { id, status } = await req.json();
    const data: Record<string, unknown> = { status };
    if (status === 'received') data.receivedAt = new Date();
    await prisma.plateOrder.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
