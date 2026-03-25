'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Consumable } from '@/generated/prisma/client';
import { createConsumable, updateConsumable } from './actions';

const inputCls = "h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15";

const CON_TYPES = [
  { v: 'ink', l: 'Μελάνι' }, { v: 'toner', l: 'Toner' }, { v: 'drum', l: 'Drum' },
  { v: 'developer', l: 'Developer' }, { v: 'plate', l: 'Τσίγκος' }, { v: 'blanket', l: 'Καουτσούκ' },
  { v: 'chemical', l: 'Χημικό' }, { v: 'varnish', l: 'Βερνίκι' }, { v: 'fuser', l: 'Fuser' },
  { v: 'belt', l: 'Belt' }, { v: 'waste', l: 'Waste' }, { v: 'corona', l: 'Corona' },
  { v: 'other', l: 'Άλλο' },
];

const COLORS = [
  { v: '', l: '—' }, { v: 'cyan', l: 'Cyan', dot: '#06b6d4' }, { v: 'magenta', l: 'Magenta', dot: '#ec4899' },
  { v: 'yellow', l: 'Yellow', dot: '#eab308' }, { v: 'black', l: 'Black', dot: '#9ca3af' },
  { v: 'white', l: 'White', dot: '#f5f5f5' }, { v: 'clear', l: 'Clear', dot: '#a5b4fc' },
  { v: 'gold', l: 'Gold', dot: '#d97706' }, { v: 'silver', l: 'Silver', dot: '#94a3b8' },
];

const UNITS = [
  { v: 'kg', l: 'kg' }, { v: 'lt', l: 'lt' }, { v: 'τεμ', l: 'τεμ' }, { v: 'set', l: 'set' },
];

interface Props {
  consumable?: Consumable;
  defaultModule?: string;
  onClose: () => void;
}

export function ConsumablePanel({ consumable, defaultModule, onClose }: Props) {
  const isNew = !consumable;
  const [name, setName] = useState(consumable?.name ?? '');
  const [conType, setConType] = useState(consumable?.conType ?? 'toner');
  const [conModule, setConModule] = useState(consumable?.conModule ?? defaultModule ?? 'digital');
  const [color, setColor] = useState(consumable?.color ?? '');
  const [groupName, setGroupName] = useState(consumable?.groupName ?? '');
  const [supplier, setSupplier] = useState(consumable?.supplier ?? '');
  const [supplierEmail, setSupplierEmail] = useState(consumable?.supplierEmail ?? '');
  const [unit, setUnit] = useState(consumable?.unit ?? 'τεμ');
  const [unitSize, setUnitSize] = useState<number | null>(consumable?.unitSize ?? null);
  const [costPerUnit, setCostPerUnit] = useState<number | null>(consumable?.costPerUnit ?? null);
  const [yieldPages, setYieldPages] = useState<number | null>(consumable?.yieldPages ?? null);
  const [stock, setStock] = useState<number | null>(consumable?.stock ?? null);
  const [stockTarget, setStockTarget] = useState<number | null>(consumable?.stockTarget ?? null);
  const [stockAlert, setStockAlert] = useState<number | null>(consumable?.stockAlert ?? null);
  const [notes, setNotes] = useState(consumable?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const costPerBase = costPerUnit && unitSize ? costPerUnit / unitSize : null;
  const showYield = ['toner', 'drum', 'developer', 'fuser', 'belt', 'waste', 'corona'].includes(conType);
  const showColor = ['ink', 'toner', 'drum', 'developer', 'varnish'].includes(conType);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const data = {
      name, conType, conModule, color: color || undefined, groupName: groupName || undefined,
      supplier: supplier || undefined, supplierEmail: supplierEmail || undefined,
      unit, unitSize, costPerUnit, costPerBase, yieldPages,
      stock, stockTarget, stockAlert, notes,
    };
    if (consumable) {
      await updateConsumable(consumable.id, data);
    } else {
      await createConsumable(data);
    }
    setSaving(false);
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex justify-end backdrop-blur-sm" onClick={onClose}>
      <div className="w-[480px] h-full flex flex-col border-l border-[var(--glass-border)] shadow-[-8px_0_40px_rgba(0,0,0,0.3)]"
        style={{ background: 'rgb(20, 30, 55)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <h2 className="text-lg font-bold">{isNew ? 'Νέο Αναλώσιμο' : name}</h2>
            <p className="text-xs text-[var(--text-muted)]">{conModule === 'offset' ? 'Offset' : conModule === 'digital' ? 'Digital' : 'Shared'}</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)]"><X className="h-5 w-5" /></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar">
          {/* Τύπος & Κατηγορία */}
          <Section title="Τύπος & Κατηγορία">
            <Field label="Όνομα *"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="π.χ. Konica TN-622C" autoFocus /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Τύπος">
                <select className={inputCls} value={conType} onChange={e => setConType(e.target.value)}>
                  {CON_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                </select>
              </Field>
              <Field label="Module">
                <div className="flex rounded-lg border border-[var(--glass-border)] overflow-hidden">
                  {[{ v: 'offset', l: 'Offset' }, { v: 'digital', l: 'Digital' }, { v: 'shared', l: 'Shared' }].map(o => (
                    <button key={o.v} onClick={() => setConModule(o.v)}
                      className={`flex-1 py-2 text-xs font-semibold transition-all ${conModule === o.v ? 'bg-[rgba(245,130,32,0.12)] text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
                    >{o.l}</button>
                  ))}
                </div>
              </Field>
            </div>
            {showColor && (
              <Field label="Χρώμα">
                <div className="flex flex-wrap gap-2">
                  {COLORS.map(c => (
                    <button key={c.v} onClick={() => setColor(c.v)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${color === c.v ? 'border-[var(--accent)] bg-[rgba(245,130,32,0.12)] text-[var(--accent)]' : 'border-[var(--glass-border)] text-[var(--text-muted)]'}`}>
                      {c.dot && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c.dot }} />}
                      {c.l}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <Field label="Ομάδα"><input className={inputCls} value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="π.χ. OEM, Compatible, Process" /></Field>
          </Section>

          {/* Κόστος & Μονάδα */}
          <Section title="Κόστος & Μονάδα">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Μονάδα">
                <select className={inputCls} value={unit} onChange={e => setUnit(e.target.value)}>
                  {UNITS.map(u => <option key={u.v} value={u.v}>{u.l}</option>)}
                </select>
              </Field>
              <Field label="Μέγεθος πακέτου"><input className={inputCls + " text-center"} type="number" step="0.1" value={unitSize ?? ''} onChange={e => setUnitSize(e.target.value ? +e.target.value : null)} placeholder="1" /></Field>
              <Field label="Κόστος (€)"><input className={inputCls + " text-center"} type="number" step="0.01" value={costPerUnit ?? ''} onChange={e => setCostPerUnit(e.target.value ? +e.target.value : null)} placeholder="85.00" /></Field>
            </div>
            {costPerBase !== null && <p className="text-sm text-[var(--text-dim)]">= €{costPerBase.toFixed(4)} / {unit}</p>}
          </Section>

          {/* Yield */}
          {showYield && (
            <Section title="Yield">
              <Field label="Σελίδες @ 5% coverage"><input className={inputCls + " text-center"} type="number" value={yieldPages ?? ''} onChange={e => setYieldPages(e.target.value ? +e.target.value : null)} placeholder="30000" /></Field>
              {costPerUnit && yieldPages ? (
                <p className="text-sm text-[var(--success)]">Κόστος / σελίδα: €{(costPerUnit / yieldPages).toFixed(5)}</p>
              ) : null}
            </Section>
          )}

          {/* Προμηθευτής */}
          <Section title="Προμηθευτής">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Όνομα"><input className={inputCls} value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="π.χ. Konica Minolta" /></Field>
              <Field label="Email"><input className={inputCls} value={supplierEmail} onChange={e => setSupplierEmail(e.target.value)} placeholder="orders@..." /></Field>
            </div>
          </Section>

          {/* Stock */}
          <Section title="Απόθεμα">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Τρέχον"><input className={inputCls + " text-center"} type="number" value={stock ?? ''} onChange={e => setStock(e.target.value ? +e.target.value : null)} /></Field>
              <Field label="Target"><input className={inputCls + " text-center"} type="number" value={stockTarget ?? ''} onChange={e => setStockTarget(e.target.value ? +e.target.value : null)} /></Field>
              <Field label="Alert"><input className={inputCls + " text-center"} type="number" value={stockAlert ?? ''} onChange={e => setStockAlert(e.target.value ? +e.target.value : null)} /></Field>
            </div>
          </Section>

          {/* Σημειώσεις */}
          <Section title="Σημειώσεις">
            <textarea className={inputCls + " !h-16 py-2 resize-none"} value={notes} onChange={e => setNotes(e.target.value)} placeholder="..." />
          </Section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] px-6 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)]">Ακύρωση</button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_16px_rgba(245,130,32,0.3)] disabled:opacity-40">
            {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--border)] pt-4 first:border-0 first:pt-0">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><span className="text-xs font-semibold text-[var(--text-muted)] mb-1.5 block">{label}</span>{children}</div>;
}
