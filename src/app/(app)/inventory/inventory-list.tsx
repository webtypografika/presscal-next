'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Material, Consumable, Machine } from '@/generated/prisma/client';
import { deleteMaterial, deleteConsumable } from './actions';
import { MaterialPanel } from './material-panel';
import { ConsumablePanel } from './consumable-panel';

type ConsumableWithMachine = Consumable & { machine: { id: string; name: string } | null };

const TABS = [
  { id: 'sheet', label: 'Χαρτιά', icon: 'fa-file', color: 'var(--blue)' },
  { id: 'consumable-offset', label: 'Offset Αναλώσιμα', icon: 'fa-industry', color: 'var(--violet)' },
  { id: 'consumable-digital', label: 'Digital Αναλώσιμα', icon: 'fa-print', color: 'var(--accent)' },
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
}

export function InventoryList({ materials, consumables }: Props) {
  const [tab, setTab] = useState<TabId>('sheet');
  const [search, setSearch] = useState('');
  const [editMaterialId, setEditMaterialId] = useState<string | null>(null);
  const [editConsumableId, setEditConsumableId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState<'material' | 'consumable' | null>(null);

  const sheets = materials.filter(m => m.cat === 'sheet');
  const offsetCons = consumables.filter(c => c.conModule === 'offset');
  const digitalCons = consumables.filter(c => c.conModule === 'digital' || c.conModule === 'shared');

  const counts: Record<TabId, number> = {
    'sheet': sheets.length,
    'consumable-offset': offsetCons.length,
    'consumable-digital': digitalCons.length,
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
      return sheets.filter(m => !q || m.name.toLowerCase().includes(q) || m.supplier?.toLowerCase().includes(q));
    }
    const list = tab === 'consumable-offset' ? offsetCons : digitalCons;
    return list.filter(c => !q || c.name.toLowerCase().includes(q) || c.supplier?.toLowerCase().includes(q));
  }

  const filtered = getFiltered();
  const activeTab = TABS.find(t => t.id === tab)!;

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

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Χαρτιά', value: sheets.length, icon: 'fa-file', color: 'var(--blue)' },
          { label: 'Offset', value: offsetCons.length, icon: 'fa-industry', color: 'var(--violet)' },
          { label: 'Digital', value: digitalCons.length, icon: 'fa-print', color: 'var(--accent)' },
        ].map(s => (
          <div key={s.label} className="panel" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <i className={`fas ${s.icon}`} style={{ color: s.color, fontSize: '1rem' }} />
            <div>
              <p style={{ fontSize: '1.1rem', fontWeight: 800 }}>{s.value}</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
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

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          style={{
            width: 300, padding: '8px 14px', borderRadius: 8,
            border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.04)',
            color: 'var(--text)', fontSize: '0.85rem',
          }}
          placeholder="Αναζήτηση..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span style={{ marginLeft: 12, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{filtered.length} εγγραφές</span>
      </div>

      {/* Table */}
      {tab === 'sheet' ? (
        <SheetTable items={filtered as Material[]} onEdit={setEditMaterialId} onDelete={deleteMaterial} />
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
    </>
  );
}

// ─── SHEET TABLE ───
function SheetTable({ items, onEdit, onDelete }: { items: Material[]; onEdit: (id: string) => void; onDelete: (id: string) => void }) {
  if (items.length === 0) return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <i className="fas fa-file" style={{ fontSize: '2.5rem', color: 'var(--text-muted)', opacity: 0.2 }} />
      <p style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Δεν υπάρχουν χαρτιά</p>
    </div>
  );

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Χαρτί</th>
            <th style={{ textAlign: 'center', padding: '8px 12px' }}>Διαστάσεις</th>
            <th style={{ textAlign: 'center', padding: '8px 12px' }}>Βάρος</th>
            <th style={{ textAlign: 'right', padding: '8px 12px' }}>Κόστος</th>
            <th style={{ textAlign: 'center', padding: '8px 12px' }}>Stock</th>
            <th style={{ width: 60 }} />
          </tr>
        </thead>
        <tbody>
          {items.map(m => {
            const isLow = m.stock !== null && m.stockAlert !== null && m.stock <= m.stockAlert;
            return (
              <tr key={m.id} onClick={() => onEdit(m.id)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '10px 12px' }}>
                  <p style={{ fontWeight: 700 }}>{m.name}</p>
                  {m.supplier && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.supplier}</p>}
                </td>
                <td style={{ textAlign: 'center', padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {m.width && m.height ? `${m.width}×${m.height}` : '—'}{m.grain === 'long' ? ' ↓' : m.grain === 'short' ? ' →' : ''}
                </td>
                <td style={{ textAlign: 'center', padding: '10px 12px' }}>{m.thickness ? `${m.thickness}g` : '—'}</td>
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
          <tr style={{ borderBottom: '1px solid var(--border)', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Αναλώσιμο</th>
            <th style={{ textAlign: 'center', padding: '8px 12px' }}>Τύπος</th>
            <th style={{ textAlign: 'center', padding: '8px 12px' }}>Χρώμα</th>
            <th style={{ textAlign: 'right', padding: '8px 12px' }}>Κόστος</th>
            <th style={{ textAlign: 'center', padding: '8px 12px' }}>Yield</th>
            <th style={{ textAlign: 'center', padding: '8px 12px' }}>Stock</th>
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
