'use client';

/**
 * WIZARD DESIGN SYSTEM
 * ====================
 * Shared UI components for all machine wizards (Digital, Offset, Plotter).
 *
 * RULES:
 * 1. Every section uses 2-column layout: left label (w-32) + right content
 * 2. Left label has: colored left border (4px), bold uppercase title, gray subtitle
 * 3. Sections separated by 24px gap + border-top
 * 4. Input fields always have a label ABOVE them (not inline)
 * 5. Toggles: rounded pill style, orange when active
 * 6. Spacing: sections py-5, fields gap-3
 * 7. Colors: section border = accent color (customizable per section)
 * 8. Number fields: thousand separators (el-GR), text input with numeric keyboard
 * 9. No emojis, no gradients, no colored backgrounds on rows
 * 10. Rows: bg-white/[0.03] with rounded-lg, consistent padding p-3
 */

import { useState } from 'react';

// ─── BASE STYLES ───
export const inputCls = "h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 no-spinners";

// ─── NUMBER FORMATTING ───
export function fmtNum(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toLocaleString('el-GR', { maximumFractionDigits: 4 });
}

// ─── NUM INPUT ───
export function NumInput({ value, onChange, placeholder, step }: { value: unknown; onChange: (v: number | null) => void; placeholder?: string; step?: string }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const isDecimal = step && parseFloat(step) < 1;

  function handleChange(raw: string) {
    const clean = raw.replace(/[^\d.,-]/g, '');
    const parsed = parseFloat(clean.replace(/\./g, '').replace(',', '.'));
    if (clean === '' || clean === '-') { setText(clean); onChange(null); return; }
    if (!isNaN(parsed)) {
      onChange(parsed);
      setText(isDecimal ? clean : Math.round(parsed).toLocaleString('el-GR'));
    } else { setText(clean); }
  }

  function handleFocus() {
    setFocused(true);
    const v = value as number | null;
    if (v !== null && v !== undefined) {
      setText(isDecimal ? String(v) : Math.round(v).toLocaleString('el-GR'));
    } else { setText(''); }
  }

  return (
    <input
      className={inputCls + " text-center"}
      type="text"
      inputMode={isDecimal ? 'decimal' : 'numeric'}
      value={focused ? text : fmtNum(value)}
      onChange={(e) => handleChange(e.target.value)}
      onFocus={handleFocus}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
    />
  );
}

// ─── FIELD (label + input wrapper) ───
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-xs font-semibold text-[var(--text-muted)] mb-1.5 block">{label}</span>
      {children}
    </div>
  );
}

// ─── SECTION (2-column with colored left border) ───
export function WizSection({
  title,
  sub,
  children,
  border = false,
  accent = 'var(--accent)',
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
  border?: boolean;
  accent?: string;
}) {
  return (
    <div className={`flex gap-6 ${border ? 'border-t border-[var(--border)] pt-6 mt-2' : ''}`}>
      <div className="w-32 shrink-0 rounded-lg bg-white/[0.02] py-3 pl-3 pr-2" style={{ borderLeft: `3px solid ${accent}` }}>
        <h4 className="text-sm font-black uppercase tracking-wide" style={{ color: accent }}>{title}</h4>
        <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5 leading-tight">{sub}</p>
      </div>
      <div className="flex-1 space-y-3">{children}</div>
    </div>
  );
}

// ─── ROW (consistent styled row) ───
export function Row({ children, dashed }: { children: React.ReactNode; dashed?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg p-3 ${dashed ? 'border border-dashed border-[var(--accent)]/30 bg-white/[0.02]' : 'bg-white/[0.03]'}`}>
      {children}
    </div>
  );
}

// ─── ROW LABEL (colored name pill in a row) ───
export function RowLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`w-20 text-sm font-bold ${className ?? 'text-[var(--text-dim)]'}`}>{children}</span>;
}

// ─── PILL TOGGLE ───
export function PillToggle({ value, options, onChange }: { value: unknown; options: { v: string; l: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-lg border border-[var(--glass-border)] overflow-hidden">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={`flex-1 py-2 text-sm font-semibold transition-all ${value === o.v ? 'bg-[rgba(245,130,32,0.12)] text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
        >{o.l}</button>
      ))}
    </div>
  );
}

// ─── TOGGLE BUTTON ───
export function Toggle({ value, onChange, labelOn, labelOff }: { value: unknown; onChange: (v: boolean) => void; labelOn?: string; labelOff?: string }) {
  const on = !!value;
  return (
    <button onClick={() => onChange(!on)}
      className={`rounded-full border px-5 py-2 text-sm font-semibold transition-all ${on ? 'border-[var(--accent)] bg-[rgba(245,130,32,0.12)] text-[var(--accent)]' : 'border-[var(--glass-border)] text-[var(--text-muted)]'}`}
    >{on ? (labelOn ?? 'ON') : (labelOff ?? 'OFF')}</button>
  );
}

// ─── COLUMN HEADERS ───
export function ColHeaders({ labels }: { labels: Array<{ w?: string; text: string }> }) {
  return (
    <div className="flex items-center gap-3 px-3">
      {labels.map((l, i) => (
        <span key={i} className={`${l.w ?? 'flex-1'} text-xs font-semibold text-[var(--text-muted)]`}>{l.text}</span>
      ))}
    </div>
  );
}

// ─── ADD BUTTON (dashed) ───
export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full rounded-lg border border-dashed border-[var(--glass-border)] py-2.5 text-sm font-semibold text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
    >{label}</button>
  );
}

// ─── WAREHOUSE LINK BUTTON ───
export function WarehouseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Επιλογή από Αποθήκη"
      className="shrink-0 flex items-center gap-1 rounded-lg border border-[var(--teal)]/30 bg-[var(--teal)]/8 px-2 py-1 text-[0.65rem] font-semibold text-[var(--teal)] hover:bg-[var(--teal)]/15 transition-all"
    >
      <i className="fas fa-warehouse" style={{ fontSize: '0.55rem' }} /> Αποθήκη
    </button>
  );
}

// ─── CMYK COLOR HELPERS ───
export const CMYK_COLORS = [
  { name: 'Cyan', key: 'c', cls: 'text-cyan-400' },
  { name: 'Magenta', key: 'm', cls: 'text-pink-400' },
  { name: 'Yellow', key: 'y', cls: 'text-yellow-400' },
  { name: 'Black', key: 'k', cls: 'text-gray-400' },
];

export function getColorStations(stations: number) {
  if (stations >= 4) return CMYK_COLORS;
  if (stations === 1) return [CMYK_COLORS[3]];
  return Array.from({ length: stations }, (_, i) => ({
    name: `Σταθμός ${i + 1}`,
    key: CMYK_COLORS[i]?.key ?? `s${i + 1}`,
    cls: CMYK_COLORS[i]?.cls ?? 'text-[var(--text-dim)]',
  }));
}
