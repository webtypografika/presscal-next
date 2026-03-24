'use client';

import { useState } from 'react';
import { X, Printer, Factory, PenTool } from 'lucide-react';
import type { Machine } from '@/generated/prisma/client';
import { createMachine, updateMachine } from './actions';

const CATS = [
  { value: 'digital', label: 'Ψηφιακό', icon: Printer, color: 'border-blue-500/50 bg-blue-500/10 text-blue-400' },
  { value: 'offset', label: 'Offset', icon: Factory, color: 'border-violet-500/50 bg-violet-500/10 text-violet-400' },
  { value: 'plotter', label: 'Plotter', icon: PenTool, color: 'border-teal-500/50 bg-teal-500/10 text-teal-400' },
];

const SHEET_PRESETS = [
  { label: 'A4', ss: 210, ls: 297 },
  { label: 'A3', ss: 297, ls: 420 },
  { label: 'SRA3', ss: 320, ls: 450 },
  { label: '33×48', ss: 330, ls: 487 },
  { label: '35×50', ss: 350, ls: 500 },
  { label: '52×36', ss: 360, ls: 520 },
  { label: '70×100', ss: 700, ls: 1000 },
];

interface Props {
  machine?: Machine;
  onClose: () => void;
}

export function MachineForm({ machine, onClose }: Props) {
  const isEdit = !!machine;
  const specs = (machine?.specs ?? {}) as Record<string, unknown>;

  const [cat, setCat] = useState(machine?.cat ?? 'digital');
  const [name, setName] = useState(machine?.name ?? '');
  const [notes, setNotes] = useState(machine?.notes ?? '');
  const [maxSS, setMaxSS] = useState<number | null>(machine?.maxSS ?? 330);
  const [maxLS, setMaxLS] = useState<number | null>(machine?.maxLS ?? 487);
  const [minSS, setMinSS] = useState<number | null>(machine?.minSS ?? null);
  const [minLS, setMinLS] = useState<number | null>(machine?.minLS ?? null);
  const [marginTop, setMarginTop] = useState<number | null>(machine?.marginTop ?? null);
  const [marginBottom, setMarginBottom] = useState<number | null>(machine?.marginBottom ?? null);
  const [marginLeft, setMarginLeft] = useState<number | null>(machine?.marginLeft ?? null);
  const [marginRight, setMarginRight] = useState<number | null>(machine?.marginRight ?? null);

  // Digital specs
  const [costMode, setCostMode] = useState((specs.cost_mode as string) ?? 'simple_in');
  const [clickA4Color, setClickA4Color] = useState<number | null>((specs.click_a4_color as number) ?? null);
  const [clickA4Bw, setClickA4Bw] = useState<number | null>((specs.click_a4_bw as number) ?? null);
  const [clickA3Color, setClickA3Color] = useState<number | null>((specs.click_a3_color as number) ?? null);
  const [clickA3Bw, setClickA3Bw] = useState<number | null>((specs.click_a3_bw as number) ?? null);
  const [speedColor, setSpeedColor] = useState<number | null>((specs.speed_ppm_color as number) ?? null);
  const [speedBw, setSpeedBw] = useState<number | null>((specs.speed_ppm_bw as number) ?? null);
  const [colorStations, setColorStations] = useState<number>((specs.color_stations as number) ?? 4);

  // Offset specs
  const [towers, setTowers] = useState<number>((specs.off_towers as number) ?? 4);
  const [offSpeed, setOffSpeed] = useState<number>((specs.off_speed as number) ?? 10000);
  const [offSetupMin, setOffSetupMin] = useState<number>((specs.off_setup_min as number) ?? 30);
  const [offHourC, setOffHourC] = useState<number>((specs.off_hour_c as number) ?? 0);
  const [offPlateCost, setOffPlateCost] = useState<number>((specs.off_plate_c as number) ?? 5);
  const [offDefaultWaste, setOffDefaultWaste] = useState<number>((specs.off_default_waste as number) ?? 50);

  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);

    const baseData = {
      name: name.trim(),
      cat,
      notes,
      maxSS: maxSS ?? undefined,
      maxLS: maxLS ?? undefined,
      minSS: minSS ?? undefined,
      minLS: minLS ?? undefined,
      marginTop: marginTop ?? undefined,
      marginBottom: marginBottom ?? undefined,
      marginLeft: marginLeft ?? undefined,
      marginRight: marginRight ?? undefined,
      specs: cat === 'digital' ? {
        ...specs,
        cost_mode: costMode,
        click_a4_color: clickA4Color,
        click_a4_bw: clickA4Bw,
        click_a3_color: clickA3Color,
        click_a3_bw: clickA3Bw,
        speed_ppm_color: speedColor,
        speed_ppm_bw: speedBw,
        color_stations: colorStations,
      } : cat === 'offset' ? {
        ...specs,
        off_towers: towers,
        off_speed: offSpeed,
        off_setup_min: offSetupMin,
        off_hour_c: offHourC,
        off_plate_c: offPlateCost,
        off_default_waste: offDefaultWaste,
      } : specs,
    };

    if (isEdit) {
      await updateMachine(machine!.id, baseData);
    } else {
      await createMachine(baseData);
    }

    setSaving(false);
    onClose();
  }

  const inputCls = "h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15";
  const labelCls = "text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[640px] max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-elevated)] p-6 shadow-[0_32px_80px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">{isEdit ? 'Επεξεργασία' : 'Νέο Μηχάνημα'}</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Category select */}
        <div className="flex gap-2 mb-5">
          {CATS.map((c) => {
            const Icon = c.icon;
            const active = cat === c.value;
            return (
              <button
                key={c.value}
                onClick={() => setCat(c.value)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-bold transition-all ${
                  active ? c.color : 'border-[var(--glass-border)] bg-transparent text-[var(--text-muted)]'
                }`}
              >
                <Icon className="h-4 w-4" /> {c.label}
              </button>
            );
          })}
        </div>

        {/* Name */}
        <div className="mb-4">
          <label className={labelCls}>Όνομα μηχανής</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="π.χ. Xerox C70" autoFocus />
        </div>

        {/* Sheet size */}
        <div className="mb-4">
          <label className={labelCls}>Μέγεθος φύλλου (mm)</label>
          <div className="flex items-center gap-2 mb-2">
            <input className={inputCls + " !w-24 text-center"} type="number" value={maxSS ?? ''} onChange={(e) => setMaxSS(+e.target.value || null)} placeholder="Short Side" />
            <span className="text-[var(--text-muted)] font-semibold">×</span>
            <input className={inputCls + " !w-24 text-center"} type="number" value={maxLS ?? ''} onChange={(e) => setMaxLS(+e.target.value || null)} placeholder="Long Side" />
            <span className="text-xs text-[var(--text-muted)]">mm</span>
          </div>
        </div>

        {/* Margins */}
        <div className="mb-4">
          <label className={labelCls}>Περιθώρια (mm)</label>
          <div className="grid grid-cols-4 gap-2">
            <div><span className="text-[0.6rem] text-[var(--text-muted)]">Top</span><input className={inputCls + " text-center"} type="number" value={marginTop ?? ''} onChange={(e) => setMarginTop(+e.target.value || null)} placeholder="—" /></div>
            <div><span className="text-[0.6rem] text-[var(--text-muted)]">Bottom</span><input className={inputCls + " text-center"} type="number" value={marginBottom ?? ''} onChange={(e) => setMarginBottom(+e.target.value || null)} placeholder="—" /></div>
            <div><span className="text-[0.6rem] text-[var(--text-muted)]">Left</span><input className={inputCls + " text-center"} type="number" value={marginLeft ?? ''} onChange={(e) => setMarginLeft(+e.target.value || null)} placeholder="—" /></div>
            <div><span className="text-[0.6rem] text-[var(--text-muted)]">Right</span><input className={inputCls + " text-center"} type="number" value={marginRight ?? ''} onChange={(e) => setMarginRight(+e.target.value || null)} placeholder="—" /></div>
          </div>
        </div>

        {/* ─── DIGITAL SPECS ─── */}
        {cat === 'digital' && (
          <>
            <div className="mb-4 mt-6 border-t border-[var(--border)] pt-4">
              <label className={labelCls}>Cost Model</label>
              <div className="flex gap-0 rounded-lg border border-[var(--glass-border)] overflow-hidden">
                {[
                  { v: 'simple_in', l: 'Simple (In)' },
                  { v: 'simple_out', l: 'Simple (Out)' },
                  { v: 'precision', l: 'Precision' },
                ].map((m) => (
                  <button
                    key={m.v}
                    onClick={() => setCostMode(m.v)}
                    className={`flex-1 py-2 text-sm font-semibold transition-all ${
                      costMode === m.v ? 'bg-[rgba(245,130,32,0.12)] text-[var(--accent)]' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {m.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className={labelCls}>Click Costs (€)</label>
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-[0.6rem] text-[var(--text-muted)]">A4 Color</span><input className={inputCls} type="number" step="0.001" value={clickA4Color ?? ''} onChange={(e) => setClickA4Color(+e.target.value || null)} placeholder="0.035" /></div>
                <div><span className="text-[0.6rem] text-[var(--text-muted)]">A4 B&W</span><input className={inputCls} type="number" step="0.001" value={clickA4Bw ?? ''} onChange={(e) => setClickA4Bw(+e.target.value || null)} placeholder="0.007" /></div>
                <div><span className="text-[0.6rem] text-[var(--text-muted)]">A3 Color</span><input className={inputCls} type="number" step="0.001" value={clickA3Color ?? ''} onChange={(e) => setClickA3Color(+e.target.value || null)} placeholder="0.070" /></div>
                <div><span className="text-[0.6rem] text-[var(--text-muted)]">A3 B&W</span><input className={inputCls} type="number" step="0.001" value={clickA3Bw ?? ''} onChange={(e) => setClickA3Bw(+e.target.value || null)} placeholder="0.014" /></div>
              </div>
            </div>

            <div className="mb-4">
              <label className={labelCls}>Speed & Stations</label>
              <div className="grid grid-cols-3 gap-3">
                <div><span className="text-[0.6rem] text-[var(--text-muted)]">Color ppm</span><input className={inputCls} type="number" value={speedColor ?? ''} onChange={(e) => setSpeedColor(+e.target.value || null)} placeholder="61" /></div>
                <div><span className="text-[0.6rem] text-[var(--text-muted)]">B&W ppm</span><input className={inputCls} type="number" value={speedBw ?? ''} onChange={(e) => setSpeedBw(+e.target.value || null)} placeholder="65" /></div>
                <div><span className="text-[0.6rem] text-[var(--text-muted)]">Stations</span><input className={inputCls} type="number" value={colorStations} onChange={(e) => setColorStations(+e.target.value || 4)} /></div>
              </div>
            </div>
          </>
        )}

        {/* ─── OFFSET SPECS ─── */}
        {cat === 'offset' && (
          <div className="mb-4 mt-6 border-t border-[var(--border)] pt-4">
            <label className={labelCls}>Offset Specs</label>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><span className="text-[0.6rem] text-[var(--text-muted)]">Πύργοι</span><input className={inputCls} type="number" value={towers} onChange={(e) => setTowers(+e.target.value || 4)} /></div>
              <div><span className="text-[0.6rem] text-[var(--text-muted)]">Ταχύτητα (φ/ω)</span><input className={inputCls} type="number" value={offSpeed} onChange={(e) => setOffSpeed(+e.target.value || 0)} /></div>
              <div><span className="text-[0.6rem] text-[var(--text-muted)]">Setup (λεπτά)</span><input className={inputCls} type="number" value={offSetupMin} onChange={(e) => setOffSetupMin(+e.target.value || 0)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><span className="text-[0.6rem] text-[var(--text-muted)]">Κόστος ωριαίο €</span><input className={inputCls} type="number" step="0.01" value={offHourC} onChange={(e) => setOffHourC(+e.target.value || 0)} /></div>
              <div><span className="text-[0.6rem] text-[var(--text-muted)]">Πλάκα €</span><input className={inputCls} type="number" step="0.01" value={offPlateCost} onChange={(e) => setOffPlateCost(+e.target.value || 0)} /></div>
              <div><span className="text-[0.6rem] text-[var(--text-muted)]">Φύρα (φύλλα)</span><input className={inputCls} type="number" value={offDefaultWaste} onChange={(e) => setOffDefaultWaste(+e.target.value || 0)} /></div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="mb-5">
          <label className={labelCls}>Σημειώσεις</label>
          <textarea className={inputCls + " !h-16 py-2 resize-none"} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Προαιρετικό..." />
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="rounded-lg px-5 py-2.5 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]">
            Ακύρωση
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_16px_rgba(245,130,32,0.3)] transition-all hover:shadow-[0_6px_24px_rgba(245,130,32,0.4)] disabled:opacity-50"
          >
            {saving ? 'Αποθήκευση...' : isEdit ? 'Αποθήκευση' : 'Δημιουργία'}
          </button>
        </div>
      </div>
    </div>
  );
}
