'use client';

import { useState } from 'react';
import { Printer, Droplet, Zap, BookOpen, Scissors, PinIcon, CircleDot, GripVertical, CheckCircle, AlertTriangle } from 'lucide-react';
import { aiScanDigital } from './ai-scan-action';

type OnChange = (field: string, value: unknown) => void;
type Data = Record<string, unknown>;

// Shared UI helpers
const inputCls = "h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 no-spinners";
const labelCls = "text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block";

function NumInput({ value, onChange, placeholder, step }: { value: unknown; onChange: (v: number | null) => void; placeholder?: string; step?: string }) {
  return (
    <input
      className={inputCls + " text-center"}
      type="number"
      step={step}
      value={(value as number | string) ?? ''}
      onChange={(e) => onChange(e.target.value ? +e.target.value : null)}
      placeholder={placeholder}
    />
  );
}

function PillToggle({ value, options, onChange }: { value: unknown; options: { v: string; l: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-lg border border-[var(--glass-border)] overflow-hidden">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`flex-1 py-2 text-sm font-semibold transition-all ${value === o.v ? 'bg-[rgba(245,130,32,0.12)] text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function FinishingPill({ label, icon: Icon, active, onClick }: { label: string; icon: typeof Printer; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all ${active ? 'border-[var(--accent)] bg-[rgba(245,130,32,0.12)] text-[var(--accent)]' : 'border-[var(--glass-border)] text-[var(--text-muted)]'}`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

// ─── STEP RENDERERS ───

function StepWelcome() {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[var(--blue)]/30 bg-[var(--blue)]/10 text-[var(--blue)]">
        <Printer className="h-10 w-10" />
      </div>
      <h2 className="mt-6 text-2xl font-bold">Ρύθμιση Ψηφιακής Μηχανής</h2>
      <p className="mt-2 max-w-md text-[var(--text-dim)]">
        Θα σας καθοδηγήσουμε βήμα-βήμα στη ρύθμιση της μηχανής σας.
        Μπορείτε να χρησιμοποιήσετε AI Scan για αυτόματη αναγνώριση προδιαγραφών.
      </p>
    </div>
  );
}

function StepAiScan({ data, onChange }: { data: Data; onChange: OnChange }) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; fieldsFound?: number; error?: string } | null>(null);

  async function handleScan() {
    const name = (data.name as string) ?? '';
    if (!name.trim()) return;
    setScanning(true);
    setResult(null);

    const res = await aiScanDigital(name);
    setResult(res);

    if (res.success) {
      // Apply found specs to data
      for (const [key, val] of Object.entries(res.specs)) {
        if (val !== null && val !== undefined) {
          onChange(key, val);
        }
      }
    }
    setScanning(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Μοντέλο Μηχανής *</label>
        <input
          className={inputCls}
          value={(data.name as string) ?? ''}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="π.χ. Konica Accurio C6100"
          autoFocus
        />
      </div>

      <button
        onClick={handleScan}
        disabled={scanning || !(data.name as string)?.trim()}
        className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-pink-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50"
      >
        <Zap className="h-4 w-4" />
        {scanning ? 'Αναζήτηση...' : 'AI Scan'}
      </button>

      {scanning && (
        <div className="flex items-center gap-3 rounded-lg bg-[var(--blue)]/10 p-4 text-sm text-[var(--blue)]">
          <span className="animate-spin">⏳</span>
          Αναζήτηση προδιαγραφών για &quot;{data.name as string}&quot;...
        </div>
      )}

      {result?.success && (
        <div className="flex items-center gap-3 rounded-lg bg-[var(--success)]/10 p-4 text-sm text-[var(--success)]">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <div>
            <strong>Βρέθηκαν {result.fieldsFound} προδιαγραφές</strong>
            <p className="text-[var(--text-dim)] text-xs mt-1">Ελέγξτε τα πεδία στα επόμενα βήματα και διορθώστε ό,τι χρειάζεται.</p>
          </div>
        </div>
      )}

      {result && !result.success && (
        <div className="flex items-center gap-3 rounded-lg bg-[var(--danger)]/10 p-4 text-sm text-[var(--danger)]">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <strong>Δεν βρέθηκαν αποτελέσματα</strong>
            <p className="text-[var(--text-dim)] text-xs mt-1">{result.error ?? 'Συμπληρώστε χειροκίνητα.'}</p>
          </div>
        </div>
      )}

      <div className="border-t border-[var(--border)] pt-4">
        <label className={labelCls}>URL Κατασκευαστή (προαιρετικό)</label>
        <input
          className={inputCls}
          value={(data.spec_url as string) ?? ''}
          onChange={(e) => onChange('spec_url', e.target.value)}
          placeholder="https://..."
        />
      </div>
    </div>
  );
}

function StepInkType({ data, onChange }: { data: Data; onChange: OnChange }) {
  const ink = data.ink_type as string;
  return (
    <div className="grid grid-cols-2 gap-4">
      {[
        { v: 'toner', l: 'Toner', desc: 'Σκόνη σε κασέτα — CMYK', icon: '🖨️' },
        { v: 'liquid', l: 'Liquid Ink', desc: 'Υγρό ink — HP Indigo / Riso', icon: '💧' },
      ].map((t) => (
        <button
          key={t.v}
          onClick={() => onChange('ink_type', t.v)}
          className={`flex flex-col items-center gap-3 rounded-2xl border-2 p-8 text-center transition-all ${ink === t.v ? 'border-[var(--blue)] bg-[var(--blue)]/8' : 'border-[var(--glass-border)] hover:border-[var(--border-hover)]'}`}
        >
          <span className="text-4xl">{t.icon}</span>
          <span className="text-lg font-bold">{t.l}</span>
          <span className="text-sm text-[var(--text-muted)]">{t.desc}</span>
        </button>
      ))}
    </div>
  );
}

function StepSpecs({ data, onChange }: { data: Data; onChange: OnChange }) {
  return (
    <div className="space-y-5">
      {/* Speeds */}
      <div>
        <label className={labelCls}>Ταχύτητες (PPM)</label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-[0.6rem] text-[var(--text-muted)]">Color *</span>
            <NumInput value={data.speed_ppm_color} onChange={(v) => onChange('speed_ppm_color', v)} placeholder="61" />
          </div>
          <div>
            <span className="text-[0.6rem] text-[var(--text-muted)]">B&W</span>
            <NumInput value={data.speed_ppm_bw} onChange={(v) => onChange('speed_ppm_bw', v)} placeholder="65" />
          </div>
        </div>
      </div>

      {/* GSM Range */}
      <div>
        <label className={labelCls}>Εύρος Βάρους (GSM)</label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-[0.6rem] text-[var(--text-muted)]">Min</span>
            <NumInput value={data.min_gsm} onChange={(v) => onChange('min_gsm', v)} placeholder="60" />
          </div>
          <div>
            <span className="text-[0.6rem] text-[var(--text-muted)]">Max</span>
            <NumInput value={data.max_gsm} onChange={(v) => onChange('max_gsm', v)} placeholder="350" />
          </div>
        </div>
      </div>

      {/* Duplex speed */}
      <div>
        <label className={labelCls}>Duplex Speed Factor (%)</label>
        <NumInput value={data.duplex_speed_factor} onChange={(v) => onChange('duplex_speed_factor', v)} placeholder="100" />
      </div>

      {/* Finishing */}
      <div>
        <label className={labelCls}>Finishing (Output)</label>
        <div className="flex flex-wrap gap-2">
          <FinishingPill label="Booklet" icon={BookOpen} active={!!data.has_booklet_maker} onClick={() => onChange('has_booklet_maker', !data.has_booklet_maker)} />
          <FinishingPill label="Stapler" icon={PinIcon} active={!!data.has_stapler} onClick={() => onChange('has_stapler', !data.has_stapler)} />
          <FinishingPill label="Puncher" icon={CircleDot} active={!!data.has_puncher} onClick={() => onChange('has_puncher', !data.has_puncher)} />
          <FinishingPill label="Trimmer" icon={Scissors} active={!!data.has_trimmer} onClick={() => onChange('has_trimmer', !data.has_trimmer)} />
          <FinishingPill label="Glue Binder" icon={GripVertical} active={!!data.has_glue_binder} onClick={() => onChange('has_glue_binder', !data.has_glue_binder)} />
        </div>
      </div>
    </div>
  );
}

function StepMedia({ data, onChange }: { data: Data; onChange: OnChange }) {
  const PRESETS = [
    { l: 'A4', ss: 210, ls: 297 }, { l: 'A3', ss: 297, ls: 420 },
    { l: 'SRA3', ss: 320, ls: 450 }, { l: '33×48', ss: 330, ls: 487 },
    { l: '35×50', ss: 350, ls: 500 },
  ];
  return (
    <div className="space-y-5">
      {/* Max sheet */}
      <div>
        <label className={labelCls}>Μέγιστο Φύλλο (mm)</label>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div><span className="text-[0.6rem] text-[var(--text-muted)]">Short Side</span><NumInput value={data.max_sheet_ss} onChange={(v) => onChange('max_sheet_ss', v)} placeholder="330" /></div>
          <div><span className="text-[0.6rem] text-[var(--text-muted)]">Long Side</span><NumInput value={data.max_sheet_ls} onChange={(v) => onChange('max_sheet_ls', v)} placeholder="487" /></div>
        </div>
      </div>

      {/* Min sheet */}
      <div>
        <label className={labelCls}>Ελάχιστο Φύλλο (mm)</label>
        <div className="grid grid-cols-2 gap-3">
          <div><span className="text-[0.6rem] text-[var(--text-muted)]">Short Side</span><NumInput value={data.min_sheet_ss} onChange={(v) => onChange('min_sheet_ss', v)} /></div>
          <div><span className="text-[0.6rem] text-[var(--text-muted)]">Long Side</span><NumInput value={data.min_sheet_ls} onChange={(v) => onChange('min_sheet_ls', v)} /></div>
        </div>
      </div>

      {/* Banner */}
      <div>
        <label className={labelCls}>Banner (mm)</label>
        <div className="grid grid-cols-2 gap-3">
          <div><span className="text-[0.6rem] text-[var(--text-muted)]">Short Side</span><NumInput value={data.banner_ss} onChange={(v) => onChange('banner_ss', v)} /></div>
          <div><span className="text-[0.6rem] text-[var(--text-muted)]">Long Side</span><NumInput value={data.banner_ls} onChange={(v) => onChange('banner_ls', v)} /></div>
        </div>
      </div>

      {/* Margins */}
      <div>
        <label className={labelCls}>Περιθώρια Εκτύπωσης (mm)</label>
        <div className="grid grid-cols-4 gap-2">
          <div><span className="text-[0.6rem] text-[var(--text-muted)]">Top</span><NumInput value={data.margin_top} onChange={(v) => onChange('margin_top', v)} /></div>
          <div><span className="text-[0.6rem] text-[var(--text-muted)]">Bottom</span><NumInput value={data.margin_bottom} onChange={(v) => onChange('margin_bottom', v)} /></div>
          <div><span className="text-[0.6rem] text-[var(--text-muted)]">Left</span><NumInput value={data.margin_left} onChange={(v) => onChange('margin_left', v)} /></div>
          <div><span className="text-[0.6rem] text-[var(--text-muted)]">Right</span><NumInput value={data.margin_right} onChange={(v) => onChange('margin_right', v)} /></div>
        </div>
      </div>

      {/* Feed direction */}
      <div>
        <label className={labelCls}>Τροφοδοσία</label>
        <PillToggle value={data.feed_direction} options={[{ v: 'sef', l: 'SEF' }, { v: 'lef', l: 'LEF' }, { v: 'both', l: 'Both' }]} onChange={(v) => onChange('feed_direction', v)} />
      </div>
    </div>
  );
}

function StepColorStations({ data, onChange }: { data: Data; onChange: OnChange }) {
  const stations = [
    { v: 1, l: 'Mono', d: '1 κανάλι' },
    { v: 2, l: 'Duo', d: '2 κανάλια' },
    { v: 4, l: 'CMYK', d: '4 κανάλια (standard)' },
    { v: 5, l: 'CMYK+1', d: '5 κανάλια + 1 extra' },
    { v: 6, l: 'CMYK+2', d: '6 κανάλια + 2 extra' },
  ];
  return (
    <div className="grid grid-cols-5 gap-3">
      {stations.map((s) => (
        <button
          key={s.v}
          onClick={() => onChange('color_stations', s.v)}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-center transition-all ${data.color_stations === s.v ? 'border-[var(--blue)] bg-[var(--blue)]/8' : 'border-[var(--glass-border)] hover:border-[var(--border-hover)]'}`}
        >
          <span className="text-2xl font-black">{s.v}</span>
          <span className="text-sm font-bold">{s.l}</span>
          <span className="text-[0.65rem] text-[var(--text-muted)]">{s.d}</span>
        </button>
      ))}
    </div>
  );
}

function StepExtraColors({ data, onChange }: { data: Data; onChange: OnChange }) {
  const count = ((data.color_stations as number) ?? 4) - 4;
  if (count <= 0) return <p className="text-[var(--text-muted)]">Η μηχανή σας δεν χρησιμοποιεί extra χρώματα.</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-dim)]">Ορίστε τα ονόματα, yield και κόστος των επιπλέον σταθμών (π.χ. White, Gold, Clear, Silver, Fluorescent)</p>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg bg-white/[0.02] p-4 space-y-3">
          <label className={labelCls}>Extra Χρώμα {i + 1}</label>
          <input className={inputCls} value={(data[`extra_color_${i + 1}_name`] as string) ?? ''} onChange={(e) => onChange(`extra_color_${i + 1}_name`, e.target.value)} placeholder={`π.χ. ${i === 0 ? 'White' : 'Clear'}`} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[0.55rem] text-[var(--text-muted)]">Yield (σελίδες)</span>
              <NumInput value={data[`extra_color_${i + 1}_yield`]} onChange={(v) => onChange(`extra_color_${i + 1}_yield`, v)} placeholder="8000" />
            </div>
            <div>
              <span className="text-[0.55rem] text-[var(--text-muted)]">Κόστος € (κασέτα/δοχείο)</span>
              <NumInput value={data[`extra_color_${i + 1}_cost`]} onChange={(v) => onChange(`extra_color_${i + 1}_cost`, v)} placeholder="85.00" step="0.01" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StepCostModel({ data, onChange }: { data: Data; onChange: OnChange }) {
  const models = [
    { v: 'simple_in', l: 'Simple — Χρώμα στο CPC', d: 'Το χρώμα περιλαμβάνεται στη χρέωση click. Ιδανικό για συμβόλαιο αντιπροσωπείας.', tags: ['Συμβόλαιο', 'Γρήγορο'] },
    { v: 'simple_out', l: 'Simple — Χρώμα εκτός CPC', d: 'CPC + αγοράζετε χρώμα ξεχωριστά. Ελεύθερη μηχανή ή συμβόλαιο χωρίς χρώμα.', tags: ['Ελεύθερα', 'Αποθήκη'] },
    { v: 'precision', l: 'Precision — Πλήρης Ανάλυση', d: 'Αναλυτικό: χρώμα, drums, developer, fuser, belt, coronas, waste. Πλήρης ακρίβεια.', tags: ['Ελεύθερα', 'Ακρίβεια'] },
  ];
  return (
    <div className="space-y-3">
      {models.map((m) => (
        <button
          key={m.v}
          onClick={() => onChange('cost_mode', m.v)}
          className={`w-full text-left rounded-xl border-2 p-5 transition-all ${data.cost_mode === m.v ? 'border-[var(--accent)] bg-[rgba(245,130,32,0.06)]' : 'border-[var(--glass-border)] hover:border-[var(--border-hover)]'}`}
        >
          <span className="text-base font-bold">{m.l}</span>
          <p className="mt-1 text-sm text-[var(--text-dim)]">{m.d}</p>
          <div className="mt-2 flex gap-2">
            {m.tags.map((t) => (
              <span key={t} className="rounded-full bg-[var(--blue)]/10 px-2 py-0.5 text-[0.6rem] font-semibold text-[var(--blue)]">{t}</span>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}

function StepCosts({ data, onChange }: { data: Data; onChange: OnChange }) {
  const mode = data.cost_mode as string;
  const inkType = data.ink_type as string;
  const stations = (data.color_stations as number) ?? 4;
  const extraCount = Math.max(0, stations - 4);

  return (
    <div className="space-y-5">
      {/* CPC — Click costs */}
      <div>
        <label className={labelCls}>Click Costs — CPC (€/όψη)</label>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-3 grid grid-cols-3 gap-3">
            <span></span>
            {stations >= 2 && <span className="text-center text-[0.6rem] font-semibold text-[var(--text-muted)]">COLOR</span>}
            <span className="text-center text-[0.6rem] font-semibold text-[var(--text-muted)]">B&W</span>
          </div>
          <span className="flex items-center text-sm font-semibold">A4</span>
          {stations >= 2 && <NumInput value={data.click_a4_color} onChange={(v) => onChange('click_a4_color', v)} placeholder="0.035" step="0.001" />}
          <NumInput value={data.click_a4_bw} onChange={(v) => onChange('click_a4_bw', v)} placeholder="0.007" step="0.001" />
          <span className="flex items-center text-sm font-semibold">A3/SRA3</span>
          {stations >= 2 && <NumInput value={data.click_a3_color} onChange={(v) => onChange('click_a3_color', v)} placeholder="0.070" step="0.001" />}
          <NumInput value={data.click_a3_bw} onChange={(v) => onChange('click_a3_bw', v)} placeholder="0.014" step="0.001" />
          <span className="flex items-center text-sm font-semibold">Banner</span>
          {stations >= 2 && <NumInput value={data.click_banner_color} onChange={(v) => onChange('click_banner_color', v)} step="0.001" />}
          <NumInput value={data.click_banner_bw} onChange={(v) => onChange('click_banner_bw', v)} step="0.001" />
        </div>
      </div>

      {/* Extra color click costs */}
      {extraCount > 0 && (
        <div>
          <label className={labelCls}>Extra Color Click Costs (€/όψη)</label>
          <div className="space-y-2">
            {Array.from({ length: extraCount }).map((_, i) => {
              const name = (data[`extra_color_${i + 1}_name`] as string) || `Extra ${i + 1}`;
              return (
                <div key={i} className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3">
                  <span className="w-28 text-sm font-semibold text-[var(--text-dim)]">{name}</span>
                  <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Click A4 €</span><NumInput value={data[`click_extra_${i + 1}_a4`]} onChange={(v) => onChange(`click_extra_${i + 1}_a4`, v)} step="0.001" /></div>
                  <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Click A3 €</span><NumInput value={data[`click_extra_${i + 1}_a3`]} onChange={(v) => onChange(`click_extra_${i + 1}_a3`, v)} step="0.001" /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Duplex click multiplier */}
      <div>
        <label className={labelCls}>Duplex Click Multiplier</label>
        <p className="text-[0.65rem] text-[var(--text-dim)] mb-1">Πόσα clicks χρεώνει η 2η όψη (2 = διπλάσιο, 1 = ίδιο)</p>
        <NumInput value={data.duplex_click_multiplier} onChange={(v) => onChange('duplex_click_multiplier', v)} placeholder="2" />
      </div>

      {/* Toner CMYK — for simple_out and precision (toner machines) */}
      {(mode === 'simple_out' || mode === 'precision') && inkType === 'toner' && (
        <div className="border-t border-[var(--border)] pt-4">
          <label className={labelCls}>Toner — Yield & Cost (CMYK)</label>
          <div className="space-y-2">
            {['C', 'M', 'Y', 'K'].slice(0, stations >= 4 ? 4 : stations).map((c) => {
              const key = c.toLowerCase();
              const colors: Record<string, string> = { C: 'bg-cyan-500/10 text-cyan-400', M: 'bg-pink-500/10 text-pink-400', Y: 'bg-yellow-500/10 text-yellow-400', K: 'bg-gray-500/10 text-gray-300' };
              return (
                <div key={c} className={`flex items-center gap-3 rounded-lg ${colors[c]} p-3`}>
                  <span className="w-8 text-center text-sm font-black">{c}</span>
                  <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Yield (σελίδες)</span><NumInput value={data[`toner_${key}_yield`]} onChange={(v) => onChange(`toner_${key}_yield`, v)} /></div>
                  <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Κόστος €</span><NumInput value={data[`toner_${key}_cost`]} onChange={(v) => onChange(`toner_${key}_cost`, v)} step="0.01" /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Toner extra colors — for simple_out and precision */}
      {(mode === 'simple_out' || mode === 'precision') && inkType === 'toner' && extraCount > 0 && (
        <div>
          <label className={labelCls}>Toner — Extra Colors Yield & Cost</label>
          <div className="space-y-2">
            {Array.from({ length: extraCount }).map((_, i) => {
              const name = (data[`extra_color_${i + 1}_name`] as string) || `Extra ${i + 1}`;
              return (
                <div key={i} className="flex items-center gap-3 rounded-lg bg-purple-500/10 text-purple-300 p-3">
                  <span className="w-16 text-center text-sm font-black">{name}</span>
                  <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Yield (σελίδες)</span><NumInput value={data[`extra_color_${i + 1}_yield`]} onChange={(v) => onChange(`extra_color_${i + 1}_yield`, v)} /></div>
                  <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Κόστος €</span><NumInput value={data[`extra_color_${i + 1}_cost`]} onChange={(v) => onChange(`extra_color_${i + 1}_cost`, v)} step="0.01" /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drums CMYK — precision mode only */}
      {mode === 'precision' && inkType === 'toner' && (
        <div className="border-t border-[var(--border)] pt-4">
          <label className={labelCls}>Drums — Life & Cost (CMYK)</label>
          <div className="space-y-2">
            {['C', 'M', 'Y', 'K'].slice(0, stations >= 4 ? 4 : stations).map((c) => {
              const key = c.toLowerCase();
              const colors: Record<string, string> = { C: 'bg-cyan-500/10 text-cyan-400', M: 'bg-pink-500/10 text-pink-400', Y: 'bg-yellow-500/10 text-yellow-400', K: 'bg-gray-500/10 text-gray-300' };
              return (
                <div key={c} className={`flex items-center gap-3 rounded-lg ${colors[c]} p-3`}>
                  <span className="w-8 text-center text-sm font-black">{c}</span>
                  <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Life (σελίδες)</span><NumInput value={data[`drum_${key}_life`]} onChange={(v) => onChange(`drum_${key}_life`, v)} /></div>
                  <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Κόστος €</span><NumInput value={data[`drum_${key}_cost`]} onChange={(v) => onChange(`drum_${key}_cost`, v)} step="0.01" /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Developer — precision mode */}
      {mode === 'precision' && inkType === 'toner' && (
        <div className="border-t border-[var(--border)] pt-4">
          <label className={labelCls}>Developer</label>
          <PillToggle value={data.developer_type} options={[{ v: 'integrated', l: 'Ενσωματωμένο στο Drum' }, { v: 'separate', l: 'Ξεχωριστό' }]} onChange={(v) => onChange('developer_type', v)} />
          {data.developer_type === 'separate' && (
            <div className="space-y-2 mt-3">
              {['C', 'M', 'Y', 'K'].slice(0, stations >= 4 ? 4 : stations).map((c) => {
                const key = c.toLowerCase();
                return (
                  <div key={c} className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3">
                    <span className="w-8 text-center text-sm font-black text-[var(--text-dim)]">{c}</span>
                    <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Life (σελίδες)</span><NumInput value={data[`dev_${key}_life`]} onChange={(v) => onChange(`dev_${key}_life`, v)} /></div>
                    <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Κόστος €</span><NumInput value={data[`dev_${key}_cost`]} onChange={(v) => onChange(`dev_${key}_cost`, v)} step="0.01" /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Coronas — precision mode */}
      {mode === 'precision' && inkType === 'toner' && (
        <div className="border-t border-[var(--border)] pt-4">
          <label className={labelCls}>Charge Coronas</label>
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => onChange('has_charge_coronas', !data.has_charge_coronas)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-all ${data.has_charge_coronas ? 'border-[var(--accent)] bg-[rgba(245,130,32,0.12)] text-[var(--accent)]' : 'border-[var(--glass-border)] text-[var(--text-muted)]'}`}>
              {data.has_charge_coronas ? 'Ναι — Έχει' : 'Όχι'}
            </button>
          </div>
          {!!data.has_charge_coronas && (
            <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3">
              <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Life (σελίδες)</span><NumInput value={data.corona_life} onChange={(v) => onChange('corona_life', v)} /></div>
              <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Κόστος €</span><NumInput value={data.corona_cost} onChange={(v) => onChange('corona_cost', v)} step="0.01" /></div>
            </div>
          )}
        </div>
      )}

      {/* Service Parts — precision mode (fuser, belt, waste) */}
      {mode === 'precision' && (
        <div className="border-t border-[var(--border)] pt-4">
          <label className={labelCls}>Service Parts</label>
          <div className="space-y-2">
            {[
              { label: 'Fuser', life: 'fuser_life', cost: 'fuser_cost' },
              { label: 'Transfer Belt', life: 'belt_life', cost: 'belt_cost' },
              { label: 'Waste Toner', life: 'waste_life', cost: 'waste_cost' },
            ].map((p) => (
              <div key={p.label} className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3">
                <span className="w-28 text-sm font-semibold text-[var(--text-dim)]">{p.label}</span>
                <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Life (σελίδες)</span><NumInput value={data[p.life]} onChange={(v) => onChange(p.life, v)} /></div>
                <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Κόστος €</span><NumInput value={data[p.cost]} onChange={(v) => onChange(p.cost, v)} step="0.01" /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liquid Ink — for HP Indigo / inkjet */}
      {(mode === 'simple_out' || mode === 'precision') && inkType === 'liquid' && (
        <div className="border-t border-[var(--border)] pt-4">
          <label className={labelCls}>Liquid Ink</label>
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3">
              <span className="w-28 text-sm font-semibold text-[var(--text-dim)]">Ink Can</span>
              <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Yield (σελίδες)</span><NumInput value={data.ink_can_yield} onChange={(v) => onChange('ink_can_yield', v)} /></div>
              <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Κόστος €</span><NumInput value={data.ink_can_cost} onChange={(v) => onChange('ink_can_cost', v)} step="0.01" /></div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3">
              <span className="w-28 text-sm font-semibold text-[var(--text-dim)]">Impression</span>
              <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Charge €/impression</span><NumInput value={data.impression_charge} onChange={(v) => onChange('impression_charge', v)} step="0.001" /></div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3">
              <span className="w-28 text-sm font-semibold text-[var(--text-dim)]">Blanket</span>
              <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Life (σελίδες)</span><NumInput value={data.blanket_life} onChange={(v) => onChange('blanket_life', v)} /></div>
              <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Κόστος €</span><NumInput value={data.blanket_cost} onChange={(v) => onChange('blanket_cost', v)} step="0.01" /></div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3">
              <span className="w-28 text-sm font-semibold text-[var(--text-dim)]">PIP</span>
              <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Life (σελίδες)</span><NumInput value={data.pip_life} onChange={(v) => onChange('pip_life', v)} /></div>
              <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Κόστος €</span><NumInput value={data.pip_cost} onChange={(v) => onChange('pip_cost', v)} step="0.01" /></div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3">
              <span className="w-28 text-sm font-semibold text-[var(--text-dim)]">Mixing Fee</span>
              <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">€/εργασία</span><NumInput value={data.mixing_fee} onChange={(v) => onChange('mixing_fee', v)} step="0.01" /></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepSpeedZones({ data, onChange }: { data: Data; onChange: OnChange }) {
  const zones = (data.speed_zones as Array<{ name: string; gsm_from: number; gsm_to: number; ppm: number; markup: number }>) ?? [];

  function updateZone(i: number, field: string, val: unknown) {
    const updated = zones.map((z, idx) => idx === i ? { ...z, [field]: val } : z);
    onChange('speed_zones', updated);
  }
  function addZone() {
    const last = zones[zones.length - 1];
    onChange('speed_zones', [...zones, { name: 'New', gsm_from: (last?.gsm_to ?? 0) + 1, gsm_to: (last?.gsm_to ?? 0) + 50, ppm: 20, markup: 15 }]);
  }
  function delZone(i: number) {
    onChange('speed_zones', zones.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-dim)]">
        Ορίστε ζώνες ταχύτητας ανά βάρος χαρτιού. Βαρύτερα χαρτιά = αργότερη ταχύτητα + markup.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
              <th className="px-2 py-1 text-left">Ζώνη</th>
              <th className="px-2 py-1 text-center">GSM Από</th>
              <th className="px-2 py-1 text-center">GSM Έως</th>
              <th className="px-2 py-1 text-center">PPM</th>
              <th className="px-2 py-1 text-center">+%</th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z, i) => (
              <tr key={i} className="border-t border-[var(--border)]">
                <td className="px-1 py-1"><input className={inputCls + " !h-8 text-xs"} value={z.name} onChange={(e) => updateZone(i, 'name', e.target.value)} /></td>
                <td className="px-1 py-1"><input className={inputCls + " !h-8 text-xs text-center"} type="number" value={z.gsm_from} onChange={(e) => updateZone(i, 'gsm_from', +e.target.value)} /></td>
                <td className="px-1 py-1"><input className={inputCls + " !h-8 text-xs text-center"} type="number" value={z.gsm_to} onChange={(e) => updateZone(i, 'gsm_to', +e.target.value)} /></td>
                <td className="px-1 py-1"><input className={inputCls + " !h-8 text-xs text-center"} type="number" value={z.ppm} onChange={(e) => updateZone(i, 'ppm', +e.target.value)} /></td>
                <td className="px-1 py-1"><input className={inputCls + " !h-8 text-xs text-center"} type="number" value={z.markup} onChange={(e) => updateZone(i, 'markup', +e.target.value)} /></td>
                <td className="px-1 py-1"><button onClick={() => delZone(i)} className="text-[var(--text-muted)] hover:text-[var(--danger)]">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addZone} className="w-full rounded-lg border border-dashed border-[var(--glass-border)] py-2 text-sm font-semibold text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]">
        + Προσθήκη Ζώνης
      </button>
    </div>
  );
}

function StepProduction({ data, onChange }: { data: Data; onChange: OnChange }) {
  const depCost = data.include_depreciation && data.machine_cost && data.machine_lifetime_passes
    ? ((data.machine_cost as number) / (data.machine_lifetime_passes as number)).toFixed(4)
    : null;
  return (
    <div className="space-y-5">
      <div>
        <label className={labelCls}>Setup & Φύρα</label>
        <div className="grid grid-cols-3 gap-3">
          <div><span className="text-[0.6rem] text-[var(--text-muted)]">Φύρα Setup (φύλλα)</span><NumInput value={data.setup_sheets_waste} onChange={(v) => onChange('setup_sheets_waste', v)} /></div>
          <div><span className="text-[0.6rem] text-[var(--text-muted)]">Φύρα Εκτύπωσης (%)</span><NumInput value={data.registration_spoilage_pct} onChange={(v) => onChange('registration_spoilage_pct', v)} /></div>
          <div><span className="text-[0.6rem] text-[var(--text-muted)]">Warmup (λεπτά)</span><NumInput value={data.warmup_minutes} onChange={(v) => onChange('warmup_minutes', v)} /></div>
        </div>
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        <div className="flex items-center gap-3 mb-3">
          <label className="text-sm font-semibold">Απόσβεση</label>
          <button
            onClick={() => onChange('include_depreciation', !data.include_depreciation)}
            className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${data.include_depreciation ? 'bg-[var(--accent)] text-white' : 'bg-white/5 text-[var(--text-muted)]'}`}
          >
            {data.include_depreciation ? 'ON' : 'OFF'}
          </button>
        </div>
        {!!data.include_depreciation && (
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-[0.6rem] text-[var(--text-muted)]">Κόστος Μηχανής (€)</span><NumInput value={data.machine_cost} onChange={(v) => onChange('machine_cost', v)} /></div>
            <div><span className="text-[0.6rem] text-[var(--text-muted)]">Όριο Ζωής (περάσματα)</span><NumInput value={data.machine_lifetime_passes} onChange={(v) => onChange('machine_lifetime_passes', v)} /></div>
            {depCost && <p className="col-span-2 text-sm text-[var(--success)]">Απόσβεση / click: €{depCost}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function StepMaintenance({ data, onChange }: { data: Data; onChange: OnChange }) {
  const techs = (data.dig_techs as Array<{ role: string; name: string; phone: string }>) ?? [];

  function addTech() {
    onChange('dig_techs', [...techs, { role: '', name: '', phone: '' }]);
  }
  function updateTech(i: number, field: string, val: string) {
    onChange('dig_techs', techs.map((t, idx) => idx === i ? { ...t, [field]: val } : t));
  }
  function delTech(i: number) {
    onChange('dig_techs', techs.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-5">
      <div>
        <label className={labelCls}>Κατάσταση Μηχανής</label>
        <div className="grid grid-cols-2 gap-3">
          <div><span className="text-[0.6rem] text-[var(--text-muted)]">Counter</span><NumInput value={data.current_counter} onChange={(v) => onChange('current_counter', v)} /></div>
          <div><span className="text-[0.6rem] text-[var(--text-muted)]">Τελευταίο Service</span><input className={inputCls} type="date" value={(data.last_service_date as string) ?? ''} onChange={(e) => onChange('last_service_date', e.target.value)} /></div>
        </div>
      </div>

      <div>
        <label className={labelCls}>Σημειώσεις</label>
        <textarea className={inputCls + " !h-16 py-2 resize-none"} value={(data.notes as string) ?? ''} onChange={(e) => onChange('notes', e.target.value)} placeholder="Σημειώσεις μηχανής..." />
      </div>

      <div>
        <label className={labelCls}>Τεχνικοί</label>
        {techs.map((t, i) => (
          <div key={i} className="mb-2 flex items-center gap-2">
            <input className={inputCls + " !w-28"} value={t.role} onChange={(e) => updateTech(i, 'role', e.target.value)} placeholder="Ειδικότητα" />
            <input className={inputCls + " !w-32"} value={t.name} onChange={(e) => updateTech(i, 'name', e.target.value)} placeholder="Όνομα" />
            <input className={inputCls + " !w-28"} value={t.phone} onChange={(e) => updateTech(i, 'phone', e.target.value)} placeholder="Τηλέφωνο" />
            <button onClick={() => delTech(i)} className="text-[var(--text-muted)] hover:text-[var(--danger)]">×</button>
          </div>
        ))}
        <button onClick={addTech} className="text-sm font-semibold text-[var(--accent)]">+ Προσθήκη Τεχνικού</button>
      </div>

      <div>
        <label className={labelCls}>Εγχειρίδια</label>
        <div className="grid grid-cols-2 gap-3">
          <div><span className="text-[0.6rem] text-[var(--text-muted)]">Manual URL</span><input className={inputCls} value={(data.manual_url as string) ?? ''} onChange={(e) => onChange('manual_url', e.target.value)} placeholder="https://..." /></div>
          <div><span className="text-[0.6rem] text-[var(--text-muted)]">Driver URL</span><input className={inputCls} value={(data.driver_url as string) ?? ''} onChange={(e) => onChange('driver_url', e.target.value)} placeholder="https://..." /></div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN RENDERER ───
export function renderDigitalStep(stepId: string, data: Data, onChange: OnChange): React.ReactNode {
  switch (stepId) {
    case 'welcome': return <StepWelcome />;
    case 'ai_scan': return <StepAiScan data={data} onChange={onChange} />;
    case 'ink_type': return <StepInkType data={data} onChange={onChange} />;
    case 'specs': return <StepSpecs data={data} onChange={onChange} />;
    case 'media': return <StepMedia data={data} onChange={onChange} />;
    case 'color_stations': return <StepColorStations data={data} onChange={onChange} />;
    case 'extra_colors': return <StepExtraColors data={data} onChange={onChange} />;
    case 'cost_model': return <StepCostModel data={data} onChange={onChange} />;
    case 'costs': return <StepCosts data={data} onChange={onChange} />;
    case 'speed_zones': return <StepSpeedZones data={data} onChange={onChange} />;
    case 'production': return <StepProduction data={data} onChange={onChange} />;
    case 'maintenance': return <StepMaintenance data={data} onChange={onChange} />;
    default: return <p>Unknown step: {stepId}</p>;
  }
}
