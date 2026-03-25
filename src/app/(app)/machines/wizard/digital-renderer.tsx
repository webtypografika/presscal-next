'use client';

import { useState } from 'react';
import { Printer, Droplet, Zap, BookOpen, Scissors, PinIcon, CircleDot, GripVertical, CheckCircle, AlertTriangle } from 'lucide-react';
import { aiScanDigital } from './ai-scan-action';

type OnChange = (field: string, value: unknown) => void;
type Data = Record<string, unknown>;

// Shared UI helpers
const inputCls = "h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 no-spinners";
const labelCls = "text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block";

function fmtNum(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toLocaleString('el-GR', { maximumFractionDigits: 4 });
}

function NumInput({ value, onChange, placeholder, step }: { value: unknown; onChange: (v: number | null) => void; placeholder?: string; step?: string }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const isDecimal = step && parseFloat(step) < 1;

  function handleChange(raw: string) {
    // Strip everything except digits, dot, comma, minus
    const clean = raw.replace(/[^\d.,-]/g, '');
    // Parse: replace comma with dot for parsing
    const parsed = parseFloat(clean.replace(/\./g, '').replace(',', '.'));

    if (clean === '' || clean === '-') {
      setText(clean);
      onChange(null);
      return;
    }

    if (!isNaN(parsed)) {
      onChange(parsed);
      // Format live: for decimals keep raw input, for integers add thousand separators
      if (isDecimal) {
        setText(clean);
      } else {
        // Format with dots but keep cursor-friendly
        const formatted = Math.round(parsed).toLocaleString('el-GR');
        setText(formatted);
      }
    } else {
      setText(clean);
    }
  }

  function handleFocus() {
    setFocused(true);
    // Show current value formatted
    const v = value as number | null;
    if (v !== null && v !== undefined) {
      if (isDecimal) {
        setText(String(v));
      } else {
        setText(Math.round(v).toLocaleString('el-GR'));
      }
    } else {
      setText('');
    }
  }

  function handleBlur() {
    setFocused(false);
  }

  const display = focused ? text : fmtNum(value);

  return (
    <input
      className={inputCls + " text-center"}
      type="text"
      inputMode={isDecimal ? 'decimal' : 'numeric'}
      value={display}
      onChange={(e) => handleChange(e.target.value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
    />
  );
}

const CMYK_COLORS = [
  { name: 'Cyan', key: 'c', cls: 'text-cyan-400' },
  { name: 'Magenta', key: 'm', cls: 'text-pink-400' },
  { name: 'Yellow', key: 'y', cls: 'text-yellow-400' },
  { name: 'Black', key: 'k', cls: 'text-gray-400' },
];

function getColorStations(stations: number) {
  if (stations >= 4) return CMYK_COLORS;
  if (stations === 1) return [CMYK_COLORS[3]]; // Black only
  // Duo or other < 4: use Station 1, Station 2 etc with generic styling
  return Array.from({ length: stations }, (_, i) => ({
    name: `Σταθμός ${i + 1}`,
    key: CMYK_COLORS[i]?.key ?? `s${i + 1}`,
    cls: CMYK_COLORS[i]?.cls ?? 'text-[var(--text-dim)]',
  }));
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
        className="flex items-center gap-2 rounded-lg border border-[var(--blue)] bg-[var(--blue)]/10 px-5 py-2.5 text-sm font-bold text-[var(--blue)] transition-all hover:bg-[var(--blue)]/20 disabled:opacity-40"
      >
        <Zap className="h-4 w-4" />
        {scanning ? 'Αναζήτηση...' : 'AI Scan'}
      </button>

      {scanning && (
        <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-4 text-sm text-[var(--text-dim)]">
          <div className="h-4 w-4 shrink-0 rounded-full border-2 border-[var(--blue)] border-t-transparent animate-spin" />
          Αναζήτηση προδιαγραφών & αναλωσίμων για &quot;{data.name as string}&quot;...
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
  const options = [
    { v: 'toner', l: 'Toner', desc: 'Σκόνη σε κασέτα — CMYK', Icon: Printer, examples: 'Konica, Ricoh, Xerox, Canon' },
    { v: 'liquid', l: 'Liquid Ink', desc: 'Υγρό ink — ElectroInk / Inkjet', Icon: Droplet, examples: 'HP Indigo, Riso ComColor' },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {options.map((t) => (
          <button
            key={t.v}
            onClick={() => onChange('ink_type', t.v)}
            className={`flex flex-col items-center gap-4 rounded-xl border-2 p-8 text-center transition-all ${ink === t.v ? 'border-[var(--blue)] bg-[var(--blue)]/8' : 'border-[var(--glass-border)] hover:border-[var(--border-hover)]'}`}
          >
            <div className={`flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all ${ink === t.v ? 'border-[var(--blue)]/40 bg-[var(--blue)]/10 text-[var(--blue)]' : 'border-[var(--glass-border)] bg-white/[0.03] text-[var(--text-muted)]'}`}>
              <t.Icon className="h-6 w-6" />
            </div>
            <span className="text-base font-bold">{t.l}</span>
            <span className="text-[0.75rem] text-[var(--text-muted)]">{t.desc}</span>
          </button>
        ))}
      </div>
      {ink && (
        <div className="rounded-lg bg-white/[0.03] px-4 py-3">
          <span className="text-[0.6rem] font-bold uppercase tracking-widest text-[var(--text-muted)]">Παραδείγματα</span>
          <p className="mt-1 text-sm text-[var(--text-dim)]">{options.find(o => o.v === ink)?.examples}</p>
        </div>
      )}
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
  const options = [
    { v: 1, l: 'Mono', d: 'Ασπρόμαυρη εκτύπωση', icon: '●',
      examples: 'Riso SF5450, Ricoh Pro 8300, Konica Minolta 758' },
    { v: 2, l: 'Duo', d: '2 κανάλια χρώματος', icon: '●●',
      examples: 'Riso ComColor FW5000, Riso SF9450 (Black + Red)' },
    { v: 4, l: 'CMYK', d: 'Full color (standard)', icon: '●●●●',
      examples: 'Konica C4080, Ricoh C9200, Xerox Versant 4100, Canon C910' },
    { v: 5, l: 'CMYK + Special', d: 'Full color + ειδικά χρώματα', icon: '●●●●+',
      examples: 'HP Indigo 7K (White/Silver), Xerox Iridesse (Gold/Clear/White), Ricoh Pro C9500 (White/Clear/Neon)' },
  ];
  const currentVal = (data.color_stations as number) ?? 4;
  const displayVal = currentVal >= 5 ? 5 : currentVal;
  const selected = options.find(o => o.v === displayVal);

  function handleSelect(v: number) {
    if (v < 5) {
      onChange('has_special_colors', false);
      onChange('color_stations', v);
      // Clear color fields not applicable to lower station count
      if (v < 2) {
        onChange('click_a4_color', null);
        onChange('click_a3_color', null);
        onChange('click_banner_color', null);
      }
    } else {
      onChange('has_special_colors', true);
      if (currentVal < 5) onChange('color_stations', 5);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {options.map((o) => (
          <button
            key={o.v}
            onClick={() => handleSelect(o.v)}
            className={`flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all ${displayVal === o.v ? 'border-[var(--blue)] bg-[var(--blue)]/8' : 'border-[var(--glass-border)] hover:border-[var(--border-hover)]'}`}
          >
            <span className="text-lg tracking-widest" style={{ color: 'var(--blue)' }}>{o.icon}</span>
            <span className="text-base font-bold">{o.l}</span>
            <span className="text-[0.7rem] text-[var(--text-muted)]">{o.d}</span>
          </button>
        ))}
      </div>

      {/* Examples for selected category */}
      {selected && (
        <div className="rounded-lg bg-white/[0.03] px-4 py-3">
          <span className="text-[0.6rem] font-bold uppercase tracking-widest text-[var(--text-muted)]">Παραδείγματα μοντέλων</span>
          <p className="mt-1 text-sm text-[var(--text-dim)]">{selected.examples}</p>
        </div>
      )}
    </div>
  );
}

function StepExtraColors({ data, onChange }: { data: Data; onChange: OnChange }) {
  const stationCount = ((data.extra_station_count as number) ?? 1);

  function setStationCount(count: number) {
    onChange('extra_station_count', count);
    onChange('color_stations', 4 + count);
  }

  return (
    <div className="space-y-6">
      {/* Section: Number of extra stations */}
      <div className="flex gap-6">
        <div className="w-28 shrink-0 pt-1">
          <h4 className="text-sm font-black uppercase tracking-wide">Σταθμοί</h4>
          <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">Φυσικοί extra</p>
        </div>
        <div className="flex-1">
          <p className="text-sm text-[var(--text-dim)] mb-3">Πόσους φυσικούς extra σταθμούς έχει η μηχανή;</p>
          <div className="flex gap-3">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => setStationCount(n)}
                className={`flex-1 rounded-xl border-2 py-5 text-center transition-all ${stationCount === n ? 'border-[var(--accent)] bg-[var(--accent)]/8' : 'border-[var(--glass-border)] hover:border-[var(--border-hover)]'}`}
              >
                <span className="text-2xl font-black">{n}</span>
                <p className="text-[0.7rem] text-[var(--text-muted)] mt-1">σταθμ{n === 1 ? 'ός' : 'οί'}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-lg bg-white/[0.03] px-4 py-3">
        <p className="text-sm text-[var(--text-dim)]">
          Τα ειδικά χρώματα (White, Gold, Clear κλπ) και τα αναλώσιμά τους ορίζονται στο κοστολόγιο κάθε εργασίας.
          Αν η δουλειά χρειάζεται περισσότερα χρώματα από τους σταθμούς, θα χρειαστεί επιπλέον πέρασμα.
        </p>
      </div>

      {/* Examples */}
      <div className="rounded-lg bg-white/[0.03] px-4 py-3">
        <span className="text-[0.6rem] font-bold uppercase tracking-widest text-[var(--text-muted)]">Παραδείγματα</span>
        <div className="mt-2 space-y-1 text-sm text-[var(--text-dim)]">
          <p><strong className="text-[var(--text)]">1 σταθμός:</strong> Ricoh C7500, Xerox iGen 5</p>
          <p><strong className="text-[var(--text)]">2 σταθμοί:</strong> Xerox Iridesse, Fujifilm Revoria</p>
          <p><strong className="text-[var(--text)]">3 σταθμοί:</strong> HP Indigo 7K (7 BIDs), Fujifilm Revoria PC1120</p>
        </div>
      </div>
    </div>
  );
}

function StepCostModel({ data, onChange }: { data: Data; onChange: OnChange }) {
  const isInk = data.ink_type === 'liquid';
  const models = [
    {
      v: 'simple_in',
      l: 'Simple — Αναλώσιμα στο CPC',
      d: isInk
        ? 'Ink, blanket, PIP περιλαμβάνονται στη χρέωση click. Συμβόλαιο HP/αντιπροσωπείας.'
        : 'Toner, drums, service περιλαμβάνονται στη χρέωση click. Συμβόλαιο αντιπροσωπείας.',
      tags: ['Συμβόλαιο', 'Γρήγορο'],
      detail: 'Μόνο Click Cost (€/σελίδα)',
    },
    {
      v: 'simple_out',
      l: isInk ? 'Simple — Ink εκτός CPC' : 'Simple — Toner εκτός CPC',
      d: isInk
        ? 'CPC + αγοράζετε ink cans ξεχωριστά. Blanket/PIP στο service.'
        : 'CPC + αγοράζετε toner ξεχωριστά. Drums/service στο συμβόλαιο.',
      tags: ['Ελεύθερα', 'Αποθήκη'],
      detail: isInk ? 'Click + Ink Can yield/cost' : 'Click + Toner yield/cost',
    },
    {
      v: 'precision',
      l: 'Precision — Πλήρης Ανάλυση',
      d: isInk
        ? 'Αναλυτικό: ink cans, blanket (BID), PIP, impression charge, mixing fee.'
        : 'Αναλυτικό: toner, drums, developer, fuser, belt, coronas, waste.',
      tags: ['Ελεύθερα', 'Ακρίβεια'],
      detail: isInk
        ? 'Ink + Blanket + PIP + Impression + Mixing'
        : 'Toner + Drums + Developer + Fuser + Belt + Waste',
    },
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
          <div className="mt-2 flex items-center gap-2">
            {m.tags.map((t) => (
              <span key={t} className="rounded-full bg-[var(--blue)]/10 px-2 py-0.5 text-[0.6rem] font-semibold text-[var(--blue)]">{t}</span>
            ))}
            <span className="ml-auto text-[0.6rem] text-[var(--text-muted)]">{m.detail}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function calcCostPreview(data: Data) {
  const mode = data.cost_mode as string;
  const inkType = data.ink_type as string;
  const stations = (data.color_stations as number) ?? 4;
  const n = (v: unknown) => (typeof v === 'number' && v > 0) ? v : 0;
  const div = (cost: unknown, life: unknown) => { const c = n(cost); const l = n(life); return l > 0 ? c / l : 0; };

  if (mode === 'simple_in') {
    return {
      a4_color: n(data.click_a4_color),
      a4_bw: n(data.click_a4_bw),
      a3_color: n(data.click_a3_color) || n(data.click_a4_color) * 2,
      a3_bw: n(data.click_a3_bw) || n(data.click_a4_bw) * 2,
      cons_a4_color: 0, cons_a4_bw: 0,
      breakdown: null,
    };
  }

  if (inkType === 'liquid') {
    // HP Indigo calculation
    const inkPerImp = div(data.ink_can_cost, data.ink_can_yield);
    const blanketPerImp = div(data.blanket_cost, data.blanket_life);
    const pipPerImp = div(data.pip_cost, data.pip_life);
    const impCharge = n(data.impression_charge);
    const costPerImp = inkPerImp + blanketPerImp + pipPerImp + impCharge;

    if (mode === 'simple_out') {
      const cpc_a4_color = n(data.click_a4_color);
      const cpc_a4_bw = n(data.click_a4_bw);
      const consColor = inkPerImp * (stations >= 4 ? 4 : stations);
      const consBw = inkPerImp;
      return {
        a4_color: cpc_a4_color + consColor,
        a4_bw: cpc_a4_bw + consBw,
        a3_color: (n(data.click_a3_color) || cpc_a4_color * 2) + consColor * 2,
        a3_bw: (n(data.click_a3_bw) || cpc_a4_bw * 2) + consBw * 2,
        cons_a4_color: consColor, cons_a4_bw: consBw,
        breakdown: { ink: inkPerImp, cpc_color: cpc_a4_color, cpc_bw: cpc_a4_bw },
      };
    }
    // precision — include extra ink stations
    const colorImps = stations >= 4 ? 4 : stations;
    const extraCount = Math.max(0, stations - 4);
    let extraInk = 0;
    for (let i = 1; i <= extraCount; i++) {
      extraInk += div(data[`ink_extra_${i}_cost`], data[`ink_extra_${i}_yield`]);
    }
    const totalLiquid = costPerImp * colorImps + extraInk;
    return {
      a4_color: totalLiquid,
      a4_bw: costPerImp,
      a3_color: totalLiquid * 2,
      a3_bw: costPerImp * 2,
      cons_a4_color: totalLiquid, cons_a4_bw: costPerImp,
      breakdown: { ink: inkPerImp, blanket: blanketPerImp, pip: pipPerImp, impression: impCharge, extraInk },
    };
  }

  // Toner calculations
  const tonerColor = div(data.toner_c_cost, data.toner_c_yield)
    + div(data.toner_m_cost, data.toner_m_yield)
    + div(data.toner_y_cost, data.toner_y_yield)
    + div(data.toner_k_cost, data.toner_k_yield);
  const tonerBw = div(data.toner_k_cost, data.toner_k_yield);

  if (mode === 'simple_out') {
    const cpc_a4_color = n(data.click_a4_color);
    const cpc_a4_bw = n(data.click_a4_bw);
    return {
      a4_color: cpc_a4_color + tonerColor,
      a4_bw: cpc_a4_bw + tonerBw,
      a3_color: (n(data.click_a3_color) || cpc_a4_color * 2) + tonerColor * 2,
      a3_bw: (n(data.click_a3_bw) || cpc_a4_bw * 2) + tonerBw * 2,
      cons_a4_color: tonerColor, cons_a4_bw: tonerBw,
      breakdown: { toner_color: tonerColor, toner_bw: tonerBw, cpc_color: cpc_a4_color, cpc_bw: cpc_a4_bw },
    };
  }

  // Precision toner
  const drumColor = div(data.drum_c_cost, data.drum_c_life) + div(data.drum_m_cost, data.drum_m_life)
    + div(data.drum_y_cost, data.drum_y_life) + div(data.drum_k_cost, data.drum_k_life);
  const drumBw = div(data.drum_k_cost, data.drum_k_life);
  let devColor = 0, devBw = 0;
  if (data.developer_type === 'separate') {
    devColor = div(data.dev_c_cost, data.dev_c_life) + div(data.dev_m_cost, data.dev_m_life)
      + div(data.dev_y_cost, data.dev_y_life) + div(data.dev_k_cost, data.dev_k_life);
    devBw = div(data.dev_k_cost, data.dev_k_life);
  }

  // Extra color consumables
  const extraCount = Math.max(0, stations - 4);
  let extraToner = 0, extraDrum = 0, extraDev = 0;
  for (let i = 1; i <= extraCount; i++) {
    extraToner += div(data[`extra_color_${i}_cost`], data[`extra_color_${i}_yield`]);
    extraDrum += div(data[`drum_extra_${i}_cost`], data[`drum_extra_${i}_life`]);
    if (data.developer_type === 'separate') {
      extraDev += div(data[`dev_extra_${i}_cost`], data[`dev_extra_${i}_life`]);
    }
  }

  const fuser = div(data.fuser_cost, data.fuser_life);
  const belt = div(data.belt_cost, data.belt_life);
  const waste = div(data.waste_cost, data.waste_life);
  const coronaPer = data.has_charge_coronas ? div(data.corona_cost, data.corona_life) : 0;
  const colorStationCount = stations >= 4 ? 4 : stations;
  const corona = coronaPer * colorStationCount;
  const coronaBw = coronaPer;
  const shared = fuser + belt + waste;

  const totalColor = tonerColor + drumColor + devColor + extraToner + extraDrum + extraDev + shared + corona;
  const totalBw = tonerBw + drumBw + devBw + shared + coronaBw;

  return {
    a4_color: totalColor,
    a4_bw: totalBw,
    a3_color: totalColor * 2,
    a3_bw: totalBw * 2,
    cons_a4_color: totalColor, cons_a4_bw: totalBw,
    breakdown: { toner_color: tonerColor, drums: drumColor, dev: devColor, shared, corona },
  };
}

function CostPreview({ data }: { data: Data }) {
  const p = calcCostPreview(data);
  const fmt = (v: number) => v > 0 ? `€${v.toLocaleString('el-GR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : '—';
  const stations = (data.color_stations as number) ?? 4;
  const mode = data.cost_mode as string;
  const isInk = data.ink_type === 'liquid';
  const showCons = (mode === 'simple_out' || mode === 'precision') && (p.cons_a4_color > 0 || p.cons_a4_bw > 0);

  const consName = isInk ? 'Ink' : 'Toner';
  const rows: Array<{ label: string; color: string; bw: string }> = [
    { label: 'A4 αναλώσιμα', color: fmt(p.a4_color), bw: fmt(p.a4_bw) },
    { label: 'A3 αναλώσιμα', color: fmt(p.a3_color), bw: fmt(p.a3_bw) },
  ];
  if (showCons) {
    rows.push(
      { label: `A4 αναλώσιμα + ${consName}`, color: fmt(p.cons_a4_color), bw: fmt(p.cons_a4_bw) },
      { label: `A3 αναλώσιμα + ${consName}`, color: fmt(p.cons_a4_color > 0 ? p.cons_a4_color * 2 : 0), bw: fmt(p.cons_a4_bw > 0 ? p.cons_a4_bw * 2 : 0) },
    );
  }

  return (
    <div className="border-t border-[var(--border)] pt-5">
      <div className="flex gap-6">
        <div className="w-28 shrink-0 pt-1">
          <h4 className="text-sm font-black uppercase tracking-wide">Άθροισμα</h4>
          <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">Κόστος / όψη</p>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 px-3 mb-2">
            <span className="w-36" />
            {stations >= 2 && <span className="flex-1 text-[0.6rem] font-semibold text-[var(--text-muted)] text-center">Color</span>}
            <span className="flex-1 text-[0.6rem] font-semibold text-[var(--text-muted)] text-center">B&W</span>
          </div>
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3 mb-2">
              <span className="w-36 text-sm font-semibold text-[var(--text-dim)]">{r.label}</span>
              {stations >= 2 && <span className="flex-1 text-center text-sm font-black">{r.color}</span>}
              <span className="flex-1 text-center text-sm font-black">{r.bw}</span>
            </div>
          ))}
          <p className="text-[0.6rem] text-[var(--text-muted)] mt-1">* 5% coverage · A3 = 2× A4</p>
        </div>
      </div>
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
      {/* CPC — Click costs — only for simple modes */}
      {(mode === 'simple_in' || mode === 'simple_out') && (
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
      )}

      {/* Extra color click costs — only for simple modes */}
      {(mode === 'simple_in' || mode === 'simple_out') && extraCount > 0 && (
        <div>
          <label className={labelCls}>Extra Color Click Costs (€/όψη)</label>
          <div className="space-y-2">
            {Array.from({ length: extraCount }).map((_, i) => {
              const name = `Σταθμός ${i + 1}`;
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

      {/* Duplex click multiplier — only relevant for simple modes */}
      {(mode === 'simple_in' || mode === 'simple_out') && (
        <div>
          <label className={labelCls}>Duplex Click Multiplier</label>
          <p className="text-[0.65rem] text-[var(--text-dim)] mb-1">Πόσα clicks χρεώνει η 2η όψη (2 = διπλάσιο, 1 = ίδιο)</p>
          <NumInput value={data.duplex_click_multiplier} onChange={(v) => onChange('duplex_click_multiplier', v)} placeholder="2" />
        </div>
      )}

      {/* ─── TONER CONSUMABLES (simple_out / precision) ─── */}
      {(mode === 'simple_out' || mode === 'precision') && inkType === 'toner' && (
        <div className="border-t border-[var(--border)] pt-5">
          {/* Section: ΧΡΩΜΑ */}
          <div className="flex gap-6">
            <div className="w-28 shrink-0 pt-2">
              <h4 className="text-sm font-black uppercase tracking-wide">Χρώμα</h4>
              <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">@ 5% coverage</p>
            </div>
            <div className="flex-1 space-y-2">
              {/* Header */}
              <div className="flex items-center gap-3 px-3">
                <span className="w-20" />
                <span className="flex-1 text-[0.6rem] font-semibold text-[var(--text-muted)]">Yield (σελίδες)</span>
                <span className="flex-1 text-[0.6rem] font-semibold text-[var(--text-muted)]">Cost €</span>
              </div>
              {getColorStations(stations).map((c) => (
                  <div key={c.key} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
                    <span className={`w-20 text-sm font-bold ${c.cls}`}>{c.name}</span>
                    <div className="flex-1"><NumInput value={data[`toner_${c.key}_yield`]} onChange={(v) => onChange(`toner_${c.key}_yield`, v)} /></div>
                    <div className="flex-1"><NumInput value={data[`toner_${c.key}_cost`]} onChange={(v) => onChange(`toner_${c.key}_cost`, v)} step="0.01" /></div>
                  </div>
              ))}
            </div>
          </div>

          {/* Section: EXTRA */}
          {extraCount > 0 && (
            <div className="flex gap-6 mt-4">
              <div className="w-28 shrink-0 pt-2">
                <h4 className="text-sm font-black uppercase tracking-wide">Extra</h4>
                <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">{extraCount} special χρώμ{extraCount === 1 ? 'α' : 'ατα'}</p>
              </div>
              <div className="flex-1 space-y-2">
                {Array.from({ length: extraCount }).map((_, i) => {
                  const name = `Σταθμός ${i + 1}`;
                  return (
                    <div key={i} className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--accent)]/30 bg-white/[0.02] p-3">
                      <span className="w-20 text-sm font-bold text-[var(--accent)]">{name}</span>
                      <div className="flex-1"><NumInput value={data[`extra_color_${i + 1}_yield`]} onChange={(v) => onChange(`extra_color_${i + 1}_yield`, v)} /></div>
                      <div className="flex-1"><NumInput value={data[`extra_color_${i + 1}_cost`]} onChange={(v) => onChange(`extra_color_${i + 1}_cost`, v)} step="0.01" /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── DRUMS (precision only) ─── */}
      {mode === 'precision' && inkType === 'toner' && (
        <div className="border-t border-[var(--border)] pt-5">
          <div className="flex gap-6">
            <div className="w-28 shrink-0 pt-2">
              <h4 className="text-sm font-black uppercase tracking-wide">Drums</h4>
              <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">Life & Cost</p>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-3 px-3">
                <span className="w-20" />
                <span className="flex-1 text-[0.6rem] font-semibold text-[var(--text-muted)]">Life (σελίδες)</span>
                <span className="flex-1 text-[0.6rem] font-semibold text-[var(--text-muted)]">Cost €</span>
              </div>
              {getColorStations(stations).map((c) => (
                  <div key={c.key} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
                    <span className={`w-20 text-sm font-bold ${c.cls}`}>{c.name}</span>
                    <div className="flex-1"><NumInput value={data[`drum_${c.key}_life`]} onChange={(v) => onChange(`drum_${c.key}_life`, v)} /></div>
                    <div className="flex-1"><NumInput value={data[`drum_${c.key}_cost`]} onChange={(v) => onChange(`drum_${c.key}_cost`, v)} step="0.01" /></div>
                  </div>
              ))}
              {extraCount > 0 && Array.from({ length: extraCount }).map((_, i) => {
                const name = `Σταθμός ${i + 1}`;
                return (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--accent)]/30 bg-white/[0.02] p-3">
                    <span className="w-20 text-sm font-bold text-[var(--accent)]">{name}</span>
                    <div className="flex-1"><NumInput value={data[`drum_extra_${i + 1}_life`]} onChange={(v) => onChange(`drum_extra_${i + 1}_life`, v)} /></div>
                    <div className="flex-1"><NumInput value={data[`drum_extra_${i + 1}_cost`]} onChange={(v) => onChange(`drum_extra_${i + 1}_cost`, v)} step="0.01" /></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── DEVELOPER (precision only) ─── */}
      {mode === 'precision' && inkType === 'toner' && (
        <div className="border-t border-[var(--border)] pt-5">
          <div className="flex gap-6">
            <div className="w-28 shrink-0 pt-2">
              <h4 className="text-sm font-black uppercase tracking-wide">Developer</h4>
              <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">Life & Cost</p>
            </div>
            <div className="flex-1 space-y-3">
              <PillToggle value={data.developer_type} options={[{ v: 'integrated', l: 'Στο Drum' }, { v: 'separate', l: 'Ξεχωριστό' }]} onChange={(v) => onChange('developer_type', v)} />
              {data.developer_type === 'separate' && (
                <div className="space-y-2">
                  {getColorStations(stations).map((c) => (
                      <div key={c.key} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
                        <span className={`w-20 text-sm font-bold ${c.cls}`}>{c.name}</span>
                        <div className="flex-1"><NumInput value={data[`dev_${c.key}_life`]} onChange={(v) => onChange(`dev_${c.key}_life`, v)} /></div>
                        <div className="flex-1"><NumInput value={data[`dev_${c.key}_cost`]} onChange={(v) => onChange(`dev_${c.key}_cost`, v)} step="0.01" /></div>
                      </div>
                  ))}
                  {extraCount > 0 && Array.from({ length: extraCount }).map((_, i) => {
                    const name = `Σταθμός ${i + 1}`;
                    return (
                      <div key={i} className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--accent)]/30 bg-white/[0.02] p-3">
                        <span className="w-20 text-sm font-bold text-[var(--accent)]">{name}</span>
                        <div className="flex-1"><NumInput value={data[`dev_extra_${i + 1}_life`]} onChange={(v) => onChange(`dev_extra_${i + 1}_life`, v)} /></div>
                        <div className="flex-1"><NumInput value={data[`dev_extra_${i + 1}_cost`]} onChange={(v) => onChange(`dev_extra_${i + 1}_cost`, v)} step="0.01" /></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── CORONAS (precision only) ─── */}
      {mode === 'precision' && inkType === 'toner' && (
        <div className="border-t border-[var(--border)] pt-5">
          <div className="flex gap-6">
            <div className="w-28 shrink-0 pt-2">
              <h4 className="text-sm font-black uppercase tracking-wide">Coronas</h4>
              <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">Charge wires · ×{stations >= 4 ? 4 : stations} σταθμοί</p>
            </div>
            <div className="flex-1 space-y-3">
              <button onClick={() => onChange('has_charge_coronas', !data.has_charge_coronas)}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-all ${data.has_charge_coronas ? 'border-[var(--accent)] bg-[rgba(245,130,32,0.12)] text-[var(--accent)]' : 'border-[var(--glass-border)] text-[var(--text-muted)]'}`}>
                {data.has_charge_coronas ? 'Ναι — Έχει' : 'Όχι'}
              </button>
              {!!data.has_charge_coronas && (
                <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
                  <span className="w-20 text-sm font-bold text-[var(--text-dim)]">Corona</span>
                  <div className="flex-1"><NumInput value={data.corona_life} onChange={(v) => onChange('corona_life', v)} /></div>
                  <div className="flex-1"><NumInput value={data.corona_cost} onChange={(v) => onChange('corona_cost', v)} step="0.01" /></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── SERVICE PARTS (precision, toner only) ─── */}
      {mode === 'precision' && inkType === 'toner' && (
        <div className="border-t border-[var(--border)] pt-5">
          <div className="flex gap-6">
            <div className="w-28 shrink-0 pt-2">
              <h4 className="text-sm font-black uppercase tracking-wide">Service</h4>
              <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">Parts & Waste</p>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-3 px-3">
                <span className="w-20" />
                <span className="flex-1 text-[0.6rem] font-semibold text-[var(--text-muted)]">Life (σελίδες)</span>
                <span className="flex-1 text-[0.6rem] font-semibold text-[var(--text-muted)]">Cost €</span>
              </div>
              {[
                { label: 'Fuser', life: 'fuser_life', cost: 'fuser_cost' },
                { label: 'Belt', life: 'belt_life', cost: 'belt_cost' },
                { label: 'Waste', life: 'waste_life', cost: 'waste_cost' },
              ].map((p) => (
                <div key={p.label} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
                  <span className="w-20 text-sm font-bold text-[var(--text-dim)]">{p.label}</span>
                  <div className="flex-1"><NumInput value={data[p.life]} onChange={(v) => onChange(p.life, v)} /></div>
                  <div className="flex-1"><NumInput value={data[p.cost]} onChange={(v) => onChange(p.cost, v)} step="0.01" /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Liquid Ink — simple_out: only ink can */}
      {mode === 'simple_out' && inkType === 'liquid' && (
        <div className="border-t border-[var(--border)] pt-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-[0.65rem] font-bold uppercase tracking-widest text-[var(--text-muted)]">Ink Cans</span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3">
              <span className="w-28 text-sm font-semibold text-[var(--text-dim)]">ElectroInk Can</span>
              <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Yield (impressions)</span><NumInput value={data.ink_can_yield} onChange={(v) => onChange('ink_can_yield', v)} /></div>
              <div className="flex-1"><span className="text-[0.55rem] text-[var(--text-muted)]">Κόστος €</span><NumInput value={data.ink_can_cost} onChange={(v) => onChange('ink_can_cost', v)} step="0.01" /></div>
            </div>
          </div>
        </div>
      )}

      {/* ─── LIQUID INK PRECISION (HP Indigo) ─── */}
      {mode === 'precision' && inkType === 'liquid' && (
        <>
          <div className="border-t border-[var(--border)] pt-5">
            <div className="flex gap-6">
              <div className="w-28 shrink-0 pt-1">
                <h4 className="text-sm font-black uppercase tracking-wide">Ink</h4>
                <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">ElectroInk cans</p>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3 px-3">
                  <span className="w-20" />
                  <span className="flex-1 text-[0.6rem] font-semibold text-[var(--text-muted)]">Yield (impressions)</span>
                  <span className="flex-1 text-[0.6rem] font-semibold text-[var(--text-muted)]">Cost €</span>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
                  <span className="w-20 text-sm font-bold text-[var(--text-dim)]">CMYK Can</span>
                  <div className="flex-1"><NumInput value={data.ink_can_yield} onChange={(v) => onChange('ink_can_yield', v)} /></div>
                  <div className="flex-1"><NumInput value={data.ink_can_cost} onChange={(v) => onChange('ink_can_cost', v)} step="0.01" /></div>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
                  <span className="w-20 text-sm font-bold text-[var(--text-dim)]">Impression</span>
                  <div className="flex-1"><NumInput value={data.impression_charge} onChange={(v) => onChange('impression_charge', v)} step="0.001" /></div>
                  <div className="flex-1" />
                </div>
                {extraCount > 0 && Array.from({ length: extraCount }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--accent)]/30 bg-white/[0.02] p-3">
                    <span className="w-20 text-sm font-bold text-[var(--accent)]">Extra {i + 1}</span>
                    <div className="flex-1"><NumInput value={data[`ink_extra_${i + 1}_yield`]} onChange={(v) => onChange(`ink_extra_${i + 1}_yield`, v)} /></div>
                    <div className="flex-1"><NumInput value={data[`ink_extra_${i + 1}_cost`]} onChange={(v) => onChange(`ink_extra_${i + 1}_cost`, v)} step="0.01" /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--border)] pt-5">
            <div className="flex gap-6">
              <div className="w-28 shrink-0 pt-1">
                <h4 className="text-sm font-black uppercase tracking-wide">Parts</h4>
                <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">Blanket, PIP</p>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3 px-3">
                  <span className="w-20" />
                  <span className="flex-1 text-[0.6rem] font-semibold text-[var(--text-muted)]">Life (impressions)</span>
                  <span className="flex-1 text-[0.6rem] font-semibold text-[var(--text-muted)]">Cost €</span>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
                  <span className="w-20 text-sm font-bold text-[var(--text-dim)]">Blanket</span>
                  <div className="flex-1"><NumInput value={data.blanket_life} onChange={(v) => onChange('blanket_life', v)} /></div>
                  <div className="flex-1"><NumInput value={data.blanket_cost} onChange={(v) => onChange('blanket_cost', v)} step="0.01" /></div>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
                  <span className="w-20 text-sm font-bold text-[var(--text-dim)]">PIP</span>
                  <div className="flex-1"><NumInput value={data.pip_life} onChange={(v) => onChange('pip_life', v)} /></div>
                  <div className="flex-1"><NumInput value={data.pip_cost} onChange={(v) => onChange('pip_cost', v)} step="0.01" /></div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--border)] pt-5">
            <div className="flex gap-6">
              <div className="w-28 shrink-0 pt-1">
                <h4 className="text-sm font-black uppercase tracking-wide">Setup</h4>
                <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">Mixing / Prep</p>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
                  <span className="w-20 text-sm font-bold text-[var(--text-dim)]">Mixing Fee</span>
                  <div className="flex-1"><NumInput value={data.mixing_fee} onChange={(v) => onChange('mixing_fee', v)} step="0.01" /></div>
                  <div className="flex-1" />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Live cost preview */}
      <CostPreview data={data} />
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
  const logs = (data.maint_log as Array<{ date: string; description: string; counter: number | null }>) ?? [];

  function addLog() {
    onChange('maint_log', [...logs, { date: new Date().toISOString().slice(0, 10), description: '', counter: null }]);
  }
  function updateLog(i: number, field: string, val: unknown) {
    onChange('maint_log', logs.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  }
  function delLog(i: number) {
    onChange('maint_log', logs.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-0">
      {/* ─── ΚΑΤΑΣΤΑΣΗ ΜΗΧΑΝΗΣ ─── */}
      <div className="flex gap-6 pb-5">
        <div className="w-28 shrink-0 pt-1">
          <h4 className="text-sm font-black uppercase tracking-wide">Μηχανή</h4>
          <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">Τρέχουσα κατάσταση</p>
        </div>
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Counter</span>
              <NumInput value={data.current_counter} onChange={(v) => onChange('current_counter', v)} placeholder="π.χ. 1250000" />
            </div>
            <div>
              <span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Τελευταίο Service</span>
              <input className={inputCls} type="date" value={(data.last_service_date as string) ?? ''} onChange={(e) => onChange('last_service_date', e.target.value)} />
            </div>
          </div>
          <div>
            <span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Σημειώσεις</span>
            <textarea className={inputCls + " !h-14 py-2 resize-none"} value={(data.maint_notes as string) ?? ''} onChange={(e) => onChange('maint_notes', e.target.value)} placeholder="Γενικές σημειώσεις συντήρησης..." />
          </div>
        </div>
      </div>

      {/* ─── ΗΜΕΡΟΛΟΓΙΟ ΣΥΝΤΗΡΗΣΗΣ ─── */}
      <div className="flex gap-6 border-t border-[var(--border)] pt-5">
        <div className="w-28 shrink-0 pt-1">
          <h4 className="text-sm font-black uppercase tracking-wide">Ημερολόγιο</h4>
          <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">Ιστορικό service</p>
        </div>
        <div className="flex-1 space-y-2">
          {logs.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <span className="w-28 text-[0.6rem] font-semibold text-[var(--text-muted)]">Ημερομηνία</span>
              <span className="w-24 text-[0.6rem] font-semibold text-[var(--text-muted)]">Counter</span>
              <span className="flex-1 text-[0.6rem] font-semibold text-[var(--text-muted)]">Περιγραφή</span>
              <span className="w-5" />
            </div>
          )}
          {logs.map((l, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-2">
              <input className={inputCls + " !h-8 w-28"} type="date" value={l.date} onChange={(e) => updateLog(i, 'date', e.target.value)} />
              <input className={inputCls + " !h-8 w-24 text-center"} type="number" value={l.counter ?? ''} onChange={(e) => updateLog(i, 'counter', e.target.value ? +e.target.value : null)} placeholder="Counter" />
              <input className={inputCls + " !h-8 flex-1"} value={l.description} onChange={(e) => updateLog(i, 'description', e.target.value)} placeholder="π.χ. Αλλαγή fuser, PM kit..." />
              <button onClick={() => delLog(i)} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--danger)] text-lg">×</button>
            </div>
          ))}
          <button onClick={addLog} className="w-full rounded-lg border border-dashed border-[var(--glass-border)] py-2 text-sm font-semibold text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all">
            + Προσθήκη Εγγραφής
          </button>
        </div>
      </div>

    </div>
  );
}

function StepContacts({ data, onChange }: { data: Data; onChange: OnChange }) {
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
    <div className="space-y-0">
      {/* ─── ΤΕΧΝΙΚΟΙ ─── */}
      <div className="flex gap-6 pb-5">
        <div className="w-28 shrink-0 pt-1">
          <h4 className="text-sm font-black uppercase tracking-wide">Τεχνικοί</h4>
          <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">Επαφές service</p>
        </div>
        <div className="flex-1 space-y-2">
          {techs.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <span className="w-[30%] text-[0.6rem] font-semibold text-[var(--text-muted)]">Ειδικότητα</span>
              <span className="w-[35%] text-[0.6rem] font-semibold text-[var(--text-muted)]">Όνομα</span>
              <span className="flex-1 text-[0.6rem] font-semibold text-[var(--text-muted)]">Τηλέφωνο</span>
              <span className="w-5" />
            </div>
          )}
          {techs.map((t, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-2">
              <input className={inputCls + " !h-8 w-[30%]"} value={t.role} onChange={(e) => updateTech(i, 'role', e.target.value)} placeholder="π.χ. Service" />
              <input className={inputCls + " !h-8 w-[35%]"} value={t.name} onChange={(e) => updateTech(i, 'name', e.target.value)} placeholder="Γιώργος Κ." />
              <input className={inputCls + " !h-8 flex-1"} value={t.phone} onChange={(e) => updateTech(i, 'phone', e.target.value)} placeholder="210-..." />
              <button onClick={() => delTech(i)} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--danger)] text-lg">×</button>
            </div>
          ))}
          <button onClick={addTech} className="w-full rounded-lg border border-dashed border-[var(--glass-border)] py-2 text-sm font-semibold text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all">
            + Προσθήκη Τεχνικού
          </button>
        </div>
      </div>

      {/* ─── ΕΓΧΕΙΡΙΔΙΑ ─── */}
      <div className="flex gap-6 border-t border-[var(--border)] pt-5">
        <div className="w-28 shrink-0 pt-1">
          <h4 className="text-sm font-black uppercase tracking-wide">Links</h4>
          <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">Εγχειρίδια & drivers</p>
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Service Manual</span>
            <input className={inputCls} value={(data.manual_url as string) ?? ''} onChange={(e) => onChange('manual_url', e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Driver / PPD</span>
            <input className={inputCls} value={(data.driver_url as string) ?? ''} onChange={(e) => onChange('driver_url', e.target.value)} placeholder="https://..." />
          </div>
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
    case 'contacts': return <StepContacts data={data} onChange={onChange} />;
    default: return <p>Unknown step: {stepId}</p>;
  }
}
