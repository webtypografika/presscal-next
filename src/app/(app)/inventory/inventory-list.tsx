'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Material, Consumable, Machine, Org } from '@/generated/prisma/client';
import { deleteMaterial, deleteConsumable, deleteAllMaterials, bulkDeleteMaterials, bulkUpdateMaterials } from './actions';
import { MaterialPanel } from './material-panel';
import { ConsumablePanel } from './consumable-panel';
import { ImportCenter } from './import-center';
import { ImportMapper } from './import-mapper';
import { parseStandardRows } from './parse-import';
import { bulkCreateMaterials } from './actions';

type ConsumableWithMachine = Consumable & { machine: { id: string; name: string } | null };

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
      animation: 'fadeIn 0.3s ease',
      minWidth: 280,
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

const TABS = [
  { id: 'sheet', label: 'Χαρτιά', icon: 'fa-file', color: 'var(--blue)' },
  { id: 'lamination', label: 'Πλαστικοποίηση', icon: 'fa-scroll', color: '#84cc16' },
  { id: 'consumable-offset', label: 'Offset Αναλώσιμα', icon: 'fa-industry', color: 'var(--violet)' },
  { id: 'consumable-digital', label: 'Digital Αναλώσιμα', icon: 'fa-print', color: 'var(--accent)' },
  { id: 'plate-orders', label: 'Παραγγελίες Τσίγκων', icon: 'fa-layer-group', color: 'var(--amber)' },
] as const;

type TabId = typeof TABS[number]['id'];

const CON_TYPE_LABELS: Record<string, string> = {
  ink: 'Μελάνι', toner: 'Toner', drum: 'Drum', developer: 'Developer',
  plate: 'Τσίγκος', blanket: 'Καουτσούκ', chemical: 'Χημικό',
  varnish: 'Βερνίκι', fuser: 'Fuser', belt: 'Belt', waste: 'Waste',
  corona: 'Corona', other: 'Άλλο',
};

const COLOR_DOTS: Record<string, string> = {
  cyan: '#06b6d4', magenta: '#ec4899', yellow: '#eab308', black: '#9ca3af',
  white: '#f5f5f5', clear: '#a5b4fc', gold: '#d97706', silver: '#94a3b8',
};

interface Props {
  materials: Material[];
  consumables: ConsumableWithMachine[];
  org: Org | null;
}

export function InventoryList({ materials, consumables, org }: Props) {
  const [tab, setTab] = useState<TabId>('sheet');
  const [search, setSearch] = useState('');
  const [editMaterialId, setEditMaterialId] = useState<string | null>(null);
  const [editConsumableId, setEditConsumableId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState<'material' | 'consumable' | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [smartRows, setSmartRows] = useState<string[][] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    setToasts(prev => [...prev, { message, type, id: ++toastId }]);
  }, []);
  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Sheet filters
  const [filterSupplier, setFilterSupplier] = useState<string | null>(null);
  const [filterFamily, setFilterFamily] = useState<string | null>(null);
  const [filterDims, setFilterDims] = useState<string | null>(null);
  const [filterGrams, setFilterGrams] = useState<string | null>(null);

  const sheets = materials.filter(m => m.cat === 'sheet');
  const lamFilms = materials.filter(m => m.cat === 'film' || m.cat === 'roll');
  const offsetCons = consumables.filter(c => c.conModule === 'offset');
  const digitalCons = consumables.filter(c => c.conModule === 'digital' || c.conModule === 'shared');

  // Unique values for filters
  const suppliers = [...new Set(sheets.map(m => m.supplier).filter(Boolean))] as string[];
  const families = [...new Set(
    (filterSupplier ? sheets.filter(m => m.supplier === filterSupplier) : sheets)
      .map(m => m.subtype).filter(Boolean)
  )] as string[];
  const dimOptions = [...new Set(sheets.filter(m => m.width && m.height).map(m => `${m.width}×${m.height}`))].sort();
  const gramOptions = [...new Set(sheets.map(m => m.thickness).filter(Boolean))].sort((a, b) => (a as number) - (b as number)) as number[];

  const [plateOrders, setPlateOrders] = useState<any[]>([]);
  const [plateOrdersLoaded, setPlateOrdersLoaded] = useState(false);

  // Fetch plate orders when tab is active
  useEffect(() => {
    if (tab === 'plate-orders' && !plateOrdersLoaded) {
      fetch('/api/plate-order').then(r => r.ok ? r.json() : []).then(data => {
        setPlateOrders(data);
        setPlateOrdersLoaded(true);
      }).catch(() => setPlateOrdersLoaded(true));
    }
  }, [tab, plateOrdersLoaded]);

  const counts: Record<TabId, number> = {
    'sheet': sheets.length,
    'lamination': lamFilms.length,
    'consumable-offset': offsetCons.length,
    'consumable-digital': digitalCons.length,
    'plate-orders': plateOrders.length,
  };

  // Stats
  const totalItems = materials.length + consumables.length;
  const lowStock = [
    ...materials.filter(m => m.stock !== null && m.stockAlert !== null && m.stock <= m.stockAlert),
    ...consumables.filter(c => c.stock !== null && c.stockAlert !== null && c.stock <= c.stockAlert),
  ].length;

  function getFiltered() {
    const q = search.toLowerCase();
    if (tab === 'sheet') {
      return sheets.filter(m => {
        if (q && !m.name.toLowerCase().includes(q) && !m.supplier?.toLowerCase().includes(q) && !m.subtype?.toLowerCase().includes(q)) return false;
        if (filterSupplier && m.supplier !== filterSupplier) return false;
        if (filterFamily && m.subtype !== filterFamily) return false;
        if (filterDims && m.width && m.height && `${m.width}×${m.height}` !== filterDims) return false;
        if (filterGrams && m.thickness !== Number(filterGrams)) return false;
        return true;
      });
    }
    const list = tab === 'consumable-offset' ? offsetCons : digitalCons;
    return list.filter(c => !q || c.name.toLowerCase().includes(q) || c.supplier?.toLowerCase().includes(q));
  }

  const filtered = getFiltered();
  const activeTab = TABS.find(t => t.id === tab)!;

  function clearFilters() {
    setFilterSupplier(null);
    setFilterFamily(null);
    setFilterDims(null);
    setFilterGrams(null);
    setSearch('');
  }

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 46, height: 46, borderRadius: '50%',
            border: '2px solid color-mix(in srgb, var(--teal) 35%, transparent)',
            background: 'color-mix(in srgb, var(--teal) 10%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', color: 'var(--teal)',
          }}>
            <i className="fas fa-warehouse" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Αποθήκη</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{totalItems} items{lowStock > 0 ? ` · ${lowStock} χαμηλό stock` : ''}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tab === 'sheet' && (
            <>
              <button
                onClick={async () => {
                  if (!confirm(`Διαγραφή ΟΛΩΝ των ${sheets.length} χαρτιών;\n\nΑυτή η ενέργεια δεν αναιρείται.`)) return;
                  const count = await deleteAllMaterials();
                  toast(`Διαγράφηκαν ${count} χαρτιά`);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'transparent', color: 'var(--danger)',
                  padding: '10px 16px', borderRadius: 10,
                  border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)',
                  fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                }}
              >
                <i className="fas fa-trash-alt" /> Διαγραφή Όλων
              </button>
              <button
                onClick={() => setShowImport(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--blue)', color: '#fff',
                  padding: '10px 20px', borderRadius: 10, border: 'none',
                  fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(29,47,110,0.3)',
                }}
              >
                <i className="fas fa-database" /> Εισαγωγή
              </button>
            </>
          )}
          <button
            onClick={() => setShowNew(tab === 'sheet' ? 'material' : 'consumable')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--accent)', color: '#fff',
              padding: '10px 20px', borderRadius: 10, border: 'none',
              fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(245,130,32,0.3)',
            }}
          >
            <i className="fas fa-plus" /> Νέο Item
          </button>
        </div>
      </div>

      {/* Module selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        {([
          { id: 'sheetfed', label: 'Sheetfed', icon: 'fa-layer-group', enabled: true },
          { id: 'plotter', label: 'Plotter / Wide Format', icon: 'fa-ruler-horizontal', enabled: false },
          { id: 'packaging', label: 'Packaging', icon: 'fa-box', enabled: false },
        ]).map(mod => (
          <button key={mod.id} style={{
            padding: '6px 16px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
            border: `1px solid ${mod.id === 'sheetfed' ? 'color-mix(in srgb, var(--teal) 50%, transparent)' : 'var(--glass-border)'}`,
            background: mod.id === 'sheetfed' ? 'color-mix(in srgb, var(--teal) 10%, transparent)' : 'transparent',
            color: mod.id === 'sheetfed' ? 'var(--teal)' : 'var(--text-muted)',
            cursor: mod.enabled ? 'pointer' : 'default',
            opacity: mod.enabled ? 1 : 0.4,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <i className={`fas ${mod.icon}`} style={{ fontSize: '0.7rem' }} />
            {mod.label}
            {!mod.enabled && <span style={{ fontSize: '0.55rem', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 }}>soon</span>}
          </button>
        ))}
      </div>

      {/* Sub-tabs (within sheetfed) */}
      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3, marginBottom: 16, width: 'fit-content' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '7px 16px', borderRadius: 8, border: 'none',
              fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
              color: tab === t.id ? t.color : 'var(--text-muted)',
              background: tab === t.id ? `color-mix(in srgb, ${t.color} 12%, transparent)` : 'transparent',
            }}
          >
            <i className={`fas ${t.icon}`} style={{ marginRight: 6 }} />
            {t.label} <span style={{ marginLeft: 4, fontSize: '0.7rem', opacity: 0.6 }}>{counts[t.id]}</span>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', height: 36,
          border: '1px solid var(--glass-border)', borderRadius: 8,
          background: 'rgba(255,255,255,0.04)', width: 220,
        }}>
          <i className="fas fa-search" style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }} />
          <input
            style={{ border: 'none', background: 'transparent', color: 'var(--text)', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', flex: 1, width: '100%' }}
            placeholder="Αναζήτηση..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {tab === 'sheet' && (
          <>
            {/* Supplier filter */}
            {suppliers.length > 0 && (
              <FilterSelect
                icon="fa-truck"
                label="Προμηθευτής"
                value={filterSupplier}
                options={suppliers}
                onChange={(v) => { setFilterSupplier(v); setFilterFamily(null); }}
              />
            )}

            {/* Family filter */}
            {families.length > 0 && (
              <FilterSelect
                icon="fa-layer-group"
                label="Οικογένεια"
                value={filterFamily}
                options={families}
                onChange={setFilterFamily}
              />
            )}

            {/* Dimensions filter */}
            {dimOptions.length > 0 && (
              <FilterSelect
                icon="fa-expand"
                label="Διαστάσεις"
                value={filterDims}
                options={dimOptions}
                onChange={setFilterDims}
              />
            )}

            {/* Grams filter */}
            {gramOptions.length > 0 && (
              <FilterSelect
                icon="fa-weight-hanging"
                label="Γραμμάρια"
                value={filterGrams}
                options={gramOptions.map(String)}
                formatOption={(v) => `${v}gsm`}
                onChange={setFilterGrams}
              />
            )}

            {/* Clear */}
            {(filterSupplier || filterFamily || filterDims || filterGrams) && (
              <button onClick={clearFilters} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '0 10px', height: 36, borderRadius: 8,
                border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)',
                background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
                color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
              }}>
                <i className="fas fa-times" style={{ fontSize: '0.65rem' }} /> Καθαρισμός
              </button>
            )}
          </>
        )}

        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{filtered.length} εγγραφές</span>
      </div>

      {/* Mass action bar */}
      {tab === 'sheet' && selected.size > 0 && (
        <MassActionBar
          count={selected.size}
          selectedItems={sheets.filter(m => selected.has(m.id))}
          org={org}
          toast={toast}
          onDelete={async () => {
            if (!confirm(`Διαγραφή ${selected.size} επιλεγμένων χαρτιών;`)) return;
            await bulkDeleteMaterials([...selected]);
            setSelected(new Set());
            toast(`Διαγράφηκαν ${selected.size} χαρτιά`);
          }}
          onUpdate={async (data) => {
            await bulkUpdateMaterials([...selected], data);
            setSelected(new Set());
            toast(`Ενημερώθηκαν ${selected.size} χαρτιά`);
          }}
          onClear={() => setSelected(new Set())}
        />
      )}

      {/* Table */}
      {tab === 'sheet' ? (
        <SheetTable
          items={filtered as Material[]}
          selected={selected}
          onSelect={(id) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; })}
          onSelectAll={(ids) => setSelected(prev => prev.size === ids.length ? new Set() : new Set(ids))}
          onEdit={setEditMaterialId}
          onDelete={deleteMaterial}
        />
      ) : tab === 'lamination' ? (
        <LamFilmTable items={lamFilms} onEdit={setEditMaterialId} />
      ) : tab === 'plate-orders' ? (
        <PlateOrdersPanel orders={plateOrders} onUpdate={() => setPlateOrdersLoaded(false)} />
      ) : (
        <ConsumableTable items={filtered as ConsumableWithMachine[]} onEdit={setEditConsumableId} onDelete={deleteConsumable} />
      )}

      {/* Edit panels */}
      {editMaterialId && (
        <MaterialPanel material={materials.find(m => m.id === editMaterialId)!} onClose={() => setEditMaterialId(null)} />
      )}
      {editConsumableId && (
        <ConsumablePanel consumable={consumables.find(c => c.id === editConsumableId)!} onClose={() => setEditConsumableId(null)} />
      )}
      {showNew === 'material' && (
        <MaterialPanel onClose={() => setShowNew(null)} />
      )}
      {showNew === 'consumable' && (
        <ConsumablePanel defaultModule={tab === 'consumable-offset' ? 'offset' : 'digital'} onClose={() => setShowNew(null)} />
      )}

      {/* Import Center */}
      {showImport && (
        <ImportCenter
          onStandardFile={async (rows) => {
            setShowImport(false);
            const parsed = parseStandardRows(rows);
            const bulkRows = parsed.map(p => ({
              name: p.name, cat: 'sheet' as const,
              subtype: p.subtype || undefined,
              supplier: p.supplier || undefined, supplierEmail: p.supplierEmail || undefined,
              width: p.width || null, height: p.height || null, thickness: p.thickness || null,
              grain: p.grain || undefined, costPerUnit: p.costPerUnit || null,
              markup: p.markup, unit: 'φύλλο',
            }));
            const res = await bulkCreateMaterials(bulkRows);
            toast(`Εισαγωγή: ${res.added} νέα, ${res.updated} ενημερώθηκαν, ${res.skipped} αγνοήθηκαν`);
          }}
          onSmartFile={(rows) => { setShowImport(false); setSmartRows(rows); }}
          onSmartPdf={(rows) => { setShowImport(false); setSmartRows(rows); }}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* Smart Mapper */}
      {smartRows && (
        <ImportMapper
          rawRows={smartRows}
          onClose={() => setSmartRows(null)}
          onDone={() => setSmartRows(null)}
        />
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

// ─── FILTER SELECT ───
function FilterSelect({ icon, label, value, options, onChange, formatOption }: {
  icon: string; label: string; value: string | null; options: string[];
  onChange: (v: string | null) => void; formatOption?: (v: string) => string;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      style={{
        height: 36, borderRadius: 8, padding: '0 28px 0 28px',
        border: `1px solid ${value ? 'color-mix(in srgb, var(--accent) 50%, transparent)' : 'var(--glass-border)'}`,
        background: value ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'rgba(255,255,255,0.04)',
        color: value ? 'var(--accent)' : 'var(--text-dim)',
        fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 6l4 4 4-4' fill='none' stroke='%2394a3b8' stroke-width='1.5'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '14px',
        appearance: 'none', WebkitAppearance: 'none',
      }}
    >
      <option value="">{label}</option>
      {options.map(o => (
        <option key={o} value={o}>{formatOption ? formatOption(o) : o}</option>
      ))}
    </select>
  );
}

// ─── MASS EDIT POPUP ───
function MassEditPopup({ count, onApply, onClose }: {
  count: number;
  onApply: (data: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [supplier, setSupplier] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [subtype, setSubtype] = useState('');
  const [markup, setMarkup] = useState('');
  const [grain, setGrain] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [thickness, setThickness] = useState('');

  function handleApply() {
    const data: Record<string, unknown> = {};
    if (supplier) data.supplier = supplier;
    if (supplierEmail) data.supplierEmail = supplierEmail;
    if (subtype) data.subtype = subtype;
    if (markup) data.markup = Number(markup);
    if (grain) data.grain = grain;
    if (width) data.width = Number(width);
    if (height) data.height = Number(height);
    if (thickness) data.thickness = Number(thickness);
    if (Object.keys(data).length === 0) return;
    onApply(data);
  }

  const inputCls = "h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15";

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{  }} onClick={onClose}>
      <div style={{ width: 440, background: 'rgb(20,30,55)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-pen-square" style={{ color: 'var(--blue)' }} />
            Mass Edit — {count} χαρτιά
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}>&times;</button>
        </div>

        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Συμπληρώστε μόνο τα πεδία που θέλετε να αλλάξετε. Τα κενά πεδία δεν θα τροποποιηθούν.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Προμηθευτής</label>
              <input className={inputCls} value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="π.χ. Antalis" />
            </div>
            <div>
              <label style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Email</label>
              <input className={inputCls} value={supplierEmail} onChange={e => setSupplierEmail(e.target.value)} placeholder="orders@..." />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Οικογένεια</label>
              <input className={inputCls} value={subtype} onChange={e => setSubtype(e.target.value)} placeholder="π.χ. Munken" />
            </div>
            <div>
              <label style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Markup %</label>
              <input className={inputCls + " text-center"} type="number" value={markup} onChange={e => setMarkup(e.target.value)} placeholder="30" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>SS (mm)</label>
              <input className={inputCls + " text-center"} type="number" value={width} onChange={e => setWidth(e.target.value)} placeholder="700" />
            </div>
            <div>
              <label style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>LS (mm)</label>
              <input className={inputCls + " text-center"} type="number" value={height} onChange={e => setHeight(e.target.value)} placeholder="1000" />
            </div>
            <div>
              <label style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Γραμμάρια</label>
              <input className={inputCls + " text-center"} type="number" value={thickness} onChange={e => setThickness(e.target.value)} placeholder="130" />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Ίνα (Grain)</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {[{ v: '', l: '— Χωρίς αλλαγή —' }, { v: 'long', l: '↓ Long' }, { v: 'short', l: '→ Short' }, { v: 'none', l: 'N/A' }].map(o => (
                <button key={o.v} onClick={() => setGrain(o.v)}
                  style={{
                    flex: 1, padding: '7px 0', borderRadius: 7, fontSize: '0.78rem', fontWeight: 600,
                    border: `1px solid ${grain === o.v ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}`,
                    background: grain === o.v ? 'rgba(245,130,32,0.12)' : 'transparent',
                    color: grain === o.v ? 'var(--accent)' : '#94a3b8', cursor: 'pointer',
                  }}>{o.l}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
            Ακύρωση
          </button>
          <button onClick={handleApply} style={{
            padding: '8px 24px', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(245,130,32,0.3)',
          }}>
            <i className="fas fa-check" style={{ marginRight: 6 }} />Εφαρμογή σε {count} χαρτιά
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── ORDER POPUP ───
function OrderPopup({ items, org, toast, onClose }: { items: Material[]; org: Org | null; toast: (msg: string, type?: ToastType) => void; onClose: () => void }) {
  // Group by supplier email
  const bySupplier = new Map<string, { supplier: string; email: string; items: Material[] }>();
  for (const m of items) {
    const email = m.supplierEmail || '';
    if (!email) continue;
    const key = email.toLowerCase();
    if (!bySupplier.has(key)) bySupplier.set(key, { supplier: m.supplier || email, email, items: [] });
    bySupplier.get(key)!.items.push(m);
  }
  const noEmail = items.filter(m => !m.supplierEmail);
  const supplierGroups = [...bySupplier.entries()];

  const [quantities, setQuantities] = useState<Record<string, string>>(() => {
    const q: Record<string, string> = {};
    for (const m of items) q[m.id] = String(m.stockTarget ? Math.max(0, m.stockTarget - (m.stock ?? 0)) : '');
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

  function buildMailto(email: string, supplierItems: Material[]) {
    const subject = `Παραγγελία Χαρτιών${org?.legalName ? ` — ${org.legalName}` : ''}`;
    const lines = supplierItems.map(m => {
      const qty = quantities[m.id] || '___';
      const dims = m.width && m.height ? ` ${m.width}×${m.height}mm` : '';
      const gsm = m.thickness ? ` ${m.thickness}gsm` : '';
      return `• ${m.name}${dims}${gsm} — ${qty} φύλλα`;
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
      'Θα ήθελα να παραγγείλω τα παρακάτω:',
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

  const inputCls = "h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15";

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{  }} onClick={onClose}>
      <div style={{ width: 600, maxHeight: '85vh', background: 'rgb(20,30,55)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-paper-plane" style={{ color: 'var(--success)' }} />
            Παραγγελία — {items.length} χαρτιά
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}>&times;</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }} className="custom-scrollbar">

          {/* Company info from Settings */}
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

          {/* Items with quantities per supplier */}
          {supplierGroups.map(([key, group]) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <i className="fas fa-truck" style={{ color: 'var(--teal)', fontSize: '0.7rem' }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--teal)' }}>{group.supplier}</span>
                <input
                  className={inputCls}
                  style={{ width: 240, height: 30, fontSize: '0.75rem' }}
                  value={emails[key] || ''}
                  onChange={e => setEmails(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder="email@supplier.com"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {group.items.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.03)' }}>
                    <span style={{ flex: 1, fontSize: '0.82rem' }}>
                      {m.name}
                      {m.width && m.height ? <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: '0.72rem' }}>{m.width}×{m.height}</span> : null}
                    </span>
                    <input
                      className={inputCls + " text-center"}
                      style={{ width: 90, height: 32 }}
                      type="number"
                      value={quantities[m.id] || ''}
                      onChange={e => setQuantities(p => ({ ...p, [m.id]: e.target.value }))}
                      placeholder="Ποσ."
                    />
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', width: 40 }}>φύλλα</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {noEmail.length > 0 && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'color-mix(in srgb, var(--danger) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)', marginBottom: 12 }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--danger)', marginBottom: 4 }}>
                <i className="fas fa-exclamation-triangle" style={{ marginRight: 4 }} />{noEmail.length} χαρτιά χωρίς email:
              </p>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{noEmail.map(m => m.name).join(', ')}</p>
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
            <textarea className={inputCls + " !h-14 py-2 resize-none"} value={notes} onChange={e => setNotes(e.target.value)} placeholder="π.χ. Παράδοση μέχρι Παρασκευή..." />
          </div>
        </div>

        {/* Footer — send buttons */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#94a3b8', fontSize: '0.82rem', cursor: 'pointer' }}>Ακύρωση</button>
          <div style={{ flex: 1 }} />
          {supplierGroups.map(([key, group]) => {
            const targetEmail = emails[key] || group.email;
            return (
              <div key={key} style={{ display: 'flex', gap: 4 }}>
                {/* HTML email via Gmail */}
                <button onClick={async () => {
                  const orderItems = group.items.map(m => ({
                    name: m.name,
                    dims: m.width && m.height ? `${m.width}×${m.height}mm${m.thickness ? ` · ${m.thickness}gsm` : ''}` : '',
                    qty: quantities[m.id] || '',
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
                  <i className="fas fa-paper-plane" /> {supplierGroups.length > 1 ? group.supplier : 'Αποστολή HTML Email'}
                </button>
                {/* Mailto fallback */}
                <a href={buildMailto(targetEmail, group.items)} target="_blank" rel="noreferrer"
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

// ─── MASS ACTION BAR ───
function MassActionBar({ count, selectedItems, org, toast, onDelete, onUpdate, onClear }: {
  count: number;
  selectedItems: Material[];
  org: Org | null;
  toast: (msg: string, type?: ToastType) => void;
  onDelete: () => void;
  onUpdate: (data: Record<string, unknown>) => void;
  onClear: () => void;
}) {
  const [showEdit, setShowEdit] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const hasEmails = selectedItems.some(m => m.supplierEmail);

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
        marginBottom: 12, borderRadius: 10,
        background: 'color-mix(in srgb, var(--blue) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--blue) 30%, transparent)',
      }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--blue)' }}>
          <i className="fas fa-check-square" style={{ marginRight: 6 }} />{count} επιλεγμένα
        </span>

        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

        <button onClick={() => setShowEdit(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 16px', borderRadius: 7, fontSize: '0.78rem', fontWeight: 700,
          border: 'none', background: 'var(--blue)', color: '#fff', cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
        }}>
          <i className="fas fa-pen" style={{ fontSize: '0.65rem' }} /> Mass Edit
        </button>

        {hasEmails && (
          <button onClick={() => setShowOrder(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 16px', borderRadius: 7, fontSize: '0.78rem', fontWeight: 700,
            border: 'none', background: 'var(--success)', color: '#fff', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
          }}>
            <i className="fas fa-paper-plane" style={{ fontSize: '0.65rem' }} /> Παραγγελία
          </button>
        )}

        <div style={{ flex: 1 }} />

        <button onClick={onDelete} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '6px 14px', borderRadius: 7, fontSize: '0.75rem', fontWeight: 600,
          border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)',
          background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
          color: 'var(--danger)', cursor: 'pointer',
        }}>
          <i className="fas fa-trash" style={{ fontSize: '0.65rem' }} /> Διαγραφή
        </button>

        <button onClick={onClear} style={{
          border: 'none', background: 'transparent', color: 'var(--text-muted)',
          cursor: 'pointer', fontSize: '0.75rem',
        }}>Ακύρωση</button>
      </div>

      {showEdit && (
        <MassEditPopup
          count={count}
          onApply={(data) => { onUpdate(data); setShowEdit(false); }}
          onClose={() => setShowEdit(false)}
        />
      )}

      {showOrder && (
        <OrderPopup
          items={selectedItems}
          org={org}
          toast={toast}
          onClose={() => setShowOrder(false)}
        />
      )}
    </>
  );
}

// ─── SHEET TABLE ───
function SheetTable({ items, selected, onSelect, onSelectAll, onEdit, onDelete }: {
  items: Material[]; selected: Set<string>;
  onSelect: (id: string) => void; onSelectAll: (ids: string[]) => void;
  onEdit: (id: string) => void; onDelete: (id: string) => void;
}) {
  if (items.length === 0) return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <i className="fas fa-file" style={{ fontSize: '2.5rem', color: 'var(--text-muted)', opacity: 0.2 }} />
      <p style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Δεν υπάρχουν χαρτιά</p>
    </div>
  );

  const allIds = items.map(m => m.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  const someSelected = allIds.some(id => selected.has(id));

  const cbStyle: React.CSSProperties = {
    width: 16, height: 16, borderRadius: 4, cursor: 'pointer', accentColor: 'var(--blue)',
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            <th style={{ width: 40, padding: '8px 12px' }}>
              <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={() => onSelectAll(allIds)} style={cbStyle} />
            </th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>ΧΑΡΤΙ</th>
            <th style={{ textAlign: 'center', padding: '8px 12px' }}>ΔΙΑΣΤΑΣΕΙΣ</th>
            <th style={{ textAlign: 'center', padding: '8px 12px' }}>ΒΑΡΟΣ</th>
            <th style={{ textAlign: 'right', padding: '8px 12px' }}>ΚΟΣΤΟΣ</th>
            <th style={{ textAlign: 'center', padding: '8px 12px' }}>STOCK</th>
            <th style={{ width: 60 }} />
          </tr>
        </thead>
        <tbody>
          {items.map(m => {
            const isLow = m.stock !== null && m.stockAlert !== null && m.stock <= m.stockAlert;
            const isSel = selected.has(m.id);
            return (
              <tr key={m.id} onClick={() => onEdit(m.id)}
                style={{
                  borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s',
                  background: isSel ? 'color-mix(in srgb, var(--blue) 6%, transparent)' : 'transparent',
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
              >
                <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={isSel} onChange={() => onSelect(m.id)} style={cbStyle} />
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontWeight: 700 }}>{m.name}</p>
                    {m.supplierEmail && (
                      <i className="fas fa-envelope" title={m.supplierEmail} style={{ fontSize: '0.6rem', color: 'var(--success)', opacity: 0.7 }} />
                    )}
                  </div>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {[m.supplier, m.subtype].filter(Boolean).join(' · ') || '—'}
                  </p>
                </td>
                <td style={{ textAlign: 'center', padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {m.width && m.height ? `${m.width}×${m.height}` : '—'}{m.grain === 'long' ? ' ↓' : m.grain === 'short' ? ' →' : ''}
                </td>
                <td style={{ textAlign: 'center', padding: '10px 12px' }}>{m.thickness ? `${m.thickness}gsm` : '—'}</td>
                <td style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 700, color: 'var(--accent)' }}>
                  {m.costPerUnit ? `€${m.costPerUnit.toFixed(2)}` : '—'}
                </td>
                <td style={{ textAlign: 'center', padding: '10px 12px', color: isLow ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {m.stock ?? '—'}{isLow && ' ⚠'}
                </td>
                <td style={{ padding: '10px 4px' }}>
                  <button onClick={(e) => { e.stopPropagation(); if (confirm(`Διαγραφή ${m.name};`)) onDelete(m.id); }}
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}>
                    <i className="fas fa-trash" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── CONSUMABLE TABLE ───
function LamFilmTable({ items, onEdit }: { items: Material[]; onEdit: (id: string) => void }) {
  if (items.length === 0) return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <i className="fas fa-scroll" style={{ fontSize: '2.5rem', color: 'var(--text-muted)', opacity: 0.2 }} />
      <p style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Δεν υπάρχουν υλικά πλαστικοποίησης</p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Προσθέστε από Μετεκτύπωση → Πλαστικοποίηση</p>
    </div>
  );

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>ΥΛΙΚΟ</th>
            <th style={{ textAlign: 'center', padding: '8px 12px' }}>ΤΥΠΟΣ</th>
            <th style={{ textAlign: 'center', padding: '8px 12px' }}>ΔΙΑΣΤΑΣΕΙΣ</th>
            <th style={{ textAlign: 'right', padding: '8px 12px' }}>ΚΟΣΤΟΣ</th>
            <th style={{ textAlign: 'right', padding: '8px 12px' }}>ΤΙΜΗ ΠΩΛΗΣΗΣ</th>
            <th style={{ textAlign: 'center', padding: '8px 12px' }}>STOCK</th>
          </tr>
        </thead>
        <tbody>
          {items.map(m => (
            <tr key={m.id} onClick={() => onEdit(m.id)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <td style={{ padding: '10px 12px' }}>
                <p style={{ fontWeight: 700 }}>{m.name}</p>
                {m.groupName && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.groupName}</p>}
              </td>
              <td style={{ textAlign: 'center', padding: '10px 12px' }}>
                <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600, background: m.cat === 'roll' ? 'rgba(132,204,22,0.1)' : 'rgba(96,165,250,0.1)', color: m.cat === 'roll' ? '#84cc16' : '#60a5fa' }}>
                  {m.cat === 'roll' ? 'Ρολό' : 'Pouch'}
                </span>
              </td>
              <td style={{ textAlign: 'center', padding: '10px 12px', fontSize: '0.8rem' }}>
                {m.cat === 'roll'
                  ? `${m.width || '—'}mm × ${m.rollLength || '—'}m`
                  : `${m.width || '—'} × ${m.height || '—'}mm`
                }
              </td>
              <td style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 700, color: 'var(--accent)' }}>
                {m.costPerUnit ? `€${m.costPerUnit.toFixed(2)}` : '—'}
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 2 }}>/{m.unit || 'τμχ'}</span>
              </td>
              <td style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600, color: '#84cc16' }}>
                {m.sellPerUnit ? `€${m.sellPerUnit.toFixed(2)}` : '—'}
              </td>
              <td style={{ textAlign: 'center', padding: '10px 12px', color: 'var(--text-muted)' }}>
                {(m as any).stock ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConsumableTable({ items, onEdit, onDelete }: { items: ConsumableWithMachine[]; onEdit: (id: string) => void; onDelete: (id: string) => void }) {
  if (items.length === 0) return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <i className="fas fa-flask" style={{ fontSize: '2.5rem', color: 'var(--text-muted)', opacity: 0.2 }} />
      <p style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Δεν υπάρχουν αναλώσιμα</p>
    </div>
  );

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>ΑΝΑΛΩΣΙΜΟ</th>
            <th style={{ textAlign: 'center', padding: '8px 12px' }}>ΤΥΠΟΣ</th>
            <th style={{ textAlign: 'center', padding: '8px 12px' }}>ΧΡΩΜΑ</th>
            <th style={{ textAlign: 'right', padding: '8px 12px' }}>ΚΟΣΤΟΣ</th>
            <th style={{ textAlign: 'center', padding: '8px 12px' }}>YIELD</th>
            <th style={{ textAlign: 'center', padding: '8px 12px' }}>STOCK</th>
            <th style={{ width: 60 }} />
          </tr>
        </thead>
        <tbody>
          {items.map(c => {
            const isLow = c.stock !== null && c.stockAlert !== null && c.stock <= c.stockAlert;
            return (
              <tr key={c.id} onClick={() => onEdit(c.id)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '10px 12px' }}>
                  <p style={{ fontWeight: 700 }}>{c.name}</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {c.supplier ?? ''}{c.machine ? ` · ${c.machine.name}` : ''}
                  </p>
                </td>
                <td style={{ textAlign: 'center', padding: '10px 12px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600, background: 'rgba(255,255,255,0.05)' }}>
                    {CON_TYPE_LABELS[c.conType] ?? c.conType}
                  </span>
                </td>
                <td style={{ textAlign: 'center', padding: '10px 12px' }}>
                  {c.color && COLOR_DOTS[c.color] ? (
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: COLOR_DOTS[c.color] }} />
                  ) : '—'}
                </td>
                <td style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 700, color: 'var(--accent)' }}>
                  {c.costPerUnit ? `€${c.costPerUnit.toFixed(2)}` : '—'}
                  {c.unitSize ? <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 2 }}>/{c.unitSize}{c.unit}</span> : ''}
                </td>
                <td style={{ textAlign: 'center', padding: '10px 12px', fontSize: '0.8rem' }}>
                  {c.yieldPages ? c.yieldPages.toLocaleString('el-GR') : '—'}
                </td>
                <td style={{ textAlign: 'center', padding: '10px 12px', color: isLow ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {c.stock ?? '—'}{isLow && ' ⚠'}
                </td>
                <td style={{ padding: '10px 4px' }}>
                  <button onClick={(e) => { e.stopPropagation(); if (confirm(`Διαγραφή ${c.name};`)) onDelete(c.id); }}
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}>
                    <i className="fas fa-trash" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── PLATE ORDERS PANEL ───
const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  draft: { bg: 'rgba(100,116,139,0.12)', fg: '#94a3b8', label: 'Πρόχειρο' },
  sent: { bg: 'rgba(59,130,246,0.12)', fg: '#60a5fa', label: 'Εστάλη' },
  received: { bg: 'rgba(34,197,94,0.12)', fg: '#4ade80', label: 'Παρελήφθη' },
  cancelled: { bg: 'rgba(239,68,68,0.12)', fg: '#f87171', label: 'Ακυρώθηκε' },
};

function PlateOrdersPanel({ orders, onUpdate }: { orders: any[]; onUpdate: () => void }) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [updating, setUpdating] = useState<string | null>(null);

  const filtered = statusFilter === 'all' ? orders : orders.filter((o: any) => o.status === statusFilter);

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    try {
      await fetch('/api/plate-order', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      onUpdate();
    } catch { /* ignore */ }
    finally { setUpdating(null); }
  }

  if (orders.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <i className="fas fa-layer-group" style={{ fontSize: '2.5rem', color: 'var(--text-muted)', opacity: 0.2 }} />
        <p style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Δεν υπάρχουν παραγγελίες τσίγκων</p>
        <p style={{ color: '#475569', fontSize: '0.75rem' }}>Χρησιμοποιήστε το κουμπί "Τσίγκοι" στον Calculator (offset)</p>
      </div>
    );
  }

  const statusCounts: Record<string, number> = {};
  for (const o of orders) statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;

  return (
    <div>
      {/* Status filter */}
      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 2, marginBottom: 16, width: 'fit-content' }}>
        <button onClick={() => setStatusFilter('all')} style={{
          padding: '5px 14px', borderRadius: 6, border: 'none', fontSize: '0.78rem', fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
          color: statusFilter === 'all' ? 'var(--amber)' : '#64748b',
          background: statusFilter === 'all' ? 'rgba(245,158,11,0.12)' : 'transparent',
        }}>Όλα <span style={{ opacity: 0.5, marginLeft: 4 }}>{orders.length}</span></button>
        {Object.entries(STATUS_COLORS).map(([key, s]) => statusCounts[key] ? (
          <button key={key} onClick={() => setStatusFilter(key)} style={{
            padding: '5px 14px', borderRadius: 6, border: 'none', fontSize: '0.78rem', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            color: statusFilter === key ? s.fg : '#64748b',
            background: statusFilter === key ? s.bg : 'transparent',
          }}>{s.label} <span style={{ opacity: 0.5, marginLeft: 4 }}>{statusCounts[key]}</span></button>
        ) : null)}
      </div>

      {/* Order cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((order: any) => {
          const items = (order.items || []) as any[];
          const st = STATUS_COLORS[order.status] || STATUS_COLORS.draft;
          const isService = order.orderType === 'platemaker_service';
          const date = new Date(order.sentAt || order.createdAt);

          return (
            <div key={order.id} className="card" style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'color-mix(in srgb, var(--amber) 10%, transparent)',
                    border: '2px solid color-mix(in srgb, var(--amber) 30%, transparent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--amber)', fontSize: '0.85rem',
                  }}>
                    <i className={`fas ${isService ? 'fa-paper-plane' : 'fa-box'}`} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{order.supplierName}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                      {date.toLocaleDateString('el-GR')} · {items.length} τσίγκ{items.length === 1 ? 'ος' : 'οι'}
                      {isService ? ' · Service' : ' · Υλικό'}
                    </div>
                  </div>
                </div>
                <span style={{
                  padding: '4px 12px', borderRadius: 6,
                  background: st.bg, color: st.fg,
                  fontSize: '0.72rem', fontWeight: 700,
                }}>{st.label}</span>
              </div>

              {order.jobDescription && (
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)' }}>
                  <i className="fas fa-info-circle" style={{ marginRight: 6, color: '#64748b' }} />{order.jobDescription}
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {items.map((item: any, i: number) => (
                  <span key={i} style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', color: '#cbd5e1',
                  }}>
                    {item.name} · {item.plateSize}{item.color ? ` · ${item.color}` : ''}
                  </span>
                ))}
              </div>

              {order.pdfFileName && (
                <div style={{ fontSize: '0.7rem', color: 'var(--teal)', marginBottom: 4 }}>
                  <i className="fas fa-file-pdf" style={{ marginRight: 4 }} />{order.pdfFileName}
                </div>
              )}
              {order.notes && (
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: 8 }}>
                  <i className="fas fa-sticky-note" style={{ marginRight: 4 }} />{order.notes}
                </div>
              )}

              {order.status === 'sent' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => updateStatus(order.id, 'received')} disabled={updating === order.id}
                    style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: 'color-mix(in srgb, #22c55e 12%, transparent)', color: '#4ade80', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: updating === order.id ? 0.5 : 1 }}>
                    <i className="fas fa-check" style={{ marginRight: 4 }} />Παρελήφθη
                  </button>
                  <button onClick={() => updateStatus(order.id, 'cancelled')} disabled={updating === order.id}
                    style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: updating === order.id ? 0.5 : 1 }}>
                    <i className="fas fa-times" style={{ marginRight: 4 }} />Ακύρωση
                  </button>
                </div>
              )}
              {order.status === 'received' && order.receivedAt && (
                <div style={{ fontSize: '0.68rem', color: '#4ade80' }}>
                  <i className="fas fa-check-circle" style={{ marginRight: 4 }} />Παρελήφθη {new Date(order.receivedAt).toLocaleDateString('el-GR')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
