'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { Quote, Customer } from '@/generated/prisma/client';
import { updateQuote, updateQuoteStatus, deleteQuote, linkEmailToQuote, createCustomer, updateCustomer } from '../actions';

type QuoteWithCustomer = Quote & { customer: Customer | null };

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
  const ai = item.aiParsed as Record<string, unknown> | undefined;

  // Dimensions: parse "210×297mm", "21x29.7cm", "A4", etc.
  const dimStr = (ai?.dimensions as string) || '';
  const dimMatch = dimStr.match(/([\d.]+)\s*[x×]\s*([\d.]+)\s*(cm|mm)?/i);
  if (dimMatch) {
    let w = parseFloat(dimMatch[1]);
    let h = parseFloat(dimMatch[2]);
    if (dimMatch[3]?.toLowerCase() === 'cm') { w *= 10; h *= 10; }
    p.set('w', String(Math.round(w)));
    p.set('h', String(Math.round(h)));
  }

  // Quantity
  const qty = (ai?.quantity as number) || (item.qty as number) || 0;
  if (qty > 0) p.set('qty', String(qty));

  // Colors → sides: "4/4" = 2 sides, "4/0" = 1 side
  const colorsStr = (ai?.colors as string) || '';
  const colMatch = colorsStr.match(/(\d+)\s*\/\s*(\d+)/);
  if (colMatch) {
    const back = parseInt(colMatch[2]);
    p.set('sides', back > 0 ? '2' : '1');
    p.set('colorsF', colMatch[1]);
    p.set('colorsB', colMatch[2]);
  }

  // Paper type hint
  if (ai?.paperType) p.set('paper', ai.paperType as string);

  // Finishing hints
  if (ai?.finishing && Array.isArray(ai.finishing) && ai.finishing.length) {
    p.set('finishing', (ai.finishing as string[]).join(','));
  }

  // Description for display
  if (ai?.description) p.set('desc', ai.description as string);

  // Linked file data — overrides AI-parsed dimensions
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
interface Props { quote: QuoteWithCustomer; customers: Customer[]; elorusConfigured?: boolean; elorusSlug?: string; }

export function QuoteDetail({ quote: initial, customers, elorusConfigured, elorusSlug }: Props) {
  const router = useRouter();
  const [quote, setQuote] = useState(initial);
  const [items, setItems] = useState<any[]>(() => Array.isArray(initial.items) && (initial.items as any[]).length > 0 ? initial.items as any[] : []);
  const [title, setTitle] = useState(initial.title ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [vatRate, setVatRate] = useState(initial.vatRate ?? 24);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [customerId, setCustomerId] = useState(initial.customerId ?? '');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

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
  const selectedCustomer = customers.find(c => c.id === customerId) ?? quote.customer;
  const customerName = selectedCustomer?.name ?? selectedCustomer?.company ?? '—';

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
      if (field === 'finalPrice') u.profit = (u.finalPrice || 0) - (u.cost || 0);
      if (field === 'cost') u.profit = (u.finalPrice || 0) - (u.cost || 0);
      return u;
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const result = await updateQuote(quote.id, { customerId: customerId || null, title: title || null, notes: notes || null, items, subtotal, vatRate, vatAmount, grandTotal, totalCost, totalProfit });
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
            {selectedCustomer?.company && <span>{selectedCustomer.company}</span>}
            {selectedCustomer?.email && <span>{selectedCustomer.email}</span>}
            {selectedCustomer?.phone && <span>{selectedCustomer.phone}</span>}
            <span>{new Date(quote.date).toLocaleDateString('el-GR')}</span>
            {(selectedCustomer as any)?.folderPath && (
              <a
                href={`presscal-fh://open-folder?path=${encodeURIComponent((selectedCustomer as any).folderPath)}${selectedCustomer?.email ? `&email=${encodeURIComponent(selectedCustomer.email)}` : ''}`}
                title={(selectedCustomer as any).folderPath}
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

        {/* Status progress bar */}
        <div style={{ width: 120, marginRight: 8 }}>
          <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, background: st.color, borderRadius: 2, transition: 'width 0.4s ease' }} />
          </div>
        </div>

        {/* Grand total */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--accent)' }}>{formatCurrency(grandTotal)}</div>
          <div style={{ fontSize: '0.78rem', color: totalProfit >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 500 }}>
            Κέρδος {formatCurrency(totalProfit)}
          </div>
        </div>
      </div>

      {/* ═══ TITLE ═══ */}
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Τίτλος προσφοράς..."
        style={{
          width: '100%', background: 'transparent', border: 'none',
          fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)',
          padding: '8px 0', marginBottom: 12, outline: 'none',
          borderBottom: '1px solid var(--border)',
        }}
      />

      {/* ═══ ACTIONS BAR ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16,
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1 }} />

        {/* Send quote */}
        {canSend && (
          <button onClick={() => setShowSendModal(true)} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 14px', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600,
            background: 'color-mix(in srgb, var(--blue) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--blue) 25%, transparent)',
            color: 'var(--blue)', cursor: 'pointer',
          }}>
            <i className="fas fa-paper-plane" style={{ fontSize: '0.6rem' }} /> Αποστολή
          </button>
        )}

        {/* Invoice (Elorus) */}
        {elorusConfigured && (
          quote.elorusInvoiceId ? (
            <a href={quote.elorusInvoiceUrl || '#'} target="_blank" rel="noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 14px', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600,
              background: 'color-mix(in srgb, var(--success) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)',
              color: 'var(--success)', cursor: 'pointer', textDecoration: 'none',
            }}>
              <i className="fas fa-check" style={{ fontSize: '0.6rem' }} /> Τιμολόγιο
            </a>
          ) : (
            <button onClick={() => setShowInvoiceModal(true)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 14px', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600,
              background: 'color-mix(in srgb, #4f46e5 12%, transparent)',
              border: '1px solid color-mix(in srgb, #4f46e5 25%, transparent)',
              color: '#4f46e5', cursor: 'pointer',
            }}>
              <i className="fas fa-file-invoice-dollar" style={{ fontSize: '0.6rem' }} /> Τιμολόγηση
            </button>
          )
        )}

        {/* Status transitions */}
        {transitions.map(t => (
          <button key={t.status} onClick={() => changeStatus(t.status)} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 6, fontSize: '0.82rem', fontWeight: 500,
            background: `color-mix(in srgb, ${t.color} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${t.color} 20%, transparent)`,
            color: t.color, cursor: 'pointer',
          }}>
            <i className={`fas ${t.icon}`} style={{ fontSize: '0.6rem' }} /> {t.label}
          </button>
        ))}

        {/* Autosave indicator */}
        <span style={{ fontSize: '0.78rem', color: saving ? 'var(--text-muted)' : dirty ? 'var(--accent)' : 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
          {saving ? <><i className="fas fa-spinner fa-spin" style={{ fontSize: '0.6rem' }} /> Αποθήκευση...</>
            : dirty ? <><i className="fas fa-circle" style={{ fontSize: '0.35rem' }} /> Μη αποθηκευμένο</>
            : <><i className="fas fa-check" style={{ fontSize: '0.6rem' }} /> Αποθηκεύτηκε</>}
        </span>

        {/* Delete */}
        <button onClick={handleDelete} style={{
          padding: '6px 8px', borderRadius: 6, fontSize: '0.92rem',
          background: 'transparent', border: '1px solid var(--border)',
          color: 'var(--text-muted)', cursor: 'pointer',
        }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <i className="fas fa-trash" />
        </button>
      </div>

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

        {/* Totals row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 85px 85px 85px',
          gap: 0, padding: '10px 10px', background: 'rgba(255,255,255,0.015)',
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

        {/* ─── LEFT: Email Πελάτη ─── */}
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
          quoteId={quote.id}
          quoteNumber={quote.number}
          customerEmail={quote.customer?.email ?? ''}
          customerName={customerName}
          grandTotal={grandTotal}
          onClose={() => setShowSendModal(false)}
          onSent={() => {
            setShowSendModal(false);
            setQuote(prev => ({ ...prev, status: 'sent', sentAt: new Date() }));
            toast('Η προσφορά εστάλη!');
          }}
          toast={toast}
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

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
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
                  href={`presscal-fh://attachment?messageId=${att.emailId}&attId=${att.id}&mime=${encodeURIComponent(att.mimeType || 'application/octet-stream')}&filename=${encodeURIComponent(att.filename)}`}
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
                          href={`presscal-fh://attachment?messageId=${em.id}&attId=${att.id}&mime=${encodeURIComponent(att.mimeType || 'application/octet-stream')}&filename=${encodeURIComponent(att.filename)}`}
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
function SendQuoteModal({ quoteId, quoteNumber, customerEmail, customerName, grandTotal, onClose, onSent, toast }: {
  quoteId: string;
  quoteNumber: string;
  customerEmail: string;
  customerName: string;
  grandTotal: number;
  onClose: () => void;
  onSent: () => void;
  toast: (msg: string, type?: ToastType) => void;
}) {
  const [to, setTo] = useState(customerEmail);
  const [cc, setCc] = useState('');
  const [lang, setLang] = useState<'el' | 'en'>('el');
  const [customMessage, setCustomMessage] = useState('');
  const [sending, setSending] = useState(false);

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
        <input value={cc} onChange={e => setCc(e.target.value)} placeholder="cc@example.com" style={{ ...inp, marginBottom: 10 }} />

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
  customers: Customer[];
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

  const filtered = customers.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.name.toLowerCase().includes(s) || (c.company || '').toLowerCase().includes(s) || (c.email || '').toLowerCase().includes(s);
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
            {currentCustomer.company && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>{currentCustomer.company}</div>}
            {currentCustomer.email && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 1 }}>{currentCustomer.email}</div>}
            {currentCustomer.phone && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 1 }}>{currentCustomer.phone}</div>}
            {(currentCustomer as any).folderPath && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <i className="fas fa-folder" style={{ fontSize: '0.6rem', color: '#f58220' }} />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(currentCustomer as any).folderPath}
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
                  {(c.company || c.email) && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 1 }}>
                      {c.company && <span>{c.company}</span>}
                      {c.company && c.email && <span> · </span>}
                      {c.email && <span>{c.email}</span>}
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
            {filtered.length === 0 && (
              <div style={{ padding: '16px 12px', fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Κανένα αποτέλεσμα
              </div>
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
              {mode === 'new' ? 'Νέος Πελάτης' : 'Επεξεργασία Πελάτη'}
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
