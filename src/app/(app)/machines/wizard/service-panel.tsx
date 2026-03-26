'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Machine } from '@/generated/prisma/client';
import { updateMachine } from '../actions';

const inputCls = "h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 no-spinners";

type Tab = 'maintenance' | 'contacts';

interface Props {
  machine: Machine;
  onClose: () => void;
}

export function MachineServicePanel({ machine, onClose }: Props) {
  const specs = (machine.specs ?? {}) as Record<string, unknown>;
  const [tab, setTab] = useState<Tab>('maintenance');

  // Maintenance state
  const [counter, setCounter] = useState<number | null>((specs.current_counter as number) ?? null);
  const [lastService, setLastService] = useState<string>((specs.last_service_date as string) ?? '');
  const [notes, setNotes] = useState<string>((specs.maint_notes as string) ?? '');
  const [logs, setLogs] = useState<Array<{ date: string; description: string; counter: number | null }>>(
    (specs.maint_log as Array<{ date: string; description: string; counter: number | null }>) ?? []
  );

  // Contacts state
  const [techs, setTechs] = useState<Array<{ role: string; name: string; phone: string }>>(
    ((specs.off_techs ?? specs.dig_techs) as Array<{ role: string; name: string; phone: string }>) ?? []
  );
  const [manualUrl, setManualUrl] = useState<string>((specs.manual_url as string) ?? '');
  const [driverUrl, setDriverUrl] = useState<string>((specs.driver_url as string) ?? '');

  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await updateMachine(machine.id, {
      specs: {
        ...specs,
        current_counter: counter,
        last_service_date: lastService,
        maint_notes: notes,
        maint_log: logs,
        off_techs: techs,
        dig_techs: techs,
        manual_url: manualUrl,
        driver_url: driverUrl,
      },
    });
    setSaving(false);
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex w-[700px] max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-[var(--glass-border)] shadow-[0_32px_80px_rgba(0,0,0,0.5)]"
        style={{ background: 'rgb(20, 30, 55)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <h2 className="text-lg font-bold">{machine.name}</h2>
            <p className="text-sm text-[var(--text-muted)]">Συντήρηση & Τεχνικοί</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3">
          {([
            { id: 'maintenance' as Tab, label: 'Συντήρηση', icon: 'fa-calendar-alt' },
            { id: 'contacts' as Tab, label: 'Τεχνικοί & Links', icon: 'fa-address-book' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
            >
              <i className={`fas ${t.icon}`} /> {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
          {tab === 'maintenance' && (
            <div className="space-y-5">
              {/* Machine status */}
              <div className="flex gap-6">
                <div className="w-28 shrink-0 pt-1">
                  <h4 className="text-sm font-black uppercase tracking-wide">Μηχανή</h4>
                  <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">Τρέχουσα κατάσταση</p>
                </div>
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Counter</span>
                      <input className={inputCls + " text-center"} type="number" value={counter ?? ''} onChange={e => setCounter(e.target.value ? +e.target.value : null)} placeholder="π.χ. 1250000" />
                    </div>
                    <div>
                      <span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Τελευταίο Service</span>
                      <input className={inputCls} type="date" value={lastService} onChange={e => setLastService(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Σημειώσεις</span>
                    <textarea className={inputCls + " !h-14 py-2 resize-none"} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Γενικές σημειώσεις..." />
                  </div>
                </div>
              </div>

              {/* Service log */}
              <div className="flex gap-6 border-t border-[var(--border)] pt-5">
                <div className="w-28 shrink-0 pt-1">
                  <h4 className="text-sm font-black uppercase tracking-wide">Ημερολόγιο</h4>
                  <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">Ιστορικό service</p>
                </div>
                <div className="flex-1 space-y-2">
                  {logs.map((l, i) => (
                    <div key={i} className="rounded-lg bg-white/[0.03] p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input className={inputCls + " !h-8 w-32"} type="date" value={l.date} onChange={e => { const u = [...logs]; u[i] = { ...l, date: e.target.value }; setLogs(u); }} />
                        <input className={inputCls + " !h-8 w-28 text-center"} type="number" value={l.counter ?? ''} onChange={e => { const u = [...logs]; u[i] = { ...l, counter: e.target.value ? +e.target.value : null }; setLogs(u); }} placeholder="Counter" />
                        <span className="flex-1" />
                        <button onClick={() => setLogs(logs.filter((_, idx) => idx !== i))} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--danger)] text-lg">×</button>
                      </div>
                      <textarea className={inputCls + " !h-16 py-2 resize-none text-sm"} value={l.description} onChange={e => { const u = [...logs]; u[i] = { ...l, description: e.target.value }; setLogs(u); }} placeholder="Τι αλλάχτηκε; π.χ. Αλλαγή fuser kit, καθαρισμός coronas, PM 500K..." />
                    </div>
                  ))}
                  <button
                    onClick={() => setLogs([...logs, { date: new Date().toLocaleDateString('sv-SE'), description: '', counter: null }])}
                    className="w-full rounded-lg border border-dashed border-[var(--glass-border)] py-2 text-sm font-semibold text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                  >
                    + Προσθήκη Εγγραφής
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'contacts' && (
            <div className="space-y-5">
              {/* Technicians */}
              <div className="flex gap-6">
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
                      <input className={inputCls + " !h-8 w-[30%]"} value={t.role} onChange={e => { const u = [...techs]; u[i] = { ...t, role: e.target.value }; setTechs(u); }} placeholder="π.χ. Service" />
                      <input className={inputCls + " !h-8 w-[35%]"} value={t.name} onChange={e => { const u = [...techs]; u[i] = { ...t, name: e.target.value }; setTechs(u); }} placeholder="Γιώργος Κ." />
                      <input className={inputCls + " !h-8 flex-1"} value={t.phone} onChange={e => { const u = [...techs]; u[i] = { ...t, phone: e.target.value }; setTechs(u); }} placeholder="210-..." />
                      <button onClick={() => setTechs(techs.filter((_, idx) => idx !== i))} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--danger)] text-lg">×</button>
                    </div>
                  ))}
                  <button
                    onClick={() => setTechs([...techs, { role: '', name: '', phone: '' }])}
                    className="w-full rounded-lg border border-dashed border-[var(--glass-border)] py-2 text-sm font-semibold text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                  >
                    + Προσθήκη Τεχνικού
                  </button>
                </div>
              </div>

              {/* Links */}
              <div className="flex gap-6 border-t border-[var(--border)] pt-5">
                <div className="w-28 shrink-0 pt-1">
                  <h4 className="text-sm font-black uppercase tracking-wide">Links</h4>
                  <p className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">Εγχειρίδια & drivers</p>
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Service Manual</span>
                    <input className={inputCls} value={manualUrl} onChange={e => setManualUrl(e.target.value)} placeholder="https://..." />
                  </div>
                  <div>
                    <span className="text-[0.6rem] font-semibold text-[var(--text-muted)]">Driver / PPD</span>
                    <input className={inputCls} value={driverUrl} onChange={e => setDriverUrl(e.target.value)} placeholder="https://..." />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] px-6 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]">
            Ακύρωση
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_16px_rgba(245,130,32,0.3)] transition-all hover:shadow-[0_6px_24px_rgba(245,130,32,0.4)] disabled:opacity-40"
          >
            {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
