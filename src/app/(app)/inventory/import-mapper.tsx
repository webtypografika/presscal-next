'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, CheckCircle } from 'lucide-react';
import { parseImportRows, type ColumnMapping, type GlobalFields } from './parse-import';
import { bulkCreateMaterials, type BulkMaterialRow } from './actions';

const inputCls = "h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15";
const selectCls = "h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]";

interface Props {
  rawRows: string[][];
  onClose: () => void;
  onDone: (result: { added: number; updated: number; skipped: number }) => void;
}

const FIELDS = [
  { id: 'name', label: 'Περιγραφή *' },
  { id: 'cost', label: 'Τιμή *' },
  { id: 'height', label: 'SS (Short Side)' },
  { id: 'width', label: 'LS (Long Side)' },
  { id: 'grams', label: 'Γραμμάρια' },
  { id: 'email', label: 'Email' },
] as const;

export function ImportMapper({ rawRows, onClose, onDone }: Props) {
  const maxCols = rawRows.reduce((max, row) => Math.max(max, row.length), 0);

  const [mapping, setMapping] = useState<ColumnMapping>({
    name: -1, cost: -1, height: -1, width: -1, grams: -1, email: -1,
  });
  const [globals, setGlobals] = useState<GlobalFields>({ group: '', supplier: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ added: number; updated: number; skipped: number } | null>(null);

  function setMap(field: string, val: number) {
    setMapping(prev => ({ ...prev, [field]: val }));
  }

  async function execute() {
    setSaving(true);
    const parsed = parseImportRows(rawRows, mapping, globals);
    const rows: BulkMaterialRow[] = parsed.map(p => ({
      name: p.name,
      cat: 'sheet',
      groupName: p.groupName || undefined,
      subtype: p.subtype || undefined,
      supplier: p.supplier || undefined,
      supplierEmail: p.supplierEmail || undefined,
      width: p.width || null,
      height: p.height || null,
      thickness: p.thickness || null,
      grain: p.grain || undefined,
      costPerUnit: p.costPerUnit || null,
      markup: p.markup,
      unit: 'φύλλο',
    }));
    const res = await bulkCreateMaterials(rows);
    setSaving(false);
    setResult(res);
    onDone(res);
  }

  return createPortal(
    <div className="fixed inset-0 z-[250] flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
      <div className="w-[1000px] h-[85vh] flex flex-col rounded-2xl border border-[var(--glass-border)] shadow-[0_32px_80px_rgba(0,0,0,0.5)] overflow-hidden"
        style={{ background: 'rgb(20, 30, 55)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]"
          style={{ background: 'var(--blue)' }}>
          <h3 className="text-base font-black text-white flex items-center gap-3">
            <i className="fas fa-magic" /> Smart Mapping
          </h3>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {/* Body: mapping panel (left) + preview (right) */}
        <div className="flex-1 flex overflow-hidden">

          {/* Left: Mapping controls */}
          <div className="w-[340px] shrink-0 border-r border-[var(--border)] overflow-y-auto p-5 space-y-5 custom-scrollbar">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-[var(--blue)] border-b-2 border-[var(--accent)] pb-1 mb-4">
                1. Αντιστοίχιση Στηλών
              </h4>
              <div className="space-y-3">
                {FIELDS.map(f => (
                  <div key={f.id}>
                    <label className="text-[0.65rem] font-bold text-[var(--text-muted)] mb-1 block">{f.label}</label>
                    <select
                      className={selectCls}
                      style={{ colorScheme: 'dark' }}
                      value={mapping[f.id as keyof ColumnMapping]}
                      onChange={e => setMap(f.id, parseInt(e.target.value))}
                    >
                      <option value={-1}>Αυτόματο</option>
                      {Array.from({ length: maxCols }, (_, i) => (
                        <option key={i} value={i}>Στήλη {i + 1}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-[var(--border)] pt-4 space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)] mb-2">
                2. Καθολικά πεδία
              </h4>
              <div>
                <label className="text-[0.65rem] font-bold text-[var(--text-muted)] mb-1 block">ΥΠΕΡ-ΟΜΑΔΑ</label>
                <input className={inputCls} placeholder="π.χ. Uncoated"
                  value={globals.group} onChange={e => setGlobals(p => ({ ...p, group: e.target.value }))} />
              </div>
              <div>
                <label className="text-[0.65rem] font-bold text-[var(--text-muted)] mb-1 block">ΠΡΟΜΗΘΕΥΤΗΣ</label>
                <input className={inputCls} placeholder="π.χ. Περράκης"
                  value={globals.supplier} onChange={e => setGlobals(p => ({ ...p, supplier: e.target.value }))} />
              </div>
              <div>
                <label className="text-[0.65rem] font-bold text-[var(--text-muted)] mb-1 block">EMAIL (GLOBAL)</label>
                <input className={inputCls} placeholder="orders@supplier.com"
                  value={globals.email} onChange={e => setGlobals(p => ({ ...p, email: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Right: Data preview */}
          <div className="flex-1 flex flex-col overflow-hidden p-5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">
              Προεπισκόπηση ({rawRows.length} γραμμές)
            </h4>
            <div className="flex-1 overflow-auto rounded-lg border border-[var(--glass-border)]">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0" style={{ background: 'var(--blue)' }}>
                  <tr>
                    {Array.from({ length: maxCols }, (_, i) => (
                      <th key={i} className="px-3 py-2 text-white font-bold text-left whitespace-nowrap">Col {i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rawRows.slice(0, 80).map((row, ri) => (
                    <tr key={ri} className="border-b border-[var(--border)] hover:bg-white/[0.02]">
                      {Array.from({ length: maxCols }, (_, ci) => (
                        <td key={ci} className="px-3 py-2 text-[var(--text-dim)] whitespace-nowrap max-w-[180px] truncate">
                          {row[ci] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)]">
          <div className="text-sm">
            {result && (
              <span className="flex items-center gap-2 text-[var(--success)]">
                <CheckCircle className="h-4 w-4" />
                Νέα: {result.added} · Ενημερώθηκαν: {result.updated} · Αγνοήθηκαν: {result.skipped}
              </span>
            )}
          </div>
          {!result ? (
            <button onClick={execute} disabled={saving}
              className="flex items-center gap-2 rounded-lg px-8 py-3 text-sm font-black text-white shadow-[0_4px_16px_rgba(29,47,110,0.3)] disabled:opacity-40 transition-all"
              style={{ background: saving ? 'var(--accent)' : 'var(--blue)' }}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> ΑΠΟΘΗΚΕΥΣΗ...</> : 'ΕΚΤΕΛΕΣΗ ΕΙΣΑΓΩΓΗΣ'}
            </button>
          ) : (
            <button onClick={onClose}
              className="rounded-lg bg-[var(--success)] px-8 py-3 text-sm font-black text-white">
              ΚΛΕΙΣΙΜΟ
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
