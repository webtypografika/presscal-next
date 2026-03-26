'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { Quote, Customer } from '@/generated/prisma/client';
import { createQuote, updateQuote, updateQuoteStatus, deleteQuote, createCustomer, linkEmailToQuote } from './actions';

type QuoteWithCustomer = Quote & { customer: Customer | null };

// ─── TOAST ───
type ToastType = 'success' | 'error' | 'info';
interface ToastData { message: string; type: ToastType; id: number; }
let toastId = 0;

function Toast({ toast, onRemove }: { toast: ToastData; onRemove: () => void }) {
  useEffect(() => {
    const t = setTimeout(onRemove, toast.type === 'error' ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [toast, onRemove]);
  const colors = {
    success: { bg: 'var(--success)', icon: 'fa-check-circle' },
    error: { bg: 'var(--danger)', icon: 'fa-exclamation-circle' },
    info: { bg: 'var(--blue)', icon: 'fa-info-circle' },
  };
  const c = colors[toast.type];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 20px', borderRadius: 10,
      background: 'rgb(20,30,55)', border: `1px solid ${c.bg}`,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      animation: 'fadeIn 0.3s ease', minWidth: 280,
    }}>
      <i className={`fas ${c.icon}`} style={{ color: c.bg, fontSize: '1rem' }} />
      <span style={{ fontSize: '0.92rem', color: 'var(--text)', flex: 1 }}>{toast.message}</span>
      <button onClick={onRemove} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.92rem' }}>&times;</button>
    </div>
  );
}

function ToastContainer({ toasts, onRemove }: { toasts: ToastData[]; onRemove: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return createPortal(
    <div style={{ position: 'fixed', bottom: 80, right: 20, zIndex: 300, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => <Toast key={t.id} toast={t} onRemove={() => onRemove(t.id)} />)}
    </div>,
    document.body
  );
}

// ─── KANBAN COLUMNS ───
const KB_COLUMNS = [
  { id: 'new', label: 'Νέες', statuses: ['draft', 'new'], color: 'var(--blue)', icon: 'fa-envelope' },
  { id: 'editing', label: 'Σε Επεξεργασία', statuses: ['editing', 'revision'], color: 'var(--accent)', icon: 'fa-pen' },
  { id: 'sent', label: 'Εστάλησαν', statuses: ['sent'], color: '#60a5fa', icon: 'fa-paper-plane' },
  { id: 'approved', label: 'Εγκρίθηκαν', statuses: ['approved', 'partial'], color: 'var(--success)', icon: 'fa-check' },
  { id: 'rejected', label: 'Απορρίφθηκαν', statuses: ['rejected'], color: 'var(--danger)', icon: 'fa-times' },
] as const;

type KbColId = typeof KB_COLUMNS[number]['id'];
const COL_TO_STATUS: Record<KbColId, string> = { new: 'new', editing: 'editing', sent: 'sent', approved: 'approved', rejected: 'rejected' };

const STATUS_LABEL: Record<string, string> = {
  draft: 'Πρόχειρη', new: 'Νέα', editing: 'Σε Επεξ.', revision: 'Αναθεώρηση',
  sent: 'Εστάλη', approved: 'Εγκρίθηκε', partial: 'Μερική',
  rejected: 'Απορρίφθηκε', completed: 'Ολοκληρώθηκε', cancelled: 'Ακυρώθηκε',
};

// ─── HELPERS ───
function formatCurrency(n: number) {
  return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(n);
}

function emptyItem() {
  return { id: crypto.randomUUID(), name: '', type: 'manual' as const, qty: 1, unit: 'τεμ', unitPrice: 0, finalPrice: 0, cost: 0, profit: 0, notes: '' };
}

function aiToItem(ai: any) {
  const nameParts = [ai.description || 'Προϊόν'];
  if (ai.dimensions) nameParts.push(ai.dimensions);
  if (ai.colors) nameParts.push(ai.colors);
  const name = nameParts.join(' ');
  const notesParts = [];
  if (ai.paperType) notesParts.push(`Χαρτί: ${ai.paperType}`);
  if (ai.finishing?.length) notesParts.push(`Φινίρισμα: ${ai.finishing.join(', ')}`);
  if (ai.specialNotes) notesParts.push(ai.specialNotes);
  return {
    id: crypto.randomUUID(), name, type: 'manual' as const,
    qty: ai.quantity || 1, unit: 'τεμ', unitPrice: 0, finalPrice: 0,
    cost: 0, profit: 0, status: 'pending',
    notes: notesParts.join(' · '), aiParsed: ai,
  };
}

// ─── MAIN ───
interface Props { quotes: QuoteWithCustomer[]; customers: Customer[]; }

export function QuotesList({ quotes: initialQuotes, customers: initialCustomers }: Props) {
  const router = useRouter();
  const [quotes, setQuotes] = useState(initialQuotes);
  const [customers, setCustomers] = useState(initialCustomers);
  const [search, setSearch] = useState('');
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [showNewQuote, setShowNewQuote] = useState(false);
  const [showEmailQuote, setShowEmailQuote] = useState(false);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  useEffect(() => { setQuotes(initialQuotes); }, [initialQuotes]);
  useEffect(() => { setCustomers(initialCustomers); }, [initialCustomers]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    setToasts(prev => [...prev, { message, type, id: ++toastId }]);
  }, []);
  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Filter (exclude completed/cancelled)
  const kanbanQuotes = quotes.filter(q => {
    if (['completed', 'cancelled'].includes(q.status)) return false;
    if (search) {
      const s = search.toLowerCase();
      return q.number.toLowerCase().includes(s) ||
        (q.customer?.name || '').toLowerCase().includes(s) ||
        (q.customer?.company || '').toLowerCase().includes(s) ||
        (q.title || '').toLowerCase().includes(s);
    }
    return true;
  });

  function getColumnQuotes(col: typeof KB_COLUMNS[number]) {
    return kanbanQuotes
      .filter(q => (col.statuses as readonly string[]).includes(q.status))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // Drag & drop
  function handleDragStart(e: React.DragEvent, quoteId: string) {
    e.dataTransfer.setData('text/plain', quoteId);
    e.dataTransfer.effectAllowed = 'move';
  }

  async function handleDrop(e: React.DragEvent, colId: KbColId) {
    e.preventDefault();
    setDragOverCol(null);
    const quoteId = e.dataTransfer.getData('text/plain');
    const q = quotes.find(x => x.id === quoteId);
    if (!q) return;
    const newStatus = COL_TO_STATUS[colId];
    if (q.status === newStatus) return;
    try {
      await updateQuoteStatus(quoteId, newStatus);
      setQuotes(prev => prev.map(x => x.id === quoteId
        ? { ...x, status: newStatus, ...(newStatus === 'sent' ? { sentAt: new Date() } : {}) } : x));
      toast(`${STATUS_LABEL[q.status] || q.status} → ${STATUS_LABEL[newStatus]}`);
    } catch { toast('Σφάλμα', 'error'); }
  }

  const totalPending = kanbanQuotes.reduce((s, q) => s + q.grandTotal, 0);

  return (
    <>
      {/* ─── HEADER ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="fas fa-file-invoice" style={{ fontSize: '1.1rem', color: 'var(--accent)' }} />
          <div>
            <h1 style={{ fontSize: '1.15rem', fontWeight: 600, letterSpacing: '-0.01em' }}>Προσφορές</h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 1 }}>
              {kanbanQuotes.length} ενεργές · {formatCurrency(totalPending)}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Αναζήτηση..."
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px 7px 28px', color: 'var(--text)', fontSize: '0.92rem', width: 180, outline: 'none' }} />
          </div>
          <button onClick={() => setShowEmailQuote(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'color-mix(in srgb, var(--violet) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--violet) 25%, transparent)',
            color: 'var(--violet)',
            padding: '8px 14px', borderRadius: 8,
            fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
          }}>
            <i className="fas fa-envelope" style={{ fontSize: '0.75rem' }} /> Από Email
          </button>
          <button onClick={() => setShowNewQuote(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--accent)', color: '#fff',
            padding: '8px 16px', borderRadius: 8,
            border: 'none', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
          }}>
            <i className="fas fa-plus" style={{ fontSize: '0.72rem' }} /> Νέα Προσφορά
          </button>
        </div>
      </div>

      {/* ─── KANBAN ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${KB_COLUMNS.length}, 1fr)`,
        gap: 10,
        minHeight: 'calc(100vh - 210px)',
        alignItems: 'start',
      }}>
        {KB_COLUMNS.map(col => {
          const colQuotes = getColumnQuotes(col);
          const colTotal = colQuotes.reduce((s, q) => s + q.grandTotal, 0);
          const isDragOver = dragOverCol === col.id;
          return (
            <div
              key={col.id}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCol(col.id); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={e => handleDrop(e, col.id)}
              style={{
                background: isDragOver ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.015)',
                border: isDragOver ? `1px solid color-mix(in srgb, ${col.color} 40%, transparent)` : '1px solid var(--border)',
                borderRadius: 12,
                transition: 'border-color 0.2s, background 0.15s',
                overflow: 'hidden',
              }}
            >
              {/* Column header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 12px',
                borderLeft: `3px solid ${col.color}`,
              }}>
                <i className={`fas ${col.icon}`} style={{ fontSize: '0.72rem', color: col.color, opacity: 0.8 }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, flex: 1, color: 'var(--text-dim)' }}>{col.label}</span>
                <span style={{
                  fontSize: '0.92rem', fontWeight: 700, color: col.color, opacity: 0.7,
                  minWidth: 18, textAlign: 'center',
                }}>{colQuotes.length}</span>
              </div>

              {/* Cards */}
              <div style={{ padding: '4px 6px 6px', minHeight: 50 }}>
                {colQuotes.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '16px 0', fontSize: '0.92rem', color: 'var(--text-muted)', opacity: 0.4 }}>—</div>
                )}
                {colQuotes.map(q => {
                  const name = q.customer?.name ?? q.customer?.company ?? '—';
                  const items = Array.isArray(q.items) ? q.items as any[] : [];
                  const desc = q.title || q.description || items.map((i: any) => i.name).filter(Boolean).join(' · ') || '';
                  return (
                    <div
                      key={q.id}
                      draggable
                      onDragStart={e => handleDragStart(e, q.id)}
                      onClick={() => router.push(`/quotes/${q.id}`)}
                      style={{
                        padding: '8px 10px', borderRadius: 8,
                        border: '1px solid var(--border)', marginBottom: 5,
                        cursor: 'pointer', transition: 'background 0.15s',
                        background: 'transparent',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)', opacity: 0.8 }}>{q.number}</span>
                        <span style={{ flex: 1 }} />
                        <span style={{ fontSize: '0.92rem', color: 'var(--text-muted)' }}>
                          {new Date(q.date).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                      {desc && <div style={{ fontSize: '0.92rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>{desc}</div>}
                      <div style={{ fontSize: '0.92rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                        {formatCurrency(q.grandTotal)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Column total */}
              {colQuotes.length > 0 && (
                <div style={{
                  padding: '6px 12px', borderTop: '1px solid var(--border)',
                  fontSize: '0.92rem', color: 'var(--text-muted)', textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {formatCurrency(colTotal)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── NEW QUOTE MODAL (quick create) ─── */}
      {showNewQuote && (
        <QuickNewQuote
          customers={customers}
          onClose={() => setShowNewQuote(false)}
          onCreated={(q) => {
            setShowNewQuote(false);
            toast('Προσφορά δημιουργήθηκε');
            router.push(`/quotes/${q.id}`);
          }}
          onCustomerCreated={(c) => setCustomers(prev => [...prev, c])}
          toast={toast}
        />
      )}

      {/* ─── NEW QUOTE FROM EMAIL ─── */}
      {showEmailQuote && (
        <NewQuoteFromEmail
          customers={customers}
          onClose={() => setShowEmailQuote(false)}
          onCreated={(q) => {
            setShowEmailQuote(false);
            toast('Προσφορά από email δημιουργήθηκε');
            router.push(`/quotes/${q.id}`);
          }}
          toast={toast}
        />
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

// ─── QUICK NEW QUOTE (minimal modal — just pick customer, then redirect to full page) ───
function QuickNewQuote({ customers, onClose, onCreated, onCustomerCreated, toast }: {
  customers: Customer[];
  onClose: () => void;
  onCreated: (q: Quote) => void;
  onCustomerCreated: (c: Customer) => void;
  toast: (msg: string, type?: ToastType) => void;
}) {
  const [customerId, setCustomerId] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [showNewCust, setShowNewCust] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');

  const inp = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: '0.92rem', width: '100%', outline: 'none' } as const;

  async function create() {
    setSaving(true);
    try {
      const q = await createQuote({ customerId: customerId || undefined, title: title || undefined, items: [emptyItem()] });
      onCreated(q);
    } catch (e) { toast('Σφάλμα: ' + (e as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  async function createCust() {
    if (!newCustName.trim()) return;
    try {
      const c = await createCustomer({ name: newCustName.trim(), email: newCustEmail.trim() || undefined });
      onCustomerCreated(c);
      setCustomerId(c.id);
      setShowNewCust(false);
      setNewCustName('');
      setNewCustEmail('');
    } catch (e) { toast('Σφάλμα: ' + (e as Error).message, 'error'); }
  }

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      background: 'rgba(0,0,0,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 400, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 16 }}>Νέα Προσφορά</h2>

        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Πελάτης</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <select value={customerId} onChange={e => setCustomerId(e.target.value)} style={{ ...inp, flex: 1 }}>
            <option value="">— Επιλέξτε —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>)}
          </select>
          <button onClick={() => setShowNewCust(!showNewCust)} style={{
            padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--blue)', fontSize: '0.9rem', cursor: 'pointer',
          }}><i className="fas fa-plus" /></button>
        </div>

        {showNewCust && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input value={newCustName} onChange={e => setNewCustName(e.target.value)} placeholder="Όνομα" style={{ ...inp, flex: 1 }} />
            <input value={newCustEmail} onChange={e => setNewCustEmail(e.target.value)} placeholder="Email" style={{ ...inp, flex: 1 }} />
            <button onClick={createCust} style={{ padding: '0 12px', borderRadius: 8, border: 'none', background: 'var(--blue)', color: '#fff', fontSize: '0.9rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>OK</button>
          </div>
        )}

        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Τίτλος (προαιρετικό)</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="π.χ. Φυλλάδια A4 4χρ." style={{ ...inp, marginBottom: 20 }} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.92rem', cursor: 'pointer' }}>Ακύρωση</button>
          <button onClick={create} disabled={saving} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: '#fff', fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer',
            opacity: saving ? 0.6 : 1,
          }}>
            {saving ? 'Δημιουργία...' : 'Δημιουργία'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── NEW QUOTE FROM EMAIL (browse inbox, pick email, create quote + link + AI parse) ───
function NewQuoteFromEmail({ customers, onClose, onCreated, toast }: {
  customers: Customer[];
  onClose: () => void;
  onCreated: (q: Quote) => void;
  toast: (msg: string, type?: ToastType) => void;
}) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [creating, setCreating] = useState<string | null>(null);

  // Load recent inbox on mount
  useEffect(() => {
    fetchMessages('newer_than:14d');
  }, []);

  async function fetchMessages(q: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/email/messages?maxResults=15&q=${encodeURIComponent(q)}`);
      if (res.ok) { const data = await res.json(); setMessages(data.messages || []); }
    } catch {} finally { setLoading(false); }
  }

  async function createFromEmail(msg: any) {
    setCreating(msg.id);
    try {
      // Match customer by sender email
      const senderEmail = msg.from?.match(/<([^>]+)>/)?.[1] || msg.from?.trim() || '';
      const senderName = msg.from?.replace(/<[^>]+>/, '').trim() || senderEmail;
      const matchedCustomer = customers.find(c =>
        c.email?.toLowerCase() === senderEmail.toLowerCase()
      );

      // 1. Fetch full email body
      const fullRes = await fetch(`/api/email/messages/${msg.id}`);
      const fullMsg = fullRes.ok ? await fullRes.json() : null;
      const emailBody = fullMsg?.textBody || fullMsg?.htmlBody || msg.snippet || '';

      // 2. AI parse (in parallel with quote creation)
      const [aiRes, q] = await Promise.all([
        fetch('/api/ai/parse-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emailBody, subject: msg.subject, senderEmail }),
        }).then(r => r.json()).catch(() => null),
        createQuote({
          customerId: matchedCustomer?.id || undefined,
          title: msg.subject || undefined,
          description: `Email από: ${senderName}`,
        }),
      ]);

      // 3. Link email
      await linkEmailToQuote(q.id, msg.id, msg.threadId);

      // 4. If AI parsed items, save them to the quote
      if (aiRes?.success && aiRes.items?.length > 0) {
        const items = aiRes.items.map((ai: any) => aiToItem(ai));
        await updateQuote(q.id, {
          items,
          description: aiRes.customerInterpretation || undefined,
        });
      }

      onCreated(q);
    } catch (e) {
      toast('Σφάλμα: ' + (e as Error).message, 'error');
      setCreating(null);
    }
  }

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      background: 'rgba(0,0,0,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.4)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fas fa-envelope" style={{ color: 'var(--violet)' }} />
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, flex: 1 }}>Νέα Προσφορά από Email</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }}>&times;</button>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
              placeholder="Αναζήτηση email (π.χ. from:customer@, subject:φυλλάδια)"
              onKeyDown={e => e.key === 'Enter' && fetchMessages(searchQ || 'newer_than:14d')}
              style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: '0.92rem', outline: 'none' }} />
            <button onClick={() => fetchMessages(searchQ || 'newer_than:14d')} style={{
              padding: '7px 12px', borderRadius: 6, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: '0.88rem', cursor: 'pointer',
            }}><i className="fas fa-search" /></button>
          </div>
        </div>

        {/* Email list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: '1rem' }} />
            </div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: '0.92rem' }}>
              Κανένα email
            </div>
          ) : messages.map(msg => (
            <div key={msg.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 20px', borderBottom: '1px solid var(--border)',
              cursor: 'pointer', transition: 'background 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              onClick={() => createFromEmail(msg)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {msg.subject || '(χωρίς θέμα)'}
                </div>
                <div style={{ fontSize: '0.92rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {msg.from} · {msg.date}
                </div>
                {msg.snippet && (
                  <div style={{ fontSize: '0.92rem', color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.6 }}>
                    {msg.snippet}
                  </div>
                )}
              </div>
              {creating === msg.id ? (
                <i className="fas fa-spinner fa-spin" style={{ color: 'var(--violet)', fontSize: '0.92rem' }} />
              ) : (
                <div style={{
                  padding: '4px 10px', borderRadius: 6,
                  background: 'color-mix(in srgb, var(--violet) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--violet) 20%, transparent)',
                  color: 'var(--violet)', fontSize: '0.92rem', fontWeight: 600, whiteSpace: 'nowrap',
                }}>
                  <i className="fas fa-plus" style={{ marginRight: 3 }} />Προσφορά
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
