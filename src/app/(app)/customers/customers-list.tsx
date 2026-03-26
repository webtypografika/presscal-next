'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Customer, Quote } from '@/generated/prisma/client';
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
  bulkDeleteCustomers,
  bulkCreateCustomers,
  getCustomer,
} from './actions';

type CustomerWithCount = Customer & { _count: { quotes: number } };
type CustomerWithQuotes = Customer & { quotes: Quote[] };

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
      <span style={{ fontSize: '0.82rem', color: 'var(--text)', flex: 1 }}>{toast.message}</span>
      <button onClick={onRemove} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>&times;</button>
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

// ─── FILTER TABS ───
const FILTER_TABS = [
  { id: 'all', label: 'Όλοι' },
  { id: 'with_quotes', label: 'Με Προσφορές' },
  { id: 'without_quotes', label: 'Χωρίς Προσφορές' },
] as const;

type FilterId = typeof FILTER_TABS[number]['id'];

// ─── HELPERS ───
function timeAgo(d: Date | string): string {
  const now = new Date();
  const past = new Date(d);
  const diffMs = now.getTime() - past.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days === 0) return 'Σήμερα';
  if (days === 1) return '1 μέρα';
  if (days < 30) return `${days} μέρες`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 μήνα' : `${months} μήνες`;
}

function initials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ─── MODAL BACKDROP ───
function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        background: 'rgba(0,0,0,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 720, maxHeight: '90vh', overflow: 'auto' }}>
        {children}
      </div>
    </div>,
    document.body
  );
}

// ─── MAIN COMPONENT ───
interface Props {
  customers: CustomerWithCount[];
}

export function CustomersList({ customers: initialCustomers }: Props) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [filter, setFilter] = useState<FilterId>('all');
  const [search, setSearch] = useState('');
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [showEditor, setShowEditor] = useState<'new' | string | null>(null);
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showGoogleImport, setShowGoogleImport] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => { setCustomers(initialCustomers); }, [initialCustomers]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    setToasts(prev => [...prev, { message, type, id: ++toastId }]);
  }, []);
  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Filtering
  const filtered = customers.filter(c => {
    if (filter === 'with_quotes' && c._count.quotes === 0) return false;
    if (filter === 'without_quotes' && c._count.quotes > 0) return false;
    if (search) {
      const s = search.toLowerCase();
      const match =
        c.name.toLowerCase().includes(s) ||
        (c.company || '').toLowerCase().includes(s) ||
        (c.email || '').toLowerCase().includes(s) ||
        (c.phone || '').toLowerCase().includes(s) ||
        (c.mobile || '').toLowerCase().includes(s) ||
        (c.afm || '').toLowerCase().includes(s);
      if (!match) return false;
    }
    return true;
  });

  // Stats
  const withQuotes = customers.filter(c => c._count.quotes > 0).length;

  const editingCustomer = showEditor && showEditor !== 'new'
    ? customers.find(c => c.id === showEditor) ?? null
    : null;

  return (
    <>
      {/* ─── HEADER ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 46, height: 46, borderRadius: '50%',
            border: '2px solid color-mix(in srgb, var(--teal) 35%, transparent)',
            background: 'color-mix(in srgb, var(--teal) 10%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', color: 'var(--teal)',
          }}>
            <i className="fas fa-users" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Πελάτες</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {customers.length} συνολικά · {withQuotes} με προσφορές
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowGoogleImport(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)',
              color: '#ea4335',
              padding: '10px 16px', borderRadius: 10,
              fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
            }}
          >
            <i className="fab fa-google" /> Google Contacts
          </button>
          <button
            onClick={() => setShowImport(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'color-mix(in srgb, var(--blue) 15%, transparent)',
              border: '1px solid color-mix(in srgb, var(--blue) 30%, transparent)',
              color: 'var(--blue)',
              padding: '10px 16px', borderRadius: 10,
              fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
            }}
          >
            <i className="fas fa-file-csv" /> Εισαγωγή CSV
          </button>
          <button
            onClick={() => setShowEditor('new')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--teal)', color: '#fff',
              padding: '10px 20px', borderRadius: 10,
              border: 'none', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
            }}
          >
            <i className="fas fa-plus" /> Νέος Πελάτης
          </button>
        </div>
      </div>

      {/* ─── FILTERS ─── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTER_TABS.map(ft => (
          <button
            key={ft.id}
            onClick={() => setFilter(ft.id)}
            style={{
              padding: '6px 14px', borderRadius: 20,
              border: filter === ft.id ? '1px solid var(--teal)' : '1px solid var(--border)',
              background: filter === ft.id ? 'color-mix(in srgb, var(--teal) 15%, transparent)' : 'transparent',
              color: filter === ft.id ? 'var(--teal)' : 'var(--text-muted)',
              fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {ft.label}
            {ft.id === 'all' && <span style={{ marginLeft: 4, opacity: 0.6 }}>({customers.length})</span>}
            {ft.id === 'with_quotes' && <span style={{ marginLeft: 4, opacity: 0.6 }}>({withQuotes})</span>}
            {ft.id === 'without_quotes' && <span style={{ marginLeft: 4, opacity: 0.6 }}>({customers.length - withQuotes})</span>}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.72rem' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Αναζήτηση..."
            style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '7px 10px 7px 30px',
              color: 'var(--text)', fontSize: '0.78rem', width: 200,
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* ─── BULK ACTIONS ─── */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px', marginBottom: 10, borderRadius: 10,
          background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
        }}>
          <input
            type="checkbox"
            checked={selected.size === filtered.length}
            onChange={() => {
              if (selected.size === filtered.length) setSelected(new Set());
              else setSelected(new Set(filtered.map(c => c.id)));
            }}
            style={{ accentColor: 'var(--teal)', width: 15, height: 15 }}
          />
          <span style={{ fontSize: '0.85rem', flex: 1 }}>
            {selected.size} επιλεγμένοι
          </span>
          <button
            onClick={async () => {
              if (!confirm(`Διαγραφή ${selected.size} πελατών;`)) return;
              try {
                await bulkDeleteCustomers(Array.from(selected));
                setCustomers(prev => prev.filter(c => !selected.has(c.id)));
                toast(`${selected.size} πελάτες διαγράφηκαν`);
                setSelected(new Set());
              } catch { toast('Σφάλμα διαγραφής', 'error'); }
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 14px', borderRadius: 6,
              background: 'var(--danger)', border: 'none',
              color: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            }}
          >
            <i className="fas fa-trash" /> Διαγραφή {selected.size}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{
              padding: '6px 10px', borderRadius: 6,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer',
            }}
          >
            Ακύρωση
          </button>
        </div>
      )}

      {/* ─── CUSTOMER LIST ─── */}
      <div style={{
        background: 'var(--bg-surface)', backdropFilter: 'blur(24px)',
        border: '1px solid var(--glass-border)', borderRadius: 20,
        padding: 24, position: 'relative', overflow: 'hidden',
      }}>
        {/* Glass gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 20,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.02), transparent)',
          pointerEvents: 'none',
        }} />

        {/* Select all row */}
        {filtered.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '6px 12px', marginBottom: 8,
            borderBottom: '1px solid var(--border)',
          }}>
            <input
              type="checkbox"
              checked={selected.size > 0 && selected.size === filtered.length}
              ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length; }}
              onChange={() => {
                if (selected.size === filtered.length) setSelected(new Set());
                else setSelected(new Set(filtered.map(c => c.id)));
              }}
              style={{ accentColor: 'var(--teal)', width: 15, height: 15, cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {selected.size > 0 ? `${selected.size} / ${filtered.length} επιλεγμένοι` : 'Επιλογή όλων'}
            </span>
          </div>
        )}

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            <i className="fas fa-users" style={{ fontSize: '2rem', marginBottom: 12, display: 'block', opacity: 0.3 }} />
            <p style={{ fontSize: '0.85rem' }}>
              {customers.length === 0 ? 'Δεν υπάρχουν πελάτες ακόμα' : 'Κανένα αποτέλεσμα'}
            </p>
            {customers.length === 0 && (
              <button
                onClick={() => setShowEditor('new')}
                style={{
                  marginTop: 12, padding: '8px 16px', borderRadius: 8,
                  background: 'color-mix(in srgb, var(--teal) 15%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--teal) 30%, transparent)',
                  color: 'var(--teal)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Δημιουργήστε τον πρώτο πελάτη
              </button>
            )}
          </div>
        ) : (
          filtered.map(c => (
            <div
              key={c.id}
              onClick={() => setShowDetail(c.id)}
              style={{
                padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border)', marginBottom: 6,
                cursor: 'pointer', transition: 'background 0.2s',
                position: 'relative',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onClick={e => e.stopPropagation()}
                  onChange={e => {
                    setSelected(prev => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(c.id); else next.delete(c.id);
                      return next;
                    });
                  }}
                  style={{ accentColor: 'var(--teal)', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }}
                />
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'color-mix(in srgb, var(--teal) 15%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--teal) 25%, transparent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.68rem', fontWeight: 700, color: 'var(--teal)',
                  flexShrink: 0,
                }}>
                  {initials(c.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{c.name}</span>
                    {c.company && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.company}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 3 }}>
                    {(c.email) && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        <i className="fas fa-envelope" style={{ marginRight: 3, fontSize: '0.55rem' }} />
                        {c.email}
                      </span>
                    )}
                    {(c.phone || c.mobile) && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        <i className="fas fa-phone" style={{ marginRight: 3, fontSize: '0.55rem' }} />
                        {c.phone || c.mobile}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {/* Tags */}
                  {c.tags && c.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {c.tags.slice(0, 3).map(tag => (
                        <span key={tag} style={{
                          padding: '3px 10px', borderRadius: 20,
                          fontSize: '0.68rem', fontWeight: 600,
                          background: 'color-mix(in srgb, var(--teal) 12%, transparent)',
                          color: 'var(--teal)',
                        }}>
                          {tag}
                        </span>
                      ))}
                      {c.tags.length > 3 && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>+{c.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                  {/* Quote count */}
                  {c._count.quotes > 0 && (
                    <span style={{
                      padding: '3px 10px', borderRadius: 20,
                      fontSize: '0.68rem', fontWeight: 600,
                      background: 'rgba(59,130,246,0.12)',
                      color: '#60a5fa',
                    }}>
                      <i className="fas fa-file-invoice" style={{ marginRight: 3, fontSize: '0.55rem' }} />
                      {c._count.quotes}
                    </span>
                  )}
                  {/* Time */}
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: 55, textAlign: 'right' }}>
                    <i className="fas fa-clock" style={{ marginRight: 3, fontSize: '0.55rem' }} />
                    {timeAgo(c.createdAt)}
                  </span>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`Διαγραφή "${c.name}";`)) return;
                      try {
                        await deleteCustomer(c.id);
                        setCustomers(prev => prev.filter(x => x.id !== c.id));
                        toast('Ο πελάτης διαγράφηκε');
                      } catch { toast('Σφάλμα διαγραφής', 'error'); }
                    }}
                    style={{
                      background: 'transparent', border: 'none',
                      color: 'var(--text-muted)', cursor: 'pointer',
                      fontSize: '0.7rem', padding: '4px 6px', borderRadius: 4,
                      opacity: 0.3, transition: 'opacity 0.2s, color 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.3'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >
                    <i className="fas fa-trash" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ─── EDITOR MODAL ─── */}
      {showEditor && (
        <CustomerEditor
          customer={editingCustomer}
          onClose={() => setShowEditor(null)}
          onSaved={(c) => {
            if (editingCustomer) {
              setCustomers(prev => prev.map(old => old.id === c.id ? { ...old, ...c } : old));
            } else {
              setCustomers(prev => [c as CustomerWithCount, ...prev]);
            }
            setShowEditor(null);
            toast(editingCustomer ? 'Ο πελάτης ενημερώθηκε' : 'Ο πελάτης δημιουργήθηκε');
          }}
          toast={toast}
        />
      )}

      {/* ─── DETAIL MODAL ─── */}
      {showDetail && (
        <CustomerDetail
          customerId={showDetail}
          customer={customers.find(c => c.id === showDetail) ?? null}
          onClose={() => setShowDetail(null)}
          onEdit={() => { setShowDetail(null); setShowEditor(showDetail); }}
          onDelete={async () => {
            if (!confirm('Διαγραφή αυτού του πελάτη;')) return;
            try {
              await deleteCustomer(showDetail);
              setCustomers(prev => prev.filter(c => c.id !== showDetail));
              setShowDetail(null);
              toast('Ο πελάτης διαγράφηκε');
            } catch { toast('Σφάλμα διαγραφής', 'error'); }
          }}
          toast={toast}
        />
      )}

      {/* ─── CSV IMPORT MODAL ─── */}
      {showImport && (
        <CustomerCsvImport
          onClose={() => setShowImport(false)}
          onDone={(count) => {
            setShowImport(false);
            toast(`Εισαγωγή ${count} πελατών ολοκληρώθηκε`);
          }}
          toast={toast}
        />
      )}

      {/* ─── GOOGLE CONTACTS IMPORT ─── */}
      {showGoogleImport && (
        <GoogleContactsImport
          existingEmails={customers.map(c => c.email?.toLowerCase()).filter(Boolean) as string[]}
          onClose={() => setShowGoogleImport(false)}
          onDone={(count) => {
            setShowGoogleImport(false);
            toast(`Εισαγωγή ${count} επαφών από Google ολοκληρώθηκε`);
          }}
          toast={toast}
        />
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

// ─── CUSTOMER EDITOR ───
interface EditorProps {
  customer: CustomerWithCount | null;
  onClose: () => void;
  onSaved: (c: CustomerWithCount) => void;
  toast: (msg: string, type?: ToastType) => void;
}

interface ContactItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
}

function CustomerEditor({ customer, onClose, onSaved, toast }: EditorProps) {
  const [name, setName] = useState(customer?.name ?? '');
  const [company, setCompany] = useState(customer?.company ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [mobile, setMobile] = useState(customer?.mobile ?? '');
  const [afm, setAfm] = useState(customer?.afm ?? '');
  const [doy, setDoy] = useState(customer?.doy ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [city, setCity] = useState(customer?.city ?? '');
  const [zip, setZip] = useState(customer?.zip ?? '');
  const [notes, setNotes] = useState(customer?.notes ?? '');
  const [tags, setTags] = useState<string[]>(customer?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [contacts, setContacts] = useState<ContactItem[]>(() => {
    const raw = customer?.contacts;
    if (Array.isArray(raw) && raw.length > 0) return raw as unknown as ContactItem[];
    return [];
  });
  const [saving, setSaving] = useState(false);

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags(prev => [...prev, t]);
    }
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags(prev => prev.filter(t => t !== tag));
  }

  function addContact() {
    setContacts(prev => [...prev, { id: crypto.randomUUID(), name: '', email: '', phone: '', role: '' }]);
  }

  function updateContact(idx: number, field: keyof ContactItem, value: string) {
    setContacts(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }

  function removeContact(idx: number) {
    setContacts(prev => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!name.trim()) {
      toast('Το όνομα είναι υποχρεωτικό', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        company: company.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        mobile: mobile.trim() || undefined,
        afm: afm.trim() || undefined,
        doy: doy.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        zip: zip.trim() || undefined,
        notes: notes.trim(),
        contacts: contacts.filter(c => c.name.trim()),
        tags,
      };
      let result;
      if (customer) {
        result = await updateCustomer(customer.id, payload);
      } else {
        result = await createCustomer(payload);
      }
      onSaved(result as CustomerWithCount);
    } catch (e) {
      toast('Σφάλμα αποθήκευσης: ' + (e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const inp = {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 10px', color: 'var(--text)',
    fontSize: '0.82rem', width: '100%', outline: 'none',
  } as const;

  const labelStyle = {
    display: 'block', fontSize: '0.72rem', fontWeight: 600 as const,
    color: 'var(--text-muted)', marginBottom: 4,
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
        borderRadius: 20, padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>
            {customer ? 'Επεξεργασία Πελάτη' : 'Νέος Πελάτης'}
          </h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer' }}>&times;</button>
        </div>

        {/* Basic info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Όνομα *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Όνομα πελάτη" style={inp} />
          </div>
          <div>
            <label style={labelStyle}>Εταιρεία</label>
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Επωνυμία" style={inp} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" style={inp} />
          </div>
          <div>
            <label style={labelStyle}>Τηλέφωνο</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Τηλέφωνο" style={inp} />
          </div>
          <div>
            <label style={labelStyle}>Κινητό</label>
            <input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="Κινητό" style={inp} />
          </div>
          <div>
            <label style={labelStyle}>ΑΦΜ</label>
            <input value={afm} onChange={e => setAfm(e.target.value)} placeholder="ΑΦΜ" style={inp} />
          </div>
          <div>
            <label style={labelStyle}>ΔΟΥ</label>
            <input value={doy} onChange={e => setDoy(e.target.value)} placeholder="ΔΟΥ" style={inp} />
          </div>
          <div>
            <label style={labelStyle}>Διεύθυνση</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Διεύθυνση" style={inp} />
          </div>
          <div>
            <label style={labelStyle}>Πόλη</label>
            <input value={city} onChange={e => setCity(e.target.value)} placeholder="Πόλη" style={inp} />
          </div>
          <div>
            <label style={labelStyle}>Τ.Κ.</label>
            <input value={zip} onChange={e => setZip(e.target.value)} placeholder="Τ.Κ." style={inp} />
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Σημειώσεις</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Σημειώσεις..."
            rows={3}
            style={{ ...inp, resize: 'vertical' as const }}
          />
        </div>

        {/* Tags */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Ετικέτες</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {tags.map(tag => (
              <span
                key={tag}
                onClick={() => removeTag(tag)}
                style={{
                  padding: '3px 10px', borderRadius: 20,
                  fontSize: '0.68rem', fontWeight: 600,
                  background: 'color-mix(in srgb, var(--teal) 12%, transparent)',
                  color: 'var(--teal)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {tag}
                <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>&times;</span>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              placeholder="Προσθήκη ετικέτας..."
              style={{ ...inp, flex: 1 }}
            />
            <button
              onClick={addTag}
              style={{
                padding: '8px 14px', borderRadius: 8,
                background: 'color-mix(in srgb, var(--teal) 15%, transparent)',
                border: '1px solid color-mix(in srgb, var(--teal) 30%, transparent)',
                color: 'var(--teal)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              <i className="fas fa-plus" />
            </button>
          </div>
        </div>

        {/* Contacts */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Επαφές</label>
            <button
              onClick={addContact}
              style={{
                padding: '4px 10px', borderRadius: 6,
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              <i className="fas fa-plus" style={{ marginRight: 4 }} />Προσθήκη
            </button>
          </div>
          {contacts.map((contact, idx) => (
            <div key={contact.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 0.7fr auto', gap: 6,
              marginBottom: 6, alignItems: 'center',
            }}>
              <input
                value={contact.name}
                onChange={e => updateContact(idx, 'name', e.target.value)}
                placeholder="Όνομα"
                style={{ ...inp, fontSize: '0.75rem', padding: '6px 8px' }}
              />
              <input
                value={contact.email}
                onChange={e => updateContact(idx, 'email', e.target.value)}
                placeholder="Email"
                style={{ ...inp, fontSize: '0.75rem', padding: '6px 8px' }}
              />
              <input
                value={contact.phone}
                onChange={e => updateContact(idx, 'phone', e.target.value)}
                placeholder="Τηλέφωνο"
                style={{ ...inp, fontSize: '0.75rem', padding: '6px 8px' }}
              />
              <input
                value={contact.role}
                onChange={e => updateContact(idx, 'role', e.target.value)}
                placeholder="Ρόλος"
                style={{ ...inp, fontSize: '0.75rem', padding: '6px 8px' }}
              />
              <button
                onClick={() => removeContact(idx)}
                style={{
                  border: 'none', background: 'transparent',
                  color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem',
                  padding: '4px 6px',
                }}
              >
                <i className="fas fa-trash" />
              </button>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px', borderRadius: 8,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Ακύρωση
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: '10px 20px', borderRadius: 8,
              background: 'var(--teal)', border: 'none',
              color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? (
              <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />Αποθήκευση...</>
            ) : (
              <><i className="fas fa-check" style={{ marginRight: 6 }} />{customer ? 'Ενημέρωση' : 'Δημιουργία'}</>
            )}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ─── CUSTOMER DETAIL ───
interface DetailProps {
  customerId: string;
  customer: CustomerWithCount | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  toast: (msg: string, type?: ToastType) => void;
}

function CustomerDetail({ customerId, customer, onClose, onEdit, onDelete, toast }: DetailProps) {
  const [fullCustomer, setFullCustomer] = useState<CustomerWithQuotes | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getCustomer(customerId);
        if (!cancelled) setFullCustomer(data);
      } catch {
        if (!cancelled) toast('Σφάλμα φόρτωσης', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId, toast]);

  const c = fullCustomer ?? customer;
  if (!c) return null;

  const contacts: ContactItem[] = Array.isArray(c.contacts) ? c.contacts as unknown as ContactItem[] : [];
  const quotes: Quote[] = fullCustomer?.quotes ?? [];

  const labelStyle = { fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 2 };
  const valueStyle = { fontSize: '0.82rem', color: 'var(--text)' };

  return (
    <ModalBackdrop onClose={onClose}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
        borderRadius: 20, padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: '50%',
              background: 'color-mix(in srgb, var(--teal) 15%, transparent)',
              border: '1px solid color-mix(in srgb, var(--teal) 25%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.78rem', fontWeight: 700, color: 'var(--teal)',
            }}>
              {initials(c.name)}
            </div>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>{c.name}</h2>
              {c.company && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.company}</p>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={onEdit}
              style={{
                padding: '8px 14px', borderRadius: 8,
                background: 'color-mix(in srgb, var(--teal) 15%, transparent)',
                border: '1px solid color-mix(in srgb, var(--teal) 30%, transparent)',
                color: 'var(--teal)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              <i className="fas fa-edit" style={{ marginRight: 4 }} />Επεξεργασία
            </button>
            <button
              onClick={onDelete}
              style={{
                padding: '8px 14px', borderRadius: 8,
                background: 'rgba(240,101,72,0.12)',
                border: '1px solid rgba(240,101,72,0.25)',
                color: '#f06548', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              <i className="fas fa-trash" style={{ marginRight: 4 }} />Διαγραφή
            </button>
            <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer', padding: '0 4px' }}>&times;</button>
          </div>
        </div>

        {/* Tags */}
        {c.tags && c.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {c.tags.map(tag => (
              <span key={tag} style={{
                padding: '3px 10px', borderRadius: 20,
                fontSize: '0.68rem', fontWeight: 600,
                background: 'color-mix(in srgb, var(--teal) 12%, transparent)',
                color: 'var(--teal)',
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Info grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14,
          padding: 16, borderRadius: 12,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          marginBottom: 16,
        }}>
          {c.email && (
            <div>
              <div style={labelStyle}><i className="fas fa-envelope" style={{ marginRight: 4, fontSize: '0.55rem' }} />Email</div>
              <div style={valueStyle}>{c.email}</div>
            </div>
          )}
          {c.phone && (
            <div>
              <div style={labelStyle}><i className="fas fa-phone" style={{ marginRight: 4, fontSize: '0.55rem' }} />Τηλέφωνο</div>
              <div style={valueStyle}>{c.phone}</div>
            </div>
          )}
          {c.mobile && (
            <div>
              <div style={labelStyle}><i className="fas fa-mobile-alt" style={{ marginRight: 4, fontSize: '0.55rem' }} />Κινητό</div>
              <div style={valueStyle}>{c.mobile}</div>
            </div>
          )}
          {c.afm && (
            <div>
              <div style={labelStyle}><i className="fas fa-id-card" style={{ marginRight: 4, fontSize: '0.55rem' }} />ΑΦΜ</div>
              <div style={valueStyle}>{c.afm}</div>
            </div>
          )}
          {c.doy && (
            <div>
              <div style={labelStyle}><i className="fas fa-building" style={{ marginRight: 4, fontSize: '0.55rem' }} />ΔΟΥ</div>
              <div style={valueStyle}>{c.doy}</div>
            </div>
          )}
          {(c.address || c.city || c.zip) && (
            <div>
              <div style={labelStyle}><i className="fas fa-map-marker-alt" style={{ marginRight: 4, fontSize: '0.55rem' }} />Διεύθυνση</div>
              <div style={valueStyle}>{[c.address, c.city, c.zip].filter(Boolean).join(', ')}</div>
            </div>
          )}
        </div>

        {/* Notes */}
        {c.notes && (
          <div style={{
            padding: 14, borderRadius: 10,
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            marginBottom: 16,
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
              <i className="fas fa-sticky-note" style={{ marginRight: 4 }} />Σημειώσεις
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{c.notes}</div>
          </div>
        )}

        {/* Contacts */}
        {contacts.length > 0 && (
          <div style={{
            padding: 14, borderRadius: 10,
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            marginBottom: 16,
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600 }}>
              <i className="fas fa-address-book" style={{ marginRight: 4 }} />Επαφές ({contacts.length})
            </div>
            {contacts.map((contact, idx) => (
              <div key={contact.id || idx} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 0',
                borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: 'color-mix(in srgb, var(--blue) 12%, transparent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.6rem', color: 'var(--blue)',
                }}>
                  <i className="fas fa-user" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{contact.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: 10 }}>
                    {contact.role && <span>{contact.role}</span>}
                    {contact.email && <span><i className="fas fa-envelope" style={{ marginRight: 2, fontSize: '0.5rem' }} />{contact.email}</span>}
                    {contact.phone && <span><i className="fas fa-phone" style={{ marginRight: 2, fontSize: '0.5rem' }} />{contact.phone}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quotes */}
        <div style={{
          padding: 14, borderRadius: 10,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600 }}>
            <i className="fas fa-file-invoice" style={{ marginRight: 4 }} />Προσφορές
            {loading && <i className="fas fa-spinner fa-spin" style={{ marginLeft: 6, fontSize: '0.6rem' }} />}
          </div>
          {quotes.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '8px 0' }}>
              {loading ? 'Φόρτωση...' : 'Δεν υπάρχουν προσφορές'}
            </div>
          ) : (
            quotes.map(q => (
              <div key={q.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 6px', borderRadius: 6,
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)' }}>{q.number}</span>
                <span style={{ fontSize: '0.78rem', flex: 1, color: 'var(--text-muted)' }}>{q.title || '—'}</span>
                <span style={{
                  padding: '2px 8px', borderRadius: 12,
                  fontSize: '0.65rem', fontWeight: 600,
                  background: 'rgba(156,163,175,0.15)', color: '#9ca3af',
                }}>
                  {q.status}
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(q.grandTotal)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Footer: created at */}
        <div style={{ marginTop: 14, fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>
          <i className="fas fa-clock" style={{ marginRight: 4 }} />
          Δημιουργήθηκε: {timeAgo(c.createdAt)}
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ─── CSV IMPORT ───

const CUSTOMER_FIELDS = [
  { id: 'name', label: 'Όνομα', required: true },
  { id: 'company', label: 'Εταιρεία' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Τηλέφωνο' },
  { id: 'mobile', label: 'Κινητό' },
  { id: 'afm', label: 'ΑΦΜ' },
  { id: 'doy', label: 'ΔΟΥ' },
  { id: 'address', label: 'Διεύθυνση' },
  { id: 'city', label: 'Πόλη' },
  { id: 'zip', label: 'ΤΚ' },
  { id: 'notes', label: 'Σημειώσεις' },
] as const;

type CustFieldId = typeof CUSTOMER_FIELDS[number]['id'];

/** Auto-detect column mapping from header names */
function autoDetectMapping(headers: string[]): Record<CustFieldId, number> {
  const map: Record<string, number> = {
    name: -1, company: -1, email: -1, phone: -1, mobile: -1,
    afm: -1, doy: -1, address: -1, city: -1, zip: -1, notes: -1,
  };
  const patterns: Record<string, RegExp> = {
    name: /^(όνομα|onoma|name|ονομα|ονοματεπ|επωνυμ)/i,
    company: /^(εταιρ[εί]α|εταιρια|company|επωνυμία|επωνυμια)/i,
    email: /^(email|e-mail|ηλ[.\s]*ταχ|mail)/i,
    phone: /^(τηλ[εέ]φωνο|τηλ\.?|phone|tel)/i,
    mobile: /^(κινητ[οό]|mobile|cell)/i,
    afm: /^(αφμ|α\.?φ\.?μ\.?|vat|tin|tax.?id)/i,
    doy: /^(δου|δ\.?ο\.?υ\.?|doy|tax.?office)/i,
    address: /^(διε[υύ]θυνση|address|οδ[οό]ς|odos)/i,
    city: /^(π[οό]λη|city|town|περιοχ)/i,
    zip: /^(τ\.?κ\.?|zip|postal|ταχ)/i,
    notes: /^(σημει[ωώ]σ|notes|comments|παρατηρ)/i,
  };
  headers.forEach((h, i) => {
    const trimmed = h.trim();
    for (const [field, rx] of Object.entries(patterns)) {
      if (rx.test(trimmed) && map[field] === -1) {
        map[field] = i;
      }
    }
  });
  return map as Record<CustFieldId, number>;
}

/** Parse CSV text handling comma, semicolon, tab delimiters and quoted fields */
function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Detect delimiter: semicolon, tab, or comma
  const first = lines[0];
  let delim = ',';
  if (first.includes('\t')) delim = '\t';
  else if ((first.match(/;/g) || []).length >= (first.match(/,/g) || []).length && first.includes(';')) delim = ';';

  function splitRow(line: string): string[] {
    const cells: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuote = false;
          }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQuote = true;
        } else if (ch === delim) {
          cells.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
    }
    cells.push(cur.trim());
    return cells;
  }

  const headers = splitRow(lines[0]);
  const rows = lines.slice(1).map(l => splitRow(l));
  return { headers, rows };
}

interface CsvImportProps {
  onClose: () => void;
  onDone: (count: number) => void;
  toast: (msg: string, type?: ToastType) => void;
}

function CustomerCsvImport({ onClose, onDone, toast }: CsvImportProps) {
  const [step, setStep] = useState<'upload' | 'map' | 'importing'>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<CustFieldId, number>>({
    name: -1, company: -1, email: -1, phone: -1, mobile: -1,
    afm: -1, doy: -1, address: -1, city: -1, zip: -1, notes: -1,
  });
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCsvText(text);
      if (parsed.rows.length === 0) {
        toast('Το αρχείο είναι κενό ή δεν αναγνωρίστηκε', 'error');
        return;
      }
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(autoDetectMapping(parsed.headers));
      setStep('map');
    };
    reader.readAsText(file, 'utf-8');
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  function getMappedValue(row: string[], fieldId: CustFieldId): string {
    const idx = mapping[fieldId];
    if (idx < 0 || idx >= row.length) return '';
    return row[idx] || '';
  }

  async function doImport() {
    if (mapping.name < 0) {
      toast('Πρέπει να αντιστοιχίσετε τουλάχιστον το πεδίο Όνομα', 'error');
      return;
    }
    setSaving(true);
    setStep('importing');
    try {
      const data = rows
        .map(row => ({
          name: getMappedValue(row, 'name'),
          company: getMappedValue(row, 'company') || undefined,
          email: getMappedValue(row, 'email') || undefined,
          phone: getMappedValue(row, 'phone') || undefined,
          mobile: getMappedValue(row, 'mobile') || undefined,
          afm: getMappedValue(row, 'afm') || undefined,
          doy: getMappedValue(row, 'doy') || undefined,
          address: getMappedValue(row, 'address') || undefined,
          city: getMappedValue(row, 'city') || undefined,
          zip: getMappedValue(row, 'zip') || undefined,
          notes: getMappedValue(row, 'notes') || undefined,
        }))
        .filter(r => r.name.trim().length > 0);

      if (data.length === 0) {
        toast('Δεν βρέθηκαν έγκυρες εγγραφές', 'error');
        setSaving(false);
        setStep('map');
        return;
      }

      const result = await bulkCreateCustomers(data);
      onDone(result.count);
    } catch (err) {
      toast('Σφάλμα εισαγωγής: ' + (err as Error).message, 'error');
      setSaving(false);
      setStep('map');
    }
  }

  const nameIsMapped = mapping.name >= 0;
  const validRowCount = nameIsMapped
    ? rows.filter(r => (r[mapping.name] || '').trim().length > 0).length
    : 0;

  const inp = {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 10px', color: 'var(--text)',
    fontSize: '0.82rem', width: '100%', outline: 'none',
  } as const;

  const labelStyle = {
    display: 'block', fontSize: '0.72rem', fontWeight: 600 as const,
    color: 'var(--text-muted)', marginBottom: 4,
  };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        background: 'rgba(0,0,0,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
          borderRadius: 20, padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          width: step === 'upload' ? 520 : 900,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', transition: 'width 0.3s ease',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-file-csv" style={{ color: 'var(--blue)' }} />
            Εισαγωγή Πελατών από CSV
          </h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer' }}>&times;</button>
        </div>

        {/* ─── STEP 1: UPLOAD ─── */}
        {step === 'upload' && (
          <>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? 'var(--teal)' : 'var(--border)'}`,
                borderRadius: 14, padding: '48px 24px', textAlign: 'center',
                cursor: 'pointer', transition: 'all 0.2s',
                background: dragOver ? 'color-mix(in srgb, var(--teal) 5%, transparent)' : 'transparent',
              }}
            >
              <i className="fas fa-cloud-upload-alt" style={{ fontSize: '2.2rem', color: dragOver ? 'var(--teal)' : 'var(--text-muted)', marginBottom: 12, display: 'block' }} />
              <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                Σύρετε αρχείο εδώ ή κάντε κλικ
              </p>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Υποστηριζόμενοι τύποι: .csv, .tsv, .txt (UTF-8)
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={onFileChange}
              style={{ display: 'none' }}
            />
          </>
        )}

        {/* ─── STEP 2: MAPPING ─── */}
        {(step === 'map' || step === 'importing') && (
          <>
            {/* Step indicator */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <span style={{
                padding: '4px 12px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700,
                background: 'color-mix(in srgb, var(--teal) 15%, transparent)',
                color: 'var(--teal)',
              }}>
                <i className="fas fa-check" style={{ marginRight: 4 }} />
                {rows.length} γραμμές · {headers.length} στήλες
              </span>
              {nameIsMapped && (
                <span style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700,
                  background: 'color-mix(in srgb, var(--blue) 15%, transparent)',
                  color: 'var(--blue)',
                }}>
                  {validRowCount} έγκυροι πελάτες
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 20, flex: 1, overflow: 'hidden', minHeight: 0 }}>
              {/* Left: Column mapping */}
              <div style={{ width: 280, flexShrink: 0, overflowY: 'auto', paddingRight: 8 }}>
                <h4 style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                  Αντιστοίχιση Στηλών
                </h4>
                {CUSTOMER_FIELDS.map(f => (
                  <div key={f.id} style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>
                      {f.label}
                      {'required' in f && f.required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
                    </label>
                    <select
                      value={mapping[f.id]}
                      onChange={e => setMapping(prev => ({ ...prev, [f.id]: parseInt(e.target.value) }))}
                      style={{ ...inp, cursor: 'pointer', colorScheme: 'dark' } as React.CSSProperties}
                    >
                      <option value={-1}>— Παράλειψη —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Στήλη ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Right: Preview table */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <h4 style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                  Προεπισκόπηση
                </h4>
                <div style={{ flex: 1, overflow: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                    <thead>
                      <tr style={{ background: 'color-mix(in srgb, var(--blue) 15%, transparent)' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>#</th>
                        {CUSTOMER_FIELDS.filter(f => mapping[f.id] >= 0).map(f => (
                          <th key={f.id} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                            {f.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((row, ri) => (
                        <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{ri + 1}</td>
                          {CUSTOMER_FIELDS.filter(f => mapping[f.id] >= 0).map(f => (
                            <td key={f.id} style={{ padding: '6px 10px', color: 'var(--text)', whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {row[mapping[f.id]] || ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 5 && (
                    <div style={{ padding: '8px 10px', fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                      ... και {rows.length - 5} ακόμα γραμμές
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => { setStep('upload'); setHeaders([]); setRows([]); }}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                }}
              >
                <i className="fas fa-arrow-left" style={{ marginRight: 6 }} />
                Πίσω
              </button>
              <button
                onClick={doImport}
                disabled={!nameIsMapped || saving}
                style={{
                  padding: '10px 24px', borderRadius: 8,
                  background: nameIsMapped ? 'var(--teal)' : 'var(--border)',
                  border: 'none',
                  color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: nameIsMapped ? 'pointer' : 'not-allowed',
                  opacity: saving ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                {saving ? (
                  <><i className="fas fa-spinner fa-spin" /> Εισαγωγή...</>
                ) : (
                  <><i className="fas fa-upload" /> Εισαγωγή {validRowCount} πελατών</>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── GOOGLE CONTACTS IMPORT ───
function GoogleContactsImport({ existingEmails, onClose, onDone, toast }: {
  existingEmails: string[];
  onClose: () => void;
  onDone: (count: number) => void;
  toast: (msg: string, type?: ToastType) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // Fetch contacts on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/contacts/google');
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Σφάλμα σύνδεσης');
          setLoading(false);
          return;
        }
        setContacts(data.contacts || []);
        // Auto-select contacts not already in the system
        const existingSet = new Set(existingEmails);
        const newIdx = new Set<number>();
        (data.contacts || []).forEach((c: any, i: number) => {
          if (c.email && !existingSet.has(c.email.toLowerCase())) {
            newIdx.add(i);
          }
        });
        setSelected(newIdx);
      } catch (e) {
        setError('Σφάλμα: ' + (e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [existingEmails]);

  const filtered = contacts.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.name || '').toLowerCase().includes(s) ||
      (c.email || '').toLowerCase().includes(s) ||
      (c.company || '').toLowerCase().includes(s) ||
      (c.phone || '').toLowerCase().includes(s);
  });

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      const all = new Set<number>();
      filtered.forEach(fc => {
        const realIdx = contacts.indexOf(fc);
        all.add(realIdx);
      });
      setSelected(all);
    }
  }

  function toggle(realIdx: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(realIdx)) next.delete(realIdx);
      else next.add(realIdx);
      return next;
    });
  }

  async function doImport() {
    const toImport = Array.from(selected).map(i => contacts[i]).filter(Boolean);
    if (toImport.length === 0) return;
    setSaving(true);
    try {
      const payload = toImport.map(c => ({
        name: c.name || c.email || 'Χωρίς όνομα',
        company: c.company || undefined,
        email: c.email || undefined,
        phone: c.phone || undefined,
        mobile: c.mobile || undefined,
        address: c.address || undefined,
        city: c.city || undefined,
        zip: c.zip || undefined,
      }));
      const result = await bulkCreateCustomers(payload);
      onDone(result.count);
    } catch (e) {
      toast('Σφάλμα εισαγωγής: ' + (e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const existingSet = new Set(existingEmails);

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      background: 'rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.2s ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
        borderRadius: 20, boxShadow: '0 24px 80px rgba(0,0,0,0.5)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 28px', borderBottom: '1px solid var(--glass-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="fab fa-google" style={{ fontSize: '1.1rem', color: '#ea4335' }} />
            <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Εισαγωγή από Google Contacts</h2>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>&times;</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 28px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.5rem', marginBottom: 12, display: 'block' }} />
              <p style={{ fontSize: '0.82rem' }}>Φόρτωση επαφών Google...</p>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <i className="fas fa-exclamation-triangle" style={{ fontSize: '1.5rem', color: 'var(--danger)', marginBottom: 12, display: 'block' }} />
              <p style={{ fontSize: '0.82rem', color: 'var(--danger)', maxWidth: 400, margin: '0 auto' }}>{error}</p>
            </div>
          ) : contacts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              <i className="fas fa-address-book" style={{ fontSize: '1.5rem', marginBottom: 12, display: 'block', opacity: 0.4 }} />
              <p style={{ fontSize: '0.82rem' }}>Δεν βρέθηκαν επαφές στο Google</p>
            </div>
          ) : (
            <>
              {/* Search + stats */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.72rem' }} />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Αναζήτηση επαφών..."
                    style={{
                      background: 'var(--bg-surface)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '7px 10px 7px 30px',
                      color: 'var(--text)', fontSize: '0.78rem', width: '100%', outline: 'none',
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {contacts.length} επαφές · {selected.size} επιλεγμένες
                </span>
              </div>

              {/* Select all */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                borderBottom: '1px solid var(--border)', marginBottom: 4,
              }}>
                <input type="checkbox" checked={selected.size > 0 && selected.size === filtered.length} onChange={toggleAll}
                  style={{ accentColor: 'var(--teal)', width: 14, height: 14 }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>Επιλογή όλων</span>
              </div>

              {/* Contact list */}
              {filtered.map((c) => {
                const realIdx = contacts.indexOf(c);
                const isDuplicate = c.email && existingSet.has(c.email.toLowerCase());
                return (
                  <div key={realIdx} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 4px', borderBottom: '1px solid var(--border)',
                    opacity: isDuplicate ? 0.45 : 1,
                  }}>
                    <input type="checkbox" checked={selected.has(realIdx)} onChange={() => toggle(realIdx)}
                      style={{ accentColor: 'var(--teal)', width: 14, height: 14, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{c.name || '—'}</span>
                        {c.company && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({c.company})</span>}
                        {isDuplicate && (
                          <span style={{
                            padding: '1px 6px', borderRadius: 10,
                            background: 'rgba(245,130,32,0.15)', color: '#fb923c',
                            fontSize: '0.58rem', fontWeight: 600,
                          }}>Υπάρχει</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {c.email && <span><i className="fas fa-envelope" style={{ marginRight: 3, fontSize: '0.55rem' }} />{c.email}</span>}
                        {c.phone && <span><i className="fas fa-phone" style={{ marginRight: 3, fontSize: '0.55rem' }} />{c.phone}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && contacts.length > 0 && (
          <div style={{
            padding: '16px 28px', borderTop: '1px solid var(--glass-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
          }}>
            <button onClick={onClose} style={{
              padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            }}>Ακύρωση</button>
            <button onClick={doImport} disabled={saving || selected.size === 0} style={{
              padding: '9px 24px', borderRadius: 8, border: 'none',
              background: selected.size > 0 ? '#ea4335' : 'var(--border)',
              color: '#fff', fontSize: '0.82rem', fontWeight: 700,
              cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
              opacity: saving ? 0.6 : 1,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {saving ? (
                <><i className="fas fa-spinner fa-spin" /> Εισαγωγή...</>
              ) : (
                <><i className="fab fa-google" /> Εισαγωγή {selected.size} επαφών</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
