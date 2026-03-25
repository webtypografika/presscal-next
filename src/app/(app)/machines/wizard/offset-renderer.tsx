'use client';

import { useState } from 'react';
import { Printer, Zap, CheckCircle, AlertTriangle } from 'lucide-react';
import { aiScanOffset } from './ai-scan-action';

type OnChange = (field: string, value: unknown) => void;
type Data = Record<string, unknown>;

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

function PillToggle({ value, options, onChange }: { value: unknown; options: { v: string; l: string }[]; onChange: (v: string) => void }) {
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

function Toggle({ value, onChange, labelOn, labelOff }: { value: unknown; onChange: (v: boolean) => void; labelOn?: string; labelOff?: string }) {
  const on = !!value;
  return (
    <button onClick={() => onChange(!on)}
      className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-all ${on ? 'border-[var(--accent)] bg-[rgba(245,130,32,0.12)] text-[var(--accent)]' : 'border-[var(--glass-border)] text-[var(--text-muted)]'}`}
    >{on ? (labelOn ?? 'ON') : (labelOff ?? 'OFF')}</button>
  );
}

// ─── SECTION WRAPPER (2-column layout) ───
function Section({ title, sub, children, border }: { title: string; sub: string; children: React.ReactNode; border?: boolean }) {
  return (
    <div className={`flex gap-6 ${border ? 'border-t border-[var(--border)] pt-5' : ''}`}>
      <div className="w-28 shrink-0 pt-1">
        <h4 className="text-sm font-black uppercase tracking-wide">{title}</h4>
        <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">{sub}</p>
      </div>
      <div className="flex-1 space-y-3">{children}</div>
    </div>
  );
}

// ─── STEP RENDERERS ───

function StepWelcome() {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[var(--violet)]/30 bg-[var(--violet)]/10 text-[var(--violet)]">
        <i className="fas fa-industry text-3xl" />
      </div>
      <h2 className="mt-6 text-2xl font-bold">Ρύθμιση Offset Μηχανής</h2>
      <p className="mt-2 max-w-md text-[var(--text-dim)]">
        Θα σας καθοδηγήσουμε βήμα-βήμα στη ρύθμιση της offset μηχανής σας.
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
    const res = await aiScanOffset(name);
    setResult(res);
    if (res.success) {
      for (const [key, val] of Object.entries(res.specs)) {
        if (val !== null && val !== undefined) onChange(key, val);
      }
    }
    setScanning(false);
  }

  return (
    <div className="space-y-4">
      <Section title="Μοντέλο" sub="Όνομα μηχανής">
        <input className={inputCls} value={(data.name as string) ?? ''} onChange={(e) => onChange('name', e.target.value)} placeholder="π.χ. Heidelberg SM 74-4" autoFocus />
        <button onClick={handleScan} disabled={scanning || !(data.name as string)?.trim()}
          className="flex items-center gap-2 rounded-lg border border-[var(--blue)] bg-[var(--blue)]/10 px-5 py-2.5 text-sm font-bold text-[var(--blue)] transition-all hover:bg-[var(--blue)]/20 disabled:opacity-40"
        >
          <Zap className="h-4 w-4" />
          {scanning ? 'Αναζήτηση...' : 'AI Scan'}
        </button>
        {scanning && (
          <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-4 text-sm text-[var(--text-dim)]">
            <div className="h-4 w-4 shrink-0 rounded-full border-2 border-[var(--blue)] border-t-transparent animate-spin" />
            Αναζήτηση προδιαγραφών...
          </div>
        )}
        {result?.success && (
          <div className="flex items-center gap-3 rounded-lg bg-[var(--success)]/10 p-4 text-sm text-[var(--success)]">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <div><strong>Βρέθηκαν {result.fieldsFound} προδιαγραφές</strong><p className="text-[var(--text-dim)] text-xs mt-1">Ελέγξτε τα πεδία στα επόμενα βήματα.</p></div>
          </div>
        )}
        {result && !result.success && (
          <div className="flex items-center gap-3 rounded-lg bg-[var(--danger)]/10 p-4 text-sm text-[var(--danger)]">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div><strong>Δεν βρέθηκαν</strong><p className="text-[var(--text-dim)] text-xs mt-1">{result.error ?? 'Συμπληρώστε χειροκίνητα.'}</p></div>
          </div>
        )}
      </Section>
    </div>
  );
}

function StepPaper({ data, onChange }: { data: Data; onChange: OnChange }) {
  return (
    <div className="space-y-5">
      <Section title="Max Φύλλο" sub="Μέγιστο (mm)">
        <div className="grid grid-cols-2 gap-3">
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Short Side (SS)</span><NumInput value={data.off_max_ss} onChange={(v) => onChange('off_max_ss', v)} /></div>
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Long Side (LS)</span><NumInput value={data.off_max_ls} onChange={(v) => onChange('off_max_ls', v)} /></div>
        </div>
      </Section>
      <Section title="Min Φύλλο" sub="Ελάχιστο (mm)" border>
        <div className="grid grid-cols-2 gap-3">
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Short Side (SS)</span><NumInput value={data.off_min_ss} onChange={(v) => onChange('off_min_ss', v)} /></div>
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Long Side (LS)</span><NumInput value={data.off_min_ls} onChange={(v) => onChange('off_min_ls', v)} /></div>
        </div>
      </Section>
    </div>
  );
}

function StepMargins({ data, onChange }: { data: Data; onChange: OnChange }) {
  return (
    <div className="space-y-5">
      <Section title="Gripper" sub="Μη εκτυπώσιμο (mm)">
        <div className="grid grid-cols-2 gap-3">
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Gripper (εμπρός)</span><NumInput value={data.off_gripper} onChange={(v) => onChange('off_gripper', v)} /></div>
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Tail (πίσω)</span><NumInput value={data.off_margin_tail} onChange={(v) => onChange('off_margin_tail', v)} /></div>
        </div>
      </Section>
      <Section title="Side Lay" sub="Πλαϊνό (mm)" border>
        <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Αριστερά / Δεξιά</span><NumInput value={data.off_side_margin} onChange={(v) => onChange('off_side_margin', v)} /></div>
      </Section>
    </div>
  );
}

function StepThickness({ data, onChange }: { data: Data; onChange: OnChange }) {
  return (
    <div className="space-y-5">
      <Section title="Μονάδα" sub="Βάρος / Πάχος">
        <PillToggle value={data.off_thick_unit} options={[{ v: 'gr', l: 'Γραμμάρια (g/m²)' }, { v: 'mic', l: 'Microns (μm)' }]} onChange={(v) => onChange('off_thick_unit', v)} />
      </Section>
      <Section title="Εύρος" sub={data.off_thick_unit === 'gr' ? 'g/m²' : 'μm'} border>
        <div className="grid grid-cols-2 gap-3">
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Ελάχιστο</span><NumInput value={data.off_min_thick} onChange={(v) => onChange('off_min_thick', v)} /></div>
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Μέγιστο</span><NumInput value={data.off_max_thick} onChange={(v) => onChange('off_max_thick', v)} /></div>
        </div>
      </Section>
    </div>
  );
}

function StepMachine({ data, onChange }: { data: Data; onChange: OnChange }) {
  return (
    <div className="space-y-5">
      <Section title="Πύργοι" sub="Ταχύτητα">
        <div className="grid grid-cols-3 gap-3">
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Πύργοι</span><NumInput value={data.off_towers} onChange={(v) => onChange('off_towers', v)} /></div>
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Max (φύλλα/ώρα)</span><NumInput value={data.off_speed} onChange={(v) => onChange('off_speed', v)} /></div>
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Συνήθης (φ/ώρα)</span><NumInput value={data.off_common_speed} onChange={(v) => onChange('off_common_speed', v)} /></div>
        </div>
      </Section>

      <Section title="Περφορέ" sub="Perfecting" border>
        <div className="flex items-center gap-4">
          <Toggle value={data.off_perfecting} onChange={(v) => onChange('off_perfecting', v)} labelOn="Ναι" labelOff="Όχι" />
          {!!data.off_perfecting && (
            <div className="flex-1">
              <span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Τροχοί</span>
              <NumInput value={data.off_perfo_cnt} onChange={(v) => onChange('off_perfo_cnt', v)} />
            </div>
          )}
        </div>
      </Section>

      <Section title="Αρίθμηση" sub="Numbering" border>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="w-20 text-sm font-semibold text-[var(--text-dim)]">Οριζόντια</div>
            <Toggle value={data.off_num_h} onChange={(v) => onChange('off_num_h', v)} labelOn="Ναι" labelOff="Όχι" />
            {!!data.off_num_h && (
              <>
                <div className="flex-1"><span className="text-[0.6rem] text-[var(--text-muted)]">Κεφαλές</span><NumInput value={data.off_num_h_cnt} onChange={(v) => onChange('off_num_h_cnt', v)} /></div>
                <div className="flex-1"><span className="text-[0.6rem] text-[var(--text-muted)]">Min X (mm)</span><NumInput value={data.off_num_min_x} onChange={(v) => onChange('off_num_min_x', v)} /></div>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="w-20 text-sm font-semibold text-[var(--text-dim)]">Κάθετη</div>
            <Toggle value={data.off_num_v} onChange={(v) => onChange('off_num_v', v)} labelOn="Ναι" labelOff="Όχι" />
            {!!data.off_num_v && (
              <>
                <div className="flex-1"><span className="text-[0.6rem] text-[var(--text-muted)]">Κεφαλές</span><NumInput value={data.off_num_v_cnt} onChange={(v) => onChange('off_num_v_cnt', v)} /></div>
                <div className="flex-1"><span className="text-[0.6rem] text-[var(--text-muted)]">Min Y (mm)</span><NumInput value={data.off_num_min_y} onChange={(v) => onChange('off_num_min_y', v)} /></div>
              </>
            )}
          </div>
        </div>
      </Section>

      <Section title="Βερνίκι" sub="Coating Tower" border>
        <div className="flex items-center gap-4">
          <Toggle value={data.off_has_varnish_tower} onChange={(v) => onChange('off_has_varnish_tower', v)} labelOn="Ναι" labelOff="Όχι" />
          {!!data.off_has_varnish_tower && (
            <div className="flex-1">
              <PillToggle value={data.off_varnish_type} options={[{ v: 'aqueous', l: 'Aqueous (AQ)' }, { v: 'uv', l: 'UV' }]} onChange={(v) => onChange('off_varnish_type', v)} />
            </div>
          )}
        </div>
        {!!data.off_has_varnish_tower && (
          <p className="text-[0.65rem] text-[var(--text-muted)]">Η βερνικιέρα είναι ξεχωριστή μονάδα, δεν επηρεάζει τον αριθμό πύργων.</p>
        )}
      </Section>
    </div>
  );
}

function StepProduction({ data, onChange }: { data: Data; onChange: OnChange }) {
  const depHour = data.off_include_depreciation && data.off_machine_cost && data.off_depreciation_years && data.off_hours_per_year
    ? ((data.off_machine_cost as number) / ((data.off_depreciation_years as number) * (data.off_hours_per_year as number))).toFixed(2)
    : null;

  return (
    <div className="space-y-5">
      <Section title="Setup" sub="Φύρα & Χρόνοι">
        <div className="grid grid-cols-3 gap-3">
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Φύρα (φύλλα)</span><NumInput value={data.off_default_waste} onChange={(v) => onChange('off_default_waste', v)} /></div>
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Setup (λεπτά)</span><NumInput value={data.off_setup_min} onChange={(v) => onChange('off_setup_min', v)} /></div>
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Wash (λεπτά)</span><NumInput value={data.off_wash_min} onChange={(v) => onChange('off_wash_min', v)} /></div>
        </div>
        <p className="text-[0.6rem] text-[var(--text-muted)]">Η φύρα είναι baseline — αλλάζει ανά εργασία.</p>
      </Section>

      <Section title="Κόστος" sub="Εργασία & Ενέργεια" border>
        <div className="grid grid-cols-2 gap-3">
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Εργατοώρα (€/ώρα)</span><NumInput value={data.off_hour_c} onChange={(v) => onChange('off_hour_c', v)} step="0.01" /></div>
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Ενέργεια (€/ώρα)</span><NumInput value={data.off_energy_hourly} onChange={(v) => onChange('off_energy_hourly', v)} step="0.01" /></div>
        </div>
      </Section>

      <Section title="Απόσβεση" sub="BHR method" border>
        <Toggle value={data.off_include_depreciation} onChange={(v) => onChange('off_include_depreciation', v)} labelOn="Ναι — Υπολογισμός" labelOff="Όχι" />
        {!!data.off_include_depreciation && (
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Κόστος Μηχανής (€)</span><NumInput value={data.off_machine_cost} onChange={(v) => onChange('off_machine_cost', v)} /></div>
            <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Έτη Απόσβεσης</span><NumInput value={data.off_depreciation_years} onChange={(v) => onChange('off_depreciation_years', v)} /></div>
            <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Ώρες / Έτος</span><NumInput value={data.off_hours_per_year} onChange={(v) => onChange('off_hours_per_year', v)} /></div>
          </div>
        )}
        {depHour && <p className="text-sm text-[var(--success)] mt-2">Απόσβεση / ώρα: €{depHour}</p>}
      </Section>

      <Section title="Κατανάλωση" sub="Ρυθμοί χρήσης" border>
        <div className="grid grid-cols-3 gap-3">
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Μελάνι (g/m²)</span><NumInput value={data.off_ink_gm2} onChange={(v) => onChange('off_ink_gm2', v)} step="0.1" /></div>
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Βερνίκι OPV (g/m²)</span><NumInput value={data.off_varnish_gm2} onChange={(v) => onChange('off_varnish_gm2', v)} step="0.1" /></div>
          {!!data.off_has_varnish_tower && (
            <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Coating (g/m²)</span><NumInput value={data.off_coating_gm2} onChange={(v) => onChange('off_coating_gm2', v)} step="0.1" /></div>
          )}
        </div>
        <p className="text-[0.6rem] text-[var(--text-muted)]">Τεχνικές παράμετροι για τον υπολογισμό κόστους ανά φύλλο.</p>
      </Section>
    </div>
  );
}

function StepParts({ data, onChange }: { data: Data; onChange: OnChange }) {
  const rollerCostPerImpr = data.off_include_rollers && data.off_roller_count && data.off_roller_recover_c && data.off_roller_recover_life
    ? (((data.off_roller_count as number) * (data.off_roller_recover_c as number)) / (data.off_roller_recover_life as number)).toFixed(5)
    : null;

  return (
    <div className="space-y-5">
      <Section title="Τσίγκος" sub="CTP Plates">
        <Toggle value={data.off_include_parts} onChange={(v) => onChange('off_include_parts', v)} labelOn="Συμπεριλαμβάνεται" labelOff="Εξαιρείται" />
        {!!data.off_include_parts && (
          <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
            <span className="w-20 text-sm font-bold text-[var(--text-dim)]">Plate</span>
            <div className="flex-1"><span className="text-[0.6rem] text-[var(--text-muted)]">Κόστος €/τεμ</span><NumInput value={data.off_plate_c} onChange={(v) => onChange('off_plate_c', v)} step="0.01" /></div>
          </div>
        )}
      </Section>

      <Section title="Καουτσούκ" sub="Blankets" border>
        {!!data.off_include_parts && (
          <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
            <span className="w-20 text-sm font-bold text-[var(--text-dim)]">Blanket</span>
            <div className="flex-1"><span className="text-[0.6rem] text-[var(--text-muted)]">Κόστος €</span><NumInput value={data.off_blanket_c} onChange={(v) => onChange('off_blanket_c', v)} step="0.01" /></div>
            <div className="flex-1"><span className="text-[0.6rem] text-[var(--text-muted)]">Life (impressions)</span><NumInput value={data.off_blanket_life} onChange={(v) => onChange('off_blanket_life', v)} /></div>
          </div>
        )}
      </Section>

      <Section title="Ρολά" sub="Αναγόμωση" border>
        <Toggle value={data.off_include_rollers} onChange={(v) => onChange('off_include_rollers', v)} labelOn="Ναι" labelOff="Όχι" />
        {!!data.off_include_rollers && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Αριθμός ρολών</span><NumInput value={data.off_roller_count} onChange={(v) => onChange('off_roller_count', v)} /></div>
              <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">€ / ρολό</span><NumInput value={data.off_roller_recover_c} onChange={(v) => onChange('off_roller_recover_c', v)} step="0.01" /></div>
              <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Life (impressions)</span><NumInput value={data.off_roller_recover_life} onChange={(v) => onChange('off_roller_recover_life', v)} /></div>
            </div>
            {rollerCostPerImpr && <p className="text-sm text-[var(--text-dim)]">Κόστος / impression: €{rollerCostPerImpr}</p>}
          </>
        )}
      </Section>
    </div>
  );
}

function StepInks({ data, onChange }: { data: Data; onChange: OnChange }) {
  return (
    <div className="space-y-5">
      <Section title="Μελάνια" sub="CMYK (€/kg)">
        <Toggle value={data.off_include_inks} onChange={(v) => onChange('off_include_inks', v)} labelOn="Συμπεριλαμβάνεται" labelOff="Εξαιρείται" />
        {!!data.off_include_inks && (
          <>
            <div className="flex items-center gap-3 px-3">
              <span className="w-20" />
              <span className="flex-1 text-[0.6rem] font-semibold text-[var(--text-muted)]">Κόστος €/kg</span>
            </div>
            {[
              { name: 'Cyan', key: 'ink_c_p', cls: 'text-cyan-400' },
              { name: 'Magenta', key: 'ink_m_p', cls: 'text-pink-400' },
              { name: 'Yellow', key: 'ink_y_p', cls: 'text-yellow-400' },
              { name: 'Black', key: 'ink_k_p', cls: 'text-gray-400' },
            ].map((c) => (
              <div key={c.key} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
                <span className={`w-20 text-sm font-bold ${c.cls}`}>{c.name}</span>
                <div className="flex-1"><NumInput value={data[c.key]} onChange={(v) => onChange(c.key, v)} step="0.01" /></div>
              </div>
            ))}
          </>
        )}
      </Section>

      <Section title="Αλκοόλη" sub="IPA / Fountain" border>
        <Toggle value={data.off_include_alcohol} onChange={(v) => onChange('off_include_alcohol', v)} labelOn="Συμπεριλαμβάνεται" labelOff="Εξαιρείται" />
        {!!data.off_include_alcohol && (
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Κόστος IPA (€/lt)</span><NumInput value={data.chem_alcohol_c} onChange={(v) => onChange('chem_alcohol_c', v)} step="0.01" /></div>
            <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Κατανάλωση (ml/ώρα)</span><NumInput value={data.off_chem_fountain_ml_h} onChange={(v) => onChange('off_chem_fountain_ml_h', v)} /></div>
          </div>
        )}
      </Section>

      <Section title="Βερνίκι" sub="OPV & Coating" border>
        <Toggle value={data.off_include_varnish} onChange={(v) => onChange('off_include_varnish', v)} labelOn="Συμπεριλαμβάνεται" labelOff="Εξαιρείται" />
        {!!data.off_include_varnish && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
              <span className="w-20 text-sm font-bold text-[var(--text-dim)]">OPV</span>
              <div className="flex-1"><span className="text-[0.6rem] text-[var(--text-muted)]">Κόστος €/kg</span><NumInput value={data.ink_var_c} onChange={(v) => onChange('ink_var_c', v)} step="0.01" /></div>
            </div>
            {!!data.off_has_varnish_tower && (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--accent)]/30 bg-white/[0.02] p-3">
                <span className="w-20 text-sm font-bold text-[var(--accent)]">{data.off_varnish_type === 'uv' ? 'UV' : 'AQ'}</span>
                <div className="flex-1"><span className="text-[0.6rem] text-[var(--text-muted)]">Κόστος €/kg</span><NumInput value={data.off_coating_c} onChange={(v) => onChange('off_coating_c', v)} step="0.01" /></div>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

function StepChemicals({ data, onChange }: { data: Data; onChange: OnChange }) {
  return (
    <div className="space-y-5">
      <Section title="Χημικά" sub="Καθαρισμός">
        <Toggle value={data.off_include_chemicals} onChange={(v) => onChange('off_include_chemicals', v)} labelOn="Συμπεριλαμβάνεται" labelOff="Εξαιρείται" />
        {!!data.off_include_chemicals && (
          <>
            <div className="flex items-center gap-3 px-3">
              <span className="w-28" />
              <span className="flex-1 text-[0.6rem] font-semibold text-[var(--text-muted)]">Κόστος €/lt</span>
            </div>
            {[
              { label: 'Wash Ink', key: 'chem_wash_ink_c' },
              { label: 'Wash Water', key: 'chem_wash_water_c' },
            ].map((c) => (
              <div key={c.key} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
                <span className="w-28 text-sm font-bold text-[var(--text-dim)]">{c.label}</span>
                <div className="flex-1"><NumInput value={data[c.key]} onChange={(v) => onChange(c.key, v)} step="0.01" /></div>
              </div>
            ))}
            <div className="mt-2">
              <span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Wash χημικό / εργασία (ml)</span>
              <NumInput value={data.off_chem_wash_ml} onChange={(v) => onChange('off_chem_wash_ml', v)} />
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

function StepMaintenance({ data, onChange }: { data: Data; onChange: OnChange }) {
  const logs = (data.maint_log as Array<{ date: string; description: string; counter: number | null }>) ?? [];

  return (
    <div className="space-y-5">
      <Section title="Μηχανή" sub="Τρέχουσα κατάσταση">
        <div className="grid grid-cols-2 gap-3">
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Counter</span><NumInput value={data.current_counter} onChange={(v) => onChange('current_counter', v)} /></div>
          <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Τελευταίο Service</span><input className={inputCls} type="date" value={(data.last_service_date as string) ?? ''} onChange={(e) => onChange('last_service_date', e.target.value)} /></div>
        </div>
        <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Σημειώσεις</span><textarea className={inputCls + " !h-14 py-2 resize-none"} value={(data.maint_notes as string) ?? ''} onChange={(e) => onChange('maint_notes', e.target.value)} placeholder="Γενικές σημειώσεις..." /></div>
      </Section>

      <Section title="Ημερολόγιο" sub="Ιστορικό service" border>
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
            <input className={inputCls + " !h-8 w-28"} type="date" value={l.date} onChange={(e) => { const u = [...logs]; u[i] = { ...l, date: e.target.value }; onChange('maint_log', u); }} />
            <input className={inputCls + " !h-8 w-24 text-center"} type="number" value={l.counter ?? ''} onChange={(e) => { const u = [...logs]; u[i] = { ...l, counter: e.target.value ? +e.target.value : null }; onChange('maint_log', u); }} placeholder="Counter" />
            <input className={inputCls + " !h-8 flex-1"} value={l.description} onChange={(e) => { const u = [...logs]; u[i] = { ...l, description: e.target.value }; onChange('maint_log', u); }} placeholder="π.χ. Αλλαγή blanket..." />
            <button onClick={() => onChange('maint_log', logs.filter((_, idx) => idx !== i))} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--danger)] text-lg">×</button>
          </div>
        ))}
        <button onClick={() => onChange('maint_log', [...logs, { date: new Date().toISOString().slice(0, 10), description: '', counter: null }])}
          className="w-full rounded-lg border border-dashed border-[var(--glass-border)] py-2 text-sm font-semibold text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all">
          + Προσθήκη Εγγραφής
        </button>
      </Section>
    </div>
  );
}

function StepContacts({ data, onChange }: { data: Data; onChange: OnChange }) {
  const techs = (data.off_techs as Array<{ role: string; name: string; phone: string }>) ?? [];

  return (
    <div className="space-y-5">
      <Section title="Τεχνικοί" sub="Επαφές service">
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
            <input className={inputCls + " !h-8 w-[30%]"} value={t.role} onChange={(e) => { const u = [...techs]; u[i] = { ...t, role: e.target.value }; onChange('off_techs', u); }} placeholder="π.χ. Service" />
            <input className={inputCls + " !h-8 w-[35%]"} value={t.name} onChange={(e) => { const u = [...techs]; u[i] = { ...t, name: e.target.value }; onChange('off_techs', u); }} placeholder="Γιώργος Κ." />
            <input className={inputCls + " !h-8 flex-1"} value={t.phone} onChange={(e) => { const u = [...techs]; u[i] = { ...t, phone: e.target.value }; onChange('off_techs', u); }} placeholder="210-..." />
            <button onClick={() => onChange('off_techs', techs.filter((_, idx) => idx !== i))} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--danger)] text-lg">×</button>
          </div>
        ))}
        <button onClick={() => onChange('off_techs', [...techs, { role: '', name: '', phone: '' }])}
          className="w-full rounded-lg border border-dashed border-[var(--glass-border)] py-2 text-sm font-semibold text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all">
          + Προσθήκη Τεχνικού
        </button>
      </Section>

      <Section title="Links" sub="Εγχειρίδια & drivers" border>
        <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Service Manual</span><input className={inputCls} value={(data.manual_url as string) ?? ''} onChange={(e) => onChange('manual_url', e.target.value)} placeholder="https://..." /></div>
        <div><span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Driver / PPD</span><input className={inputCls} value={(data.driver_url as string) ?? ''} onChange={(e) => onChange('driver_url', e.target.value)} placeholder="https://..." /></div>
      </Section>
    </div>
  );
}

// ─── MAIN RENDERER ───
export function renderOffsetStep(stepId: string, data: Data, onChange: OnChange): React.ReactNode {
  switch (stepId) {
    case 'welcome': return <StepWelcome />;
    case 'ai_scan': return <StepAiScan data={data} onChange={onChange} />;
    case 'paper': return <StepPaper data={data} onChange={onChange} />;
    case 'margins': return <StepMargins data={data} onChange={onChange} />;
    case 'thickness': return <StepThickness data={data} onChange={onChange} />;
    case 'machine': return <StepMachine data={data} onChange={onChange} />;
    case 'production': return <StepProduction data={data} onChange={onChange} />;
    case 'parts': return <StepParts data={data} onChange={onChange} />;
    case 'inks': return <StepInks data={data} onChange={onChange} />;
    case 'chemicals': return <StepChemicals data={data} onChange={onChange} />;
    case 'maintenance': return <StepMaintenance data={data} onChange={onChange} />;
    case 'contacts': return <StepContacts data={data} onChange={onChange} />;
    default: return <p>Unknown step: {stepId}</p>;
  }
}
