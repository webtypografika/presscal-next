'use client';

import { useState } from 'react';
import { Printer, Droplet, Zap, CheckCircle, AlertTriangle } from 'lucide-react';
import { aiScanDigital } from './ai-scan-action';
import {
  inputCls, NumInput, Field, WizSection, Row, RowLabel, PillToggle, Toggle,
  ColHeaders, AddButton, fmtNum, CMYK_COLORS, getColorStations,
} from './wizard-ui';
import { ConsumableSlot } from './consumable-slot';

type OnChange = (field: string, value: unknown) => void;
type Data = Record<string, unknown>;

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
      for (const [key, val] of Object.entries(res.specs)) {
        if (val !== null && val !== undefined) {
          onChange(key, val);
        }
      }
    }
    setScanning(false);
  }

  return (
    <div className="space-y-6">
      <WizSection title="Μοντέλο" sub="Όνομα μηχανής" accent="var(--blue)">
        <input className={inputCls} value={(data.name as string) ?? ''} onChange={(e) => onChange('name', e.target.value)} placeholder="π.χ. Konica Accurio C6100" autoFocus />
        <button onClick={handleScan} disabled={scanning || !(data.name as string)?.trim()}
          className="flex items-center gap-2 rounded-lg border border-[var(--blue)] bg-[var(--blue)]/10 px-5 py-2.5 text-sm font-bold text-[var(--blue)] transition-all hover:bg-[var(--blue)]/20 disabled:opacity-40">
          <Zap className="h-4 w-4" />{scanning ? 'Αναζήτηση...' : 'AI Scan'}
        </button>
        {scanning && (
          <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-4 text-sm text-[var(--text-dim)]">
            <div className="h-4 w-4 shrink-0 rounded-full border-2 border-[var(--blue)] border-t-transparent animate-spin" />Αναζήτηση προδιαγραφών & αναλωσίμων για &quot;{data.name as string}&quot;...
          </div>
        )}
        {result?.success && (
          <div className="flex items-center gap-3 rounded-lg bg-[var(--success)]/10 p-4 text-sm text-[var(--success)]">
            <CheckCircle className="h-5 w-5 shrink-0" /><div><strong>Βρέθηκαν {result.fieldsFound} προδιαγραφές</strong><p className="text-[var(--text-dim)] text-xs mt-1">Το AI μπορεί να κάνει λάθη — ελέγξτε και διορθώστε τα αποτελέσματα στα επόμενα βήματα.</p></div>
          </div>
        )}
        {result && !result.success && (
          <div className="flex items-center gap-3 rounded-lg bg-[var(--danger)]/10 p-4 text-sm text-[var(--danger)]">
            <AlertTriangle className="h-5 w-5 shrink-0" /><div><strong>Δεν βρέθηκαν αποτελέσματα</strong><p className="text-xs mt-1">{result.error ?? 'Συμπληρώστε χειροκίνητα.'}</p></div>
          </div>
        )}
      </WizSection>

      <WizSection title="URL" sub="Κατασκευαστή" accent="var(--blue)" border>
        <Field label="URL Κατασκευαστή (προαιρετικό)">
          <input className={inputCls} value={(data.spec_url as string) ?? ''} onChange={(e) => onChange('spec_url', e.target.value)} placeholder="https://..." />
        </Field>
      </WizSection>
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
    <div className="space-y-6">
      <WizSection title="Τύπος" sub="Ink / Toner" accent="var(--blue)">
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
      </WizSection>
    </div>
  );
}

function StepSpecs({ data, onChange }: { data: Data; onChange: OnChange }) {
  return (
    <div className="space-y-6">
      <WizSection title="Ταχύτητα" sub="PPM" accent="var(--blue)">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Color *"><NumInput value={data.speed_ppm_color} onChange={(v) => onChange('speed_ppm_color', v)} placeholder="61" /></Field>
          <Field label="B&W"><NumInput value={data.speed_ppm_bw} onChange={(v) => onChange('speed_ppm_bw', v)} placeholder="65" /></Field>
        </div>
      </WizSection>

      <WizSection title="GSM" sub="Εύρος βάρους" accent="var(--blue)" border>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Min"><NumInput value={data.min_gsm} onChange={(v) => onChange('min_gsm', v)} placeholder="60" /></Field>
          <Field label="Max"><NumInput value={data.max_gsm} onChange={(v) => onChange('max_gsm', v)} placeholder="350" /></Field>
        </div>
      </WizSection>

      <WizSection title="Duplex" sub="Factor" accent="var(--blue)" border>
        <Field label="Duplex Speed Factor (%)">
          <NumInput value={data.duplex_speed_factor} onChange={(v) => onChange('duplex_speed_factor', v)} placeholder="100" />
        </Field>
      </WizSection>

      <WizSection title="Finishing" sub="Output" accent="var(--blue)" border>
        <div className="flex flex-wrap gap-2">
          <Toggle value={data.has_booklet_maker} onChange={(v) => onChange('has_booklet_maker', v)} labelOn="Booklet" labelOff="Booklet" />
          <Toggle value={data.has_stapler} onChange={(v) => onChange('has_stapler', v)} labelOn="Stapler" labelOff="Stapler" />
          <Toggle value={data.has_puncher} onChange={(v) => onChange('has_puncher', v)} labelOn="Puncher" labelOff="Puncher" />
          <Toggle value={data.has_trimmer} onChange={(v) => onChange('has_trimmer', v)} labelOn="Trimmer" labelOff="Trimmer" />
          <Toggle value={data.has_glue_binder} onChange={(v) => onChange('has_glue_binder', v)} labelOn="Glue Binder" labelOff="Glue Binder" />
        </div>
      </WizSection>
    </div>
  );
}

function StepMedia({ data, onChange }: { data: Data; onChange: OnChange }) {
  return (
    <div className="space-y-6">
      <WizSection title="Max Φύλλο" sub="Μέγιστο (mm)" accent="var(--blue)">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Short Side"><NumInput value={data.max_sheet_ss} onChange={(v) => onChange('max_sheet_ss', v)} placeholder="330" /></Field>
          <Field label="Long Side"><NumInput value={data.max_sheet_ls} onChange={(v) => onChange('max_sheet_ls', v)} placeholder="487" /></Field>
        </div>
      </WizSection>

      <WizSection title="Min Φύλλο" sub="Ελάχιστο (mm)" accent="var(--blue)" border>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Short Side"><NumInput value={data.min_sheet_ss} onChange={(v) => onChange('min_sheet_ss', v)} /></Field>
          <Field label="Long Side"><NumInput value={data.min_sheet_ls} onChange={(v) => onChange('min_sheet_ls', v)} /></Field>
        </div>
      </WizSection>

      <WizSection title="Banner" sub="Μέγιστο (mm)" accent="var(--blue)" border>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Short Side"><NumInput value={data.banner_ss} onChange={(v) => onChange('banner_ss', v)} /></Field>
          <Field label="Long Side"><NumInput value={data.banner_ls} onChange={(v) => onChange('banner_ls', v)} /></Field>
        </div>
      </WizSection>

      <WizSection title="Περιθώρια" sub="Εκτύπωσης (mm)" accent="var(--blue)" border>
        <div className="grid grid-cols-4 gap-2">
          <Field label="Top"><NumInput value={data.margin_top} onChange={(v) => onChange('margin_top', v)} /></Field>
          <Field label="Bottom"><NumInput value={data.margin_bottom} onChange={(v) => onChange('margin_bottom', v)} /></Field>
          <Field label="Left"><NumInput value={data.margin_left} onChange={(v) => onChange('margin_left', v)} /></Field>
          <Field label="Right"><NumInput value={data.margin_right} onChange={(v) => onChange('margin_right', v)} /></Field>
        </div>
      </WizSection>

      <WizSection title="Τροφοδοσία" sub="Feed direction" accent="var(--blue)" border>
        <PillToggle value={data.feed_direction} options={[{ v: 'sef', l: 'SEF' }, { v: 'lef', l: 'LEF' }, { v: 'both', l: 'Both' }]} onChange={(v) => onChange('feed_direction', v)} />
      </WizSection>
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
    <div className="space-y-6">
      <WizSection title="Σταθμοί" sub="Χρώμα" accent="var(--violet)">
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
        {selected && (
          <div className="rounded-lg bg-white/[0.03] px-4 py-3">
            <span className="text-[0.6rem] font-bold uppercase tracking-widest text-[var(--text-muted)]">Παραδείγματα μοντέλων</span>
            <p className="mt-1 text-sm text-[var(--text-dim)]">{selected.examples}</p>
          </div>
        )}
      </WizSection>
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
      <WizSection title="Σταθμοί" sub="Φυσικοί extra" accent="var(--violet)">
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
      </WizSection>

      <WizSection title="Πληροφορίες" sub="Ειδικά χρώματα" accent="var(--violet)" border>
        <div className="rounded-lg bg-white/[0.03] px-4 py-3">
          <p className="text-sm text-[var(--text-dim)]">
            Τα ειδικά χρώματα (White, Gold, Clear κλπ) και τα αναλώσιμά τους ορίζονται στο κοστολόγιο κάθε εργασίας.
            Αν η δουλειά χρειάζεται περισσότερα χρώματα από τους σταθμούς, θα χρειαστεί επιπλέον πέρασμα.
          </p>
        </div>
        <div className="rounded-lg bg-white/[0.03] px-4 py-3">
          <span className="text-[0.6rem] font-bold uppercase tracking-widest text-[var(--text-muted)]">Παραδείγματα</span>
          <div className="mt-2 space-y-1 text-sm text-[var(--text-dim)]">
            <p><strong className="text-[var(--text)]">1 σταθμός:</strong> Ricoh C7500, Xerox iGen 5</p>
            <p><strong className="text-[var(--text)]">2 σταθμοί:</strong> Xerox Iridesse, Fujifilm Revoria</p>
            <p><strong className="text-[var(--text)]">3 σταθμοί:</strong> HP Indigo 7K (7 BIDs), Fujifilm Revoria PC1120</p>
          </div>
        </div>
      </WizSection>
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
    <div className="space-y-6">
      <WizSection title="Μοντέλο" sub="Κοστολόγηση" accent="var(--accent)">
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
                <span className="ml-auto text-xs text-[var(--text-muted)]">{m.detail}</span>
              </div>
            </button>
          ))}
        </div>
      </WizSection>
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
    <WizSection title="Άθροισμα" sub="Κόστος / όψη" accent="var(--success)" border>
      <div className="flex items-center gap-3 px-3 mb-2">
        <span className="w-36" />
        {stations >= 2 && <span className="flex-1 text-xs font-semibold text-[var(--text-muted)] text-center">Color</span>}
        <span className="flex-1 text-xs font-semibold text-[var(--text-muted)] text-center">B&W</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3 mb-2">
          <span className="w-36 text-sm font-semibold text-[var(--text-dim)]">{r.label}</span>
          {stations >= 2 && <span className="flex-1 text-center text-sm font-black">{r.color}</span>}
          <span className="flex-1 text-center text-sm font-black">{r.bw}</span>
        </div>
      ))}
      <p className="text-xs text-[var(--text-muted)] mt-1">* 5% coverage · A3 = 2× A4</p>
    </WizSection>
  );
}

<<<<<<< Updated upstream
=======
const KEY_TO_COLOR: Record<string, string> = { c: 'cyan', m: 'magenta', y: 'yellow', k: 'black' };

>>>>>>> Stashed changes
function StepCosts({ data, onChange }: { data: Data; onChange: OnChange }) {
  const mode = data.cost_mode as string;
  const inkType = data.ink_type as string;
  const stations = (data.color_stations as number) ?? 4;
  const extraCount = Math.max(0, stations - 4);

  return (
    <div className="space-y-6">
      {/* CPC — Click costs — only for simple modes */}
      {(mode === 'simple_in' || mode === 'simple_out') && (
        <WizSection title="CPC" sub="Click Costs" accent="var(--accent)">
          <ColHeaders labels={[{ w: 'w-20', text: '' }, ...(stations >= 2 ? [{ text: 'COLOR' }] : []), { text: 'B&W' }]} />
          <Row>
            <RowLabel>A4</RowLabel>
            {stations >= 2 && <div className="flex-1"><NumInput value={data.click_a4_color} onChange={(v) => onChange('click_a4_color', v)} placeholder="0.035" step="0.001" /></div>}
            <div className="flex-1"><NumInput value={data.click_a4_bw} onChange={(v) => onChange('click_a4_bw', v)} placeholder="0.007" step="0.001" /></div>
          </Row>
          <Row>
            <RowLabel>A3/SRA3</RowLabel>
            {stations >= 2 && <div className="flex-1"><NumInput value={data.click_a3_color} onChange={(v) => onChange('click_a3_color', v)} placeholder="0.070" step="0.001" /></div>}
            <div className="flex-1"><NumInput value={data.click_a3_bw} onChange={(v) => onChange('click_a3_bw', v)} placeholder="0.014" step="0.001" /></div>
          </Row>
          <Row>
            <RowLabel>Banner</RowLabel>
            {stations >= 2 && <div className="flex-1"><NumInput value={data.click_banner_color} onChange={(v) => onChange('click_banner_color', v)} step="0.001" /></div>}
            <div className="flex-1"><NumInput value={data.click_banner_bw} onChange={(v) => onChange('click_banner_bw', v)} step="0.001" /></div>
          </Row>
        </WizSection>
      )}

      {/* Extra color click costs — only for simple modes */}
      {(mode === 'simple_in' || mode === 'simple_out') && extraCount > 0 && (
        <WizSection title="Extra CPC" sub="Click ειδικών" accent="var(--accent)" border>
          {Array.from({ length: extraCount }).map((_, i) => {
            const name = `Σταθμός ${i + 1}`;
            return (
              <Row key={i}>
                <RowLabel className="text-[var(--accent)]">{name}</RowLabel>
                <div className="flex-1"><Field label="Click A4 €"><NumInput value={data[`click_extra_${i + 1}_a4`]} onChange={(v) => onChange(`click_extra_${i + 1}_a4`, v)} step="0.001" /></Field></div>
                <div className="flex-1"><Field label="Click A3 €"><NumInput value={data[`click_extra_${i + 1}_a3`]} onChange={(v) => onChange(`click_extra_${i + 1}_a3`, v)} step="0.001" /></Field></div>
              </Row>
            );
          })}
        </WizSection>
      )}

      {/* Duplex click multiplier — only relevant for simple modes */}
      {(mode === 'simple_in' || mode === 'simple_out') && (
        <WizSection title="Duplex" sub="Click πολλαπ." accent="var(--accent)" border>
          <p className="text-[0.65rem] text-[var(--text-dim)] mb-1">Πόσα clicks χρεώνει η 2η όψη (2 = διπλάσιο, 1 = ίδιο)</p>
          <Field label="Duplex Click Multiplier">
            <NumInput value={data.duplex_click_multiplier} onChange={(v) => onChange('duplex_click_multiplier', v)} placeholder="2" />
          </Field>
        </WizSection>
      )}

      {/* ─── TONER CONSUMABLES (simple_out / precision) ─── */}
      {(mode === 'simple_out' || mode === 'precision') && inkType === 'toner' && (
        <WizSection title="Χρώμα" sub="@ 5% coverage" accent="var(--accent)" border>
<<<<<<< Updated upstream
          <ColHeaders labels={[{ w: 'w-20', text: '' }, { text: 'Yield (σελίδες)' }, { text: 'Cost €' }]} />
          {getColorStations(stations).map((c) => (
            <Row key={c.key}>
              <RowLabel className={c.cls}>{c.name}</RowLabel>
              <div className="flex-1"><NumInput value={data[`toner_${c.key}_yield`]} onChange={(v) => onChange(`toner_${c.key}_yield`, v)} /></div>
              <div className="flex-1"><NumInput value={data[`toner_${c.key}_cost`]} onChange={(v) => onChange(`toner_${c.key}_cost`, v)} step="0.01" /></div>
            </Row>
          ))}
          {extraCount > 0 && Array.from({ length: extraCount }).map((_, i) => {
            const name = `Σταθμός ${i + 1}`;
            return (
              <Row dashed key={i}>
                <RowLabel className="text-[var(--accent)]">{name}</RowLabel>
                <div className="flex-1"><NumInput value={data[`extra_color_${i + 1}_yield`]} onChange={(v) => onChange(`extra_color_${i + 1}_yield`, v)} /></div>
                <div className="flex-1"><NumInput value={data[`extra_color_${i + 1}_cost`]} onChange={(v) => onChange(`extra_color_${i + 1}_cost`, v)} step="0.01" /></div>
              </Row>
            );
          })}
=======
          {getColorStations(stations).map((c) => (
            <ConsumableSlot key={c.key} label={c.name} labelCls={c.cls}
              conType="toner" conModule="digital" color={KEY_TO_COLOR[c.key]}
              costField={`toner_${c.key}_cost`} yieldField={`toner_${c.key}_yield`}
              idField={`toner_${c.key}_consumable_id`} nameField={`toner_${c.key}_consumable_name`}
              data={data} onChange={onChange} />
          ))}
          {extraCount > 0 && Array.from({ length: extraCount }).map((_, i) => (
            <ConsumableSlot key={i} label={`Σταθμός ${i + 1}`} labelCls="text-[var(--accent)]"
              conType="toner" conModule="digital" dashed
              costField={`extra_color_${i + 1}_cost`} yieldField={`extra_color_${i + 1}_yield`}
              idField={`extra_color_${i + 1}_consumable_id`} nameField={`extra_color_${i + 1}_consumable_name`}
              data={data} onChange={onChange} />
          ))}
>>>>>>> Stashed changes
        </WizSection>
      )}

      {/* ─── DRUMS (precision only) ─── */}
      {mode === 'precision' && inkType === 'toner' && (
        <WizSection title="Drums" sub="Life & Cost" accent="var(--accent)" border>
<<<<<<< Updated upstream
          <ColHeaders labels={[{ w: 'w-20', text: '' }, { text: 'Life (σελίδες)' }, { text: 'Cost €' }]} />
          {getColorStations(stations).map((c) => (
            <Row key={c.key}>
              <RowLabel className={c.cls}>{c.name}</RowLabel>
              <div className="flex-1"><NumInput value={data[`drum_${c.key}_life`]} onChange={(v) => onChange(`drum_${c.key}_life`, v)} /></div>
              <div className="flex-1"><NumInput value={data[`drum_${c.key}_cost`]} onChange={(v) => onChange(`drum_${c.key}_cost`, v)} step="0.01" /></div>
            </Row>
          ))}
          {extraCount > 0 && Array.from({ length: extraCount }).map((_, i) => {
            const name = `Σταθμός ${i + 1}`;
            return (
              <Row dashed key={i}>
                <RowLabel className="text-[var(--accent)]">{name}</RowLabel>
                <div className="flex-1"><NumInput value={data[`drum_extra_${i + 1}_life`]} onChange={(v) => onChange(`drum_extra_${i + 1}_life`, v)} /></div>
                <div className="flex-1"><NumInput value={data[`drum_extra_${i + 1}_cost`]} onChange={(v) => onChange(`drum_extra_${i + 1}_cost`, v)} step="0.01" /></div>
              </Row>
            );
          })}
=======
          {getColorStations(stations).map((c) => (
            <ConsumableSlot key={c.key} label={c.name} labelCls={c.cls}
              conType="drum" conModule="digital" color={KEY_TO_COLOR[c.key]}
              costField={`drum_${c.key}_cost`} yieldField={`drum_${c.key}_life`}
              idField={`drum_${c.key}_consumable_id`} nameField={`drum_${c.key}_consumable_name`}
              data={data} onChange={onChange} />
          ))}
          {extraCount > 0 && Array.from({ length: extraCount }).map((_, i) => (
            <ConsumableSlot key={i} label={`Σταθμός ${i + 1}`} labelCls="text-[var(--accent)]"
              conType="drum" conModule="digital" dashed
              costField={`drum_extra_${i + 1}_cost`} yieldField={`drum_extra_${i + 1}_life`}
              idField={`drum_extra_${i + 1}_consumable_id`} nameField={`drum_extra_${i + 1}_consumable_name`}
              data={data} onChange={onChange} />
          ))}
>>>>>>> Stashed changes
        </WizSection>
      )}

      {/* ─── DEVELOPER (precision only) ─── */}
      {mode === 'precision' && inkType === 'toner' && (
        <WizSection title="Developer" sub="Life & Cost" accent="var(--accent)" border>
          <PillToggle value={data.developer_type} options={[{ v: 'integrated', l: 'Στο Drum' }, { v: 'separate', l: 'Ξεχωριστό' }]} onChange={(v) => onChange('developer_type', v)} />
          {data.developer_type === 'separate' && (
            <>
              {getColorStations(stations).map((c) => (
<<<<<<< Updated upstream
                <Row key={c.key}>
                  <RowLabel className={c.cls}>{c.name}</RowLabel>
                  <div className="flex-1"><NumInput value={data[`dev_${c.key}_life`]} onChange={(v) => onChange(`dev_${c.key}_life`, v)} /></div>
                  <div className="flex-1"><NumInput value={data[`dev_${c.key}_cost`]} onChange={(v) => onChange(`dev_${c.key}_cost`, v)} step="0.01" /></div>
                </Row>
              ))}
              {extraCount > 0 && Array.from({ length: extraCount }).map((_, i) => {
                const name = `Σταθμός ${i + 1}`;
                return (
                  <Row dashed key={i}>
                    <RowLabel className="text-[var(--accent)]">{name}</RowLabel>
                    <div className="flex-1"><NumInput value={data[`dev_extra_${i + 1}_life`]} onChange={(v) => onChange(`dev_extra_${i + 1}_life`, v)} /></div>
                    <div className="flex-1"><NumInput value={data[`dev_extra_${i + 1}_cost`]} onChange={(v) => onChange(`dev_extra_${i + 1}_cost`, v)} step="0.01" /></div>
                  </Row>
                );
              })}
=======
                <ConsumableSlot key={c.key} label={c.name} labelCls={c.cls}
                  conType="developer" conModule="digital" color={KEY_TO_COLOR[c.key]}
                  costField={`dev_${c.key}_cost`} yieldField={`dev_${c.key}_life`}
                  idField={`dev_${c.key}_consumable_id`} nameField={`dev_${c.key}_consumable_name`}
                  data={data} onChange={onChange} />
              ))}
              {extraCount > 0 && Array.from({ length: extraCount }).map((_, i) => (
                <ConsumableSlot key={i} label={`Σταθμός ${i + 1}`} labelCls="text-[var(--accent)]"
                  conType="developer" conModule="digital" dashed
                  costField={`dev_extra_${i + 1}_cost`} yieldField={`dev_extra_${i + 1}_life`}
                  idField={`dev_extra_${i + 1}_consumable_id`} nameField={`dev_extra_${i + 1}_consumable_name`}
                  data={data} onChange={onChange} />
              ))}
>>>>>>> Stashed changes
            </>
          )}
        </WizSection>
      )}

      {/* ─── CORONAS (precision only) ─── */}
      {mode === 'precision' && inkType === 'toner' && (
        <WizSection title="Coronas" sub={`Charge wires · ×${stations >= 4 ? 4 : stations} σταθμοί`} accent="var(--accent)" border>
          <Toggle value={data.has_charge_coronas} onChange={(v) => onChange('has_charge_coronas', v)} labelOn="Ναι — Έχει" labelOff="Όχι" />
          {!!data.has_charge_coronas && (
<<<<<<< Updated upstream
            <Row>
              <RowLabel>Corona</RowLabel>
              <div className="flex-1"><NumInput value={data.corona_life} onChange={(v) => onChange('corona_life', v)} /></div>
              <div className="flex-1"><NumInput value={data.corona_cost} onChange={(v) => onChange('corona_cost', v)} step="0.01" /></div>
            </Row>
=======
            <ConsumableSlot label="Corona" conType="corona" conModule="digital"
              costField="corona_cost" yieldField="corona_life"
              idField="corona_consumable_id" nameField="corona_consumable_name"
              data={data} onChange={onChange} />
>>>>>>> Stashed changes
          )}
        </WizSection>
      )}

      {/* ─── SERVICE PARTS (precision, toner only) ─── */}
      {mode === 'precision' && inkType === 'toner' && (
        <WizSection title="Service" sub="Parts & Waste" accent="var(--accent)" border>
<<<<<<< Updated upstream
          <ColHeaders labels={[{ w: 'w-20', text: '' }, { text: 'Life (σελίδες)' }, { text: 'Cost €' }]} />
          {[
            { label: 'Fuser', life: 'fuser_life', cost: 'fuser_cost' },
            { label: 'Belt', life: 'belt_life', cost: 'belt_cost' },
            { label: 'Waste', life: 'waste_life', cost: 'waste_cost' },
          ].map((p) => (
            <Row key={p.label}>
              <RowLabel>{p.label}</RowLabel>
              <div className="flex-1"><NumInput value={data[p.life]} onChange={(v) => onChange(p.life, v)} /></div>
              <div className="flex-1"><NumInput value={data[p.cost]} onChange={(v) => onChange(p.cost, v)} step="0.01" /></div>
            </Row>
=======
          {[
            { label: 'Fuser', life: 'fuser_life', cost: 'fuser_cost', type: 'fuser' },
            { label: 'Belt', life: 'belt_life', cost: 'belt_cost', type: 'belt' },
            { label: 'Waste', life: 'waste_life', cost: 'waste_cost', type: 'waste' },
          ].map((p) => (
            <ConsumableSlot key={p.label} label={p.label} conType={p.type} conModule="digital"
              costField={p.cost} yieldField={p.life}
              idField={`${p.type}_consumable_id`} nameField={`${p.type}_consumable_name`}
              data={data} onChange={onChange} />
>>>>>>> Stashed changes
          ))}
        </WizSection>
      )}

      {/* Liquid Ink — simple_out: only ink can */}
      {mode === 'simple_out' && inkType === 'liquid' && (
        <WizSection title="Ink Cans" sub="ElectroInk" accent="var(--accent)" border>
<<<<<<< Updated upstream
          <Row>
            <RowLabel className="!w-28">ElectroInk Can</RowLabel>
            <div className="flex-1"><Field label="Yield (impressions)"><NumInput value={data.ink_can_yield} onChange={(v) => onChange('ink_can_yield', v)} /></Field></div>
            <div className="flex-1"><Field label="Κόστος €"><NumInput value={data.ink_can_cost} onChange={(v) => onChange('ink_can_cost', v)} step="0.01" /></Field></div>
          </Row>
=======
          <ConsumableSlot label="ElectroInk Can" conType="ink" conModule="digital"
            costField="ink_can_cost" yieldField="ink_can_yield"
            idField="ink_can_consumable_id" nameField="ink_can_consumable_name"
            data={data} onChange={onChange} />
>>>>>>> Stashed changes
        </WizSection>
      )}

      {/* ─── LIQUID INK PRECISION (HP Indigo) ─── */}
      {mode === 'precision' && inkType === 'liquid' && (
        <>
          <WizSection title="Ink" sub="ElectroInk cans" accent="var(--accent)" border>
<<<<<<< Updated upstream
            <ColHeaders labels={[{ w: 'w-20', text: '' }, { text: 'Yield (impressions)' }, { text: 'Cost €' }]} />
            <Row>
              <RowLabel>CMYK Can</RowLabel>
              <div className="flex-1"><NumInput value={data.ink_can_yield} onChange={(v) => onChange('ink_can_yield', v)} /></div>
              <div className="flex-1"><NumInput value={data.ink_can_cost} onChange={(v) => onChange('ink_can_cost', v)} step="0.01" /></div>
            </Row>
=======
            <ConsumableSlot label="CMYK Can" conType="ink" conModule="digital"
              costField="ink_can_cost" yieldField="ink_can_yield"
              idField="ink_can_consumable_id" nameField="ink_can_consumable_name"
              data={data} onChange={onChange} />
>>>>>>> Stashed changes
            <Row>
              <RowLabel>Impression</RowLabel>
              <div className="flex-1"><NumInput value={data.impression_charge} onChange={(v) => onChange('impression_charge', v)} step="0.001" /></div>
              <div className="flex-1" />
            </Row>
            {extraCount > 0 && Array.from({ length: extraCount }).map((_, i) => (
<<<<<<< Updated upstream
              <Row dashed key={i}>
                <RowLabel className="text-[var(--accent)]">Extra {i + 1}</RowLabel>
                <div className="flex-1"><NumInput value={data[`ink_extra_${i + 1}_yield`]} onChange={(v) => onChange(`ink_extra_${i + 1}_yield`, v)} /></div>
                <div className="flex-1"><NumInput value={data[`ink_extra_${i + 1}_cost`]} onChange={(v) => onChange(`ink_extra_${i + 1}_cost`, v)} step="0.01" /></div>
              </Row>
=======
              <ConsumableSlot key={i} label={`Extra ${i + 1}`} labelCls="text-[var(--accent)]"
                conType="ink" conModule="digital" dashed
                costField={`ink_extra_${i + 1}_cost`} yieldField={`ink_extra_${i + 1}_yield`}
                idField={`ink_extra_${i + 1}_consumable_id`} nameField={`ink_extra_${i + 1}_consumable_name`}
                data={data} onChange={onChange} />
>>>>>>> Stashed changes
            ))}
          </WizSection>

          <WizSection title="Parts" sub="Blanket, PIP" accent="var(--accent)" border>
<<<<<<< Updated upstream
            <ColHeaders labels={[{ w: 'w-20', text: '' }, { text: 'Life (impressions)' }, { text: 'Cost €' }]} />
            <Row>
              <RowLabel>Blanket</RowLabel>
              <div className="flex-1"><NumInput value={data.blanket_life} onChange={(v) => onChange('blanket_life', v)} /></div>
              <div className="flex-1"><NumInput value={data.blanket_cost} onChange={(v) => onChange('blanket_cost', v)} step="0.01" /></div>
            </Row>
            <Row>
              <RowLabel>PIP</RowLabel>
              <div className="flex-1"><NumInput value={data.pip_life} onChange={(v) => onChange('pip_life', v)} /></div>
              <div className="flex-1"><NumInput value={data.pip_cost} onChange={(v) => onChange('pip_cost', v)} step="0.01" /></div>
            </Row>
=======
            <ConsumableSlot label="Blanket" conType="blanket" conModule="digital"
              costField="blanket_cost" yieldField="blanket_life"
              idField="blanket_consumable_id" nameField="blanket_consumable_name"
              data={data} onChange={onChange} />
            <ConsumableSlot label="PIP" conType="other" conModule="digital"
              costField="pip_cost" yieldField="pip_life"
              idField="pip_consumable_id" nameField="pip_consumable_name"
              data={data} onChange={onChange} />
>>>>>>> Stashed changes
          </WizSection>

          <WizSection title="Setup" sub="Mixing / Prep" accent="var(--accent)" border>
            <Row>
              <RowLabel>Mixing Fee</RowLabel>
              <div className="flex-1"><NumInput value={data.mixing_fee} onChange={(v) => onChange('mixing_fee', v)} step="0.01" /></div>
              <div className="flex-1" />
            </Row>
          </WizSection>
        </>
      )}

      {/* Live cost preview */}
      <CostPreview data={data} />
<<<<<<< Updated upstream
=======

>>>>>>> Stashed changes
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
    <div className="space-y-6">
      <WizSection title="Ζώνες" sub="Ταχύτητα / GSM" accent="var(--teal)">
        <p className="text-sm text-[var(--text-dim)]">
          Ορίστε ζώνες ταχύτητας ανά βάρος χαρτιού. Βαρύτερα χαρτιά = αργότερη ταχύτητα + markup.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
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
        <AddButton label="+ Προσθήκη Ζώνης" onClick={addZone} />
      </WizSection>
    </div>
  );
}

function StepProduction({ data, onChange }: { data: Data; onChange: OnChange }) {
  const depCost = data.include_depreciation && data.machine_cost && data.machine_lifetime_passes
    ? ((data.machine_cost as number) / (data.machine_lifetime_passes as number)).toFixed(4)
    : null;
  return (
    <div className="space-y-6">
      <WizSection title="Setup" sub="Φύρα & Χρόνοι" accent="var(--success)">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Φύρα Setup (φύλλα)"><NumInput value={data.setup_sheets_waste} onChange={(v) => onChange('setup_sheets_waste', v)} /></Field>
          <Field label="Φύρα Εκτύπωσης (%)"><NumInput value={data.registration_spoilage_pct} onChange={(v) => onChange('registration_spoilage_pct', v)} /></Field>
          <Field label="Warmup (λεπτά)"><NumInput value={data.warmup_minutes} onChange={(v) => onChange('warmup_minutes', v)} /></Field>
        </div>
      </WizSection>

      <WizSection title="Απόσβεση" sub="Depreciation" accent="var(--success)" border>
        <Toggle value={data.include_depreciation} onChange={(v) => onChange('include_depreciation', v)} labelOn="ON" labelOff="OFF" />
        {!!data.include_depreciation && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Κόστος Μηχανής (€)"><NumInput value={data.machine_cost} onChange={(v) => onChange('machine_cost', v)} /></Field>
            <Field label="Όριο Ζωής (περάσματα)"><NumInput value={data.machine_lifetime_passes} onChange={(v) => onChange('machine_lifetime_passes', v)} /></Field>
          </div>
        )}
        {depCost && <p className="text-sm text-[var(--success)] mt-2">Απόσβεση / click: €{depCost}</p>}
      </WizSection>
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
    <div className="space-y-6">
      <WizSection title="Μηχανή" sub="Τρέχουσα κατάσταση" accent="var(--teal)">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Counter"><NumInput value={data.current_counter} onChange={(v) => onChange('current_counter', v)} placeholder="π.χ. 1250000" /></Field>
          <Field label="Τελευταίο Service"><input className={inputCls} type="date" value={(data.last_service_date as string) ?? ''} onChange={(e) => onChange('last_service_date', e.target.value)} /></Field>
        </div>
        <Field label="Σημειώσεις"><textarea className={inputCls + " !h-14 py-2 resize-none"} value={(data.maint_notes as string) ?? ''} onChange={(e) => onChange('maint_notes', e.target.value)} placeholder="Γενικές σημειώσεις συντήρησης..." /></Field>
      </WizSection>

      <WizSection title="Ημερολόγιο" sub="Ιστορικό service" accent="var(--teal)" border>
<<<<<<< Updated upstream
        {logs.length > 0 && <ColHeaders labels={[{ w: 'w-28', text: 'Ημερομηνία' }, { w: 'w-24', text: 'Counter' }, { text: 'Περιγραφή' }, { w: 'w-5', text: '' }]} />}
        {logs.map((l, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-2">
            <input className={inputCls + " !h-8 w-28"} type="date" value={l.date} onChange={(e) => updateLog(i, 'date', e.target.value)} />
            <input className={inputCls + " !h-8 w-24 text-center"} type="number" value={l.counter ?? ''} onChange={(e) => updateLog(i, 'counter', e.target.value ? +e.target.value : null)} placeholder="Counter" />
            <input className={inputCls + " !h-8 flex-1"} value={l.description} onChange={(e) => updateLog(i, 'description', e.target.value)} placeholder="π.χ. Αλλαγή fuser, PM kit..." />
            <button onClick={() => delLog(i)} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--danger)] text-lg">×</button>
=======
        {logs.map((l, i) => (
          <div key={i} className="rounded-lg bg-white/[0.03] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input className={inputCls + " !h-8 w-32"} type="date" value={l.date} onChange={(e) => updateLog(i, 'date', e.target.value)} />
              <input className={inputCls + " !h-8 w-28 text-center no-spinners"} type="number" value={l.counter ?? ''} onChange={(e) => updateLog(i, 'counter', e.target.value ? +e.target.value : null)} placeholder="Counter" />
              <span className="flex-1" />
              <button onClick={() => delLog(i)} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--danger)] text-lg">×</button>
            </div>
            <textarea className={inputCls + " !h-16 py-2 resize-none text-sm"} value={l.description} onChange={(e) => updateLog(i, 'description', e.target.value)} placeholder="Τι αλλάχτηκε; π.χ. Αλλαγή fuser kit, καθαρισμός coronas, PM 500K..." />
>>>>>>> Stashed changes
          </div>
        ))}
        <AddButton label="+ Προσθήκη Εγγραφής" onClick={addLog} />
      </WizSection>
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
    <div className="space-y-6">
      <WizSection title="Τεχνικοί" sub="Επαφές service" accent="var(--accent)">
        {techs.length > 0 && <ColHeaders labels={[{ w: 'w-[30%]', text: 'Ειδικότητα' }, { w: 'w-[35%]', text: 'Όνομα' }, { text: 'Τηλέφωνο' }, { w: 'w-5', text: '' }]} />}
        {techs.map((t, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-2">
            <input className={inputCls + " !h-8 w-[30%]"} value={t.role} onChange={(e) => updateTech(i, 'role', e.target.value)} placeholder="π.χ. Service" />
            <input className={inputCls + " !h-8 w-[35%]"} value={t.name} onChange={(e) => updateTech(i, 'name', e.target.value)} placeholder="Γιώργος Κ." />
            <input className={inputCls + " !h-8 flex-1"} value={t.phone} onChange={(e) => updateTech(i, 'phone', e.target.value)} placeholder="210-..." />
            <button onClick={() => delTech(i)} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--danger)] text-lg">×</button>
          </div>
        ))}
        <AddButton label="+ Προσθήκη Τεχνικού" onClick={addTech} />
      </WizSection>

      <WizSection title="Links" sub="Εγχειρίδια & drivers" accent="var(--accent)" border>
        <Field label="Service Manual"><input className={inputCls} value={(data.manual_url as string) ?? ''} onChange={(e) => onChange('manual_url', e.target.value)} placeholder="https://..." /></Field>
        <Field label="Driver / PPD"><input className={inputCls} value={(data.driver_url as string) ?? ''} onChange={(e) => onChange('driver_url', e.target.value)} placeholder="https://..." /></Field>
      </WizSection>
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
