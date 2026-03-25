'use client';

import { useState } from 'react';
import { Zap, CheckCircle, AlertTriangle } from 'lucide-react';
import { aiScanOffset } from './ai-scan-action';
import { inputCls, NumInput, Field, WizSection, Row, RowLabel, PillToggle, Toggle, ColHeaders, AddButton } from './wizard-ui';

type OnChange = (field: string, value: unknown) => void;
type Data = Record<string, unknown>;

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
    setScanning(true); setResult(null);
    const res = await aiScanOffset(name);
    setResult(res);
    if (res.success) { for (const [k, v] of Object.entries(res.specs)) { if (v !== null && v !== undefined) onChange(k, v); } }
    setScanning(false);
  }

  return (
    <div className="space-y-6">
      <WizSection title="Μοντέλο" sub="Όνομα μηχανής" accent="var(--violet)">
        <input className={inputCls} value={(data.name as string) ?? ''} onChange={(e) => onChange('name', e.target.value)} placeholder="π.χ. Heidelberg SM 74-4" autoFocus />
        <button onClick={handleScan} disabled={scanning || !(data.name as string)?.trim()}
          className="flex items-center gap-2 rounded-lg border border-[var(--blue)] bg-[var(--blue)]/10 px-5 py-2.5 text-sm font-bold text-[var(--blue)] transition-all hover:bg-[var(--blue)]/20 disabled:opacity-40">
          <Zap className="h-4 w-4" />{scanning ? 'Αναζήτηση...' : 'AI Scan'}
        </button>
        {scanning && (
          <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-4 text-sm text-[var(--text-dim)]">
            <div className="h-4 w-4 shrink-0 rounded-full border-2 border-[var(--blue)] border-t-transparent animate-spin" />Αναζήτηση προδιαγραφών...
          </div>
        )}
        {result?.success && (
          <div className="flex items-center gap-3 rounded-lg bg-[var(--success)]/10 p-4 text-sm text-[var(--success)]">
            <CheckCircle className="h-5 w-5 shrink-0" /><div><strong>Βρέθηκαν {result.fieldsFound} προδιαγραφές</strong></div>
          </div>
        )}
        {result && !result.success && (
          <div className="flex items-center gap-3 rounded-lg bg-[var(--danger)]/10 p-4 text-sm text-[var(--danger)]">
            <AlertTriangle className="h-5 w-5 shrink-0" /><div><strong>Δεν βρέθηκαν</strong><p className="text-xs mt-1">{result.error}</p></div>
          </div>
        )}
      </WizSection>
    </div>
  );
}

function StepPaper({ data, onChange }: { data: Data; onChange: OnChange }) {
  return (
    <div className="space-y-6">
      <WizSection title="Max Φύλλο" sub="Μέγιστο (mm)" accent="var(--blue)">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Short Side (SS)"><NumInput value={data.off_max_ss} onChange={(v) => onChange('off_max_ss', v)} /></Field>
          <Field label="Long Side (LS)"><NumInput value={data.off_max_ls} onChange={(v) => onChange('off_max_ls', v)} /></Field>
        </div>
      </WizSection>
      <WizSection title="Min Φύλλο" sub="Ελάχιστο (mm)" accent="var(--blue)" border>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Short Side (SS)"><NumInput value={data.off_min_ss} onChange={(v) => onChange('off_min_ss', v)} /></Field>
          <Field label="Long Side (LS)"><NumInput value={data.off_min_ls} onChange={(v) => onChange('off_min_ls', v)} /></Field>
        </div>
      </WizSection>
    </div>
  );
}

function StepMargins({ data, onChange }: { data: Data; onChange: OnChange }) {
  return (
    <div className="space-y-6">
      <WizSection title="Gripper & Tail" sub="Long sides (mm)" accent="var(--teal)">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Gripper (εμπρός)"><NumInput value={data.off_gripper} onChange={(v) => onChange('off_gripper', v)} /></Field>
          <Field label="Tail (πίσω)"><NumInput value={data.off_margin_tail} onChange={(v) => onChange('off_margin_tail', v)} /></Field>
        </div>
      </WizSection>
      <WizSection title="Side Lay" sub="Short sides (mm)" accent="var(--teal)" border>
        <Field label="Αριστερά / Δεξιά"><NumInput value={data.off_side_margin} onChange={(v) => onChange('off_side_margin', v)} /></Field>
      </WizSection>
    </div>
  );
}

function StepThickness({ data, onChange }: { data: Data; onChange: OnChange }) {
  return (
    <div className="space-y-6">
      <WizSection title="Μονάδα" sub="Βάρος / Πάχος" accent="var(--violet)">
        <PillToggle value={data.off_thick_unit} options={[{ v: 'gr', l: 'Γραμμάρια (g/m²)' }, { v: 'mic', l: 'Microns (μm)' }]} onChange={(v) => onChange('off_thick_unit', v)} />
      </WizSection>
      <WizSection title="Εύρος" sub={data.off_thick_unit === 'gr' ? 'g/m²' : 'μm'} accent="var(--violet)" border>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ελάχιστο"><NumInput value={data.off_min_thick} onChange={(v) => onChange('off_min_thick', v)} /></Field>
          <Field label="Μέγιστο"><NumInput value={data.off_max_thick} onChange={(v) => onChange('off_max_thick', v)} /></Field>
        </div>
      </WizSection>
    </div>
  );
}

function StepMachine({ data, onChange }: { data: Data; onChange: OnChange }) {
  return (
    <div className="space-y-6">
      <WizSection title="Πύργοι" sub="Ταχύτητα" accent="var(--accent)">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Πύργοι"><NumInput value={data.off_towers} onChange={(v) => onChange('off_towers', v)} /></Field>
          <Field label="Max (φύλλα/ώρα)"><NumInput value={data.off_speed} onChange={(v) => onChange('off_speed', v)} /></Field>
          <Field label="Συνήθης (φ/ώρα)"><NumInput value={data.off_common_speed} onChange={(v) => onChange('off_common_speed', v)} /></Field>
        </div>
      </WizSection>

      <WizSection title="Περφορέ" sub="Perfecting" accent="var(--accent)" border>
        <div className="flex items-center gap-4">
          <Toggle value={data.off_perfecting} onChange={(v) => onChange('off_perfecting', v)} labelOn="Ναι" labelOff="Όχι" />
          {!!data.off_perfecting && <div className="flex-1"><Field label="Τροχοί"><NumInput value={data.off_perfo_cnt} onChange={(v) => onChange('off_perfo_cnt', v)} /></Field></div>}
        </div>
      </WizSection>

      <WizSection title="Αρίθμηση" sub="Numbering" accent="var(--accent)" border>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <span className="w-20 text-sm font-semibold text-[var(--text-dim)]">Οριζόντια</span>
            <Toggle value={data.off_num_h} onChange={(v) => onChange('off_num_h', v)} labelOn="Ναι" labelOff="Όχι" />
            {!!data.off_num_h && <>
              <div className="flex-1"><Field label="Κεφαλές"><NumInput value={data.off_num_h_cnt} onChange={(v) => onChange('off_num_h_cnt', v)} /></Field></div>
              <div className="flex-1"><Field label="Min X (mm)"><NumInput value={data.off_num_min_x} onChange={(v) => onChange('off_num_min_x', v)} /></Field></div>
            </>}
          </div>
          <div className="flex items-center gap-4">
            <span className="w-20 text-sm font-semibold text-[var(--text-dim)]">Κάθετη</span>
            <Toggle value={data.off_num_v} onChange={(v) => onChange('off_num_v', v)} labelOn="Ναι" labelOff="Όχι" />
            {!!data.off_num_v && <>
              <div className="flex-1"><Field label="Κεφαλές"><NumInput value={data.off_num_v_cnt} onChange={(v) => onChange('off_num_v_cnt', v)} /></Field></div>
              <div className="flex-1"><Field label="Min Y (mm)"><NumInput value={data.off_num_min_y} onChange={(v) => onChange('off_num_min_y', v)} /></Field></div>
            </>}
          </div>
        </div>
      </WizSection>

      <WizSection title="Βερνίκι" sub="Coating Tower" accent="var(--accent)" border>
        <div className="flex items-center gap-4">
          <Toggle value={data.off_has_varnish_tower} onChange={(v) => onChange('off_has_varnish_tower', v)} labelOn="Ναι" labelOff="Όχι" />
          {!!data.off_has_varnish_tower && (
            <div className="flex-1"><PillToggle value={data.off_varnish_type} options={[{ v: 'aqueous', l: 'Aqueous (AQ)' }, { v: 'uv', l: 'UV' }]} onChange={(v) => onChange('off_varnish_type', v)} /></div>
          )}
        </div>
        {!!data.off_has_varnish_tower && <p className="text-[0.65rem] text-[var(--text-muted)]">Η βερνικιέρα είναι ξεχωριστή μονάδα.</p>}
      </WizSection>
    </div>
  );
}

function StepProduction({ data, onChange }: { data: Data; onChange: OnChange }) {
  const depHour = data.off_include_depreciation && data.off_machine_cost && data.off_depreciation_years && data.off_hours_per_year
    ? ((data.off_machine_cost as number) / ((data.off_depreciation_years as number) * (data.off_hours_per_year as number))).toFixed(2)
    : null;

  return (
    <div className="space-y-6">
      <WizSection title="Setup" sub="Φύρα & Χρόνοι" accent="var(--success)">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Φύρα (φύλλα)"><NumInput value={data.off_default_waste} onChange={(v) => onChange('off_default_waste', v)} /></Field>
          <Field label="Setup (λεπτά)"><NumInput value={data.off_setup_min} onChange={(v) => onChange('off_setup_min', v)} /></Field>
          <Field label="Wash (λεπτά)"><NumInput value={data.off_wash_min} onChange={(v) => onChange('off_wash_min', v)} /></Field>
        </div>
        <p className="text-[0.6rem] text-[var(--text-muted)]">Η φύρα είναι baseline — αλλάζει ανά εργασία.</p>
      </WizSection>

      <WizSection title="Κόστος" sub="Εργασία & Ενέργεια" accent="var(--success)" border>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Εργατοώρα (€/ώρα)"><NumInput value={data.off_hour_c} onChange={(v) => onChange('off_hour_c', v)} step="0.01" /></Field>
          <Field label="Ενέργεια (€/ώρα)"><NumInput value={data.off_energy_hourly} onChange={(v) => onChange('off_energy_hourly', v)} step="0.01" /></Field>
        </div>
      </WizSection>

      <WizSection title="Απόσβεση" sub="BHR method" accent="var(--success)" border>
        <Toggle value={data.off_include_depreciation} onChange={(v) => onChange('off_include_depreciation', v)} labelOn="Ναι — Υπολογισμός" labelOff="Όχι" />
        {!!data.off_include_depreciation && (
          <div className="grid grid-cols-3 gap-3 mt-2">
            <Field label="Κόστος Μηχανής (€)"><NumInput value={data.off_machine_cost} onChange={(v) => onChange('off_machine_cost', v)} /></Field>
            <Field label="Έτη Απόσβεσης"><NumInput value={data.off_depreciation_years} onChange={(v) => onChange('off_depreciation_years', v)} /></Field>
            <Field label="Ώρες / Έτος"><NumInput value={data.off_hours_per_year} onChange={(v) => onChange('off_hours_per_year', v)} /></Field>
          </div>
        )}
        {depHour && <p className="text-sm text-[var(--success)] mt-2">Απόσβεση / ώρα: €{depHour}</p>}
      </WizSection>

      <WizSection title="Κατανάλωση" sub="Ρυθμοί χρήσης" accent="var(--success)" border>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Μελάνι (g/m²)"><NumInput value={data.off_ink_gm2} onChange={(v) => onChange('off_ink_gm2', v)} step="0.1" /></Field>
          <Field label="Βερνίκι OPV (g/m²)"><NumInput value={data.off_varnish_gm2} onChange={(v) => onChange('off_varnish_gm2', v)} step="0.1" /></Field>
          {!!data.off_has_varnish_tower && <Field label="Coating (g/m²)"><NumInput value={data.off_coating_gm2} onChange={(v) => onChange('off_coating_gm2', v)} step="0.1" /></Field>}
        </div>
        <p className="text-[0.6rem] text-[var(--text-muted)]">Τεχνικές παράμετροι για τον υπολογισμό κόστους ανά φύλλο.</p>
      </WizSection>
    </div>
  );
}

function StepParts({ data, onChange }: { data: Data; onChange: OnChange }) {
  const rollerCost = data.off_include_rollers && data.off_roller_count && data.off_roller_recover_c && data.off_roller_recover_life
    ? (((data.off_roller_count as number) * (data.off_roller_recover_c as number)) / (data.off_roller_recover_life as number)).toFixed(5) : null;

  return (
    <div className="space-y-6">
      <WizSection title="Τσίγκος" sub="CTP Plates" accent="var(--blue)">
        <Toggle value={data.off_include_parts} onChange={(v) => onChange('off_include_parts', v)} labelOn="Συμπεριλαμβάνεται" labelOff="Εξαιρείται" />
        {!!data.off_include_parts && (
          <Row><RowLabel>Plate</RowLabel><div className="flex-1"><Field label="Κόστος €/τεμ"><NumInput value={data.off_plate_c} onChange={(v) => onChange('off_plate_c', v)} step="0.01" /></Field></div></Row>
        )}
      </WizSection>

      <WizSection title="Καουτσούκ" sub="Blankets" accent="var(--blue)" border>
        {!!data.off_include_parts && (
          <Row>
            <RowLabel>Blanket</RowLabel>
            <div className="flex-1"><Field label="Κόστος €"><NumInput value={data.off_blanket_c} onChange={(v) => onChange('off_blanket_c', v)} step="0.01" /></Field></div>
            <div className="flex-1"><Field label="Life (impressions)"><NumInput value={data.off_blanket_life} onChange={(v) => onChange('off_blanket_life', v)} /></Field></div>
          </Row>
        )}
      </WizSection>

      <WizSection title="Ρολά" sub="Αναγόμωση" accent="var(--blue)" border>
        <Toggle value={data.off_include_rollers} onChange={(v) => onChange('off_include_rollers', v)} labelOn="Ναι" labelOff="Όχι" />
        {!!data.off_include_rollers && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Αριθμός ρολών"><NumInput value={data.off_roller_count} onChange={(v) => onChange('off_roller_count', v)} /></Field>
              <Field label="€ / ρολό"><NumInput value={data.off_roller_recover_c} onChange={(v) => onChange('off_roller_recover_c', v)} step="0.01" /></Field>
              <Field label="Life (impressions)"><NumInput value={data.off_roller_recover_life} onChange={(v) => onChange('off_roller_recover_life', v)} /></Field>
            </div>
            {rollerCost && <p className="text-sm text-[var(--text-dim)]">Κόστος / impression: €{rollerCost}</p>}
          </>
        )}
      </WizSection>
    </div>
  );
}

function StepInks({ data, onChange }: { data: Data; onChange: OnChange }) {
  return (
    <div className="space-y-6">
      <WizSection title="Μελάνια" sub="CMYK (€/kg)" accent="var(--accent)">
        <Toggle value={data.off_include_inks} onChange={(v) => onChange('off_include_inks', v)} labelOn="Συμπεριλαμβάνεται" labelOff="Εξαιρείται" />
        {!!data.off_include_inks && (
          <>
            <ColHeaders labels={[{ w: 'w-20', text: '' }, { text: 'Κόστος €/kg' }]} />
            {[
              { name: 'Cyan', key: 'ink_c_p', cls: 'text-cyan-400' },
              { name: 'Magenta', key: 'ink_m_p', cls: 'text-pink-400' },
              { name: 'Yellow', key: 'ink_y_p', cls: 'text-yellow-400' },
              { name: 'Black', key: 'ink_k_p', cls: 'text-gray-400' },
            ].map((c) => (
              <Row key={c.key}><RowLabel className={c.cls}>{c.name}</RowLabel><div className="flex-1"><NumInput value={data[c.key]} onChange={(v) => onChange(c.key, v)} step="0.01" /></div></Row>
            ))}
          </>
        )}
      </WizSection>

      <WizSection title="Αλκοόλη" sub="IPA / Fountain" accent="var(--accent)" border>
        <Toggle value={data.off_include_alcohol} onChange={(v) => onChange('off_include_alcohol', v)} labelOn="Συμπεριλαμβάνεται" labelOff="Εξαιρείται" />
        {!!data.off_include_alcohol && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Κόστος IPA (€/lt)"><NumInput value={data.chem_alcohol_c} onChange={(v) => onChange('chem_alcohol_c', v)} step="0.01" /></Field>
            <Field label="Κατανάλωση (ml/ώρα)"><NumInput value={data.off_chem_fountain_ml_h} onChange={(v) => onChange('off_chem_fountain_ml_h', v)} /></Field>
          </div>
        )}
      </WizSection>

      <WizSection title="Βερνίκι" sub="OPV & Coating" accent="var(--accent)" border>
        <Toggle value={data.off_include_varnish} onChange={(v) => onChange('off_include_varnish', v)} labelOn="Συμπεριλαμβάνεται" labelOff="Εξαιρείται" />
        {!!data.off_include_varnish && (
          <>
            <Row><RowLabel>OPV</RowLabel><div className="flex-1"><Field label="Κόστος €/kg"><NumInput value={data.ink_var_c} onChange={(v) => onChange('ink_var_c', v)} step="0.01" /></Field></div></Row>
            {!!data.off_has_varnish_tower && (
              <Row dashed><RowLabel className="text-[var(--accent)]">{data.off_varnish_type === 'uv' ? 'UV' : 'AQ'}</RowLabel><div className="flex-1"><Field label="Κόστος €/kg"><NumInput value={data.off_coating_c} onChange={(v) => onChange('off_coating_c', v)} step="0.01" /></Field></div></Row>
            )}
          </>
        )}
      </WizSection>
    </div>
  );
}

function StepChemicals({ data, onChange }: { data: Data; onChange: OnChange }) {
  return (
    <div className="space-y-6">
      <WizSection title="Χημικά" sub="Καθαρισμός" accent="var(--danger)">
        <Toggle value={data.off_include_chemicals} onChange={(v) => onChange('off_include_chemicals', v)} labelOn="Συμπεριλαμβάνεται" labelOff="Εξαιρείται" />
        {!!data.off_include_chemicals && (
          <>
            <ColHeaders labels={[{ w: 'w-28', text: '' }, { text: 'Κόστος €/lt' }]} />
            <Row><RowLabel className="!w-28">Wash Ink</RowLabel><div className="flex-1"><NumInput value={data.chem_wash_ink_c} onChange={(v) => onChange('chem_wash_ink_c', v)} step="0.01" /></div></Row>
            <Row><RowLabel className="!w-28">Wash Water</RowLabel><div className="flex-1"><NumInput value={data.chem_wash_water_c} onChange={(v) => onChange('chem_wash_water_c', v)} step="0.01" /></div></Row>
            <Field label="Wash χημικό / εργασία (ml)"><NumInput value={data.off_chem_wash_ml} onChange={(v) => onChange('off_chem_wash_ml', v)} /></Field>
          </>
        )}
      </WizSection>
    </div>
  );
}

function StepMaintenance({ data, onChange }: { data: Data; onChange: OnChange }) {
  const logs = (data.maint_log as Array<{ date: string; description: string; counter: number | null }>) ?? [];

  return (
    <div className="space-y-6">
      <WizSection title="Μηχανή" sub="Τρέχουσα κατάσταση" accent="var(--teal)">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Counter"><NumInput value={data.current_counter} onChange={(v) => onChange('current_counter', v)} /></Field>
          <Field label="Τελευταίο Service"><input className={inputCls} type="date" value={(data.last_service_date as string) ?? ''} onChange={(e) => onChange('last_service_date', e.target.value)} /></Field>
        </div>
        <Field label="Σημειώσεις"><textarea className={inputCls + " !h-14 py-2 resize-none"} value={(data.maint_notes as string) ?? ''} onChange={(e) => onChange('maint_notes', e.target.value)} placeholder="Γενικές σημειώσεις..." /></Field>
      </WizSection>

      <WizSection title="Ημερολόγιο" sub="Ιστορικό service" accent="var(--teal)" border>
        {logs.length > 0 && <ColHeaders labels={[{ w: 'w-28', text: 'Ημερομηνία' }, { w: 'w-24', text: 'Counter' }, { text: 'Περιγραφή' }, { w: 'w-5', text: '' }]} />}
        {logs.map((l, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-2">
            <input className={inputCls + " !h-8 w-28"} type="date" value={l.date} onChange={(e) => { const u = [...logs]; u[i] = { ...l, date: e.target.value }; onChange('maint_log', u); }} />
            <input className={inputCls + " !h-8 w-24 text-center"} type="number" value={l.counter ?? ''} onChange={(e) => { const u = [...logs]; u[i] = { ...l, counter: e.target.value ? +e.target.value : null }; onChange('maint_log', u); }} placeholder="Counter" />
            <input className={inputCls + " !h-8 flex-1"} value={l.description} onChange={(e) => { const u = [...logs]; u[i] = { ...l, description: e.target.value }; onChange('maint_log', u); }} placeholder="π.χ. Αλλαγή blanket..." />
            <button onClick={() => onChange('maint_log', logs.filter((_, idx) => idx !== i))} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--danger)] text-lg">×</button>
          </div>
        ))}
        <AddButton label="+ Προσθήκη Εγγραφής" onClick={() => onChange('maint_log', [...logs, { date: new Date().toISOString().slice(0, 10), description: '', counter: null }])} />
      </WizSection>
    </div>
  );
}

function StepContacts({ data, onChange }: { data: Data; onChange: OnChange }) {
  const techs = (data.off_techs as Array<{ role: string; name: string; phone: string }>) ?? [];

  return (
    <div className="space-y-6">
      <WizSection title="Τεχνικοί" sub="Επαφές service" accent="var(--accent)">
        {techs.length > 0 && <ColHeaders labels={[{ w: 'w-[30%]', text: 'Ειδικότητα' }, { w: 'w-[35%]', text: 'Όνομα' }, { text: 'Τηλέφωνο' }, { w: 'w-5', text: '' }]} />}
        {techs.map((t, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-2">
            <input className={inputCls + " !h-8 w-[30%]"} value={t.role} onChange={(e) => { const u = [...techs]; u[i] = { ...t, role: e.target.value }; onChange('off_techs', u); }} placeholder="π.χ. Service" />
            <input className={inputCls + " !h-8 w-[35%]"} value={t.name} onChange={(e) => { const u = [...techs]; u[i] = { ...t, name: e.target.value }; onChange('off_techs', u); }} placeholder="Γιώργος Κ." />
            <input className={inputCls + " !h-8 flex-1"} value={t.phone} onChange={(e) => { const u = [...techs]; u[i] = { ...t, phone: e.target.value }; onChange('off_techs', u); }} placeholder="210-..." />
            <button onClick={() => onChange('off_techs', techs.filter((_, idx) => idx !== i))} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--danger)] text-lg">×</button>
          </div>
        ))}
        <AddButton label="+ Προσθήκη Τεχνικού" onClick={() => onChange('off_techs', [...techs, { role: '', name: '', phone: '' }])} />
      </WizSection>

      <WizSection title="Links" sub="Εγχειρίδια & drivers" accent="var(--accent)" border>
        <Field label="Service Manual"><input className={inputCls} value={(data.manual_url as string) ?? ''} onChange={(e) => onChange('manual_url', e.target.value)} placeholder="https://..." /></Field>
        <Field label="Driver / PPD"><input className={inputCls} value={(data.driver_url as string) ?? ''} onChange={(e) => onChange('driver_url', e.target.value)} placeholder="https://..." /></Field>
      </WizSection>
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
