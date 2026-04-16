'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fuzzyMatch } from '@/lib/search';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { Quote, Customer } from '@/generated/prisma/client';
import { createQuote, updateQuote, updateQuoteStatus, deleteQuote, createCustomer, createCompanyQuick, createCompanyFromElorus, linkEmailToQuote, saveEmailAttachments, archiveQuote } from './actions';
import { NewCompanyForm, type CompanyFormData } from '@/components/new-company-form';

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
  { id: 'editing', label: 'Σε Επεξεργασία', statuses: ['draft', 'new', 'editing', 'revision'], color: 'var(--accent)', icon: 'fa-pen' },
  { id: 'sent', label: 'Εστάλησαν', statuses: ['sent'], color: '#60a5fa', icon: 'fa-paper-plane' },
  { id: 'approved', label: 'Εγκρίθηκαν', statuses: ['approved', 'partial'], color: 'var(--success)', icon: 'fa-check' },
] as const;

// Archived statuses — hidden from kanban
const ARCHIVED_STATUSES = ['completed', 'rejected', 'cancelled'];

type KbColId = typeof KB_COLUMNS[number]['id'];
const COL_TO_STATUS: Record<KbColId, string> = { editing: 'draft', sent: 'sent', approved: 'approved' };

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props { quotes: QuoteWithCustomer[]; customers: any[]; hasElorus?: boolean; }

export function QuotesList({ quotes: initialQuotes, customers: initialCustomers, hasElorus }: Props) {
  const router = useRouter();
  const [quotes, setQuotes] = useState(initialQuotes);
  const [customers, setCustomers] = useState(initialCustomers);
  const [search, setSearch] = useState('');
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [showNewQuote, setShowNewQuote] = useState(false);
  const [showEmailQuote, setShowEmailQuote] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  useEffect(() => { setQuotes(initialQuotes); }, [initialQuotes]);
  useEffect(() => { setCustomers(initialCustomers); }, [initialCustomers]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    setToasts(prev => [...prev, { message, type, id: ++toastId }]);
  }, []);
  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Filter — exclude archived from kanban
  const kanbanQuotes = quotes.filter(q => {
    if (ARCHIVED_STATUSES.includes(q.status)) return false;
    if (search) {
      return fuzzyMatch(q.number, search) ||
        fuzzyMatch((q as any).company?.name || (q as any).contact?.name || q.customer?.name || '', search) ||
        fuzzyMatch(q.title || '', search);
    }
    return true;
  });

  const archivedQuotes = quotes.filter(q => ARCHIVED_STATUSES.includes(q.status))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
          <button onClick={() => setShowArchive(v => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: showArchive ? 'rgba(255,255,255,0.06)' : 'transparent',
            border: '1px solid var(--border)',
            color: showArchive ? 'var(--text)' : 'var(--text-muted)',
            padding: '8px 14px', borderRadius: 8,
            fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
          }}>
            <i className="fas fa-archive" style={{ fontSize: '0.72rem' }} /> Αρχείο {archivedQuotes.length > 0 && <span style={{ fontSize: '0.68rem', opacity: 0.6 }}>({archivedQuotes.length})</span>}
          </button>
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
      {!showArchive && <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${KB_COLUMNS.length}, 1fr)`,
        gap: 10,
        height: 'calc(100vh - 210px)',
        alignItems: 'stretch',
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
                display: 'flex', flexDirection: 'column',
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
              <div style={{ padding: '4px 6px 6px', flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {colQuotes.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '16px 0', fontSize: '0.92rem', color: 'var(--text-muted)', opacity: 0.4 }}>—</div>
                )}
                {colQuotes.map(q => {
                  const emailSender = typeof q.description === 'string' && q.description.startsWith('Email από:') ? q.description.replace('Email από:', '').trim() : null;
                  const hasLinkedEmail = (q as any).linkedEmails?.length > 0;
                  const name = (q as any).company?.name ?? (q as any).contact?.name ?? q.customer?.name ?? (q as any).contact?.email ?? (q as any).company?.email ?? q.customer?.email ?? emailSender ?? (hasLinkedEmail ? q.title || 'Email' : '—');
                  const items = Array.isArray(q.items) ? q.items as any[] : [];
                  const desc = q.title || (q.description && !q.description.startsWith('Email από:') ? q.description : '') || items.map((i: any) => i.name).filter(Boolean).join(' · ') || '';
                  return (
                    <div
                      key={q.id}
                      draggable
                      onDragStart={e => handleDragStart(e, q.id)}
                      onClick={() => router.push(`/quotes/${q.id}`)}
                      className="quote-card-hover"
                      style={{
                        padding: '8px 10px', borderRadius: 8,
                        border: '1px solid var(--border)', marginBottom: 5,
                        cursor: 'pointer', transition: 'background 0.15s',
                        background: 'transparent',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Row 1: number + date (date replaced by actions on hover) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)', opacity: 0.8 }}>{q.number}</span>
                        <span style={{ flex: 1 }} />
                        <span className="card-date" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {new Date(q.date).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' })}
                        </span>
                        <div className="card-actions" style={{ display: 'flex', gap: 2 }}>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`Αρχειοθέτηση ${q.number};\n\nΟ φάκελος θα μετακινηθεί στο "_01 Archive/" μέσω PressKit.`)) return;
                              try {
                                const { originalFolderPath } = await archiveQuote(q.id);
                                setQuotes(prev => prev.map(x => x.id === q.id ? { ...x, status: 'cancelled' } : x));
                                if (originalFolderPath) {
                                  window.location.href = `presscal-fh://archive-quote?folderPath=${encodeURIComponent(originalFolderPath)}`;
                                  toast('Αρχειοθετήθηκε — το PressKit μετακινεί τον φάκελο');
                                } else {
                                  toast('Αρχειοθετήθηκε');
                                }
                              } catch { toast('Σφάλμα', 'error'); }
                            }}
                            style={{
                              width: 24, height: 20, borderRadius: 4,
                              border: 'none', background: 'transparent',
                              color: '#64748b', cursor: 'pointer',
                              fontSize: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(100,116,139,0.2)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            title="Αρχειοθέτηση"
                          >
                            <i className="fas fa-archive" />
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`Διαγραφή ${q.number};`)) return;
                              try {
                                await deleteQuote(q.id);
                                setQuotes(prev => prev.filter(x => x.id !== q.id));
                                toast('Διαγράφηκε');
                              } catch { toast('Σφάλμα', 'error'); }
                            }}
                            style={{
                              width: 24, height: 20, borderRadius: 4,
                              border: 'none', background: 'transparent',
                              color: '#64748b', cursor: 'pointer',
                              fontSize: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'transparent'; }}
                            title="Διαγραφή"
                          >
                            <i className="fas fa-trash" />
                          </button>
                        </div>
                      </div>
                      {/* Row 2: customer */}
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                      {/* Row 3: description + amount */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        {desc && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{desc}</div>}
                        {!desc && <span style={{ flex: 1 }} />}
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                          {q.grandTotal > 0 ? formatCurrency(q.grandTotal) : ''}
                        </span>
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
      </div>}

      {/* ─── ARCHIVE ─── */}
      {showArchive && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', height: 'calc(100vh - 210px)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
            <i className="fas fa-archive" style={{ fontSize: '0.72rem', color: '#64748b' }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#64748b' }}>Αρχείο</span>
            <span style={{ fontSize: '0.72rem', color: '#475569' }}>{archivedQuotes.length} προσφορές</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {archivedQuotes.length === 0 && (
              <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: '0.82rem', color: '#475569' }}>
                Δεν υπάρχουν αρχειοθετημένες προσφορές
              </div>
            )}
            {archivedQuotes.map(q => {
              const emailSender = typeof q.description === 'string' && q.description.startsWith('Email από:') ? q.description.replace('Email από:', '').trim() : null;
              const hasLinkedEmail = (q as any).linkedEmails?.length > 0;
              const name = (q as any).company?.name ?? (q as any).contact?.name ?? q.customer?.name ?? (q as any).contact?.email ?? emailSender ?? (hasLinkedEmail ? q.title || 'Email' : '—');
              return (
                <div key={q.id} onClick={() => router.push(`/quotes/${q.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                  }}
                  className="quote-card-hover"
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                    background: q.status === 'completed' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    color: q.status === 'completed' ? 'var(--success)' : 'var(--danger)',
                  }}>{STATUS_LABEL[q.status] || q.status}</span>
                  <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, width: 120 }}>{q.number}</span>
                  <span style={{ fontSize: '0.82rem', flex: 1 }}>{name}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(q.grandTotal)}</span>
                  <span style={{ fontSize: '0.68rem', color: '#475569' }}>{new Date(q.date).toLocaleDateString('el-GR')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── NEW QUOTE MODAL (quick create) ─── */}
      {showNewQuote && (
        <QuickNewQuote
          customers={customers}
          hasElorus={hasElorus}
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
function QuickNewQuote({ customers, hasElorus, onClose, onCreated, onCustomerCreated, toast }: {
  customers: any[];
  hasElorus?: boolean;
  onClose: () => void;
  onCreated: (q: Quote) => void;
  onCustomerCreated: (c: Customer) => void;
  toast: (msg: string, type?: ToastType) => void;
}) {
  const [customerId, setCustomerId] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [showNewCust, setShowNewCust] = useState(false);
  const [custSearch, setCustSearch] = useState('');
  const [custDropOpen, setCustDropOpen] = useState(false);
  const custRef = useRef<HTMLDivElement>(null);

  const inp = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: '0.92rem', width: '100%', outline: 'none', fontFamily: 'inherit' } as const;
  const lbl: React.CSSProperties = { fontSize: '0.68rem', fontWeight: 600, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 4 };

  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Server-side search with debounce
  useEffect(() => {
    if (!custSearch.trim()) { setSearchResults([]); return; }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { getCompaniesForQuotes } = await import('./actions');
        const results = await getCompaniesForQuotes(custSearch.trim());
        setSearchResults(results as any);
      } finally { setSearching(false); }
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [custSearch]);

  const filteredCustomers = custSearch.trim() ? searchResults : customers;
  const selectedCustomer = [...customers, ...searchResults].find(c => c.id === customerId);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (custRef.current && !custRef.current.contains(e.target as Node)) setCustDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function create() {
    setSaving(true);
    try {
      const q = await createQuote({ companyId: customerId || undefined, title: title || undefined, items: [emptyItem()] });
      onCreated(q);
    } catch (e) { toast('Σφάλμα: ' + (e as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  async function createCustAndQuote(data: CompanyFormData) {
    setSaving(true);
    try {
      let company: any;
      if (data.elorusContactId) {
        company = await createCompanyFromElorus({
          name: data.name.trim(),
          afm: data.afm || undefined,
          doy: data.doy || undefined,
          email: data.email || undefined,
          phone: data.phone || undefined,
          address: data.address || undefined,
          city: data.city || undefined,
          zip: data.zip || undefined,
          folderPath: data.folderPath || undefined,
          elorusContactId: data.elorusContactId,
        });
      } else {
        company = await createCompanyQuick({
          name: data.name.trim(),
          email: data.email || undefined,
          phone: data.phone || undefined,
          afm: data.afm || undefined,
          folderPath: data.folderPath || undefined,
          contactName: data.contactName || undefined,
          contactEmail: data.contactEmail || undefined,
        });
      }
      onCustomerCreated(company as any);
      const q = await createQuote({ companyId: company.id, title: title || undefined, items: [emptyItem()] });
      onCreated(q);
    } catch (e) { toast('Σφάλμα: ' + (e as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: showNewCust ? 620 : 520,
        minHeight: 380,
        maxHeight: 'calc(100vh - 40px)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        transition: 'width 0.2s',
        overflow: 'hidden',
      }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 600, padding: '22px 26px 14px', margin: 0, flexShrink: 0 }}>Νέα Προσφορά</h2>
        <div style={{ padding: '0 26px 22px', overflowY: 'auto', flex: 1 }}>

        <label style={{ ...lbl, fontSize: '0.72rem', marginBottom: 6 }}>Πελάτης</label>
        <div ref={custRef} style={{ position: 'relative', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div
              onClick={() => { setCustDropOpen(!custDropOpen); setShowNewCust(false); }}
              style={{
                ...inp, flex: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderColor: custDropOpen ? 'var(--accent)' : 'var(--border)',
                transition: 'border-color 0.2s',
              }}
            >
              <span style={{ color: selectedCustomer ? 'var(--text)' : '#64748b' }}>
                {selectedCustomer ? selectedCustomer.name : 'Αναζήτηση εταιρείας...'}
              </span>
              <i className={`fas fa-chevron-${custDropOpen ? 'up' : 'down'}`} style={{ fontSize: '0.6rem', color: '#64748b' }} />
            </div>
            <button onClick={() => { setShowNewCust(!showNewCust); setCustDropOpen(false); setCustomerId(''); }} style={{
              width: 38, height: 38, borderRadius: 8, border: '1px solid var(--border)',
              background: showNewCust ? 'color-mix(in srgb, var(--blue) 12%, transparent)' : 'transparent',
              color: 'var(--blue)', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }} title="Νέα εταιρεία"><i className={`fas ${showNewCust ? 'fa-times' : 'fa-plus'}`} /></button>
          </div>

          {/* Dropdown */}
          {custDropOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 44, marginTop: 4, zIndex: 10,
              background: 'rgb(20, 30, 55)', border: '1px solid var(--border)',
              borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
              overflow: 'hidden',
            }}>
              <div style={{ padding: 8 }}>
                <input
                  value={custSearch}
                  onChange={e => setCustSearch(e.target.value)}
                  placeholder="Αναζήτηση ονόματος, ΑΦΜ, email..."
                  autoFocus
                  style={{ ...inp, padding: '8px 10px', fontSize: '0.82rem', background: 'rgba(255,255,255,0.06)', borderColor: 'var(--glass-border)' }}
                />
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {searching && <div style={{ padding: '8px 14px', color: '#64748b', fontSize: '0.78rem' }}><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />Αναζήτηση...</div>}
                {customerId && (
                  <button onClick={() => { setCustomerId(''); setCustDropOpen(false); setCustSearch(''); }}
                    style={{ width: '100%', padding: '8px 14px', border: 'none', background: 'transparent', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                    <i className="fas fa-times" style={{ marginRight: 8, fontSize: '0.65rem' }} />Χωρίς πελάτη
                  </button>
                )}
                {!searching && filteredCustomers.length === 0 && custSearch.trim() && (
                  <div style={{ padding: '12px 14px', color: '#475569', fontSize: '0.8rem' }}>Δεν βρέθηκαν αποτελέσματα</div>
                )}
                {filteredCustomers.map(c => (
                  <button key={c.id} onClick={() => { setCustomerId(c.id); setCustDropOpen(false); setCustSearch(''); setShowNewCust(false); }}
                    style={{
                      width: '100%', padding: '8px 14px', border: 'none', textAlign: 'left',
                      background: c.id === customerId ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                      color: 'var(--text)', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 10,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (c.id !== customerId) (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { if (c.id !== customerId) (e.target as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: 'color-mix(in srgb, var(--blue) 12%, transparent)',
                      border: '1.5px solid color-mix(in srgb, var(--blue) 25%, transparent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--blue)', fontSize: '0.65rem', fontWeight: 700,
                    }}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{c.name}</div>
                      {(c.email || c.afm || c.companyContacts?.length > 0) && (
                        <div style={{ fontSize: '0.7rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {c.companyContacts?.find((cc: any) => cc.isPrimary)?.contact?.name && (
                            <span style={{ color: 'var(--teal)' }}>
                              <i className="fas fa-user" style={{ fontSize: '0.45rem', marginRight: 2 }} />
                              {c.companyContacts.find((cc: any) => cc.isPrimary).contact.name}
                            </span>
                          )}
                          {c.companyContacts?.find((cc: any) => cc.isPrimary)?.contact?.name && c.email ? <span>·</span> : null}{c.email && <span>{c.email}</span>}
                          {c.afm ? <span>· ΑΦΜ {c.afm}</span> : null}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── NEW CUSTOMER FORM ── */}
        {showNewCust && (
          <NewCompanyForm
            hasElorus={hasElorus}
            onSave={createCustAndQuote}
            onCancel={() => setShowNewCust(false)}
            toast={toast}
            style={{ marginBottom: 14 }}
          />
        )}

        <label style={{ ...lbl, marginTop: 10, fontSize: '0.72rem', marginBottom: 6 }}>Τίτλος (προαιρετικό)</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="π.χ. Φυλλάδια A4 4χρ." style={{ ...inp, padding: '10px 14px', fontSize: '0.88rem' }} />
        </div>

        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '16px 26px', borderTop: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.15)', flexShrink: 0,
        }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit' }}>Ακύρωση</button>
          {!showNewCust && (
            <button onClick={create} disabled={saving} style={{
              padding: '10px 24px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#fff', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              opacity: saving ? 0.6 : 1,
            }}>
              {saving ? 'Δημιουργία...' : 'Δημιουργία'}
            </button>
          )}
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

      // 3. Link email + save attachments to storage
      await linkEmailToQuote(q.id, msg.id, msg.threadId);
      await saveEmailAttachments(q.id, [msg.id]);

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
