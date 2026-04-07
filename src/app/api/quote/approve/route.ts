import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';

const fmt = (n: number) => new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(n);

// GET — Landing page with checkboxes
export async function GET(req: NextRequest) {
  try {
    const quoteId = req.nextUrl.searchParams.get('quoteId');
    if (!quoteId) return new Response('Missing quoteId', { status: 400 });

    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: { org: true },
    });
    if (!quote) return new Response('Η προσφορά δεν βρέθηκε', { status: 404 });

    const items = Array.isArray(quote.items) ? (quote.items as any[]) : [];
    const orgName = quote.org?.legalName || quote.org?.name || 'PressCal';
    const logoUrl = quote.org?.logo ? `/${quote.org.logo}` : '';

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Προσφορά ${quote.number}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: #f1f5f9; color: #1e293b; }
  .wrap { max-width: 560px; margin: 32px auto; padding: 0 16px; }
  .card { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { padding: 20px 24px; background: #f8fafc; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; }
  .header .name { color: #1e293b; font-size: 17px; font-weight: 800; display: flex; align-items: center; gap: 10px; }
  .header .num { color: #f58220; font-size: 14px; font-weight: 700; }
  .header img { height: 32px; }
  .body { padding: 24px; }
  .intro { font-size: 14px; color: #64748b; margin-bottom: 20px; line-height: 1.5; }
  .item { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 2px solid #e2e8f0; border-radius: 12px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s; user-select: none; }
  .item:hover { border-color: #94a3b8; }
  .item.checked { border-color: #16a34a; background: #f0fdf4; }
  .item input { width: 20px; height: 20px; accent-color: #16a34a; cursor: pointer; flex-shrink: 0; }
  .item .info { flex: 1; }
  .item .name { font-size: 14px; font-weight: 600; }
  .item .details { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .item .qty { font-size: 13px; color: #64748b; white-space: nowrap; text-align: right; min-width: 60px; }
  .item .price { font-size: 14px; font-weight: 700; color: #1e293b; white-space: nowrap; min-width: 80px; text-align: right; }
  .item .status { font-size: 11px; padding: 2px 8px; border-radius: 6px; font-weight: 600; }
  .status-approved { background: #dcfce7; color: #16a34a; }
  .status-pending { background: #f1f5f9; color: #94a3b8; }
  .totals { text-align: right; padding: 16px 0; border-top: 1px solid #e2e8f0; margin-top: 16px; }
  .totals .sel { font-size: 13px; color: #64748b; margin-bottom: 4px; }
  .totals .grand { font-size: 22px; font-weight: 800; color: #f58220; }
  .actions { display: flex; gap: 8px; margin-top: 20px; }
  .btn { flex: 1; padding: 14px; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.15s; }
  .btn-approve { background: #16a34a; color: #fff; }
  .btn-approve:hover { background: #15803d; }
  .btn-approve:disabled { background: #94a3b8; cursor: not-allowed; }
  .btn-all { background: #e2e8f0; color: #475569; }
  .btn-all:hover { background: #cbd5e1; }
  .footer { padding: 14px 24px; text-align: center; font-size: 11px; color: #94a3b8; background: #f8fafc; }
  .confirmed { text-align: center; padding: 40px 24px; }
  .confirmed .icon { font-size: 48px; margin-bottom: 16px; }
  .confirmed h2 { font-size: 20px; margin-bottom: 8px; }
  .confirmed p { font-size: 13px; color: #64748b; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="header">
      <div class="name">${logoUrl ? `<img src="${logoUrl}" alt="">` : ''} ${orgName}</div>
      <div class="num">${quote.number}</div>
    </div>
    <div class="body" id="form-view">
      <p class="intro">Επιλέξτε τα προϊόντα που εγκρίνετε:</p>
      <form id="approve-form" method="POST" action="/api/quote/approve">
        <input type="hidden" name="quoteId" value="${quoteId}">
        ${items.map((item: any, idx: number) => {
          const already = item.status === 'approved';
          return `
        <label class="item${already ? ' checked' : ''}" id="item-${idx}">
          <input type="checkbox" name="items" value="${idx}" ${already ? 'checked disabled' : ''} onchange="updateUI()">
          <div class="info">
            <div class="name">${item.name || '—'}</div>
            ${item.description ? `<div class="details">${item.description}</div>` : ''}
            ${item.calcData?.paperName || item.calcData?.colors ? `<div class="details">${[item.calcData?.paperName, item.calcData?.colors, item.calcData?.finishing].filter(Boolean).join(' · ')}</div>` : ''}
          </div>
          <div class="qty">${item.qty || ''} ${item.unit || 'τεμ'}</div>
          <div class="price">${fmt(item.finalPrice || 0)}</div>
          ${already ? '<span class="status status-approved">Εγκρίθηκε</span>' : ''}
        </label>`;
        }).join('')}
        <div class="totals">
          <div class="sel" id="sel-count">Επιλεγμένα: 0 / ${items.length}</div>
          <div class="grand" id="sel-total">${fmt(0)}</div>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-all" onclick="toggleAll()">Επιλογή Όλων</button>
          <button type="submit" class="btn btn-approve" id="submit-btn" disabled>Έγκριση Επιλεγμένων</button>
        </div>
      </form>
    </div>
    <div class="footer">Powered by PressCal</div>
  </div>
</div>
<script>
  const prices = [${items.map((i: any) => i.finalPrice || 0).join(',')}];
  const alreadyApproved = [${items.map((i: any) => i.status === 'approved' ? 'true' : 'false').join(',')}];
  const fmtEur = n => new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(n);

  function updateUI() {
    const checks = document.querySelectorAll('input[name="items"]');
    let count = 0, total = 0;
    checks.forEach((cb, i) => {
      const label = document.getElementById('item-' + i);
      if (cb.checked) { count++; total += prices[i]; label.classList.add('checked'); }
      else { label.classList.remove('checked'); if (alreadyApproved[i]) label.classList.add('checked'); }
    });
    document.getElementById('sel-count').textContent = 'Επιλεγμένα: ' + count + ' / ' + ${items.length};
    document.getElementById('sel-total').textContent = fmtEur(total);
    const newChecks = [...checks].filter((cb, i) => cb.checked && !alreadyApproved[i]).length;
    document.getElementById('submit-btn').disabled = newChecks === 0;
    document.getElementById('submit-btn').textContent = newChecks > 0 ? 'Έγκριση ' + newChecks + ' Προϊόντων' : 'Έγκριση Επιλεγμένων';
  }

  function toggleAll() {
    const checks = document.querySelectorAll('input[name="items"]:not(:disabled)');
    const allChecked = [...checks].every(cb => cb.checked);
    checks.forEach(cb => { cb.checked = !allChecked; });
    updateUI();
  }

  updateUI();
</script>
</body></html>`;

    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (e) {
    console.error('Approve GET error:', e);
    return new Response('Error', { status: 500 });
  }
}

// POST — Process approval
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const quoteId = formData.get('quoteId') as string;
    if (!quoteId) return new Response('Missing quoteId', { status: 400 });

    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: { org: true },
    });
    if (!quote) return new Response('Η προσφορά δεν βρέθηκε', { status: 404 });

    const items = Array.isArray(quote.items) ? (quote.items as any[]) : [];
    const approvedIndices = formData.getAll('items').map(v => Number(v)).filter(n => !isNaN(n));

    const updatedItems = items.map((item, idx) => ({
      ...item,
      status: approvedIndices.includes(idx) || item.status === 'approved' ? 'approved' : (item.status || 'pending'),
    }));

    const allApproved = updatedItems.every(i => i.status === 'approved');
    const someApproved = updatedItems.some(i => i.status === 'approved');
    const newStatus = allApproved ? 'approved' : someApproved ? 'partial' : quote.status;

    const data: Record<string, unknown> = { items: updatedItems as any, status: newStatus };

    // Auto-promote to job on full approval
    if (allApproved && quote.status !== 'approved') {
      const org = quote.org;
      const stages = (org?.jobStages as any[]) || [];
      const firstStage = stages[0]?.id || 'files';
      data.jobStage = firstStage;
      data.jobStageUpdatedAt = new Date();
      data.approvedAt = new Date();

      // Compute job folder path
      const fullQuote = await prisma.quote.findUnique({
        where: { id: quoteId },
        select: { number: true, title: true, company: { select: { name: true, folderPath: true } } },
      });
      if (fullQuote) {
        const { buildJobFolderPath } = await import('@/lib/job-folder');
        data.jobFolderPath = buildJobFolderPath({
          globalRoot: (org as any)?.jobFolderRoot || null,
          companyFolderPath: fullQuote.company?.folderPath || null,
          companyName: fullQuote.company?.name || 'Πελάτης',
          quoteNumber: fullQuote.number,
          quoteTitle: fullQuote.title,
        });
      }
    }

    await prisma.quote.update({ where: { id: quoteId }, data });

    const orgName = quote.org?.legalName || quote.org?.name || 'PressCal';

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Επιβεβαίωση — ${quote.number}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: #f1f5f9; color: #1e293b; }
  .wrap { max-width: 500px; margin: 40px auto; padding: 0 16px; }
  .card { background: #fff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); text-align: center; }
  .icon { font-size: 48px; margin-bottom: 16px; }
  h1 { font-size: 22px; margin-bottom: 8px; }
  .sub { color: #64748b; font-size: 14px; margin-bottom: 24px; }
  .items { text-align: left; background: #f8fafc; border-radius: 10px; padding: 16px; margin-bottom: 20px; }
  .row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
  .row:last-child { border: none; }
  .row .icon2 { font-size: 16px; }
  .row .name { flex: 1; font-size: 13px; }
  .row .st { font-size: 11px; font-weight: 600; }
  .thanks { font-size: 12px; color: #94a3b8; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="icon">${allApproved ? '✅' : '📋'}</div>
    <h1>${allApproved ? 'Η προσφορά εγκρίθηκε!' : 'Η επιλογή σας καταχωρήθηκε!'}</h1>
    <p class="sub">${quote.number} — ${orgName}</p>
    <div class="items">
      ${updatedItems.map(i => `
      <div class="row">
        <span class="icon2">${i.status === 'approved' ? '✅' : '⏸️'}</span>
        <span class="name">${i.name}</span>
        <span class="st" style="color:${i.status === 'approved' ? '#16a34a' : '#94a3b8'};">${i.status === 'approved' ? 'Εγκρίθηκε' : 'Σε αναμονή'}</span>
      </div>`).join('')}
    </div>
    <p class="thanks">Ευχαριστούμε! Θα επικοινωνήσουμε μαζί σας σύντομα.</p>
  </div>
</div>
</body></html>`;

    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (e) {
    console.error('Approve POST error:', e);
    return new Response('Error', { status: 500 });
  }
}
