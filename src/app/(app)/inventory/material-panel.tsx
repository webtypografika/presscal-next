'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Material } from '@/generated/prisma/client';
import { createMaterial, updateMaterial } from './actions';

const inputCls = "h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15";

interface Props {
  material?: Material;
  onClose: () => void;
}

export function MaterialPanel({ material, onClose }: Props) {
  const isNew = !material;
  const [name, setName] = useState(material?.name ?? '');
  const [groupName, setGroupName] = useState(material?.groupName ?? '');
  const [subtype, setSubtype] = useState(material?.subtype ?? '');
  const [supplier, setSupplier] = useState(material?.supplier ?? '');
  const [supplierEmail, setSupplierEmail] = useState(material?.supplierEmail ?? '');
  const [width, setWidth] = useState<number | null>(material?.width ?? null);
  const [height, setHeight] = useState<number | null>(material?.height ?? null);
  const [thickness, setThickness] = useState<number | null>(material?.thickness ?? null);
  const [grain, setGrain] = useState(material?.grain ?? 'long');
  const [costPerUnit, setCostPerUnit] = useState<number | null>(material?.costPerUnit ?? null);
  const [markup, setMarkup] = useState<number | null>(material?.markup ?? null);
  const [stock, setStock] = useState<number | null>(material?.stock ?? null);
  const [stockTarget, setStockTarget] = useState<number | null>(material?.stockTarget ?? null);
  const [stockAlert, setStockAlert] = useState<number | null>(material?.stockAlert ?? null);
  const [notes, setNotes] = useState(material?.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const data = {
      name, cat: 'sheet', groupName: groupName || undefined, subtype: subtype || undefined,
      supplier: supplier || undefined, supplierEmail: supplierEmail || undefined,
      width, height, thickness, grain, costPerUnit, markup,
      stock, stockTarget, stockAlert, notes,
    };
    if (material) {
      await updateMaterial(material.id, data);
    } else {
      await createMaterial(data);
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
            <h2 className="text-lg font-bold">{isNew ? 'Νέο Χαρτί' : name}</h2>
            <p className="text-xs text-[var(--text-muted)]">Φύλλο χαρτιού</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)]"><X className="h-5 w-5" /></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar">
          {/* Κατηγοριοποίηση */}
          <Section title="Κατηγοριοποίηση">
            <Field label="Όνομα *"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="π.χ. Velvet 130gr" autoFocus /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ομάδα"><input className={inputCls} value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="π.χ. Coated" /></Field>
              <Field label="Κατηγορία"><input className={inputCls} value={subtype} onChange={e => setSubtype(e.target.value)} placeholder="π.χ. Velvet" /></Field>
            </div>
          </Section>

          {/* Τεχνικά */}
          <Section title="Τεχνικά & Διαστάσεις">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Short Side / SS (mm)"><input className={inputCls + " text-center"} type="number" value={width ?? ''} onChange={e => setWidth(e.target.value ? +e.target.value : null)} placeholder="700" /></Field>
              <Field label="Long Side / LS (mm)"><input className={inputCls + " text-center"} type="number" value={height ?? ''} onChange={e => setHeight(e.target.value ? +e.target.value : null)} placeholder="1000" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Βάρος (g/m²)"><input className={inputCls + " text-center"} type="number" value={thickness ?? ''} onChange={e => setThickness(e.target.value ? +e.target.value : null)} placeholder="130" /></Field>
              <Field label="Ίνα (Grain)">
                <div className="flex rounded-lg border border-[var(--glass-border)] overflow-hidden">
                  {[{ v: 'long', l: '↓ Long' }, { v: 'short', l: '→ Short' }, { v: 'none', l: 'N/A' }].map(o => (
                    <button key={o.v} onClick={() => setGrain(o.v)}
                      className={`flex-1 py-2 text-sm font-semibold transition-all ${grain === o.v ? 'bg-[rgba(245,130,32,0.12)] text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
                    >{o.l}</button>
                  ))}
                </div>
              </Field>
            </div>
          </Section>

          {/* Κόστος */}
          <Section title="Κόστος & Τιμή">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Κόστος / Φύλλο (€)"><input className={inputCls + " text-center"} type="number" step="0.01" value={costPerUnit ?? ''} onChange={e => setCostPerUnit(e.target.value ? +e.target.value : null)} placeholder="0.08" /></Field>
              <Field label="Markup (%)"><input className={inputCls + " text-center"} type="number" value={markup ?? ''} onChange={e => setMarkup(e.target.value ? +e.target.value : null)} placeholder="50" /></Field>
            </div>
            {costPerUnit && markup ? (
              <p className="text-sm text-[var(--success)]">Τιμή πώλησης: €{(costPerUnit * (1 + markup / 100)).toFixed(4)} / φύλλο</p>
            ) : null}
          </Section>

          {/* Προμηθευτής */}
          <Section title="Προμηθευτής">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Όνομα"><input className={inputCls} value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="π.χ. Antalis" /></Field>
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
