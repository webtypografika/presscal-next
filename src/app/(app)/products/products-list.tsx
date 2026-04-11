'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Product } from '@/generated/prisma/client';
import { createProduct, updateProduct, deleteProduct } from './actions';

// ─── ARCHETYPES ───
const ARCHETYPES: Record<string, {
  id: string; name: string; nameGR: string; icon: string;
  description: string; fields: string[]; formula: string;
}> = {
  single_leaf: {
    id: 'single_leaf', name: 'Single Leaf', nameGR: 'Φύλλο',
    icon: 'fas fa-file', description: 'Μονόφυλλα (φλάιερ, αφίσες, επιστολόχαρτα)',
    fields: ['qty'], formula: 'qty',
  },
  pad: {
    id: 'pad', name: 'Pad', nameGR: 'Μπλοκ',
    icon: 'fas fa-layer-group', description: 'Μπλοκ σημειώσεων, ημερολόγια',
    fields: ['qty', 'sheets_per_pad'], formula: 'qty × φύλλα_ανά_μπλοκ',
  },
  booklet: {
    id: 'booklet', name: 'Booklet', nameGR: 'Φυλλάδιο',
    icon: 'fas fa-book-open', description: 'Καρφιτσωτά φυλλάδια, έντυπα, περιοδικά',
    fields: ['qty', 'pages'], formula: 'qty × σελίδες / 4',
  },
  perfect_bound: {
    id: 'perfect_bound', name: 'Perfect Bound', nameGR: 'Κολλητή Βιβλιοδεσία',
    icon: 'fas fa-book', description: 'Βιβλία, κατάλογοι με κολλητή ράχη',
    fields: ['qty', 'body_pages'], formula: 'qty × σελίδες/16 + εξώφυλλα',
  },
  die_cut: {
    id: 'die_cut', name: 'Die-Cut', nameGR: 'Ντεκόπ',
    icon: 'fas fa-shapes', description: 'Ετικέτες, αυτοκόλλητα, κουτιά',
    fields: ['qty'], formula: 'qty',
  },
  custom: {
    id: 'custom', name: 'Custom', nameGR: 'Προσαρμοσμένο',
    icon: 'fas fa-cog', description: 'Προσαρμοσμένος υπολογισμός',
    fields: ['qty', 'custom_multiplier'], formula: 'qty × πολλαπλασιαστής',
  },
};

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

// ─── MODAL ───
function ModalPortal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>,
    document.body
  );
}

// ─── SUB TABS ───
type SubTab = 'products' | 'archetypes';

// ─── MAIN COMPONENT ───
export default function ProductsList({ initialProducts }: { initialProducts: Product[] }) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [tab, setTab] = useState<SubTab>('products');
  const [search, setSearch] = useState('');
  const [archFilter, setArchFilter] = useState('');
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    setToasts(prev => [...prev, { message, type, id: ++toastId }]);
  }, []);
  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ─── FILTER ───
  const filtered = products.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (archFilter && p.archetype !== archFilter) return false;
    return true;
  });

  // Stats per archetype
  const stats = Object.values(ARCHETYPES).map(a => ({
    ...a,
    count: products.filter(p => p.archetype === a.id).length,
  }));

  // ─── CRUD ───
  async function handleDelete(id: string) {
    await deleteProduct(id);
    setProducts(prev => prev.filter(p => p.id !== id));
    addToast('Προϊόν διαγράφηκε');
  }

  async function handleSave(data: {
    name: string; archetype: string;
    pages?: number; sheetsPerPad?: number; bodyPages?: number; customMult?: number;
    offset: Record<string, unknown>; digital: Record<string, unknown>; finishing: unknown[];
  }, existingId?: string) {
    if (existingId) {
      const updated = await updateProduct(existingId, data);
      setProducts(prev => prev.map(p => p.id === existingId ? updated : p));
      addToast('Προϊόν ενημερώθηκε');
    } else {
      const created = await createProduct(data);
      setProducts(prev => [created, ...prev]);
      addToast('Νέο προϊόν δημιουργήθηκε');
    }
    setEditingProduct(null);
    setShowNewModal(false);
  }

  // ─── RENDER ───
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* ═══ HEADER ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 10, letterSpacing: '0.01em' }}>
            <i className="fas fa-cube" style={{ color: 'var(--accent)' }} />
            Global Products
          </h1>
          <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '4px 0 0', letterSpacing: '0.01em' }}>
            Κεντρική βάση προϊόντων, archetypes και τιμοδότηση ανά κατηγορία μηχανής
          </p>
        </div>
      </div>

      {/* ═══ SUB TABS ═══ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 10, width: 'fit-content', border: '1px solid var(--border)' }}>
        {([
          { id: 'products' as const, label: 'Προϊόντα', icon: 'fas fa-box' },
          { id: 'archetypes' as const, label: 'Archetypes', icon: 'fas fa-shapes' },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 20px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
            border: 'none', cursor: 'pointer', transition: 'all 0.2s',
            background: tab === t.id ? 'rgba(255,255,255,0.06)' : 'transparent',
            color: tab === t.id ? 'var(--text)' : '#64748b',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <i className={t.icon} style={{ fontSize: '0.75rem' }} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ PRODUCTS TAB ═══ */}
      {tab === 'products' && (
        <>
          {/* Toolbar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '12px 16px', background: 'rgba(0,0,0,0.2)',
            borderRadius: '10px 10px 0 0', border: '1px solid var(--border)', borderBottom: 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-list" style={{ color: 'var(--accent)', fontSize: '0.82rem' }} />
              <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)', letterSpacing: '0.01em' }}>
                Λίστα Προϊόντων ({filtered.length})
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Search */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 34,
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
              }}>
                <i className="fas fa-search" style={{ color: '#64748b', fontSize: '0.72rem' }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Αναζήτηση..."
                  style={{ border: 'none', background: 'transparent', color: 'var(--text)', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', width: 140 }}
                />
              </div>
              {/* Archetype filter */}
              <select value={archFilter} onChange={e => setArchFilter(e.target.value)} style={{
                height: 34, borderRadius: 8, border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.04)', color: 'var(--text)',
                fontSize: '0.82rem', padding: '0 10px', fontFamily: 'inherit', cursor: 'pointer',
              }}>
                <option value="">Όλα τα archetypes</option>
                {Object.values(ARCHETYPES).map(a => (
                  <option key={a.id} value={a.id}>{a.nameGR}</option>
                ))}
              </select>
              {/* New Product */}
              <button onClick={() => setShowNewModal(true)} style={{
                padding: '8px 16px', borderRadius: 20, border: 'none',
                background: 'var(--accent)', color: '#fff', fontSize: '0.82rem', fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 8px rgba(245,130,32,0.3)', transition: 'all 0.2s',
              }}>
                <i className="fas fa-plus" /> Νέο Προϊόν
              </button>
            </div>
          </div>

          {/* Table */}
          <div style={{
            background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)',
            borderRadius: '0 0 10px 10px', overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Προϊόν', 'Archetype', 'Offset', 'Ψηφιακό', 'Ενέργειες'].map((h, i) => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: i >= 2 ? 'center' : 'left',
                      fontSize: '0.68rem', fontWeight: 600, color: '#64748b',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      borderBottom: '2px solid var(--border)', background: 'rgba(0,0,0,0.1)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                      <i className="fas fa-inbox" style={{ fontSize: '2rem', marginBottom: 10, display: 'block', color: '#475569' }} />
                      Δεν υπάρχουν προϊόντα. Πατήστε &quot;Νέο Προϊόν&quot; για να ξεκινήσετε.
                    </td>
                  </tr>
                ) : filtered.map(p => {
                  const arch = ARCHETYPES[p.archetype] || ARCHETYPES.single_leaf;
                  const off = (p.offset as Record<string, unknown>) || {};
                  const dig = (p.digital as Record<string, unknown>) || {};

                  let detail = '';
                  if (p.archetype === 'booklet' && p.pages) detail = p.pages + ' σελ.';
                  if (p.archetype === 'pad' && p.sheetsPerPad) detail = p.sheetsPerPad + ' φύλ./μπλοκ';
                  if (p.archetype === 'perfect_bound' && p.bodyPages) detail = p.bodyPages + ' σελ.';
                  if (p.archetype === 'custom' && p.customMult) detail = '×' + p.customMult;

                  const offScales = (off.scales as unknown[]) || [];
                  const offSummary = offScales.length > 0
                    ? `${off.charge_per_color || 0}€/χρ, ${offScales.length} κλίμ.`
                    : `${off.charge_per_color || 0}€/χρώμα`;
                  const digSummary = `C:${dig.price_color || 0}€ B:${dig.price_bw || 0}€`;

                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <i className={arch.icon} style={{ fontSize: '1.1rem', color: 'var(--accent)', width: 24, textAlign: 'center' }} />
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.88rem', letterSpacing: '0.01em' }}>{p.name || 'Χωρίς όνομα'}</div>
                            {detail && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>{detail}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.82rem' }}>{arch.nameGR}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                          padding: '3px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
                        }}>
                          <i className="fas fa-industry" style={{ fontSize: '0.6rem' }} /> {offSummary}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: 'rgba(59,130,246,0.1)', color: '#3b82f6',
                          padding: '3px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
                        }}>
                          <i className="fas fa-print" style={{ fontSize: '0.6rem' }} /> {digSummary}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button onClick={() => setEditingProduct(p)} style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px',
                          borderRadius: 6, color: 'var(--blue)', transition: 'all 0.15s',
                        }} title="Επεξεργασία">
                          <i className="fas fa-edit" />
                        </button>
                        <button onClick={() => { if (confirm('Διαγραφή προϊόντος;')) handleDelete(p.id); }} style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px',
                          borderRadius: 6, color: 'var(--danger)', transition: 'all 0.15s',
                        }} title="Διαγραφή">
                          <i className="fas fa-trash" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ═══ QUICK STATS ═══ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginTop: 16 }}>
            {stats.map(s => (
              <div key={s.id} onClick={() => setArchFilter(archFilter === s.id ? '' : s.id)} style={{
                background: archFilter === s.id ? 'rgba(245,130,32,0.08)' : 'rgba(0,0,0,0.15)',
                border: `1px solid ${archFilter === s.id ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 10, padding: '14px 10px', textAlign: 'center',
                cursor: 'pointer', transition: 'all 0.2s',
              }}>
                <i className={s.icon} style={{ fontSize: '1.2rem', color: 'var(--accent)', marginBottom: 6, display: 'block' }} />
                <div style={{ fontSize: '0.68rem', color: '#64748b', letterSpacing: '0.01em' }}>{s.nameGR}</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>{s.count}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ═══ ARCHETYPES TAB ═══ */}
      {tab === 'archetypes' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {Object.values(ARCHETYPES).map(arch => (
            <div key={arch.id} style={{
              background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)',
              borderRadius: 12, overflow: 'hidden', transition: 'all 0.2s',
            }}>
              {/* Header */}
              <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: 'rgba(245,130,32,0.08)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <i className={arch.icon} style={{ fontSize: '1.3rem', color: 'var(--accent)' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)', letterSpacing: '0.01em' }}>{arch.nameGR}</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{arch.name}</div>
                  </div>
                  {arch.id === 'custom' && (
                    <span style={{
                      marginLeft: 'auto', background: 'var(--accent)', color: '#fff',
                      fontSize: '0.6rem', fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                    }}>EDITABLE</span>
                  )}
                </div>
              </div>
              {/* Body */}
              <div style={{ padding: '14px 18px' }}>
                <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0 0 12px', lineHeight: 1.5, letterSpacing: '0.01em' }}>{arch.description}</p>
                <div style={{
                  background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                  padding: '10px 12px', marginBottom: 10,
                }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 3, letterSpacing: '0.04em' }}>FORMULA</div>
                  <code style={{ fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 600 }}>{arch.formula}</code>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', letterSpacing: '0.01em' }}>
                  <span style={{ fontWeight: 600 }}>Παράμετροι:</span> {arch.fields.join(', ')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ PRODUCT MODAL ═══ */}
      <ModalPortal open={showNewModal || editingProduct !== null} onClose={() => { setShowNewModal(false); setEditingProduct(null); }}>
        <ProductModal
          product={editingProduct}
          onSave={handleSave}
          onClose={() => { setShowNewModal(false); setEditingProduct(null); }}
        />
      </ModalPortal>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// PRODUCT MODAL — Edit/Create
// ═══════════════════════════════════════════════════

interface ProductModalProps {
  product: Product | null;
  onSave: (data: {
    name: string; archetype: string;
    pages?: number; sheetsPerPad?: number; bodyPages?: number; customMult?: number;
    offset: Record<string, unknown>; digital: Record<string, unknown>; finishing: unknown[];
  }, existingId?: string) => void;
  onClose: () => void;
}

function ProductModal({ product, onSave, onClose }: ProductModalProps) {
  const isNew = !product;
  const [name, setName] = useState(product?.name || '');
  const [archetype, setArchetype] = useState(product?.archetype || 'single_leaf');
  const [pages, setPages] = useState(product?.pages || 8);
  const [sheetsPerPad, setSheetsPerPad] = useState(product?.sheetsPerPad || 50);
  const [bodyPages, setBodyPages] = useState(product?.bodyPages || 64);
  const [customMult, setCustomMult] = useState(product?.customMult || 1);

  // Offset
  const offData = (product?.offset as Record<string, unknown>) || {};
  const [offChargePerColor, setOffChargePerColor] = useState<number>((offData.charge_per_color as number) || 0);
  const [offExtraPantone, setOffExtraPantone] = useState<number>((offData.extra_pantone as number) || 0);
  const [offExtraVarnish, setOffExtraVarnish] = useState<number>((offData.extra_varnish as number) || 0);
  const [offHourlyEnabled, setOffHourlyEnabled] = useState<boolean>(Boolean(offData.hourly_enabled));
  const [offHourlyRate, setOffHourlyRate] = useState<number>((offData.hourly_rate as number) || 0);
  const [offDiscountEnabled, setOffDiscountEnabled] = useState<boolean>(Boolean(offData.discount_enabled));
  const [offDiscountStepQty, setOffDiscountStepQty] = useState<number>((offData.discount_step_qty as number) || 500);
  const [offDiscountStepPct, setOffDiscountStepPct] = useState<number>((offData.discount_step_pct as number) || 0);
  const [offDiscountMax, setOffDiscountMax] = useState<number>((offData.discount_max as number) || 30);

  // Digital
  const digData = (product?.digital as Record<string, unknown>) || {};
  const [digPriceColor, setDigPriceColor] = useState<number>((digData.price_color as number) || 0.10);
  const [digPriceBw, setDigPriceBw] = useState<number>((digData.price_bw as number) || 0.03);
  const [digDiscountEnabled, setDigDiscountEnabled] = useState<boolean>(Boolean(digData.discount_enabled ?? true));
  const [digDiscountStepQty, setDigDiscountStepQty] = useState<number>((digData.discount_step_qty as number) || 50);
  const [digDiscountStepPct, setDigDiscountStepPct] = useState<number>((digData.discount_step_pct as number) || 0);
  const [digDiscountMax, setDigDiscountMax] = useState<number>((digData.discount_max as number) || 30);
  const [digHourlyEnabled, setDigHourlyEnabled] = useState<boolean>(Boolean(digData.hourly_enabled));
  const [digHourlyRate, setDigHourlyRate] = useState<number>((digData.hourly_rate as number) || 0);

  // Inner tabs for offset/digital
  const [offTab, setOffTab] = useState<'basic' | 'scales'>('basic');
  const [digTab, setDigTab] = useState<'basic' | 'discount'>('basic');

  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) return;
    setSaving(true);
    const data = {
      name: name.trim(),
      archetype,
      pages: archetype === 'booklet' ? pages : undefined,
      sheetsPerPad: archetype === 'pad' ? sheetsPerPad : undefined,
      bodyPages: archetype === 'perfect_bound' ? bodyPages : undefined,
      customMult: archetype === 'custom' ? customMult : undefined,
      offset: {
        charge_per_color: offChargePerColor,
        extra_pantone: offExtraPantone,
        extra_varnish: offExtraVarnish,
        hourly_enabled: offHourlyEnabled,
        hourly_rate: offHourlyRate,
        discount_enabled: offDiscountEnabled,
        discount_step_qty: offDiscountStepQty,
        discount_step_pct: offDiscountStepPct,
        discount_max: offDiscountMax,
      },
      digital: {
        price_color: digPriceColor,
        price_bw: digPriceBw,
        discount_enabled: digDiscountEnabled,
        discount_step_qty: digDiscountStepQty,
        discount_step_pct: digDiscountStepPct,
        discount_max: digDiscountMax,
        hourly_enabled: digHourlyEnabled,
        hourly_rate: digHourlyRate,
      },
      finishing: ((product?.finishing as unknown[]) || []),
    };
    await onSave(data, product?.id);
    setSaving(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 38, borderRadius: 8, border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.04)', color: 'var(--text)', padding: '0 10px',
    fontSize: '0.85rem', fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.68rem', fontWeight: 600, color: '#64748b',
    textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.04em',
  };

  return (
    <div style={{
      width: 760, maxHeight: '88vh', overflowY: 'auto',
      background: 'rgb(16,24,48)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16, padding: 24, boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, margin: 0, color: 'var(--text)', letterSpacing: '0.01em' }}>
          <i className="fas fa-cube" style={{ color: 'var(--accent)' }} />
          {isNew ? 'Νέο Προϊόν' : 'Επεξεργασία Προϊόντος'}
        </h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}>&times;</button>
      </div>

      {/* Basic Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 18 }}>
        <div>
          <label style={labelStyle}>Όνομα Προϊόντος</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="π.χ. Επαγγελματικές Κάρτες 9×5" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Archetype</label>
          <select value={archetype} onChange={e => setArchetype(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            {Object.values(ARCHETYPES).map(a => (
              <option key={a.id} value={a.id}>{a.nameGR}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Archetype-specific fields */}
      {archetype === 'booklet' && (
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Σελίδες</label>
          <input type="number" value={pages} onChange={e => setPages(Number(e.target.value) || 4)} min={4} step={4} style={{ ...inputStyle, width: 120 }} />
        </div>
      )}
      {archetype === 'pad' && (
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Φύλλα ανά Μπλοκ</label>
          <input type="number" value={sheetsPerPad} onChange={e => setSheetsPerPad(Number(e.target.value) || 1)} min={1} style={{ ...inputStyle, width: 120 }} />
        </div>
      )}
      {archetype === 'perfect_bound' && (
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Σελίδες σώματος</label>
          <input type="number" value={bodyPages} onChange={e => setBodyPages(Number(e.target.value) || 16)} min={4} step={4} style={{ ...inputStyle, width: 120 }} />
        </div>
      )}
      {archetype === 'custom' && (
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Πολλαπλασιαστής</label>
          <input type="number" value={customMult} onChange={e => setCustomMult(Number(e.target.value) || 1)} min={0} step={0.1} style={{ ...inputStyle, width: 120 }} />
        </div>
      )}

      {/* ═══ OFFSET + DIGITAL side by side ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>

        {/* OFFSET */}
        <div style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ background: 'rgba(245,158,11,0.8)', color: '#fff', padding: '10px 14px', fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-industry" /> OFFSET
          </div>
          {/* Sub-tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
            {(['basic', 'scales'] as const).map(t => (
              <button key={t} onClick={() => setOffTab(t)} style={{
                padding: '7px 14px', fontSize: '0.72rem', fontWeight: 600,
                border: 'none', cursor: 'pointer', background: 'transparent',
                borderBottom: `2px solid ${offTab === t ? '#f59e0b' : 'transparent'}`,
                color: offTab === t ? '#f59e0b' : '#94a3b8', transition: 'all 0.2s',
              }}>{t === 'basic' ? 'Βασικά' : 'Έκπτωση'}</button>
            ))}
          </div>
          <div style={{ padding: 14 }}>
            {offTab === 'basic' && (
              <>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ ...labelStyle, color: '#f59e0b' }}>Χρέωση/Χρώμα €</label>
                  <input type="number" value={offChargePerColor} onChange={e => setOffChargePerColor(Number(e.target.value))} min={0} step={0.5} style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ ...labelStyle, color: '#f59e0b' }}>Extra Pantone €</label>
                    <input type="number" value={offExtraPantone} onChange={e => setOffExtraPantone(Number(e.target.value))} min={0} step={0.5} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, color: '#f59e0b' }}>Extra Βερνίκι €</label>
                    <input type="number" value={offExtraVarnish} onChange={e => setOffExtraVarnish(Number(e.target.value))} min={0} step={0.5} style={inputStyle} />
                  </div>
                </div>
                {/* Hourly */}
                <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 8, padding: 10, marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <input type="checkbox" checked={offHourlyEnabled} onChange={e => setOffHourlyEnabled(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#f59e0b' }}>Κέρδος Ωριαίο €</label>
                    <input type="number" value={offHourlyRate} onChange={e => setOffHourlyRate(Number(e.target.value))} min={0} step={1} style={{ ...inputStyle, width: 70, height: 30 }} />
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#94a3b8', lineHeight: 1.4 }}>
                    <i className="fas fa-info-circle" style={{ marginRight: 4 }} />
                    Κέρδος επιχείρησης × ώρες εργασίας
                  </div>
                </div>
              </>
            )}
            {offTab === 'scales' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <input type="checkbox" checked={offDiscountEnabled} onChange={e => setOffDiscountEnabled(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  <label style={{ ...labelStyle, color: '#f59e0b', margin: 0 }}>Έκπτωση Ποσότητας</label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, opacity: offDiscountEnabled ? 1 : 0.35, pointerEvents: offDiscountEnabled ? 'auto' : 'none' }}>
                  <div>
                    <label style={{ ...labelStyle, color: '#94a3b8', fontSize: '0.6rem' }}>Βήμα (τεμ.)</label>
                    <input type="number" value={offDiscountStepQty} onChange={e => setOffDiscountStepQty(Number(e.target.value))} min={1} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, color: '#94a3b8', fontSize: '0.6rem' }}>Μείωση %</label>
                    <input type="number" value={offDiscountStepPct} onChange={e => setOffDiscountStepPct(Number(e.target.value))} min={0} max={50} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, color: '#94a3b8', fontSize: '0.6rem' }}>Max %</label>
                    <input type="number" value={offDiscountMax} onChange={e => setOffDiscountMax(Number(e.target.value))} min={0} max={90} style={inputStyle} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* DIGITAL */}
        <div style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ background: 'rgba(59,130,246,0.8)', color: '#fff', padding: '10px 14px', fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-print" /> ΨΗΦΙΑΚΟ
          </div>
          {/* Sub-tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(59,130,246,0.15)' }}>
            {(['basic', 'discount'] as const).map(t => (
              <button key={t} onClick={() => setDigTab(t)} style={{
                padding: '7px 14px', fontSize: '0.72rem', fontWeight: 600,
                border: 'none', cursor: 'pointer', background: 'transparent',
                borderBottom: `2px solid ${digTab === t ? '#3b82f6' : 'transparent'}`,
                color: digTab === t ? '#3b82f6' : '#94a3b8', transition: 'all 0.2s',
              }}>{t === 'basic' ? 'Βασικά' : 'Έκπτωση'}</button>
            ))}
          </div>
          <div style={{ padding: 14 }}>
            {digTab === 'basic' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ ...labelStyle, color: '#3b82f6' }}>Τιμή Color €</label>
                    <input type="number" value={digPriceColor} onChange={e => setDigPriceColor(Number(e.target.value))} min={0} step={0.01} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, color: '#3b82f6' }}>Τιμή B/W €</label>
                    <input type="number" value={digPriceBw} onChange={e => setDigPriceBw(Number(e.target.value))} min={0} step={0.01} style={inputStyle} />
                  </div>
                </div>
                {/* Hourly */}
                <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 8, padding: 10, marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <input type="checkbox" checked={digHourlyEnabled} onChange={e => setDigHourlyEnabled(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#3b82f6' }}>Κέρδος Ωριαίο €</label>
                    <input type="number" value={digHourlyRate} onChange={e => setDigHourlyRate(Number(e.target.value))} min={0} step={1} style={{ ...inputStyle, width: 70, height: 30 }} />
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#94a3b8', lineHeight: 1.4 }}>
                    <i className="fas fa-info-circle" style={{ marginRight: 4 }} />
                    Κέρδος επιχείρησης × ώρες εργασίας
                  </div>
                </div>
              </>
            )}
            {digTab === 'discount' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <input type="checkbox" checked={digDiscountEnabled} onChange={e => setDigDiscountEnabled(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  <label style={{ ...labelStyle, color: '#3b82f6', margin: 0 }}>Έκπτωση Ποσότητας</label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, opacity: digDiscountEnabled ? 1 : 0.35, pointerEvents: digDiscountEnabled ? 'auto' : 'none' }}>
                  <div>
                    <label style={{ ...labelStyle, color: '#94a3b8', fontSize: '0.6rem' }}>Βήμα (τεμ.)</label>
                    <input type="number" value={digDiscountStepQty} onChange={e => setDigDiscountStepQty(Number(e.target.value))} min={1} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, color: '#94a3b8', fontSize: '0.6rem' }}>Μείωση %</label>
                    <input type="number" value={digDiscountStepPct} onChange={e => setDigDiscountStepPct(Number(e.target.value))} min={0} max={50} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, color: '#94a3b8', fontSize: '0.6rem' }}>Max %</label>
                    <input type="number" value={digDiscountMax} onChange={e => setDigDiscountMax(Number(e.target.value))} min={0} max={90} style={inputStyle} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={onClose} style={{
          padding: '10px 20px', borderRadius: 20, border: '1px solid var(--border)',
          background: 'transparent', color: '#94a3b8', fontWeight: 600, fontSize: '0.82rem',
          cursor: 'pointer', transition: 'all 0.2s',
        }}>Ακύρωση</button>
        <button onClick={handleSubmit} disabled={saving || !name.trim()} style={{
          padding: '10px 24px', borderRadius: 20, border: 'none',
          background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: '0.82rem',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 2px 8px rgba(245,130,32,0.3)', transition: 'all 0.2s',
          opacity: saving || !name.trim() ? 0.5 : 1,
        }}>
          {saving ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-save" />}
          {isNew ? 'Δημιουργία' : 'Αποθήκευση'}
        </button>
      </div>
    </div>
  );
}
