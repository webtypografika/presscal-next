'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus } from 'lucide-react';
import { ConsumablePanel } from '../../inventory/consumable-panel';

export interface ConsumableItem {
  id: string;
  name: string;
  conType: string;
  color: string | null;
  supplier: string | null;
  unit: string;
  unitSize: number | null;
  costPerUnit: number | null;
  yieldPages: number | null;
}

interface Props {
  conType: string;
  conModule: string;
  color?: string;
  onSelect: (item: ConsumableItem) => void;
  onClose: () => void;
}

export function ConsumablePicker({ conType, conModule, color, onSelect, onClose }: Props) {
  const [items, setItems] = useState<ConsumableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch(`/api/consumables?conType=${conType}&conModule=${conModule}${color ? `&color=${color}` : ''}`)
      .then(r => r.json())
      .then(data => { setItems(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [conType, conModule, color]);

  const filtered = search
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || i.supplier?.toLowerCase().includes(search.toLowerCase()))
    : items;

  const TYPE_LABELS: Record<string, string> = {
    ink: 'Μελάνι', toner: 'Toner', drum: 'Drum', developer: 'Developer',
    plate: 'Τσίγκος', blanket: 'Καουτσούκ', chemical: 'Χημικό',
    varnish: 'Βερνίκι', fuser: 'Fuser', belt: 'Belt', waste: 'Waste',
    corona: 'Corona', other: 'Άλλο',
  };

  const COLOR_DOTS: Record<string, string> = {
    cyan: '#06b6d4', magenta: '#ec4899', yellow: '#eab308', black: '#9ca3af',
    white: '#f5f5f5', clear: '#a5b4fc', gold: '#d97706', silver: '#94a3b8',
  };

  return createPortal(
    <div className="fixed inset-0 z-[250] flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
      <div className="w-[500px] max-h-[70vh] flex flex-col rounded-2xl border border-[var(--glass-border)] shadow-[0_32px_80px_rgba(0,0,0,0.5)]"
        style={{ background: 'rgb(20, 30, 55)' }} onClick={e => e.stopPropagation()}>

        {/* Header — clean, no create button */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <div>
            <h3 className="text-base font-bold">Επιλογή από Αποθήκη</h3>
            <p className="text-xs text-[var(--text-muted)]">{TYPE_LABELS[conType] ?? conType} · {conModule}</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <input
            className="h-8 w-full rounded-lg border border-[var(--glass-border)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            placeholder="Αναζήτηση..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 rounded-full border-2 border-[var(--blue)] border-t-transparent animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-[var(--text-muted)]">
                {items.length === 0 ? 'Δεν υπάρχουν αναλώσιμα αυτού του τύπου' : 'Κανένα αποτέλεσμα'}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Δημιουργήστε ένα νέο παρακάτω</p>
            </div>
          ) : (
            filtered.map(item => (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left transition-all hover:bg-white/[0.03] border-b border-[var(--border)]"
              >
                {item.color && COLOR_DOTS[item.color] ? (
                  <span className="shrink-0 w-3 h-3 rounded-full" style={{ background: COLOR_DOTS[item.color] }} />
                ) : (
                  <span className="shrink-0 w-3" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{item.name}</p>
                  {item.supplier && <p className="text-[0.65rem] text-[var(--text-muted)]">{item.supplier}</p>}
                </div>
                <div className="shrink-0 text-right">
                  {item.costPerUnit !== null && (
                    <p className="text-sm font-bold text-[var(--accent)]">€{item.costPerUnit.toFixed(2)}</p>
                  )}
                  {item.yieldPages !== null && (
                    <p className="text-[0.65rem] text-[var(--text-muted)]">{item.yieldPages.toLocaleString('el-GR')} pages</p>
                  )}
                </div>
                <i className="fas fa-arrow-right text-[var(--text-muted)] text-xs shrink-0" />
              </button>
            ))
          )}
        </div>

        {/* Sticky footer — single create button */}
        <div className="border-t border-[var(--border)] px-5 py-3">
          <button onClick={() => setCreating(true)}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--accent)]/30 bg-[var(--accent)]/5 py-2.5 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-all">
            <Plus className="h-3.5 w-3.5" /> Δημιουργία Νέου
          </button>
        </div>
      </div>

      {/* Inline create panel */}
      {creating && (
        <ConsumablePanel
          defaultModule={conModule}
          defaultConType={conType}
          defaultColor={color}
          onClose={() => setCreating(false)}
          onSaved={(item) => {
            setCreating(false);
            onSelect(item as ConsumableItem);
          }}
        />
      )}
    </div>,
    document.body
  );
}
