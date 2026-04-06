import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ORG_ID = 'default-org';
const ELORUS_BASE = 'https://api.elorus.com';

function headers(apiKey: string, orgId: string) {
  return {
    Authorization: `Token ${apiKey}`,
    'X-Elorus-Organization': orgId,
    'Content-Type': 'application/json',
  };
}

// ═══ POST /api/elorus/invoice ═══
// Create invoice from quote
export async function POST(req: NextRequest) {
  try {
    const { quoteId, elorusContactId, clientAfm } = await req.json();
    if (!quoteId) return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 });

    const org = await prisma.org.findUnique({ where: { id: ORG_ID } });
    if (!org?.apiElorus || !org.elorusOrgId) {
      return NextResponse.json({ error: 'Elorus δεν είναι ρυθμισμένο' }, { status: 400 });
    }

    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: { customer: true },
    });
    if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });

    // Already invoiced?
    if (quote.elorusInvoiceId) {
      return NextResponse.json({
        ok: true,
        alreadyExists: true,
        invoiceId: quote.elorusInvoiceId,
        invoiceUrl: quote.elorusInvoiceUrl,
        contactId: quote.elorusContactId,
      });
    }

    const hdrs = headers(org.apiElorus, org.elorusOrgId);

    // Resolve Elorus contact
    let contactId = elorusContactId || '';
    let afm = clientAfm || quote.customer?.afm || '';

    if (!contactId && afm) {
      // Search by AFM
      const searchRes = await fetch(
        `${ELORUS_BASE}/v1.2/contacts/?search=${afm}&page_size=5&is_client=true`,
        { headers: hdrs },
      );
      if (searchRes.ok) {
        const data = await searchRes.json();
        const match = (data.results || []).find((c: Record<string, string>) => c.tin === afm);
        if (match) contactId = match.id;
      }
    }

    // Auto-create contact if needed
    if (!contactId && quote.customer) {
      const payload = {
        client_type: '1',
        company: quote.customer.company || quote.customer.name,
        first_name: quote.customer.company ? '' : quote.customer.name,
        tin: afm || '000000000',
        country: 'GR',
        is_client: true,
        active: true,
        ...(quote.customer.email ? { email: [{ email: quote.customer.email, primary: true }] } : {}),
        ...(quote.customer.phone ? { phones: [{ number: quote.customer.phone, primary: true }] } : {}),
      };
      const createRes = await fetch(`${ELORUS_BASE}/v1.2/contacts/`, {
        method: 'POST', headers: hdrs, body: JSON.stringify(payload),
      });
      if (createRes.ok) {
        const created = await createRes.json();
        contactId = created.id;
      }
    }

    if (!contactId) {
      return NextResponse.json({ error: 'Δεν βρέθηκε ή δημιουργήθηκε επαφή Elorus' }, { status: 400 });
    }

    // Build invoice items
    const quoteItems = Array.isArray(quote.items) ? (quote.items as Record<string, unknown>[]) : [];
    const approvedItems = quote.approvedItems || [];
    const hasPartialApproval = quote.partialApproval && approvedItems.length > 0;

    const invoiceItems = quoteItems
      .filter(item => !hasPartialApproval || approvedItems.includes(item.id as string))
      .map(item => {
        const qty = (item.qty as number) || 1;
        const price = (item.finalPrice as number) || (item.unitPrice as number) || 0;
        const unitValue = qty > 0 ? (price / qty) : price;
        // Map unit to Elorus unit_measure: 1=τεμάχιο, 7=τετραγωνικό μέτρο
        const unitMap: Record<string, string> = { 'τεμ': '1', 'm²': '7', 'φύλ': '1', 'σετ': '1' };
        return {
          title: (item.name as string) || 'Υπηρεσία',
          description: (item.description as string) || '',
          quantity: String(qty),
          unit_measure: unitMap[(item.unit as string) || 'τεμ'] || '1',
          unit_value: unitValue.toFixed(2),
          taxes: org.elorusDefaultTaxId ? [org.elorusDefaultTaxId] : [],
          ...(org.elorusDefaultClassCat ? { mydata_classification_category: org.elorusDefaultClassCat } : {}),
          ...(org.elorusDefaultClassType ? { mydata_classification_type: org.elorusDefaultClassType } : {}),
        };
      });

    // Fallback: single item from subtotal
    if (invoiceItems.length === 0) {
      invoiceItems.push({
        title: quote.title || quote.number,
        description: '',
        quantity: '1',
        unit_value: (quote.subtotal || quote.grandTotal || 0).toFixed(2),
        taxes: org.elorusDefaultTaxId ? [org.elorusDefaultTaxId] : [],
        ...(org.elorusDefaultClassCat ? { mydata_classification_category: org.elorusDefaultClassCat } : {}),
        ...(org.elorusDefaultClassType ? { mydata_classification_type: org.elorusDefaultClassType } : {}),
      });
    }

    // Create invoice (v1.1 — stable)
    const invoicePayload: Record<string, unknown> = {
      calculator_mode: 'initial',
      currency_code: 'EUR',
      client: contactId,
      date: new Date().toISOString().split('T')[0],
      draft: true,
      items: invoiceItems,
    };
    if (afm) invoicePayload.client_vat_number = afm;
    if (org.elorusDefaultDocType) invoicePayload.documenttype = org.elorusDefaultDocType;
    if (org.elorusDefaultMyData) invoicePayload.mydata_document_type = org.elorusDefaultMyData;

    const invRes = await fetch(`${ELORUS_BASE}/v1.1/invoices/`, {
      method: 'POST', headers: hdrs, body: JSON.stringify(invoicePayload),
    });

    if (!invRes.ok) {
      const errText = await invRes.text();
      console.error('Elorus invoice error:', errText);
      return NextResponse.json({ error: `Elorus: ${invRes.status} — ${errText.slice(0, 200)}` }, { status: 500 });
    }

    const invoice = await invRes.json();
    const invoiceId = invoice.id;
    const invoiceUrl = org.elorusOrgSlug
      ? `https://${org.elorusOrgSlug}.elorus.com/invoices/${invoiceId}/`
      : `https://app.elorus.com/invoices/${invoiceId}/`;

    // Save to quote
    await prisma.quote.update({
      where: { id: quoteId },
      data: {
        elorusInvoiceId: invoiceId,
        elorusInvoiceUrl: invoiceUrl,
        elorusContactId: contactId,
      },
    });

    // Save contactId to customer if available
    if (quote.customerId) {
      await prisma.customer.update({
        where: { id: quote.customerId },
        data: { elorusContactId: contactId },
      }).catch(() => { /* non-critical */ });
    }

    return NextResponse.json({
      ok: true,
      invoiceId,
      invoiceUrl,
      contactId,
    });
  } catch (e) {
    console.error('Invoice creation error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
