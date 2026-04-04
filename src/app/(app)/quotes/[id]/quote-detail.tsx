'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { Quote, Customer, Company, Material, Org } from '@/generated/prisma/client';
import { updateQuote, updateQuoteStatus, deleteQuote, linkEmailToQuote, createCustomer, updateCustomer } from '../actions';

type QuoteWithCustomer = Quote & { customer: Customer | null; company: Company | null };

// ─── TOAST ───
type ToastType = 'success' | 'error' | 'info';
interface ToastData { message: string; type: ToastType; id: number; }
let toastId = 0;

function Toast({ toast: t, onRemove }: { toast: ToastData; onRemove: () => void }) {
  useEffect(() => { const x = setTimeout(onRemove, t.type === 'error' ? 5000 : 3000); return () => clearTimeout(x); }, [t, onRemove]);
  const c = { success: { bg: 'var(--success)', icon: 'fa-check-circle' }, error: { bg: 'var(--danger)', icon: 'fa-exclamation-circle' }, info: { bg: 'var(--blue)', icon: 'fa-info-circle' } }[t.type];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderRadius: 10, background: 'rgb(20,30,55)', border: `1px solid ${c.bg}`, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', animation: 'fadeIn 0.3s ease', minWidth: 280 }}>
      <i className={`fas ${c.icon}`} style={{ color: c.bg, fontSize: '1rem' }} />
      <span style={{ fontSize: '0.92rem', color: 'var(--text)', flex: 1 }}>{t.message}</span>
      <button onClick={onRemove} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.92rem' }}>&times;</button>
    </div>
  );
}
function ToastContainer({ toasts, onRemove }: { toasts: ToastData[]; onRemove: (id: number) => void }) {
  if (!toasts.length) return null;
  return createPortal(<div style={{ position: 'fixed', bottom: 80, right: 20, zIndex: 300, display: 'flex', flexDirection: 'column', gap: 8 }}>{toasts.map(t => <Toast key={t.id} toast={t} onRemove={() => onRemove(t.id)} />)}</div>, document.body);
}

// ─── STATUS ───
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Πρόχειρη', color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' },
  new: { label: 'Νέα', color: '#fb923c', bg: 'rgba(245,130,32,0.12)' },
  editing: { label: 'Σε Επεξεργασία', color: 'var(--accent)', bg: 'rgba(245,130,32,0.12)' },
  sent: { label: 'Εστάλη', color: '#60a5fa', bg: 'rgba(59,130,246,0.12)' },
  approved: { label: 'Εγκρίθηκε', color: '#34d399', bg: 'rgba(16,185,129,0.12)' },
  partial: { label: 'Μερική Έγκριση', color: '#a78bfa', bg: 'rgba(124,58,237,0.12)' },
  rejected: { label: 'Απορρίφθηκε', color: '#f06548', bg: 'rgba(240,101,72,0.12)' },
  completed: { label: 'Ολοκληρώθηκε', color: '#34d399', bg: 'rgba(16,185,129,0.12)' },
  cancelled: { label: 'Ακυρώθηκε', color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' },
};

// Status flow progress
const STATUS_STEPS = ['draft', 'editing', 'sent', 'approved', 'completed'];

function formatCurrency(n: number) {
  return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(n);
}

function initials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/** Build calculator URL from quote item data */
function calcUrl(item: Record<string, unknown>, quoteId: string) {
  const p = new URLSearchParams();
  const cd = item.calcData as Record<string, unknown> | undefined;

  // ─── If calcData exists (previously costed), pass all specs for full restore ───
  if (cd?.machineId) {
    // Job
    if (cd.width) p.set('w', String(cd.width));
    if (cd.height) p.set('h', String(cd.height));
    if (cd.qty) p.set('qty', String(cd.qty));
    if (cd.sides) p.set('sides', String(cd.sides));
    if (cd.pages) p.set('pages', String(cd.pages));
    if (cd.archetype) p.set('archetype', cd.archetype as string);
    // Machine & paper
    p.set('machineId', cd.machineId as string);
    if (cd.paperId) p.set('paperId', cd.paperId as string);
    if (cd.productId) p.set('productId', cd.productId as string);
    if (cd.feedEdge) p.set('feedEdge', cd.feedEdge as string);
    if (cd.machineSheetW) p.set('machineSheetW', String(cd.machineSheetW));
    if (cd.machineSheetH) p.set('machineSheetH', String(cd.machineSheetH));
    // Color
    if (cd.colorMode) p.set('colorMode', cd.colorMode as string);
    if (cd.bleed != null) p.set('bleed', String(cd.bleed));
    if (cd.coverageLevel) p.set('coverageLevel', cd.coverageLevel as string);
    if (cd.offsetFrontCmyk != null) p.set('colorsF', String(cd.offsetFrontCmyk));
    if (cd.offsetBackCmyk != null) p.set('colorsB', String(cd.offsetBackCmyk));
    if (cd.offsetFrontPms) p.set('pmsFront', String(cd.offsetFrontPms));
    if (cd.offsetBackPms) p.set('pmsBack', String(cd.offsetBackPms));
    if (cd.offsetOilVarnish) p.set('oilVarnish', '1');
    // Imposition
    if (cd.impositionMode) p.set('impoMode', cd.impositionMode as string);
    if (cd.impoRotation) p.set('impoRotation', String(cd.impoRotation));
    if (cd.impoGutter) p.set('impoGutter', String(cd.impoGutter));
    if (cd.impoForceUps) p.set('impoForceUps', String(cd.impoForceUps));
    if (cd.impoForceCols) p.set('impoForceCols', String(cd.impoForceCols));
    if (cd.impoForceRows) p.set('impoForceRows', String(cd.impoForceRows));
    if (cd.impoDuplexOrient) p.set('impoDuplexOrient', cd.impoDuplexOrient as string);
    if (cd.impoTurnType) p.set('impoTurnType', cd.impoTurnType as string);
    if (cd.wasteFixed) p.set('wasteFixed', String(cd.wasteFixed));
    // Finishing
    if (cd.guillotineId) p.set('guillotineId', cd.guillotineId as string);
    if (cd.lamMachineId) p.set('lamMachineId', cd.lamMachineId as string);
    if (cd.lamFilmId) p.set('lamFilmId', cd.lamFilmId as string);
    if (cd.lamSides) p.set('lamSides', String(cd.lamSides));
    if (cd.bindingType) p.set('bindingType', cd.bindingType as string);
    if (cd.bindingMachineId) p.set('bindingMachineId', cd.bindingMachineId as string);
    if (cd.overrides && Object.values(cd.overrides as Record<string, unknown>).some(v => v != null && v !== 0)) {
      p.set('overrides', JSON.stringify(cd.overrides));
    }
  } else {
    // ─── No calcData: use AI-parsed + linkedFile hints (first-time costing) ───
    const ai = item.aiParsed as Record<string, unknown> | undefined;
    const dimStr = (ai?.dimensions as string) || '';
    const dimMatch = dimStr.match(/([\d.]+)\s*[x×]\s*([\d.]+)\s*(cm|mm)?/i);
    if (dimMatch) {
      let w = parseFloat(dimMatch[1]);
      let h = parseFloat(dimMatch[2]);
      if (dimMatch[3]?.toLowerCase() === 'cm') { w *= 10; h *= 10; }
      p.set('w', String(Math.round(w)));
      p.set('h', String(Math.round(h)));
    }
    const qty = (ai?.quantity as number) || (item.qty as number) || 0;
    if (qty > 0) p.set('qty', String(qty));
    const colorsStr = (ai?.colors as string) || '';
    const colMatch = colorsStr.match(/(\d+)\s*\/\s*(\d+)/);
    if (colMatch) {
      const back = parseInt(colMatch[2]);
      p.set('sides', back > 0 ? '2' : '1');
      p.set('colorsF', colMatch[1]);
      p.set('colorsB', colMatch[2]);
    }
    if (ai?.paperType) p.set('paper', ai.paperType as string);
    if (ai?.finishing && Array.isArray(ai.finishing) && ai.finishing.length) {
      p.set('finishing', (ai.finishing as string[]).join(','));
    }
    if (ai?.description) p.set('desc', ai.description as string);
  }

  // Linked file data — always apply (overrides dimensions)
  const lf = item.linkedFile as Record<string, unknown> | undefined;
  if (lf) {
    if (lf.width && lf.height) {
      p.set('w', String(lf.width));
      p.set('h', String(lf.height));
    }
    if (lf.pages) p.set('pages', String(lf.pages));
    if (lf.colors) {
      const c = lf.colors as string;
      if (c.includes('/')) {
        const cm = c.match(/(\d+)\s*\/\s*(\d+)/);
        if (cm) { p.set('colorsF', cm[1]); p.set('colorsB', cm[2]); p.set('sides', parseInt(cm[2]) > 0 ? '2' : '1'); }
      }
    }
    if (lf.bleed) p.set('bleed', String(lf.bleed));
    if (lf.path) p.set('filePath', lf.path as string);
    if (lf.name) p.set('fileName', lf.name as string);
  }

  // Link back to quote
  p.set('quoteId', quoteId);
  if (item.id) p.set('itemId', item.id as string);

  return `/calculator?${p.toString()}`;
}

function emptyItem() {
  return { id: crypto.randomUUID(), name: '', type: 'manual' as const, qty: 1, unit: 'τεμ', unitPrice: 0, finalPrice: 0, cost: 0, profit: 0, notes: '', status: 'pending' };
}

/** Convert AI parsed product to a rich line item */
function aiToItem(ai: any) {
  // Build descriptive name: "Πανό 250×50cm 4/0 — Λευκό βινύλιο"
  const nameParts = [ai.description || 'Προϊόν'];
  if (ai.dimensions) nameParts.push(ai.dimensions);
  if (ai.colors) nameParts.push(ai.colors);
  const name = nameParts.join(' ');

  // Paper/material + finishing in notes
  const notesParts = [];
  if (ai.paperType) notesParts.push(`Χαρτί: ${ai.paperType}`);
  if (ai.finishing?.length) notesParts.push(`Φινίρισμα: ${ai.finishing.join(', ')}`);
  if (ai.specialNotes) notesParts.push(ai.specialNotes);

  return {
    id: crypto.randomUUID(),
    name,
    type: 'manual' as const,
    qty: ai.quantity || 1,
    unit: 'τεμ',
    unitPrice: 0,
    finalPrice: 0,
    cost: 0,
    profit: 0,
    status: 'pending',
    notes: notesParts.join(' · '),
    aiParsed: ai,
  };
}

// ─── MAIN COMPONENT ───
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props { quote: QuoteWithCustomer; customers: any[]; elorusConfigured?: boolean; elorusSlug?: string; courierConfigured?: boolean; materials?: Material[]; org?: Pick<Org, 'legalName' | 'afm' | 'doy' | 'address' | 'city' | 'postalCode' | 'phone' | 'email'> | null; }

export function QuoteDetail({ quote: initial, customers, elorusConfigured, elorusSlug, courierConfigured, materials = [], org }: Props) {
  const router = useRouter();
  const [quote, setQuote] = useState(initial);
  const [items, setItems] = useState<any[]>(() => Array.isArray(initial.items) && (initial.items as any[]).length > 0 ? initial.items as any[] : []);
  const [title, setTitle] = useState(initial.title ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [vatRate, setVatRate] = useState(initial.vatRate ?? 24);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [customerId, setCustomerId] = useState(initial.companyId ?? initial.customerId ?? '');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showCourierModal, setShowCourierModal] = useState(false);
  const [courierVoucher, setCourierVoucher] = useState(quote.courierVoucherId || '');
  const [leftTab, setLeftTab] = useState<'email' | 'files'>((quote as any).fileLinks?.length > 0 ? 'files' : 'email');
  const [courierStatus, setCourierStatus] = useState(quote.courierStatus || '');
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    setToasts(prev => [...prev, { message, type, id: ++toastId }]);
  }, []);
  const removeToast = useCallback((id: number) => { setToasts(prev => prev.filter(t => t.id !== id)); }, []);

  // Computed
  const subtotal = items.reduce((s, i) => s + (i.finalPrice || 0), 0);
  const vatAmount = subtotal * vatRate / 100;
  const grandTotal = subtotal + vatAmount;
  const totalCost = items.reduce((s, i) => s + (i.cost || 0), 0);
  const totalProfit = subtotal - totalCost;

  const st = STATUS_MAP[quote.status] ?? STATUS_MAP.draft;
  const selectedCompany = customers.find((c: any) => c.id === customerId) ?? quote.company;
  const selectedCustomer = selectedCompany; // backward compat alias
  const primaryContact = selectedCompany?.companyContacts?.find((cc: any) => cc.isPrimary)?.contact;
  const customerName = selectedCompany?.name ?? quote.customer?.name ?? '—';

  // Autosave with debounce (1s after last change)
  const mountedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { mountedRef.current = true; }, []);

  // Refresh items from DB (called after file link via Helper)
  const refreshLinkedFiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/quotes/${quote.id}/items`)
      if (!res.ok) return
      const data = await res.json()
      if (!data.items) return
      setItems(prev => prev.map(item => {
        const remote = (data.items as any[]).find((r: any) => r.id === item.id)
        if (remote?.linkedFile && JSON.stringify(remote.linkedFile) !== JSON.stringify(item.linkedFile)) {
          return { ...item, linkedFile: remote.linkedFile }
        }
        return item
      }))
    } catch {}
  }, [quote.id])

  // Refresh on page focus (when Helper opens the page with ?refresh=)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('refresh')) {
      refreshLinkedFiles()
      // Clean URL
      window.history.replaceState({}, '', `/quotes/${quote.id}`)
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mountedRef.current) return;
    setDirty(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => { save(); }, 1000);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, title, notes, vatRate, customerId]);

  function updateItem(idx: number, field: string, value: any) {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const u = { ...item, [field]: value };
      if (field === 'qty' || field === 'unitPrice') { u.finalPrice = (u.qty || 0) * (u.unitPrice || 0); u.profit = u.finalPrice - (u.cost || 0); }
      if (field === 'finalPrice') { u.unitPrice = (u.qty || 0) > 0 ? Math.round(((u.finalPrice || 0) / u.qty) * 1000) / 1000 : 0; u.profit = (u.finalPrice || 0) - (u.cost || 0); }
      if (field === 'cost') u.profit = (u.finalPrice || 0) - (u.cost || 0);
      return u;
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const result = await updateQuote(quote.id, { companyId: customerId || null, title: title || null, notes: notes || null, items, subtotal, vatRate, vatAmount, grandTotal, totalCost, totalProfit });
      setQuote(prev => ({ ...prev, ...result }));
      setDirty(false);
    } catch (e) { toast('Σφάλμα αποθήκευσης: ' + (e as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  async function changeStatus(status: string) {
    try {
      await updateQuoteStatus(quote.id, status);
      setQuote(prev => ({ ...prev, status, ...(status === 'sent' ? { sentAt: new Date() } : {}), ...(status === 'completed' ? { completedAt: new Date() } : {}) }));
      toast(`Κατάσταση: ${STATUS_MAP[status]?.label ?? status}`);
    } catch { toast('Σφάλμα', 'error'); }
  }

  const [applyingCalc, setApplyingCalc] = useState(false);

  async function applyCalcToOthers(sourceItem: any) {
    const cd = sourceItem.calcData;
    if (!cd?.machineId || !cd?.paperId) {
      toast('Κοστολογήστε ξανά αυτό το είδος για να αποθηκευτούν οι ρυθμίσεις', 'error');
      return;
    }
    const targets = items.filter(i => i.id !== sourceItem.id && !i.calcData?.machineId);
    if (targets.length === 0) {
      toast('Δεν υπάρχουν είδη χωρίς κοστολόγηση', 'info');
      return;
    }
    setApplyingCalc(true);
    try {
      const updated = [...items];
      for (const target of targets) {
        const qty = target.qty || 1;
        const res = await fetch('/api/calculator', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            machineId: cd.machineId,
            machineSheetW: cd.machineSheetW,
            machineSheetH: cd.machineSheetH,
            feedEdge: cd.feedEdge,
            paperId: cd.paperId,
            productId: cd.productId,
            jobW: cd.width,
            jobH: cd.height,
            qty,
            sides: cd.sides,
            colorMode: cd.colorMode,
            bleed: cd.bleed,
            impositionMode: cd.impositionMode,
            impoRotation: cd.impoRotation,
            impoGutter: cd.impoGutter,
            impoForceUps: cd.impoForceUps,
            impoTurnType: cd.impoTurnType,
            wasteFixed: cd.wasteFixed,
            coverageLevel: cd.coverageLevel,
            offsetFrontCmyk: cd.offsetFrontCmyk,
            offsetBackCmyk: cd.offsetBackCmyk,
            offsetFrontPms: cd.offsetFrontPms,
            offsetBackPms: cd.offsetBackPms,
            offsetOilVarnish: cd.offsetOilVarnish,
            guillotineId: cd.guillotineId,
            lamMachineId: cd.lamMachineId,
            lamFilmId: cd.lamFilmId,
            lamSides: cd.lamSides,
            bindingType: cd.bindingType,
            bindingMachineId: cd.bindingMachineId,
          }),
        });
        const data = await res.json();
        if (!data.result) continue;
        const r = data.result;
        const totalCost = r.totalCost ?? 0;
        const totalPrice = r.sellPrice ?? totalCost;
        const pricePerUnit = r.pricePerPiece ?? (qty > 0 ? totalPrice / qty : 0);
        const profitAmount = r.profitAmount ?? (totalPrice - totalCost);
        const totalSheets = r.totalStockSheets ?? 0;
        const tidx = updated.findIndex(i => i.id === target.id);
        if (tidx === -1) continue;
        updated[tidx] = {
          ...updated[tidx],
          type: 'calculator',
          cost: Math.round(totalCost * 100) / 100,
          unitPrice: Math.round(pricePerUnit * 1000) / 1000,
          finalPrice: Math.round(totalPrice * 100) / 100,
          profit: Math.round(profitAmount * 100) / 100,
          calcData: {
            ...cd,
            qty,
            totalCost,
            totalPrice,
            pricePerUnit,
            profitAmount,
            sheets: totalSheets,
          },
        };
      }
      setItems(updated);
      toast(`Κοστολογήθηκαν ${targets.length} είδη`);
    } catch (e) {
      toast('Σφάλμα: ' + (e as Error).message, 'error');
    } finally {
      setApplyingCalc(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Διαγραφή ${quote.number};`)) return;
    await deleteQuote(quote.id);
    router.push('/quotes');
  }

  // Status transitions
  const transitions: { label: string; status: string; icon: string; color: string }[] = [];
  if (['draft', 'new'].includes(quote.status)) transitions.push({ label: 'Σε Επεξεργασία', status: 'editing', icon: 'fa-pen', color: 'var(--accent)' });
  // "Αποστολή" is handled by the send modal, not a simple status change
  const canSend = ['draft', 'new', 'editing', 'revision', 'sent'].includes(quote.status);
  if (['sent', 'partial'].includes(quote.status)) {
    transitions.push({ label: 'Εγκρίθηκε', status: 'approved', icon: 'fa-check', color: 'var(--success)' });
    transitions.push({ label: 'Απορρίφθηκε', status: 'rejected', icon: 'fa-times', color: 'var(--danger)' });
  }
  if (quote.status === 'approved') transitions.push({ label: 'Ολοκληρώθηκε', status: 'completed', icon: 'fa-flag-checkered', color: 'var(--success)' });
  // Archive — available for draft/editing/sent (not approved, which has "Ολοκληρώθηκε")
  if (['draft', 'new', 'editing', 'revision', 'sent'].includes(quote.status)) {
    transitions.push({ label: 'Αρχειοθέτηση', status: 'cancelled', icon: 'fa-archive', color: '#64748b' });
  }
  // Unarchive — restore from archive
  if (['completed', 'rejected', 'cancelled'].includes(quote.status)) {
    transitions.push({ label: 'Επαναφορά', status: 'draft', icon: 'fa-undo', color: 'var(--accent)' });
  }

  const inp = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--text)', fontSize: '0.92rem', outline: 'none' } as const;
  const numInp = { ...inp, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const };

  // Progress bar position
  const stepIdx = STATUS_STEPS.indexOf(quote.status);
  const progressPct = quote.status === 'rejected' ? 0 : stepIdx >= 0 ? (stepIdx / (STATUS_STEPS.length - 1)) * 100 : 0;

  return (
    <>
      {/* ═══ RIBBON ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 20px', borderRadius: 12,
        background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
        marginBottom: 16,
      }}>
        {/* Back */}
        <button onClick={() => router.push('/quotes')} style={{
          background: 'transparent', border: 'none', color: 'var(--text-muted)',
          cursor: 'pointer', fontSize: '1rem', padding: '4px 8px', borderRadius: 6,
        }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <i className="fas fa-arrow-left" />
        </button>

        {/* Customer avatar — click to change */}
        <div
          onClick={() => setShowCustomerPicker(!showCustomerPicker)}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: `color-mix(in srgb, ${st.color} 15%, transparent)`,
            color: st.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.92rem', fontWeight: 700, flexShrink: 0, cursor: 'pointer',
          }}
        >{initials(customerName)}</div>

        {/* Info — click to change customer */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              onClick={() => setShowCustomerPicker(!showCustomerPicker)}
              style={{ fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text)')}
            >
              {customerName} <i className="fas fa-pen" style={{ fontSize: '0.6rem', opacity: 0.4, marginLeft: 4 }} />
            </span>
            <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 600, background: st.bg, color: st.color }}>{st.label}</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 12 }}>
            <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{quote.number}</span>
            {primaryContact && <span><i className="fas fa-user" style={{ fontSize: '0.6rem', marginRight: 3 }} />{primaryContact.name}</span>}
            {selectedCompany?.email && <span>{selectedCompany.email}</span>}
            {selectedCompany?.phone && <span>{selectedCompany.phone}</span>}
            <span>{new Date(quote.date).toLocaleDateString('el-GR')}</span>
            {selectedCompany?.folderPath && (
              <a
                href={`presscal-fh://open-folder?path=${encodeURIComponent(selectedCompany.folderPath)}${selectedCompany?.email ? `&email=${encodeURIComponent(selectedCompany.email)}` : ''}`}
                title={selectedCompany.folderPath}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  color: '#f58220', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600,
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <i className="fas fa-folder-open" style={{ fontSize: '0.65rem' }} />
                Φάκελος
              </a>
            )}
            {(quote as any).jobFolderPath && (
              <a
                href={`presscal-fh://open-folder?path=${encodeURIComponent((quote as any).jobFolderPath)}`}
                title={(quote as any).jobFolderPath}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  color: 'var(--teal)', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600,
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <i className="fas fa-briefcase" style={{ fontSize: '0.65rem' }} />
                Εργασία
              </a>
            )}
          </div>

          {/* Customer picker dropdown */}
          {showCustomerPicker && (
            <CustomerPicker
              customers={customers}
              currentId={customerId}
              linkedEmails={quote.linkedEmails as string[] || []}
              onSelect={(id) => { setCustomerId(id); setShowCustomerPicker(false); }}
              onClose={() => setShowCustomerPicker(false)}
              toast={toast}
            />
          )}
        </div>

        {/* Quick actions */}
        {courierConfigured && !courierVoucher && (
          <button onClick={() => setShowCourierModal(true)} style={{
            padding: '6px 12px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600,
            background: 'color-mix(in srgb, #10b981 12%, transparent)',
            border: '1px solid color-mix(in srgb, #10b981 25%, transparent)',
            color: '#10b981', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <i className="fas fa-truck" style={{ fontSize: '0.55rem' }} /> Voucher
          </button>
        )}
        {courierVoucher && (
          <span style={{
            padding: '6px 12px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600,
            background: 'color-mix(in srgb, #10b981 12%, transparent)',
            border: '1px solid color-mix(in srgb, #10b981 25%, transparent)',
            color: '#10b981', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <i className="fas fa-truck" style={{ fontSize: '0.55rem' }} /> {courierVoucher}
          </span>
        )}
        {elorusConfigured && !quote.elorusInvoiceId && (
          <button onClick={() => setShowInvoiceModal(true)} style={{
            padding: '6px 12px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600,
            background: 'color-mix(in srgb, #818cf8 15%, transparent)',
            border: '1px solid color-mix(in srgb, #818cf8 30%, transparent)',
            color: '#a5b4fc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <i className="fas fa-file-invoice-dollar" style={{ fontSize: '0.55rem' }} /> Τιμολόγηση
          </button>
        )}
        {elorusConfigured && quote.elorusInvoiceId && (
          <a href={quote.elorusInvoiceUrl || '#'} target="_blank" rel="noreferrer" style={{
            padding: '6px 12px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600,
            background: 'color-mix(in srgb, var(--success) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)',
            color: 'var(--success)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <i className="fas fa-check" style={{ fontSize: '0.55rem' }} /> Τιμολόγιο
          </a>
        )}
      </div>

      {/* ═══ TITLE + STATUS + ACTIONS ROW ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Τίτλος προσφοράς..."
          style={{
            flex: 1, background: 'transparent', border: 'none',
            fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)',
            padding: '4px 0', outline: 'none', minWidth: 0,
          }}
        />

        {/* Status transitions */}
        {transitions.map(t => (
          <button key={t.status} onClick={() => changeStatus(t.status)} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 500,
            background: `color-mix(in srgb, ${t.color} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${t.color} 20%, transparent)`,
            color: t.color, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            <i className={`fas ${t.icon}`} style={{ fontSize: '0.55rem' }} /> {t.label}
          </button>
        ))}

        {/* Autosave indicator */}
        <span style={{ fontSize: '0.72rem', color: saving ? 'var(--text-muted)' : dirty ? 'var(--accent)' : 'var(--success)', display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
          {saving ? <><i className="fas fa-spinner fa-spin" style={{ fontSize: '0.55rem' }} /></>
            : dirty ? <><i className="fas fa-circle" style={{ fontSize: '0.3rem' }} /></>
            : <><i className="fas fa-check" style={{ fontSize: '0.55rem' }} /></>}
        </span>

        {/* Delete */}
        <button onClick={handleDelete} style={{
          padding: '5px 7px', borderRadius: 6, fontSize: '0.82rem',
          background: 'transparent', border: 'none',
          color: 'var(--text-muted)', cursor: 'pointer',
        }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <i className="fas fa-trash" />
        </button>
      </div>

      {/* ═══ ACTIONS BAR (remaining) ═══ */}
      {items.some(i => i.calcData?.paperName) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowOrderModal(true)} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 14px', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600,
            background: 'color-mix(in srgb, var(--teal) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--teal) 25%, transparent)',
            color: 'var(--teal)', cursor: 'pointer',
          }}>
            <i className="fas fa-truck" style={{ fontSize: '0.6rem' }} /> Παραγγελία Χαρτιών
          </button>
        </div>
      )}

      {/* ═══ ITEMS TABLE ═══ */}
      <div style={{
        borderRadius: 10, border: '1px solid var(--border)',
        overflow: 'hidden', marginBottom: 16,
      }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '28px 1fr 70px 70px 85px 85px 85px 28px 28px 28px',
          gap: 0, padding: '8px 10px',
          background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)',
        }}>
          {['', 'Είδος', 'Ποσ.', 'Μονάδα', 'Τιμή/μον.', 'Σύνολο', 'Κόστος', '', '', ''].map((h, i) => (
            <span key={i} style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-muted)', textAlign: i >= 2 && i <= 6 ? 'right' : undefined }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        {items.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: '0.92rem', color: 'var(--text-muted)' }}>
            Κανένα είδος — χρησιμοποιήστε AI ανάλυση email
          </div>
        ) : items.map((item, idx) => (
          <div key={item.id} style={{
            display: 'grid', gridTemplateColumns: '28px 1fr 70px 70px 85px 85px 85px 28px 28px 28px',
            gap: 0, padding: '6px 10px', alignItems: 'center',
            borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : undefined,
          }}>
            {/* Type icon */}
            <span style={{ fontSize: '1rem', color: item.type === 'calculator' ? 'var(--blue)' : 'var(--text-muted)' }}>
              <i className={`fas ${item.type === 'calculator' ? 'fa-calculator' : item.type === 'catalog' ? 'fa-book' : 'fa-pen'}`} />
            </span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <input value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} placeholder="Περιγραφή" style={{ ...inp, border: 'none', background: 'transparent', padding: '4px 6px' }} />
              {item.linkedFile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px', marginTop: -2 }}>
                  <i className="fas fa-paperclip" style={{ fontSize: '0.5rem', color: '#f58220' }} />
                  <span style={{ fontSize: '0.68rem', color: '#f58220' }}>{item.linkedFile.name}</span>
                  {item.linkedFile.width && item.linkedFile.height && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{item.linkedFile.width}×{item.linkedFile.height}mm</span>
                  )}
                  {item.linkedFile.pages && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{item.linkedFile.pages}σελ.</span>
                  )}
                  {item.linkedFile.colors && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{item.linkedFile.colors}</span>
                  )}
                  {item.linkedFile.bleed && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>bleed {item.linkedFile.bleed}mm</span>
                  )}
                </div>
              )}
              {item.calcData?.paperName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px', marginTop: -2, flexWrap: 'wrap' }}>
                  <i className="fas fa-scroll" style={{ fontSize: '0.5rem', color: 'var(--teal)' }} />
                  <span style={{ fontSize: '0.68rem', color: 'var(--teal)' }}>{item.calcData.paperName}</span>
                  {item.calcData.sides && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{item.calcData.sides === 2 ? '2 όψεις' : '1 όψη'}</span>
                  )}
                  {(item.calcData.offsetFrontCmyk != null || item.calcData.colorMode) && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {item.calcData.colorMode === 'bw' ? 'B/W' : `${item.calcData.offsetFrontCmyk ?? 4}/${item.calcData.offsetBackCmyk ?? 0}`}
                    </span>
                  )}
                  {item.calcData.archetype && (
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{item.calcData.archetype}</span>
                  )}
                  {items.some(i => i.id !== item.id && !i.calcData?.machineId) && (
                    <button
                      onClick={() => applyCalcToOthers(item)}
                      disabled={applyingCalc}
                      title="Αντιγραφή κοστολόγησης στα υπόλοιπα"
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 2px',
                        color: 'var(--blue)', fontSize: '0.6rem', opacity: applyingCalc ? 0.4 : 0.7,
                        display: 'flex', alignItems: 'center', gap: 3,
                      }}
                      onMouseEnter={e => { if (!applyingCalc) e.currentTarget.style.opacity = '1'; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = applyingCalc ? '0.4' : '0.7'; }}
                    >
                      {applyingCalc ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-copy" />}
                      <span style={{ fontSize: '0.62rem' }}>Εφαρμογή σε όλα</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            <input type="number" value={item.qty || ''} onChange={e => updateItem(idx, 'qty', parseFloat(e.target.value) || 0)} style={{ ...numInp, border: 'none', background: 'transparent', padding: '4px 4px', width: '100%' }} />
            <input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} style={{ ...inp, border: 'none', background: 'transparent', padding: '4px 4px', textAlign: 'center', width: '100%' }} />
            <input type="number" value={item.unitPrice || ''} onChange={e => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)} style={{ ...numInp, border: 'none', background: 'transparent', padding: '4px 4px', width: '100%' }} />
            <input type="number" value={item.finalPrice || ''} onChange={e => updateItem(idx, 'finalPrice', parseFloat(e.target.value) || 0)} style={{ ...numInp, border: 'none', background: 'transparent', padding: '4px 4px', width: '100%', fontWeight: 600 }} />
            <input type="number" value={item.cost || ''} onChange={e => updateItem(idx, 'cost', parseFloat(e.target.value) || 0)} style={{ ...numInp, border: 'none', background: 'transparent', padding: '4px 4px', width: '100%', color: 'var(--text-muted)' }} />
            <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', padding: 0, opacity: 0.4 }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            ><i className="fas fa-times" /></button>
            <a href={calcUrl(item, quote.id)} title="Κοστολόγηση" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)', opacity: 0.5, fontSize: '0.85rem', textDecoration: 'none' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; }}
            ><i className="fas fa-calculator" /></a>
            {/* Link file from Helper */}
            {(selectedCustomer as any)?.folderPath ? (
              <a
                href={`presscal-fh://pick-file-for-item?quoteId=${quote.id}&itemId=${item.id}&folder=${encodeURIComponent((selectedCustomer as any).folderPath)}`}
                title={item.linkedFile ? `📎 ${item.linkedFile.name}` : 'Σύνδεση αρχείου'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: item.linkedFile ? '#f58220' : 'var(--text-muted)',
                  opacity: item.linkedFile ? 0.8 : 0.4,
                  fontSize: '0.85rem', textDecoration: 'none',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = item.linkedFile ? '0.8' : '0.4'; }}
              >
                <i className="fas fa-paperclip" />
              </a>
            ) : (
              <span style={{ opacity: 0.2, fontSize: '0.85rem', color: 'var(--text-muted)' }} title="Ορίστε πρώτα φάκελο πελάτη">
                <i className="fas fa-paperclip" />
              </span>
            )}
          </div>
        ))}

        {/* Add item button */}
        <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)' }}>
          <button onClick={() => setItems(prev => [...prev, emptyItem()])} style={{
            display: 'flex', alignItems: 'center', gap: 5, width: '100%',
            padding: '6px 10px', borderRadius: 6, border: '1px dashed var(--border)',
            background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
            fontSize: '0.78rem', fontWeight: 500, fontFamily: 'inherit',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <i className="fas fa-plus" style={{ fontSize: '0.6rem' }} /> Προσθήκη προϊόντος
          </button>
        </div>

        {/* Totals row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr auto auto auto',
          gap: 16, padding: '10px 10px', background: 'rgba(255,255,255,0.015)',
          borderTop: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <span>ΦΠΑ</span>
            <input type="number" value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value) || 0)}
              style={{ ...numInp, width: 42, padding: '2px 4px', fontSize: '0.82rem' }} />
            <span>%</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Υποσ.</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(subtotal)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>ΦΠΑ</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(vatAmount)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Σύνολο</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--accent)' }}>{formatCurrency(grandTotal)}</div>
          </div>
        </div>
      </div>

      {/* ═══ BOTTOM GRID: 2 columns ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>

        {/* ─── LEFT: Tabbed (Email / Αρχεία) ─── */}
        <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
            <button onClick={() => setLeftTab('email')} style={{
              flex: 1, padding: '8px 0', border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              background: leftTab === 'email' ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
              color: leftTab === 'email' ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: leftTab === 'email' ? '2px solid var(--accent)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}>
              <i className="fas fa-envelope" style={{ fontSize: '0.65rem' }} /> Email
              {(quote.linkedEmails as string[] || []).length > 0 && (
                <span style={{ fontSize: '0.6rem', opacity: 0.6 }}>{(quote.linkedEmails as string[]).length}</span>
              )}
            </button>
            <button onClick={() => setLeftTab('files')} style={{
              flex: 1, padding: '8px 0', border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              background: leftTab === 'files' ? 'color-mix(in srgb, #f58220 10%, transparent)' : 'transparent',
              color: leftTab === 'files' ? '#f58220' : 'var(--text-muted)',
              borderBottom: leftTab === 'files' ? '2px solid #f58220' : '2px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}>
              <i className="fas fa-folder-open" style={{ fontSize: '0.65rem' }} /> Αρχεία
              {(quote as any).fileLinks?.length > 0 && (
                <span style={{ fontSize: '0.6rem', opacity: 0.6 }}>{(quote as any).fileLinks.length}</span>
              )}
            </button>
          </div>

          {/* Email tab */}
          {leftTab === 'email' && (
            <EmailPanel
              quoteId={quote.id}
              linkedEmails={quote.linkedEmails}
              threadId={quote.threadId}
              customerEmail={quote.customer?.email ?? ''}
              onEmailLinked={(msgId, tId) => {
                setQuote(prev => ({
                  ...prev,
                  threadId: prev.threadId || tId,
                  linkedEmails: [...(prev.linkedEmails || []), msgId],
                }));
              }}
              toast={toast}
            />
          )}

          {/* Files tab */}
          {leftTab === 'files' && (
            <div style={{ padding: 12 }}>
              {/* Fetch from email button */}
              {(quote.linkedEmails as string[] || []).length > 0 && !((quote as any).fileLinks?.length > 0) && (
                <button
                  onClick={async () => {
                    toast('Κατέβασμα αρχείων...', 'info');
                    const { saveEmailAttachments } = await import('../../quotes/actions');
                    const result = await saveEmailAttachments(quote.id, quote.linkedEmails as string[]);
                    if (result.saved > 0) {
                      toast(`${result.saved} αρχεία αποθηκεύτηκαν`);
                      router.refresh();
                    } else {
                      toast('Δεν βρέθηκαν συνημμένα', 'error');
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%',
                    padding: '10px', borderRadius: 8, marginBottom: 10,
                    background: 'var(--blue)', color: '#fff', fontSize: '0.75rem', fontWeight: 700,
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  <i className="fas fa-cloud-download-alt" /> Κατέβασμα αρχείων από email
                </button>
              )}

              {/* File grid with thumbnails */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
                {((quote as any).fileLinks as any[] || []).map((fl: any) => {
                  const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(fl.fileName);
                  return (
                    <div key={fl.id} style={{
                      borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden',
                      background: 'rgba(255,255,255,0.02)',
                    }}>
                      {/* Thumbnail / icon */}
                      <a href={fl.filePath} target="_blank" style={{ display: 'block', height: 80, background: 'rgba(0,0,0,0.15)', position: 'relative', overflow: 'hidden' }}>
                        {isImage ? (
                          <img src={fl.filePath} alt={fl.fileName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                            <i className={`fas ${attIcon(fl.fileName)}`} style={{ fontSize: '1.5rem', color: '#f58220', opacity: 0.6 }} />
                          </div>
                        )}
                      </a>
                      {/* Name + actions */}
                      <div style={{ padding: '5px 6px' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-dim)', marginBottom: 4 }}>
                          {fl.fileName}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <a href={fl.filePath} download={fl.fileName} title="Download" style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '3px', borderRadius: 4, border: '1px solid var(--border)',
                            color: 'var(--text-muted)', fontSize: '0.6rem', textDecoration: 'none',
                          }}>
                            <i className="fas fa-download" />
                          </a>
                          <a href={`presscal-fh://open-file?path=${encodeURIComponent(fl.filePath)}&quoteId=${quote.id}`} title="Helper" style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '3px', borderRadius: 4, border: '1px solid var(--border)',
                            color: '#f58220', fontSize: '0.6rem', textDecoration: 'none',
                          }}>
                            <i className="fas fa-external-link-alt" />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bulk Helper button */}
              {(quote as any).fileLinks?.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  <a
                    href={`presscal-fh://download-to-folder?quoteId=${quote.id}&target=global`}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      padding: '8px', borderRadius: 8,
                      background: '#f58220', color: '#fff', fontSize: '0.72rem', fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    <i className="fas fa-folder-open" style={{ fontSize: '0.6rem' }} /> Φάκελος Εργασιών
                  </a>
                  {(selectedCompany as any)?.folderPath && (
                    <a
                      href={`presscal-fh://download-to-folder?quoteId=${quote.id}&target=customer`}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        padding: '8px', borderRadius: 8,
                        border: '1px solid #f58220', background: 'transparent',
                        color: '#f58220', fontSize: '0.72rem', fontWeight: 700,
                        textDecoration: 'none',
                      }}
                    >
                      <i className="fas fa-user" style={{ fontSize: '0.6rem' }} /> Φάκελος Πελάτη
                    </a>
                  )}
                </div>
              )}

              {/* Empty state */}
              {!((quote as any).fileLinks?.length > 0) && !(quote.linkedEmails as string[] || []).length && (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  <i className="fas fa-folder-open" style={{ fontSize: '1.5rem', opacity: 0.3, marginBottom: 8, display: 'block' }} />
                  Κανένα αρχείο
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── RIGHT: AI Ανάλυση ─── */}
        <AiPanel
          linkedEmails={quote.linkedEmails}
          existingItems={items}
          description={quote.description}
          onItemsCreated={(newItems) => {
            setItems(prev => [...prev, ...newItems]);
            toast(`${newItems.length} είδη προστέθηκαν από AI`);
          }}
          toast={toast}
        />
      </div>

      {/* ─── ROW 2: Reply + Notes ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>

        {/* Quick Reply */}
        <ReplyPanel
          customerEmail={quote.customer?.email ?? ''}
          threadId={quote.threadId}
          quoteNumber={quote.number}
          toast={toast}
        />

        {/* Notes */}
        <div style={{ borderRadius: 10, border: '1px solid var(--border)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <i className="fas fa-sticky-note" style={{ fontSize: '0.92rem', color: 'var(--accent)' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Σημειώσεις</span>
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Εσωτερικές σημειώσεις..."
            rows={4}
            style={{
              width: '100%', background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: '1rem',
              resize: 'vertical', outline: 'none',
            }}
          />
        </div>
      </div>

      {/* ─── SEND QUOTE MODAL ─── */}
      {showSendModal && (
        <SendQuoteModal
          key={customerId}
          quoteId={quote.id}
          quoteNumber={quote.number}
          customerEmail={primaryContact?.email || selectedCompany?.email || ''}
          customerName={customerName}
          grandTotal={grandTotal}
          companyContacts={selectedCompany?.companyContacts || []}
          linkedEmails={quote.linkedEmails as string[] || []}
          onClose={() => setShowSendModal(false)}
          onSent={() => {
            setShowSendModal(false);
            setQuote(prev => ({ ...prev, status: 'sent', sentAt: new Date() }));
            toast('Η προσφορά εστάλη!');
          }}
          toast={toast}
        />
      )}

      {/* ─── COURIER VOUCHER MODAL ─── */}
      {showCourierModal && (
        <CourierVoucherModal
          quoteId={quote.id}
          company={selectedCompany}
          onClose={() => setShowCourierModal(false)}
          onCreated={(voucherId) => {
            setCourierVoucher(voucherId);
            setCourierStatus('Δημιουργήθηκε');
            setShowCourierModal(false);
            toast('Voucher δημιουργήθηκε');
          }}
        />
      )}

      {/* ─── ELORUS INVOICE MODAL ─── */}
      {showInvoiceModal && (
        <ElorusInvoiceModal
          quoteId={quote.id}
          quoteNumber={quote.number}
          customerName={customerName}
          customerAfm={quote.customer?.afm ?? ''}
          customerElorusId={quote.customer?.elorusContactId ?? ''}
          grandTotal={grandTotal}
          elorusSlug={elorusSlug ?? ''}
          onClose={() => setShowInvoiceModal(false)}
          onCreated={(invoiceId, invoiceUrl, contactId) => {
            setShowInvoiceModal(false);
            setQuote(prev => ({ ...prev, elorusInvoiceId: invoiceId, elorusInvoiceUrl: invoiceUrl, elorusContactId: contactId }));
            toast('Τιμολόγιο δημιουργήθηκε!');
          }}
          toast={toast}
        />
      )}

      {/* ─── ORDER PAPERS MODAL ─── */}
      {showOrderModal && (
        <OrderPapersModal
          items={items}
          materials={materials}
          org={org}
          quoteNumber={quote.number}
          toast={toast}
          onClose={() => setShowOrderModal(false)}
        />
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

// ═══════════════════════════════════════════════════════
// ORDER PAPERS MODAL
// ═══════════════════════════════════════════════════════
function OrderPapersModal({ items, materials, org, quoteNumber, toast, onClose }: {
  items: any[];
  materials: Material[];
  org?: Pick<Org, 'legalName' | 'afm' | 'doy' | 'address' | 'city' | 'postalCode' | 'phone' | 'email'> | null;
  quoteNumber: string;
  toast: (msg: string, type?: ToastType) => void;
  onClose: () => void;
}) {
  // Collect papers needed from calcData
  const papersNeeded = items
    .filter(i => i.calcData?.paperName)
    .map(i => ({
      paperName: i.calcData.paperName as string,
      sheets: i.calcData.sheets as number || 0,
      itemName: i.name as string,
    }));

  // Group by paper name and sum sheets
  const paperMap = new Map<string, { name: string; totalSheets: number; items: string[] }>();
  for (const p of papersNeeded) {
    const key = p.paperName.toLowerCase();
    if (!paperMap.has(key)) paperMap.set(key, { name: p.paperName, totalSheets: 0, items: [] });
    const entry = paperMap.get(key)!;
    entry.totalSheets += p.sheets;
    entry.items.push(p.itemName);
  }

  // Match with materials from DB to get supplier info — prefer records with supplierEmail
  const paperEntries = [...paperMap.values()].map(p => {
    const matches = materials.filter(m => m.name.toLowerCase() === p.name.toLowerCase());
    const mat = matches.find(m => m.supplierEmail) || matches[0] || null;
    return { ...p, material: mat };
  });

  // Group by supplier
  const bySupplier = new Map<string, { supplier: string; email: string; papers: typeof paperEntries }>();
  const noSupplier: typeof paperEntries = [];
  for (const pe of paperEntries) {
    const email = pe.material?.supplierEmail;
    if (!email) { noSupplier.push(pe); continue; }
    const key = email.toLowerCase();
    if (!bySupplier.has(key)) bySupplier.set(key, { supplier: pe.material?.supplier || email, email, papers: [] });
    bySupplier.get(key)!.papers.push(pe);
  }
  const supplierGroups = [...bySupplier.entries()];

  const [quantities, setQuantities] = useState<Record<string, string>>(() => {
    const q: Record<string, string> = {};
    for (const pe of paperEntries) q[pe.name] = String(pe.totalSheets);
    return q;
  });
  const [delivery, setDelivery] = useState<'pickup' | 'deliver'>('deliver');
  const [notes, setNotes] = useState('');
  const [emails, setEmails] = useState<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    for (const [key, group] of bySupplier.entries()) e[key] = group.email;
    return e;
  });

  const hasCompany = !!(org?.legalName && org?.afm);

  function buildMailto(email: string, papers: typeof paperEntries) {
    const subject = `Παραγγελία Χαρτιών — ${quoteNumber}${org?.legalName ? ` — ${org.legalName}` : ''}`;
    const lines = papers.map(p => {
      const qty = quantities[p.name] || '___';
      const mat = p.material;
      const dims = mat?.width && mat?.height ? ` ${mat.width}×${mat.height}mm` : '';
      const gsm = mat?.thickness ? ` ${mat.thickness}gsm` : '';
      return `• ${p.name}${dims}${gsm} — ${qty} φύλλα`;
    });

    const companyBlock = org ? [
      org.legalName, org.afm ? `ΑΦΜ: ${org.afm}` : '',
      org.doy ? `ΔΟΥ: ${org.doy}` : '',
      [org.address, org.city, org.postalCode].filter(Boolean).join(', '),
      org.phone ? `Τηλ: ${org.phone}` : '',
      org.email ? `Email: ${org.email}` : '',
    ].filter(Boolean).join('\n') : '';

    const deliveryText = delivery === 'pickup' ? 'Θα παραλάβω εγώ.' : 'Παρακαλώ αποστείλατε στη διεύθυνσή μας.';

    const body = [
      'Αγαπητοί,',
      '',
      `Θα ήθελα να παραγγείλω τα παρακάτω (για ${quoteNumber}):`,
      '',
      ...lines,
      '',
      deliveryText,
      notes ? `\nΣημειώσεις: ${notes}` : '',
      '',
      '— ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ —',
      companyBlock || '(Συμπληρώστε τα στοιχεία στις Ρυθμίσεις)',
      '',
      'Ευχαριστώ',
    ].join('\n');

    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div style={{ width: 600, maxHeight: '85vh', background: 'rgb(20,30,55)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-truck" style={{ color: 'var(--teal)' }} />
            Παραγγελία Χαρτιών — {quoteNumber}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}>&times;</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }} className="custom-scrollbar">

          {/* Company info */}
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>ΣΤΟΙΧΕΙΑ ΕΤΑΙΡΕΙΑΣ</span>
            {hasCompany ? (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--text)' }}>{org!.legalName}</strong> · ΑΦΜ: {org!.afm}
                {org!.doy ? <> · ΔΟΥ: {org!.doy}</> : null}
                {org!.address || org!.city ? <><br />{[org!.address, org!.city, org!.postalCode].filter(Boolean).join(', ')}</> : null}
                {org!.phone ? <> · Τηλ: {org!.phone}</> : null}
              </div>
            ) : (
              <a href="/settings" style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8,
                background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
                fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'none',
              }}>
                <i className="fas fa-exclamation-circle" /> Συμπληρώστε τα στοιχεία σας στις Ρυθμίσεις
              </a>
            )}
          </div>

          {/* Papers by supplier */}
          {supplierGroups.map(([key, group]) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <i className="fas fa-truck" style={{ color: 'var(--teal)', fontSize: '0.7rem' }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--teal)' }}>{group.supplier}</span>
                <input
                  style={{ width: 240, height: 30, fontSize: '0.75rem', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', color: 'var(--text)', outline: 'none' }}
                  value={emails[key] || ''}
                  onChange={e => setEmails(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder="email@supplier.com"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {group.papers.map(p => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.03)' }}>
                    <span style={{ flex: 1, fontSize: '0.82rem' }}>
                      {p.name}
                      {p.material?.width && p.material?.height ? <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: '0.72rem' }}>{p.material.width}×{p.material.height}</span> : null}
                      {p.material?.thickness ? <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: '0.72rem' }}>{p.material.thickness}gsm</span> : null}
                    </span>
                    <input
                      style={{ width: 90, height: 32, textAlign: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', color: 'var(--text)', outline: 'none', fontSize: '0.82rem' }}
                      type="number"
                      value={quantities[p.name] || ''}
                      onChange={e => setQuantities(prev => ({ ...prev, [p.name]: e.target.value }))}
                      placeholder="Ποσ."
                    />
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', width: 40 }}>φύλλα</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Papers without supplier */}
          {noSupplier.length > 0 && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', marginBottom: 12 }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>
                <i className="fas fa-exclamation-triangle" style={{ marginRight: 4 }} />{noSupplier.length} χαρτιά χωρίς προμηθευτή:
              </p>
              {noSupplier.map(p => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <span style={{ flex: 1 }}>{p.name}</span>
                  <span>{quantities[p.name] || p.totalSheets} φύλλα</span>
                </div>
              ))}
              <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>Προσθέστε email προμηθευτή στην Αποθήκη</p>
            </div>
          )}

          {/* Delivery method */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Τρόπος Παραλαβής</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {([
                { v: 'deliver' as const, l: 'Αποστολή στη διεύθυνσή μας', icon: 'fa-shipping-fast' },
                { v: 'pickup' as const, l: 'Θα παραλάβω εγώ', icon: 'fa-store' },
              ]).map(o => (
                <button key={o.v} onClick={() => setDelivery(o.v)} style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600,
                  border: `1px solid ${delivery === o.v ? 'color-mix(in srgb, var(--success) 50%, transparent)' : 'rgba(255,255,255,0.08)'}`,
                  background: delivery === o.v ? 'color-mix(in srgb, var(--success) 10%, transparent)' : 'transparent',
                  color: delivery === o.v ? 'var(--success)' : '#94a3b8', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
                }}>
                  <i className={`fas ${o.icon}`} style={{ fontSize: '0.7rem' }} />{o.l}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Σημειώσεις</label>
            <textarea style={{ width: '100%', height: 56, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--text)', fontSize: '0.82rem', outline: 'none', resize: 'none' }}
              value={notes} onChange={e => setNotes(e.target.value)} placeholder="π.χ. Παράδοση μέχρι Παρασκευή..." />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#94a3b8', fontSize: '0.82rem', cursor: 'pointer' }}>Ακύρωση</button>
          <div style={{ flex: 1 }} />
          {supplierGroups.map(([key, group]) => {
            const targetEmail = emails[key] || group.email;
            return (
              <div key={key} style={{ display: 'flex', gap: 4 }}>
                <button onClick={async () => {
                  const orderItems = group.papers.map(p => ({
                    name: p.name,
                    dims: p.material?.width && p.material?.height ? `${p.material.width}×${p.material.height}mm${p.material.thickness ? ` · ${p.material.thickness}gsm` : ''}` : '',
                    qty: quantities[p.name] || '',
                  }));
                  try {
                    const res = await fetch('/api/send-order', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ to: targetEmail, supplier: group.supplier, items: orderItems, delivery, notes }),
                    });
                    const data = await res.json();
                    if (data.ok) {
                      toast(`Email στάλθηκε στο ${targetEmail}`);
                      onClose();
                    } else {
                      toast(data.error || 'Αποτυχία αποστολής', 'error');
                    }
                  } catch { toast('Σφάλμα σύνδεσης', 'error'); }
                }} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '10px 20px', borderRadius: 8, border: 'none',
                  background: 'var(--success)', color: '#fff', fontSize: '0.82rem', fontWeight: 700,
                  cursor: 'pointer', boxShadow: '0 4px 16px rgba(16,185,129,0.3)',
                }}>
                  <i className="fas fa-paper-plane" /> {supplierGroups.length > 1 ? group.supplier : 'Αποστολή Email'}
                </button>
                <a href={buildMailto(targetEmail, group.papers)} target="_blank" rel="noreferrer"
                  title="Άνοιγμα στο email client"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 38, borderRadius: 8,
                    border: '1px solid color-mix(in srgb, var(--success) 40%, transparent)',
                    background: 'transparent', color: 'var(--success)',
                    fontSize: '0.85rem', textDecoration: 'none', cursor: 'pointer',
                  }}>
                  <i className="fas fa-external-link-alt" />
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── ATTACHMENT ICON HELPER ───
function attIcon(filename: string): string {
  const ext = (filename || '').split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return 'fa-file-pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'fa-file-image';
  if (['doc', 'docx'].includes(ext)) return 'fa-file-word';
  if (['xls', 'xlsx'].includes(ext)) return 'fa-file-excel';
  if (['ppt', 'pptx'].includes(ext)) return 'fa-file-powerpoint';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'fa-file-archive';
  if (['ai', 'eps', 'psd', 'indd', 'cdr'].includes(ext)) return 'fa-palette';
  return 'fa-file';
}

// ═══════════════════════════════════════════════════════
// EMAIL PANEL — fetch & display linked emails, search & link new
// ═══════════════════════════════════════════════════════
function EmailPanel({ quoteId, linkedEmails, threadId, customerEmail, onEmailLinked, toast }: {
  quoteId: string;
  linkedEmails: string[];
  threadId: string | null;
  customerEmail: string;
  onEmailLinked: (msgId: string, threadId: string) => void;
  toast: (msg: string, type?: ToastType) => void;
}) {
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchQ, setSearchQ] = useState(customerEmail ? `from:${customerEmail}` : '');

  // Fetch linked emails on mount
  useEffect(() => {
    if (!linkedEmails?.length) return;
    setLoading(true);
    Promise.all(linkedEmails.map(id =>
      fetch(`/api/email/messages/${id}`).then(r => r.ok ? r.json() : null).catch(() => null)
    )).then(results => {
      setEmails(results.filter(Boolean));
      setLoading(false);
    });
  }, [linkedEmails]);

  async function searchEmails() {
    if (!searchQ.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/email/messages?maxResults=10&q=${encodeURIComponent(searchQ)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.messages || []);
      }
    } catch {} finally { setSearching(false); }
  }

  async function linkEmail(msg: any) {
    try {
      await linkEmailToQuote(quoteId, msg.id, msg.threadId);
      onEmailLinked(msg.id, msg.threadId);
      setShowSearch(false);
      // Fetch full message
      const res = await fetch(`/api/email/messages/${msg.id}`);
      if (res.ok) { const full = await res.json(); setEmails(prev => [...prev, full]); }
      toast('Email συνδέθηκε');
    } catch (e) { toast('Σφάλμα: ' + (e as Error).message, 'error'); }
  }

  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--border)', padding: 16, minHeight: 180 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <i className="fas fa-envelope" style={{ fontSize: '0.92rem', color: 'var(--blue)' }} />
        <span style={{ fontSize: '0.85rem', fontWeight: 600, flex: 1 }}>Email Πελάτη</span>
        <button onClick={() => setShowSearch(!showSearch)} style={{
          padding: '3px 8px', borderRadius: 5, fontSize: '0.78rem', fontWeight: 500,
          background: 'transparent', border: '1px solid var(--border)',
          color: 'var(--blue)', cursor: 'pointer',
        }}>
          <i className="fas fa-link" style={{ marginRight: 3 }} /> Σύνδεση
        </button>
      </div>

      {/* Search panel */}
      {showSearch && (
        <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Αναζήτηση email (π.χ. from:customer@...)"
              onKeyDown={e => e.key === 'Enter' && searchEmails()}
              style={{ flex: 1, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--text)', fontSize: '1rem', outline: 'none' }} />
            <button onClick={searchEmails} disabled={searching} style={{
              padding: '6px 10px', borderRadius: 6, border: 'none', background: 'var(--blue)', color: '#fff', fontSize: '0.92rem', cursor: 'pointer',
            }}>{searching ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-search" />}</button>
          </div>
          {searchResults.map(msg => (
            <div key={msg.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '1rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{msg.subject || '(χωρίς θέμα)'}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>{msg.from} · {msg.date}</div>
              </div>
              <button onClick={() => linkEmail(msg)} style={{
                padding: '3px 8px', borderRadius: 5, border: 'none',
                background: 'color-mix(in srgb, var(--blue) 15%, transparent)', color: 'var(--blue)',
                fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
              }}>Σύνδεση</button>
            </div>
          ))}
          {searchResults.length === 0 && !searching && <div style={{ fontSize: '0.92rem', color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>Πατήστε αναζήτηση</div>}
        </div>
      )}

      {/* Quick-access attachments strip */}
      {(() => {
        const allAtts = emails.flatMap(em => (em.attachments || []).map((att: any) => ({ ...att, emailId: em.id, emailSubject: em.subject })));
        if (allAtts.length === 0) return null;
        return (
          <div style={{
            display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10,
            padding: '8px 10px', borderRadius: 8,
            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginRight: 4 }}>
              <i className="fas fa-paperclip" style={{ fontSize: '0.55rem' }} /> Αρχεία:
            </span>
            {allAtts.map((att: any, i: number) => (
              <span key={`${att.emailId}-${att.id}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={() => {
                    const url = `/api/email/messages/${att.emailId}/attachments/${att.id}?filename=${encodeURIComponent(att.filename)}&mime=${encodeURIComponent(att.mimeType || 'application/octet-stream')}`;
                    const a = document.createElement('a');
                    a.href = url; a.download = att.filename; a.click();
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '3px 8px', borderRadius: '5px 0 0 5px',
                    border: '1px solid var(--border)', borderRight: 'none', background: 'transparent',
                    fontSize: '1rem', color: 'var(--text-dim)', cursor: 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.color = 'var(--blue)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)'; }}
                >
                  <i className={`fas ${attIcon(att.filename)}`} style={{ fontSize: '0.58rem' }} />
                  <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.filename}</span>
                  <i className="fas fa-download" style={{ fontSize: '0.45rem', opacity: 0.4 }} />
                </button>
                <a
                  href={`presscal-fh://attachment?messageId=${att.emailId}&attId=${att.id}&mime=${encodeURIComponent(att.mimeType || 'application/octet-stream')}&filename=${encodeURIComponent(att.filename)}&quoteId=${quoteId}`}
                  title="Open in File Helper"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '3px 8px', borderRadius: '0 5px 5px 0',
                    border: '1px solid var(--border)', background: 'transparent',
                    fontSize: '1rem', color: '#f58220', cursor: 'pointer',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#f58220'; e.currentTarget.style.background = 'rgba(245,130,32,0.06)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}
                >
                  <i className="fas fa-external-link-alt" style={{ fontSize: '0.55rem' }} />
                  <span style={{ fontSize: '1rem' }}>Helper</span>
                </a>
              </span>
            ))}
          </div>
        );
      })()}

      {/* Linked emails */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '1rem' }} />
        </div>
      ) : emails.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '1rem', opacity: 0.5 }}>
          <i className="fas fa-envelope-open" style={{ fontSize: '1rem', marginBottom: 6, display: 'block' }} />
          Κανένα συνδεδεμένο email
        </div>
      ) : (
        emails.map(em => (
          <div key={em.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === em.id ? null : em.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px',
                borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer',
                background: expanded === em.id ? 'rgba(255,255,255,0.02)' : 'transparent',
              }}
            >
              <i className="fas fa-envelope" style={{ fontSize: '0.6rem', color: 'var(--blue)', opacity: 0.6 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '1rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {em.subject || '(χωρίς θέμα)'}
                </div>
                <div style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>{em.from} · {em.date}</div>
              </div>
              {em.attachments?.length > 0 && (
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                  <i className="fas fa-paperclip" /> {em.attachments.length}
                </span>
              )}
              <i className={`fas fa-chevron-${expanded === em.id ? 'up' : 'down'}`} style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }} />
            </div>
            {expanded === em.id && (
              <div style={{ padding: '10px 8px', borderRadius: '0 0 6px 6px', border: '1px solid var(--border)', borderTop: 'none', background: 'rgba(255,255,255,0.01)' }}>
                {/* Email body */}
                <div style={{ fontSize: '1rem', color: 'var(--text-dim)', maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {em.textBody || '(κενό email)'}
                </div>
                {/* Attachments */}
                {em.attachments?.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {em.attachments.map((att: any) => (
                      <span key={att.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const url = `/api/email/messages/${em.id}/attachments/${att.id}?filename=${encodeURIComponent(att.filename)}&mime=${encodeURIComponent(att.mimeType || 'application/octet-stream')}`;
                            const a = document.createElement('a');
                            a.href = url; a.download = att.filename; a.click();
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: '6px 0 0 6px',
                            border: '1px solid var(--border)', borderRight: 'none', background: 'rgba(255,255,255,0.02)',
                            fontSize: '1rem', color: 'var(--text-dim)', cursor: 'pointer',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.color = 'var(--blue)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)'; }}
                        >
                          <i className={`fas ${attIcon(att.filename)}`} style={{ fontSize: '0.6rem' }} />
                          <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.filename}</span>
                          <i className="fas fa-download" style={{ fontSize: '0.5rem', opacity: 0.5 }} />
                        </button>
                        <a
                          href={`presscal-fh://attachment?messageId=${em.id}&attId=${att.id}&mime=${encodeURIComponent(att.mimeType || 'application/octet-stream')}&filename=${encodeURIComponent(att.filename)}&quoteId=${quoteId}`}
                          onClick={e => e.stopPropagation()}
                          title="Open in File Helper"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '4px 10px', borderRadius: '0 6px 6px 0',
                            border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)',
                            fontSize: '1rem', color: '#f58220', cursor: 'pointer',
                            textDecoration: 'none',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#f58220'; e.currentTarget.style.background = 'rgba(245,130,32,0.06)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                        >
                          <i className="fas fa-external-link-alt" style={{ fontSize: '0.55rem' }} />
                          <span style={{ fontSize: '1rem' }}>Helper</span>
                        </a>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// AI PANEL — analyze linked emails or pick from inbox
// ═══════════════════════════════════════════════════════
function AiPanel({ linkedEmails, existingItems, description, onItemsCreated, toast }: {
  linkedEmails: string[];
  existingItems: any[];
  description: string | null | undefined;
  onItemsCreated: (items: any[]) => void;
  toast: (msg: string, type?: ToastType) => void;
}) {
  const [parsing, setParsing] = useState(false);
  const [parsingId, setParsingId] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [emailMetas, setEmailMetas] = useState<any[]>([]);
  const [loadingMetas, setLoadingMetas] = useState(false);

  // Check if items already have AI data
  const aiItems = existingItems.filter(i => i.aiParsed);
  const hasExistingAi = aiItems.length > 0;
  // For "pick from inbox" mode
  const [showInbox, setShowInbox] = useState(false);
  const [inboxMessages, setInboxMessages] = useState<any[]>([]);
  const [searchingInbox, setSearchingInbox] = useState(false);
  const [inboxQ, setInboxQ] = useState('');

  // Fetch linked email metadata for display
  useEffect(() => {
    if (!linkedEmails?.length) return;
    setLoadingMetas(true);
    Promise.all(linkedEmails.map(id =>
      fetch(`/api/email/messages/${id}`).then(r => r.ok ? r.json() : null).catch(() => null)
    )).then(results => {
      setEmailMetas(results.filter(Boolean));
      setLoadingMetas(false);
    });
  }, [linkedEmails]);

  async function analyzeEmail(email: any) {
    setParsingId(email.id);
    setParsing(true);
    try {
      const body = email.textBody || email.htmlBody || email.snippet || '';
      const res = await fetch('/api/ai/parse-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailBody: body, subject: email.subject, senderEmail: email.from }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { toast(data.error || 'Σφάλμα AI', 'error'); return; }
      setResult(data);
      // Auto-add items
      if (data.items?.length) onItemsCreated(data.items.map((ai: any) => aiToItem(ai)));
    } catch (e) { toast('Σφάλμα: ' + (e as Error).message, 'error'); }
    finally { setParsing(false); setParsingId(null); }
  }

  async function analyzeFromInbox(msg: any) {
    // First fetch full message body
    setParsingId(msg.id);
    setParsing(true);
    try {
      const fullRes = await fetch(`/api/email/messages/${msg.id}`);
      if (!fullRes.ok) { toast('Σφάλμα φόρτωσης email', 'error'); return; }
      const full = await fullRes.json();
      await analyzeEmailBody(full);
    } catch (e) { toast('Σφάλμα: ' + (e as Error).message, 'error'); }
    finally { setParsing(false); setParsingId(null); }
  }

  async function analyzeEmailBody(email: any) {
    const body = email.textBody || email.htmlBody || email.snippet || '';
    const res = await fetch('/api/ai/parse-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailBody: body, subject: email.subject, senderEmail: email.from }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) { toast(data.error || 'Σφάλμα AI', 'error'); return; }
    setResult(data);
    setShowInbox(false);
    // Auto-add items
    if (data.items?.length) onItemsCreated(data.items.map((ai: any) => aiToItem(ai)));
  }

  async function searchInbox() {
    setSearchingInbox(true);
    try {
      const q = inboxQ.trim() || 'newer_than:7d';
      const res = await fetch(`/api/email/messages?maxResults=10&q=${encodeURIComponent(q)}`);
      if (res.ok) { const data = await res.json(); setInboxMessages(data.messages || []); }
    } catch {} finally { setSearchingInbox(false); }
  }

  const CONF_COLORS: Record<string, string> = { high: 'var(--success)', medium: 'var(--accent)', low: 'var(--danger)' };

  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--border)', padding: 16, minHeight: 180 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <i className="fas fa-robot" style={{ fontSize: '0.92rem', color: 'var(--violet)' }} />
        <span style={{ fontSize: '0.85rem', fontWeight: 600, flex: 1 }}>AI Ανάλυση</span>
        {!result && !hasExistingAi && (
          <button onClick={() => { setShowInbox(!showInbox); if (!showInbox && !inboxMessages.length) searchInbox(); }} style={{
            padding: '3px 8px', borderRadius: 5, fontSize: '0.78rem', fontWeight: 500,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--violet)', cursor: 'pointer',
          }}>
            <i className="fas fa-inbox" style={{ marginRight: 3 }} /> Από Inbox
          </button>
        )}
      </div>

      {/* Show existing AI data from items */}
      {hasExistingAi && !result ? (
        <>
          {description && (
            <div style={{
              padding: '8px 10px', borderRadius: 6, marginBottom: 10,
              background: 'color-mix(in srgb, var(--violet) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--violet) 15%, transparent)',
              fontSize: '1rem', color: 'var(--text-dim)', lineHeight: 1.5,
            }}>
              <i className="fas fa-lightbulb" style={{ color: 'var(--violet)', marginRight: 6 }} />
              {description}
            </div>
          )}
          {aiItems.map((item: any, idx: number) => {
            const ai = item.aiParsed;
            if (!ai) return null;
            return (
              <div key={idx} style={{
                padding: '8px 10px', borderRadius: 6, marginBottom: 6,
                border: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{ai.description || item.name}</span>
                  {ai.confidence && <span style={{
                    padding: '1px 6px', borderRadius: 8, fontSize: '0.55rem', fontWeight: 600,
                    background: `color-mix(in srgb, ${CONF_COLORS[ai.confidence] || 'var(--text-muted)'} 15%, transparent)`,
                    color: CONF_COLORS[ai.confidence] || 'var(--text-muted)',
                  }}>{ai.confidence}</span>}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.92rem', color: 'var(--text-muted)' }}>
                  {ai.quantity && <span><i className="fas fa-layer-group" style={{ marginRight: 3, fontSize: '0.55rem' }} />{ai.quantity} τεμ</span>}
                  {ai.dimensions && <span><i className="fas fa-ruler" style={{ marginRight: 3, fontSize: '0.55rem' }} />{ai.dimensions}</span>}
                  {ai.colors && <span><i className="fas fa-palette" style={{ marginRight: 3, fontSize: '0.55rem' }} />{ai.colors}</span>}
                  {ai.paperType && <span><i className="fas fa-file" style={{ marginRight: 3, fontSize: '0.55rem' }} />{ai.paperType}</span>}
                  {ai.finishing?.length > 0 && <span><i className="fas fa-cut" style={{ marginRight: 3, fontSize: '0.55rem' }} />{ai.finishing.join(', ')}</span>}
                </div>
                {ai.specialNotes && <div style={{ fontSize: '1rem', color: 'var(--accent)', marginTop: 4 }}><i className="fas fa-exclamation-circle" style={{ marginRight: 3 }} />{ai.specialNotes}</div>}
              </div>
            );
          })}
        </>
      ) : result ? (
        /* ─── AI Results ─── */
        <>
          {result.customerInterpretation && (
            <div style={{
              padding: '8px 10px', borderRadius: 6, marginBottom: 10,
              background: 'color-mix(in srgb, var(--violet) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--violet) 15%, transparent)',
              fontSize: '1rem', color: 'var(--text-dim)', lineHeight: 1.5,
            }}>
              <i className="fas fa-lightbulb" style={{ color: 'var(--violet)', marginRight: 6 }} />
              {result.customerInterpretation}
            </div>
          )}
          {result.items?.map((ai: any, idx: number) => (
            <div key={idx} style={{
              padding: '8px 10px', borderRadius: 6, marginBottom: 6,
              border: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{ai.description}</span>
                <span style={{
                  padding: '1px 6px', borderRadius: 8, fontSize: '0.55rem', fontWeight: 600,
                  background: `color-mix(in srgb, ${CONF_COLORS[ai.confidence] || 'var(--text-muted)'} 15%, transparent)`,
                  color: CONF_COLORS[ai.confidence] || 'var(--text-muted)',
                }}>{ai.confidence}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.92rem', color: 'var(--text-muted)' }}>
                {ai.quantity && <span><i className="fas fa-layer-group" style={{ marginRight: 3, fontSize: '0.55rem' }} />{ai.quantity} τεμ</span>}
                {ai.dimensions && <span><i className="fas fa-ruler" style={{ marginRight: 3, fontSize: '0.55rem' }} />{ai.dimensions}</span>}
                {ai.colors && <span><i className="fas fa-palette" style={{ marginRight: 3, fontSize: '0.55rem' }} />{ai.colors}</span>}
                {ai.paperType && <span><i className="fas fa-file" style={{ marginRight: 3, fontSize: '0.55rem' }} />{ai.paperType}</span>}
                {ai.finishing?.length > 0 && <span><i className="fas fa-cut" style={{ marginRight: 3, fontSize: '0.55rem' }} />{ai.finishing.join(', ')}</span>}
              </div>
              {ai.specialNotes && <div style={{ fontSize: '1rem', color: 'var(--accent)', marginTop: 4 }}><i className="fas fa-exclamation-circle" style={{ marginRight: 3 }} />{ai.specialNotes}</div>}
            </div>
          ))}
          <div style={{ fontSize: '0.78rem', color: 'var(--success)', marginTop: 8, textAlign: 'center' }}>
            <i className="fas fa-check-circle" style={{ marginRight: 4 }} />
            Προστέθηκαν αυτόματα στα είδη
          </div>
        </>
      ) : showInbox ? (
        /* ─── Pick from Inbox ─── */
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input value={inboxQ} onChange={e => setInboxQ(e.target.value)} placeholder="Αναζήτηση (π.χ. from:customer@...)"
              onKeyDown={e => e.key === 'Enter' && searchInbox()}
              style={{ flex: 1, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--text)', fontSize: '1rem', outline: 'none' }} />
            <button onClick={searchInbox} disabled={searchingInbox} style={{
              padding: '6px 10px', borderRadius: 6, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: '1rem', cursor: 'pointer',
            }}>{searchingInbox ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-search" />}</button>
          </div>
          {inboxMessages.length === 0 ? (
            <div style={{ fontSize: '0.92rem', color: 'var(--text-muted)', textAlign: 'center', padding: 10 }}>
              {searchingInbox ? 'Αναζήτηση...' : 'Κανένα αποτέλεσμα'}
            </div>
          ) : inboxMessages.map(msg => (
            <div key={msg.id} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 4px',
              borderBottom: '1px solid var(--border)', fontSize: '1rem',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{msg.subject || '(χωρίς θέμα)'}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>{msg.from}</div>
              </div>
              <button onClick={() => analyzeFromInbox(msg)} disabled={parsing} style={{
                padding: '3px 8px', borderRadius: 5, border: 'none', whiteSpace: 'nowrap',
                background: 'color-mix(in srgb, var(--violet) 15%, transparent)', color: 'var(--violet)',
                fontSize: '0.6rem', fontWeight: 600, cursor: 'pointer',
                opacity: parsing && parsingId === msg.id ? 0.6 : 1,
              }}>
                {parsing && parsingId === msg.id ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-magic" /> Ανάλυση</>}
              </button>
            </div>
          ))}
        </>
      ) : (
        /* ─── Linked emails with analyze button ─── */
        <>
          {loadingMetas ? (
            <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)' }}><i className="fas fa-spinner fa-spin" /></div>
          ) : emailMetas.length > 0 ? (
            emailMetas.map(em => (
              <div key={em.id} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 6px',
                borderBottom: '1px solid var(--border)', fontSize: '1rem',
              }}>
                <i className="fas fa-envelope" style={{ fontSize: '0.55rem', color: 'var(--blue)', opacity: 0.5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{em.subject || '(χωρίς θέμα)'}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>{em.from}</div>
                </div>
                <button onClick={() => analyzeEmail(em)} disabled={parsing} style={{
                  padding: '3px 10px', borderRadius: 5, border: 'none', whiteSpace: 'nowrap',
                  background: 'var(--violet)', color: '#fff',
                  fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                  opacity: parsing && parsingId === em.id ? 0.6 : 1,
                }}>
                  {parsing && parsingId === em.id ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-magic" style={{ marginRight: 3 }} />Ανάλυση</>}
                </button>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: '1rem', opacity: 0.5 }}>
              <i className="fas fa-robot" style={{ fontSize: '1rem', marginBottom: 6, display: 'block' }} />
              Συνδέστε email ή επιλέξτε "Από Inbox"
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// REPLY PANEL — quick reply to customer
// ═══════════════════════════════════════════════════════
function ReplyPanel({ customerEmail, threadId, quoteNumber, toast }: {
  customerEmail: string;
  threadId: string | null;
  quoteNumber: string;
  toast: (msg: string, type?: ToastType) => void;
}) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!customerEmail) { toast('Ο πελάτης δεν έχει email', 'error'); return; }
    if (!body.trim()) { toast('Γράψτε μήνυμα', 'info'); return; }
    setSending(true);
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: customerEmail,
          subject: `Re: ${quoteNumber}`,
          body: body.replace(/\n/g, '<br>'),
          threadId: threadId || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) { toast(data.error || 'Σφάλμα αποστολής', 'error'); return; }
      toast('Απεστάλη');
      setBody('');
    } catch (e) { toast('Σφάλμα: ' + (e as Error).message, 'error'); }
    finally { setSending(false); }
  }

  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--border)', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <i className="fas fa-reply" style={{ fontSize: '0.92rem', color: 'var(--teal)' }} />
        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Απάντηση</span>
        {customerEmail && <span style={{ fontSize: '1rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{customerEmail}</span>}
      </div>
      {customerEmail ? (
        <>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Γράψτε απάντηση στον πελάτη..."
            rows={3}
            style={{
              width: '100%', background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: '1rem',
              resize: 'vertical', outline: 'none', marginBottom: 8,
            }}
          />
          <button onClick={send} disabled={sending || !body.trim()} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 14px', borderRadius: 6, border: 'none',
            background: body.trim() ? 'var(--teal)' : 'var(--border)',
            color: '#fff', fontSize: '0.85rem', fontWeight: 600,
            cursor: body.trim() ? 'pointer' : 'not-allowed', opacity: sending ? 0.6 : 1,
            marginLeft: 'auto',
          }}>
            {sending ? <><i className="fas fa-spinner fa-spin" /> Αποστολή...</> : <><i className="fas fa-paper-plane" /> Αποστολή</>}
          </button>
        </>
      ) : (
        <div style={{ fontSize: '1rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0', opacity: 0.5 }}>
          Ο πελάτης δεν έχει email
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SEND QUOTE MODAL
// ═══════════════════════════════════════════════════════
function SendQuoteModal({ quoteId, quoteNumber, customerEmail, customerName, grandTotal, companyContacts, linkedEmails, onClose, onSent, toast }: {
  quoteId: string;
  quoteNumber: string;
  customerEmail: string;
  customerName: string;
  grandTotal: number;
  companyContacts?: any[];
  linkedEmails?: string[];
  onClose: () => void;
  onSent: () => void;
  toast: (msg: string, type?: ToastType) => void;
}) {
  const [to, setTo] = useState(customerEmail);
  const [cc, setCc] = useState('');

  // Suggest CC from other company contacts (not the primary "to")
  const ccSuggestions = (companyContacts || [])
    .map((cc: any) => cc.contact)
    .filter((c: any) => c?.email && c.email.toLowerCase() !== customerEmail.toLowerCase());
  const [lang, setLang] = useState<'el' | 'en'>('el');
  const [customMessage, setCustomMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Fallback: if no customer email, try to extract from linked emails
  useEffect(() => {
    if (to || !linkedEmails?.length) return;
    fetch(`/api/email/messages/${linkedEmails[0]}`)
      .then(r => r.ok ? r.json() : null)
      .then(msg => {
        if (!msg?.from) return;
        // Extract email from "Name <email>" format
        const match = msg.from.match(/<([^>]+)>/) || [null, msg.from];
        if (match[1]) setTo(match[1]);
      })
      .catch(() => {});
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const subject = lang === 'en' ? `Quote ${quoteNumber}` : `Προσφορά ${quoteNumber}`;

  async function send() {
    if (!to.trim()) { toast('Εισάγετε email παραλήπτη', 'error'); return; }
    setSending(true);
    try {
      const res = await fetch('/api/quote/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId, to: to.trim(), cc: cc.trim() || undefined, lang, customMessage: customMessage.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { toast(data.error || 'Σφάλμα αποστολής', 'error'); return; }
      onSent();
    } catch (e) { toast('Σφάλμα: ' + (e as Error).message, 'error'); }
    finally { setSending(false); }
  }

  const inp = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: '0.92rem', width: '100%', outline: 'none' } as const;

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      background: 'rgba(0,0,0,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 480, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-paper-plane" style={{ color: 'var(--blue)' }} />
            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Αποστολή Προσφοράς</h2>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }}>&times;</button>
        </div>

        {/* Preview card */}
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700 }}>{quoteNumber}</div>
            <div style={{ fontSize: '0.92rem', color: 'var(--text-muted)' }}>{customerName}</div>
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(grandTotal)}
          </div>
        </div>

        {/* To */}
        <label style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Προς</label>
        <input value={to} onChange={e => setTo(e.target.value)} placeholder="email@example.com" style={{ ...inp, marginBottom: 10 }} />

        {/* CC */}
        <label style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>CC (προαιρετικό)</label>
        <input value={cc} onChange={e => setCc(e.target.value)} placeholder="cc@example.com" style={{ ...inp, marginBottom: ccSuggestions.length > 0 ? 6 : 10 }} />
        {ccSuggestions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {ccSuggestions.map((contact: any) => {
              const alreadyInCc = cc.toLowerCase().includes(contact.email.toLowerCase());
              return (
                <button
                  key={contact.id}
                  onClick={() => {
                    if (alreadyInCc) return;
                    setCc(prev => prev ? `${prev}, ${contact.email}` : contact.email);
                  }}
                  style={{
                    padding: '3px 10px', borderRadius: 12, border: '1px solid var(--glass-border)',
                    background: alreadyInCc ? 'color-mix(in srgb, var(--teal) 12%, transparent)' : 'transparent',
                    color: alreadyInCc ? 'var(--teal)' : '#94a3b8',
                    fontSize: '0.72rem', cursor: alreadyInCc ? 'default' : 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 4,
                    transition: 'all 0.15s',
                  }}
                >
                  <i className={`fas ${alreadyInCc ? 'fa-check' : 'fa-plus'}`} style={{ fontSize: '0.55rem' }} />
                  {contact.name} · {contact.email}
                </button>
              );
            })}
          </div>
        )}

        {/* Language */}
        <label style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Γλώσσα</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(['el', 'en'] as const).map(l => (
            <button key={l} onClick={() => setLang(l)} style={{
              padding: '5px 14px', borderRadius: 6, fontSize: '1rem', fontWeight: 600,
              background: lang === l ? 'color-mix(in srgb, var(--blue) 15%, transparent)' : 'transparent',
              border: lang === l ? '1px solid var(--blue)' : '1px solid var(--border)',
              color: lang === l ? 'var(--blue)' : 'var(--text-muted)', cursor: 'pointer',
            }}>
              {l === 'el' ? 'Ελληνικά' : 'English'}
            </button>
          ))}
        </div>

        {/* Subject preview */}
        <label style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Θέμα</label>
        <div style={{ ...inp, marginBottom: 10, color: 'var(--text-dim)', background: 'rgba(255,255,255,0.02)' }}>{subject}</div>

        {/* Custom message */}
        <label style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Μήνυμα (προαιρετικό)</label>
        <textarea value={customMessage} onChange={e => setCustomMessage(e.target.value)} rows={2}
          placeholder={lang === 'el' ? 'Σας αποστέλλουμε την προσφορά μας...' : 'Please find our quote below...'}
          style={{ ...inp, marginBottom: 16, resize: 'vertical' }} />

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.92rem', cursor: 'pointer' }}>Ακύρωση</button>
          <button onClick={send} disabled={sending || !to.trim()} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: to.trim() ? 'var(--blue)' : 'var(--border)',
            color: '#fff', fontSize: '0.92rem', fontWeight: 700,
            cursor: to.trim() ? 'pointer' : 'not-allowed', opacity: sending ? 0.6 : 1,
          }}>
            {sending ? <><i className="fas fa-spinner fa-spin" /> Αποστολή...</> : <><i className="fas fa-paper-plane" /> Αποστολή</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ═══════════════════════════════════════════════════════
// CUSTOMER PICKER — dropdown to select/change customer
// ═══════════════════════════════════════════════════════
function CustomerPicker({ customers, currentId, linkedEmails, onSelect, onClose, toast }: {
  customers: any[];
  currentId: string;
  linkedEmails: string[];
  onSelect: (id: string) => void;
  onClose: () => void;
  toast: (msg: string, type?: ToastType) => void;
}) {
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'current' | 'list' | 'new' | 'edit'>(currentId ? 'current' : 'list');
  const currentCustomer = customers.find(c => c.id === currentId);
  const [editId, setEditId] = useState('');
  const [formName, setFormName] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAfm, setFormAfm] = useState('');
  const [formFolder, setFormFolder] = useState('');
  const [saving, setSaving] = useState(false);
  const [emailSender, setEmailSender] = useState<{ name: string; email: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Elorus search
  const [elorusResults, setElorusResults] = useState<{ id: string; display_name: string; company: string; tin: string; email: string }[]>([]);
  const [elorusLoading, setElorusLoading] = useState(false);
  const [elorusImporting, setElorusImporting] = useState<string | null>(null);
  const elorusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inp: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: '0.85rem', outline: 'none',
  };

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Extract sender info from first linked email for pre-fill
  useEffect(() => {
    if (!linkedEmails?.length) return;
    fetch(`/api/email/messages/${linkedEmails[0]}`)
      .then(r => r.ok ? r.json() : null)
      .then(msg => {
        if (!msg?.from) return;
        const emailMatch = msg.from.match(/<([^>]+)>/);
        const email = emailMatch ? emailMatch[1] : msg.from.trim();
        const name = msg.from.replace(/<[^>]+>/, '').replace(/"/g, '').trim();
        setEmailSender({ name, email });
      })
      .catch(() => {});
  }, [linkedEmails]);

  // Elorus search (debounced)
  useEffect(() => {
    if (elorusTimer.current) clearTimeout(elorusTimer.current);
    if (!search || search.length < 2) { setElorusResults([]); return; }
    elorusTimer.current = setTimeout(async () => {
      setElorusLoading(true);
      try {
        const res = await fetch('/api/elorus/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'search', search }),
        });
        const data = await res.json();
        // Filter out contacts already in local DB (by AFM match)
        const localAfms = new Set(customers.map((c: any) => c.afm).filter(Boolean));
        setElorusResults((data.contacts || []).filter((e: any) => !e.tin || !localAfms.has(e.tin)));
      } catch { setElorusResults([]); }
      finally { setElorusLoading(false); }
    }, 400);
    return () => { if (elorusTimer.current) clearTimeout(elorusTimer.current); };
  }, [search, customers]);

  // Import Elorus contact → create Company via AADE lookup
  async function importElorus(ec: { id: string; display_name: string; company: string; tin: string; email: string }) {
    setElorusImporting(ec.id);
    try {
      let companyName = ec.company || ec.display_name;
      let doy = '';
      let address = '';
      let city = '';
      let zip = '';
      let email = ec.email || '';

      // AADE lookup if we have AFM
      if (ec.tin && ec.tin.length === 9) {
        const aadeRes = await fetch('/api/elorus/lookup-afm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ afm: ec.tin }),
        }).then(r => r.json()).catch(() => ({}));
        if (aadeRes?.company) companyName = aadeRes.company;
        if (aadeRes?.doy) doy = aadeRes.doy;
        if (aadeRes?.address) address = aadeRes.address;
        if (aadeRes?.city) city = aadeRes.city;
        if (aadeRes?.zip) zip = aadeRes.zip;
        if (aadeRes?.email && !email) email = aadeRes.email;
      }

      // Create Company in DB
      const { createCompanyFromElorus } = await import('../actions');
      const company = await createCompanyFromElorus({
        name: companyName,
        afm: ec.tin || undefined,
        doy: doy || undefined,
        email: email || undefined,
        address: address || undefined,
        city: city || undefined,
        zip: zip || undefined,
        elorusContactId: ec.id,
      });
      toast('Εισαγωγή από Elorus');
      onSelect(company.id);
    } catch (e) {
      toast('Σφάλμα: ' + (e as Error).message, 'error');
    } finally {
      setElorusImporting(null);
    }
  }

  function openNew() {
    setFormName(emailSender?.name || '');
    setFormEmail(emailSender?.email || '');
    setFormCompany('');
    setFormPhone('');
    setFormAfm('');
    setFormFolder('');
    setMode('new');
  }

  function openEdit(c: Customer) {
    setEditId(c.id);
    setFormName(c.name || '');
    setFormCompany(c.company || '');
    setFormEmail(c.email || '');
    setFormPhone(c.phone || '');
    setFormAfm(c.afm || '');
    setFormFolder((c as any).folderPath || '');
    setMode('edit');
  }

  async function saveCustomer() {
    if (!formName.trim()) { toast('Εισάγετε όνομα', 'error'); return; }
    setSaving(true);
    try {
      const data = {
        name: formName.trim(),
        company: formCompany.trim() || undefined,
        email: formEmail.trim() || undefined,
        phone: formPhone.trim() || undefined,
        afm: formAfm.trim() || undefined,
        folderPath: formFolder.trim() || undefined,
      };
      if (mode === 'new') {
        const c = await createCustomer(data as any);
        toast('Πελάτης δημιουργήθηκε');
        onSelect(c.id);
      } else {
        await updateCustomer(editId, data);
        toast('Πελάτης ενημερώθηκε');
        onSelect(editId);
      }
    } catch (e) {
      toast('Σφάλμα: ' + (e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const filtered = customers.filter((c: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    const contactMatch = c.companyContacts?.some((cc: any) =>
      cc.contact?.name?.toLowerCase().includes(s) || cc.contact?.email?.toLowerCase().includes(s)
    );
    return c.name.toLowerCase().includes(s) || (c.email || '').toLowerCase().includes(s) || (c.afm || '').includes(s) || contactMatch;
  });

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 50,
      width: 360, maxHeight: 420, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      background: '#141e37', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
    }}>
      {mode === 'current' && currentCustomer ? (
        /* Current customer quick-view with edit + change buttons */
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{currentCustomer.name}</div>
            {currentCustomer.companyContacts?.find((cc: any) => cc.isPrimary)?.contact && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                <i className="fas fa-user" style={{ fontSize: '0.6rem', marginRight: 4 }} />
                {currentCustomer.companyContacts.find((cc: any) => cc.isPrimary).contact.name}
                {currentCustomer.companyContacts.find((cc: any) => cc.isPrimary).contact.email && (
                  <span style={{ marginLeft: 6 }}>{currentCustomer.companyContacts.find((cc: any) => cc.isPrimary).contact.email}</span>
                )}
              </div>
            )}
            {currentCustomer.email && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 1 }}>{currentCustomer.email}</div>}
            {currentCustomer.phone && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 1 }}>{currentCustomer.phone}</div>}
            {currentCustomer.afm && <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 1 }}>ΑΦΜ {currentCustomer.afm}</div>}
            {currentCustomer.folderPath && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <i className="fas fa-folder" style={{ fontSize: '0.6rem', color: '#f58220' }} />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentCustomer.folderPath}
                </span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => openEdit(currentCustomer)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--blue)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              <i className="fas fa-pen" style={{ fontSize: '0.6rem' }} />Επεξεργασία
            </button>
            <button
              onClick={() => setMode('list')}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              <i className="fas fa-exchange-alt" style={{ fontSize: '0.6rem' }} />Αλλαγή
            </button>
            <button
              onClick={() => onSelect('')}
              style={{
                padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--danger)', fontSize: '0.75rem', cursor: 'pointer',
              }}
              title="Αφαίρεση πελάτη"
            >
              <i className="fas fa-times" />
            </button>
          </div>
        </div>
      ) : mode === 'list' ? (
        <>
          {/* Search + New button */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Αναζήτηση πελάτη..."
              autoFocus
              style={{ ...inp, flex: 1 }}
            />
            <button onClick={openNew} style={{
              padding: '0 12px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--accent)', fontSize: '0.82rem',
              cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,130,32,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <i className="fas fa-plus" style={{ marginRight: 4, fontSize: '0.65rem' }} />Νέος
            </button>
          </div>

          {/* Email sender hint */}
          {emailSender && !customers.some(c => c.email?.toLowerCase() === emailSender.email.toLowerCase()) && (
            <div
              onClick={openNew}
              style={{
                padding: '8px 12px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                background: 'rgba(245,130,32,0.04)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,130,32,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(245,130,32,0.04)')}
            >
              <i className="fas fa-envelope" style={{ fontSize: '0.65rem', color: 'var(--accent)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 600 }}>Δημιουργία από email</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{emailSender.name} · {emailSender.email}</div>
              </div>
              <i className="fas fa-plus" style={{ fontSize: '0.6rem', color: 'var(--accent)' }} />
            </div>
          )}

          {/* Customer list */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <div
              onClick={() => onSelect('')}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem',
                color: !currentId ? 'var(--accent)' : 'var(--text-muted)',
                fontStyle: 'italic',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              — Χωρίς πελάτη —
            </div>
            {filtered.map(c => (
              <div
                key={c.id}
                style={{
                  padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                  background: c.id === currentId ? 'rgba(255,255,255,0.03)' : 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = c.id === currentId ? 'rgba(255,255,255,0.03)' : 'transparent')}
              >
                <div style={{ flex: 1, minWidth: 0 }} onClick={() => onSelect(c.id)}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>
                    {c.name}
                    {c.id === currentId && <i className="fas fa-check" style={{ marginLeft: 6, fontSize: '0.65rem', color: 'var(--success)' }} />}
                  </div>
                  {(c.email || c.companyContacts?.length > 0) && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 1 }}>
                      {c.companyContacts?.find((cc: any) => cc.isPrimary)?.contact?.name && (
                        <span><i className="fas fa-user" style={{ fontSize: '0.55rem', marginRight: 3 }} />{c.companyContacts.find((cc: any) => cc.isPrimary).contact.name}</span>
                      )}
                      {c.companyContacts?.find((cc: any) => cc.isPrimary)?.contact?.name && c.email && <span> · </span>}
                      {c.email && <span>{c.email}</span>}
                      {c.afm && <span> · ΑΦΜ {c.afm}</span>}
                    </div>
                  )}
                </div>
                {/* Edit button */}
                <button
                  onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                  style={{
                    padding: '4px 8px', border: 'none', background: 'transparent',
                    color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.65rem',
                    borderRadius: 4, flexShrink: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--blue)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                  title="Επεξεργασία"
                >
                  <i className="fas fa-pen" />
                </button>
              </div>
            ))}
            {filtered.length === 0 && !elorusResults.length && !elorusLoading && (
              <div style={{ padding: '16px 12px', fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Κανένα αποτέλεσμα
              </div>
            )}

            {/* Elorus results */}
            {(elorusResults.length > 0 || elorusLoading) && (
              <>
                <div style={{
                  padding: '6px 12px', fontSize: '0.7rem', fontWeight: 600, color: '#64748b',
                  borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                  background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <i className="fas fa-cloud-download-alt" style={{ fontSize: '0.6rem' }} />
                  Elorus
                  {elorusLoading && <i className="fas fa-spinner fa-spin" style={{ fontSize: '0.55rem', marginLeft: 'auto' }} />}
                </div>
                {elorusResults.map(ec => (
                  <div
                    key={ec.id}
                    onClick={() => !elorusImporting && importElorus(ec)}
                    style={{
                      padding: '8px 12px', cursor: elorusImporting ? 'wait' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                      opacity: elorusImporting && elorusImporting !== ec.id ? 0.4 : 1,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <i className="fas fa-building" style={{ fontSize: '0.65rem', color: '#3b82f6', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                        {ec.company || ec.display_name}
                        {elorusImporting === ec.id && <i className="fas fa-spinner fa-spin" style={{ marginLeft: 6, fontSize: '0.6rem' }} />}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {ec.tin && <span>ΑΦΜ {ec.tin}</span>}
                        {ec.tin && ec.email && <span> · </span>}
                        {ec.email && <span>{ec.email}</span>}
                      </div>
                    </div>
                    <i className="fas fa-plus" style={{ fontSize: '0.55rem', color: 'var(--accent)', flexShrink: 0 }} />
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      ) : (
        /* New / Edit form */
        <>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setMode('list')} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>
              <i className="fas fa-arrow-left" />
            </button>
            <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>
              {mode === 'new' ? 'Νέα Εταιρεία' : 'Επεξεργασία Εταιρείας'}
            </span>
          </div>
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 3 }}>Όνομα *</label>
              <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ονοματεπώνυμο" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 3 }}>Εταιρεία</label>
              <input value={formCompany} onChange={e => setFormCompany(e.target.value)} placeholder="Επωνυμία" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 3 }}>Email</label>
              <input value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="email@example.com" type="email" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 3 }}>Τηλέφωνο</label>
              <input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="+30..." style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 3 }}>ΑΦΜ</label>
              <input value={formAfm} onChange={e => setFormAfm(e.target.value)} placeholder="ΑΦΜ" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 3 }}>
                <i className="fas fa-folder" style={{ marginRight: 4, fontSize: '0.65rem' }} />Φάκελος Πελάτη
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input value={formFolder} onChange={e => setFormFolder(e.target.value)} placeholder="Paste path ή επιλογή μέσω Helper →" style={{ ...inp, flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }} />
                {mode === 'edit' && editId && (
                  <a
                    href={`presscal-fh://pick-folder?customerId=${editId}`}
                    title="Επιλογή μέσω File Helper"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '7px 10px', borderRadius: 6,
                      border: '1px solid var(--border)', background: 'rgba(245,130,32,0.06)',
                      color: '#f58220', cursor: 'pointer', textDecoration: 'none', flexShrink: 0,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,130,32,0.12)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(245,130,32,0.06)')}
                  >
                    <i className="fas fa-folder-open" style={{ fontSize: '0.75rem' }} />
                  </a>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => setMode('list')} style={{
                flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer',
              }}>Ακύρωση</button>
              <button onClick={saveCustomer} disabled={saving || !formName.trim()} style={{
                flex: 1, padding: '8px 0', borderRadius: 6, border: 'none',
                background: 'var(--accent)', color: '#fff', fontSize: '0.85rem', fontWeight: 700,
                cursor: 'pointer', opacity: (saving || !formName.trim()) ? 0.5 : 1,
              }}>
                {saving ? 'Αποθήκευση...' : mode === 'new' ? 'Δημιουργία' : 'Αποθήκευση'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ELORUS INVOICE MODAL — search/create contact + invoice
// ═══════════════════════════════════════════════════════
function ElorusInvoiceModal({ quoteId, quoteNumber, customerName, customerAfm, customerElorusId, grandTotal, elorusSlug, onClose, onCreated, toast }: {
  quoteId: string;
  quoteNumber: string;
  customerName: string;
  customerAfm: string;
  customerElorusId: string;
  grandTotal: number;
  elorusSlug: string;
  onClose: () => void;
  onCreated: (invoiceId: string, invoiceUrl: string, contactId: string) => void;
  toast: (msg: string, type?: ToastType) => void;
}) {
  const [tab, setTab] = useState<'search' | 'create'>('search');
  const [search, setSearch] = useState(customerName);
  const [contacts, setContacts] = useState<{ id: string; display_name: string; company: string; tin: string; email: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create form
  const [afm, setAfm] = useState(customerAfm);
  const [company, setCompany] = useState('');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupContactId, setLookupContactId] = useState('');

  const inp = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: '0.85rem', width: '100%', outline: 'none' } as const;

  // Auto-search on mount
  useEffect(() => {
    if (search.length >= 2) doSearch(search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function doSearch(q: string) {
    setSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 2) { setContacts([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch('/api/elorus/contacts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'search', search: q }),
        });
        const data = await res.json();
        setContacts(data.contacts || []);
      } catch { /* ignore */ }
      setSearching(false);
    }, 300);
  }

  async function selectContact(contactId: string, contactAfm: string) {
    setCreating(true);
    try {
      const res = await fetch('/api/elorus/invoice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId, elorusContactId: contactId, clientAfm: contactAfm }),
      });
      const data = await res.json();
      if (data.ok) {
        onCreated(data.invoiceId, data.invoiceUrl, data.contactId);
      } else {
        toast(data.error || 'Σφάλμα', 'error');
      }
    } catch (e) { toast('Σφάλμα: ' + (e as Error).message, 'error'); }
    setCreating(false);
  }

  // If customer already has Elorus contact, use directly
  async function useExistingContact() {
    if (customerElorusId) {
      await selectContact(customerElorusId, customerAfm);
    }
  }

  async function lookupAfm() {
    if (!afm || afm.length !== 9) { toast('ΑΦΜ πρέπει να είναι 9 ψηφία', 'error'); return; }
    setLookupLoading(true);
    try {
      const res = await fetch('/api/elorus/lookup-afm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ afm }),
      });
      const data = await res.json();
      if (data.error) { toast(data.error, 'error'); setLookupLoading(false); return; }
      if (data.onomasia) setCompany(data.onomasia);
      if (data.postal_address) setAddress(data.postal_address);
      if (data.postal_area_description) setCity(data.postal_area_description);
      if (data.postal_zip_code) setZip(data.postal_zip_code);
      if (data.email) setEmail(data.email);
      if (data.elorusContactId) setLookupContactId(data.elorusContactId);
      toast(data.source === 'elorus_existing' ? 'Βρέθηκε στο Elorus' : 'Βρέθηκε μέσω ΑΑΔΕ', 'info');
    } catch (e) { toast('Σφάλμα: ' + (e as Error).message, 'error'); }
    setLookupLoading(false);
  }

  async function createAndInvoice() {
    setCreating(true);
    try {
      let contactId = lookupContactId;
      // Create contact if no existing one
      if (!contactId) {
        const cRes = await fetch('/api/elorus/contacts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create', company, firstName, afm, email, address, city, zip }),
        });
        const cData = await cRes.json();
        if (!cData.ok) { toast(cData.error || 'Σφάλμα δημιουργίας', 'error'); setCreating(false); return; }
        contactId = cData.contact.id;
      }
      // Create invoice
      await selectContact(contactId, afm);
    } catch (e) { toast('Σφάλμα: ' + (e as Error).message, 'error'); setCreating(false); }
  }

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      background: 'rgba(0,0,0,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 520, maxHeight: '85vh', overflow: 'auto',
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-file-invoice-dollar" style={{ color: '#4f46e5' }} />
            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Τιμολόγηση — Elorus</h2>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }}>&times;</button>
        </div>

        {/* Preview card */}
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{quoteNumber}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{customerName || 'Χωρίς πελάτη'}</div>
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(grandTotal)}
          </div>
        </div>

        {/* Quick use existing contact */}
        {customerElorusId && (
          <button onClick={useExistingContact} disabled={creating} style={{
            width: '100%', padding: '10px 14px', borderRadius: 8, marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'color-mix(in srgb, var(--success) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)',
            color: 'var(--success)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
            opacity: creating ? 0.5 : 1,
          }}>
            <i className="fas fa-bolt" /> Γρήγορη τιμολόγηση (υπάρχουσα επαφή Elorus)
          </button>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 3 }}>
          {([['search', 'Αναζήτηση', 'fa-search'], ['create', 'Νέα Επαφή', 'fa-user-plus']] as const).map(([id, label, icon]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, padding: '7px 0', borderRadius: 6, border: 'none',
              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              color: tab === id ? '#4f46e5' : 'var(--text-muted)',
              background: tab === id ? 'color-mix(in srgb, #4f46e5 12%, transparent)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}>
              <i className={`fas ${icon}`} style={{ fontSize: '0.6rem' }} /> {label}
            </button>
          ))}
        </div>

        {/* ── SEARCH TAB ── */}
        {tab === 'search' && (
          <div>
            <input
              value={search} onChange={e => doSearch(e.target.value)}
              placeholder="Αναζήτηση επαφής (όνομα, εταιρεία, ΑΦΜ)..."
              style={{ ...inp, marginBottom: 10 }}
              autoFocus
            />
            {searching && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}><i className="fas fa-spinner fa-spin" /> Αναζήτηση...</p>}
            <div style={{ maxHeight: 250, overflow: 'auto' }}>
              {contacts.map(c => (
                <button key={c.id} onClick={() => selectContact(c.id, c.tin)} disabled={creating}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'transparent', cursor: 'pointer', marginBottom: 4, textAlign: 'left',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(79,70,229,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>{c.company || c.display_name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {c.tin && <span>ΑΦΜ: {c.tin}</span>}
                      {c.email && <span style={{ marginLeft: 8 }}>{c.email}</span>}
                    </div>
                  </div>
                  <i className="fas fa-arrow-right" style={{ color: '#4f46e5', fontSize: '0.7rem' }} />
                </button>
              ))}
              {!searching && search.length >= 2 && contacts.length === 0 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>
                  Δεν βρέθηκαν αποτελέσματα — δοκιμάστε &quot;Νέα Επαφή&quot;
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── CREATE TAB ── */}
        {tab === 'create' && (
          <div>
            {/* AFM Lookup */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>ΑΦΜ</label>
                <input value={afm} onChange={e => setAfm(e.target.value)} placeholder="9 ψηφία" maxLength={9} style={inp} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button onClick={lookupAfm} disabled={lookupLoading || afm.length !== 9} style={{
                  padding: '8px 14px', borderRadius: 6, border: '1px solid #4f46e5',
                  background: 'color-mix(in srgb, #4f46e5 10%, transparent)',
                  color: '#4f46e5', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                  opacity: (lookupLoading || afm.length !== 9) ? 0.4 : 1, whiteSpace: 'nowrap',
                }}>
                  {lookupLoading ? <><i className="fas fa-spinner fa-spin" /> ΑΑΔΕ...</> : <><i className="fas fa-search" /> Αναζήτηση ΑΑΔΕ</>}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Εταιρεία</label>
                <input value={company} onChange={e => setCompany(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Όνομα</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} style={inp} />
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} style={inp} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Διεύθυνση</label>
                <input value={address} onChange={e => setAddress(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Πόλη</label>
                <input value={city} onChange={e => setCity(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>ΤΚ</label>
                <input value={zip} onChange={e => setZip(e.target.value)} style={inp} />
              </div>
            </div>

            <button onClick={createAndInvoice} disabled={creating || (!company && !firstName) || afm.length !== 9} style={{
              width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
              background: (!company && !firstName) || afm.length !== 9 ? 'var(--border)' : '#4f46e5',
              color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
              opacity: creating ? 0.5 : 1,
            }}>
              {creating ? <><i className="fas fa-spinner fa-spin" /> Δημιουργία...</> : <><i className="fas fa-file-invoice-dollar" /> Δημιουργία Επαφής & Τιμολόγηση</>}
            </button>
          </div>
        )}

        {creating && (
          <div style={{ textAlign: 'center', padding: '12px 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <i className="fas fa-spinner fa-spin" /> Δημιουργία τιμολογίου στο Elorus...
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ═══ COURIER VOUCHER MODAL ═══
function CourierVoucherModal({ quoteId, company, onClose, onCreated }: {
  quoteId: string;
  company: any;
  onClose: () => void;
  onCreated: (voucherId: string) => void;
}) {
  const primaryContact = company?.companyContacts?.find((cc: any) => cc.isPrimary)?.contact;
  const [name, setName] = useState(company?.name || '');
  const [phone, setPhone] = useState(primaryContact?.phone || company?.phone || '');
  const [address, setAddress] = useState(company?.address || '');
  const [city, setCity] = useState(company?.city || '');
  const [zip, setZip] = useState(company?.zip || '');
  const [weight, setWeight] = useState(1);
  const [cod, setCod] = useState(0);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const inp: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: '0.85rem', outline: 'none',
  };

  async function handleCreate() {
    if (!name || !phone || !address || !city || !zip) { setError('Συμπληρώστε όλα τα πεδία'); return; }
    setBusy(true); setError('');
    const res = await fetch('/api/courier', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'createVoucher', quoteId,
        receiverName: name, receiverPhone: phone,
        receiverAddress: address, receiverCity: city, receiverZip: zip,
        weight, cod: cod > 0 ? cod : undefined, notes,
      }),
    }).then(r => r.json());
    setBusy(false);
    if (res.ok) onCreated(res.voucherId);
    else setError(res.error || 'Σφάλμα');
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#141e37', border: '1px solid var(--border)', borderRadius: 14, width: 420, padding: '20px 24px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
            <i className="fas fa-truck" style={{ marginRight: 8, color: '#10b981' }} />Αποστολή Courier
          </h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '1rem' }}>
            <i className="fas fa-times" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', marginBottom: 2 }}>Παραλήπτης *</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', marginBottom: 2 }}>Τηλέφωνο *</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', marginBottom: 2 }}>Διεύθυνση *</label>
            <input value={address} onChange={e => setAddress(e.target.value)} style={inp} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', marginBottom: 2 }}>Πόλη *</label>
              <input value={city} onChange={e => setCity(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', marginBottom: 2 }}>ΤΚ *</label>
              <input value={zip} onChange={e => setZip(e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', marginBottom: 2 }}>Βάρος (kg)</label>
              <input type="number" value={weight} onChange={e => setWeight(Number(e.target.value))} min={1} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', marginBottom: 2 }}>Αντικαταβολή €</label>
              <input type="number" value={cod} onChange={e => setCod(Number(e.target.value))} min={0} step={0.01} style={inp} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', marginBottom: 2 }}>Σημειώσεις</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} style={inp} />
          </div>
        </div>

        {error && <div style={{ marginTop: 10, fontSize: '0.78rem', color: '#ef4444' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.82rem' }}>
            Ακύρωση
          </button>
          <button onClick={handleCreate} disabled={busy} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: '#10b981', color: '#fff', fontSize: '0.82rem', fontWeight: 600,
            opacity: busy ? 0.5 : 1,
          }}>
            {busy ? <><i className="fas fa-spinner fa-spin" /> Δημιουργία...</> : <><i className="fas fa-truck" /> Δημιουργία Voucher</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
