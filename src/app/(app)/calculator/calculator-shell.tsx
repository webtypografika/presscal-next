'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

/* ═══════════════════════════════════════════════════
   PressCal Calculator — Draft G (Orb Popups)
   ═══════════════════════════════════════════════════ */

// ─── TYPES ───
interface JobData {
  archetype: string;
  width: number;
  height: number;
  bleed: number;
  qty: number;
  sides: 1 | 2;
}
interface ColorData {
  model: 'cmyk' | 'bw';
  pmsFront: number;
  pmsBack: number;
  varnish: 'none' | 'oil';
}
interface FinishData {
  guillotine: string;
  lamination: string;
  binding: string;
}
interface PaperData {
  name: string;
  weight: string;
  size: string;
  price: number;
}
interface MachineTab {
  name: string;
  icon: string;
  size: string;
  sheetW: number;
  sheetH: number;
}

// ─── MACHINES (demo) ───
const MACHINES: MachineTab[] = [
  { name: 'Xerox C70', icon: 'fas fa-print', size: '330×487', sheetW: 330, sheetH: 487 },
  { name: 'Konica C1100', icon: 'fas fa-print', size: '330×487', sheetW: 330, sheetH: 487 },
  { name: 'Heidelberg SM52', icon: 'fas fa-industry', size: '520×360', sheetW: 520, sheetH: 360 },
];

// ─── PAPER CATALOG (demo) ───
const PAPERS: PaperData[] = [
  { name: 'Γραφής', weight: '70g', size: '860×610mm', price: 0.085 },
  { name: 'Γραφής', weight: '70g', size: '1000×700mm', price: 0.092 },
  { name: 'Γραφής', weight: '80g', size: '860×610mm', price: 0.095 },
  { name: 'Γραφής', weight: '80g', size: '1000×700mm', price: 0.105 },
  { name: 'Γραφής', weight: '100g', size: '860×610mm', price: 0.118 },
  { name: 'Γραφής', weight: '120g', size: '860×610mm', price: 0.140 },
  { name: 'Γραφής', weight: '120g', size: '1000×700mm', price: 0.155 },
];

// ─── IMPOSITION MODES ───
const IMPO_MODES = ['N-Up', 'Booklet', 'Perfect Bound', 'Cut&Stack', 'Work&Turn', 'Gang Run', 'Step Multi'];

// ─── ARCHETYPES ───
const ARCHETYPES = ['Φυλλάδιο', 'Κάρτα', 'Αφίσα', 'Φάκελος', 'Επιστολόχαρτο', 'Custom'];

// ─── SUPPLIERS / CATEGORIES ───
const SUPPLIERS = ['Alef eni', 'Graphcom', 'Περράκης', 'Τσώλης'];
const CATEGORIES = ['NCR', 'Munken', 'Curious', 'Colorplan', 'Arctic', 'Acquerello', 'Action', 'Eureka', 'Manilla', 'Rives', 'Sirio', 'Film'];

/* ═══ MODAL PORTAL ═══ */
function ModalPortal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </div>,
    document.body
  );
}

function ModalBox({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <div style={{
      width: small ? 440 : 640, maxHeight: '80vh',
      background: 'rgb(20,30,55)', backdropFilter: 'blur(24px)',
      border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
      padding: 24, overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
    }}>
      {children}
    </div>
  );
}

function ModalHead({ icon, iconColor, title, onClose }: { icon: string; iconColor: string; title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className={icon} style={{ color: iconColor }} /> {title}
      </h2>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}>&times;</button>
    </div>
  );
}

/* ═══ PILL BUTTON ═══ */
function Pill({ active, onClick, children, color }: { active?: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  const c = color || 'var(--accent)';
  return (
    <button onClick={onClick} style={{
      padding: '5px 14px', borderRadius: 16, fontSize: '0.75rem', fontWeight: 600,
      border: `1px solid ${active ? c : 'rgba(255,255,255,0.08)'}`,
      background: active ? `color-mix(in srgb, ${c} 10%, transparent)` : 'transparent',
      color: active ? c : '#94a3b8', cursor: 'pointer', transition: 'all 0.15s',
    }}>
      {children}
    </button>
  );
}

/* ═══ TOGGLE BAR ═══ */
function ToggleBar({ options, value, onChange }: { options: { v: string; l: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
      {options.map((o, i) => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{
          flex: 1, padding: '8px 0', textAlign: 'center', fontSize: '0.82rem', fontWeight: 600,
          background: value === o.v ? 'rgba(245,130,32,0.12)' : 'transparent',
          border: 'none', color: value === o.v ? 'var(--accent)' : '#64748b',
          cursor: 'pointer', transition: 'all 0.2s',
          borderRight: i < options.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
        }}>{o.l}</button>
      ))}
    </div>
  );
}

/* ═══ CALCULATOR COMPONENT ═══ */
export default function CalculatorShell() {
  // ─── STATE ───
  const [activeMachine, setActiveMachine] = useState(0);
  const [modal, setModal] = useState<'paper' | 'job' | 'color' | 'finish' | null>(null);
  const [impoMode, setImpoMode] = useState('N-Up');

  const [paper, setPaper] = useState<PaperData>(PAPERS[0]);
  const [supplier, setSupplier] = useState('Graphcom');
  const [paperSearch, setPaperSearch] = useState('');

  const [job, setJob] = useState<JobData>({ archetype: 'Φυλλάδιο', width: 210, height: 297, bleed: 3, qty: 500, sides: 2 });
  const [color, setColor] = useState<ColorData>({ model: 'cmyk', pmsFront: 0, pmsBack: 0, varnish: 'oil' });
  const [finish, setFinish] = useState<FinishData>({ guillotine: 'Polar 78', lamination: 'Matt 1 όψη', binding: 'none' });

  const closeModal = useCallback(() => setModal(null), []);

  // ─── CALCULATIONS ───
  const machine = MACHINES[activeMachine];
  const cutW = job.width + job.bleed * 2;
  const cutH = job.height + job.bleed * 2;
  const cols = Math.floor(machine.sheetW / cutW);
  const rows = Math.floor(machine.sheetH / cutH);
  // try rotated
  const colsR = Math.floor(machine.sheetW / cutH);
  const rowsR = Math.floor(machine.sheetH / cutW);
  const upsNormal = cols * rows;
  const upsRotated = colsR * rowsR;
  const ups = Math.max(upsNormal, upsRotated, 1);
  const useCols = upsRotated > upsNormal ? colsR : cols;
  const useRows = upsRotated > upsNormal ? rowsR : rows;

  const sheets = Math.ceil(job.qty / ups);
  const printSheets = job.sides === 2 ? sheets * 2 : sheets;
  const timeMin = Math.ceil(printSheets * 0.06); // ~1 sheet/sec rough

  // ─── COST CALC (demo values) ───
  const costPaper = sheets * paper.price;
  const costPrint = printSheets * 0.30;
  const costGuillotine = finish.guillotine !== 'Χωρίς' ? sheets * 0.01 : 0;
  const costLamination = finish.lamination !== 'Χωρίς'
    ? sheets * (finish.lamination.includes('2') ? 0.14 : 0.07)
    : 0;
  const totalCost = costPaper + costPrint + costGuillotine + costLamination;

  const profitPrint = costPrint * 1.2;
  const markupPaper = costPaper * 0.5;
  const profitGuillotine = finish.guillotine !== 'Χωρίς' ? 3.0 : 0;
  const profitLamination = costLamination * 2;
  const totalPrice = totalCost + profitPrint - costPrint + markupPaper + profitGuillotine + profitLamination;
  const pricePerUnit = totalPrice / job.qty;

  const fmt = (n: number) => n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', marginTop: -8 }}>

      {/* ═══ MACHINE BAR ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        {MACHINES.map((m, i) => (
          <button key={m.name} onClick={() => setActiveMachine(i)} style={{
            padding: '6px 16px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
            border: `1px solid ${i === activeMachine ? 'color-mix(in srgb, var(--blue) 50%, transparent)' : 'rgba(255,255,255,0.08)'}`,
            background: i === activeMachine ? 'color-mix(in srgb, var(--blue) 8%, transparent)' : 'transparent',
            color: i === activeMachine ? 'var(--blue)' : '#94a3b8',
            cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <i className={m.icon} style={{ fontSize: '0.75rem' }} />
            {m.name}
            <span style={{ fontSize: '0.62rem', color: i === activeMachine ? 'color-mix(in srgb, var(--blue) 70%, var(--text))' : '#64748b', fontWeight: 400 }}>{m.size}</span>
          </button>
        ))}
      </div>

      {/* ═══ ORBS BAR + SUMMARY ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        {/* Orbs */}
        {([
          { key: 'paper' as const, icon: 'fas fa-scroll', color: 'var(--teal)', label: 'Χαρτί' },
          { key: 'job' as const, icon: 'fas fa-ruler-combined', color: 'var(--accent)', label: 'Εργασία' },
          { key: 'color' as const, icon: 'fas fa-palette', color: 'var(--blue)', label: 'Χρώμα' },
          { key: 'finish' as const, icon: 'fas fa-scissors', color: 'var(--violet)', label: 'Φινίρισμα' },
        ]).map((orb) => (
          <div key={orb.key} onClick={() => setModal(orb.key)} className="orb-btn" style={{
            '--oc': orb.color,
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            border: `2px solid color-mix(in srgb, ${orb.color} 30%, transparent)`,
            background: `color-mix(in srgb, ${orb.color} 8%, transparent)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: orb.color, fontSize: '0.88rem', cursor: 'pointer',
            transition: 'all 350ms cubic-bezier(0.34,1.56,0.64,1)', position: 'relative',
          } as React.CSSProperties}>
            <i className={orb.icon} />
            <span style={{
              position: 'absolute', bottom: -16, fontSize: '0.5rem', fontWeight: 600,
              color: '#64748b', whiteSpace: 'nowrap', opacity: 0, transition: 'opacity 0.2s',
            }} className="orb-label-text">{orb.label}</span>
          </div>
        ))}

        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />

        {/* Summary strip */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto' }}>
          <SummaryTag icon="fas fa-scroll" iconColor="var(--teal)" onClick={() => setModal('paper')}>
            <span style={{ fontWeight: 700 }}>{paper.name} {paper.weight}</span>
            <span style={{ color: '#94a3b8' }}>{paper.size} · €{paper.price.toFixed(3)}</span>
          </SummaryTag>
          <SummaryTag icon="fas fa-cube" iconColor="var(--accent)" onClick={() => setModal('job')}>
            <span style={{ fontWeight: 700 }}>{job.archetype}</span>
            <span style={{ color: '#94a3b8' }}>{job.width}×{job.height} · {job.qty}τεμ</span>
          </SummaryTag>
          <SummaryTag icon="fas fa-expand-arrows-alt" iconColor="var(--accent)" onClick={() => setModal('job')}>
            <span style={{ color: '#94a3b8' }}>bleed {job.bleed}mm</span>
          </SummaryTag>
          <SummaryTag icon="fas fa-palette" iconColor="var(--blue)" onClick={() => setModal('color')}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)', flexShrink: 0 }} />
            <span style={{ fontWeight: 700 }}>{color.model === 'cmyk' ? 'CMYK' : 'B&W'}</span>
            <span style={{ color: '#94a3b8' }}>{job.sides} όψεις</span>
          </SummaryTag>
          <SummaryTag icon="fas fa-cut" iconColor="var(--violet)" onClick={() => setModal('finish')}>
            <span style={{ color: '#94a3b8' }}>
              {finish.guillotine !== 'Χωρίς' ? finish.guillotine : ''}
              {finish.lamination !== 'Χωρίς' ? ` + ${finish.lamination}` : ''}
              {finish.guillotine === 'Χωρίς' && finish.lamination === 'Χωρίς' ? 'Χωρίς' : ''}
            </span>
          </SummaryTag>
        </div>
      </div>

      {/* ═══ MAIN ═══ */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Imposition area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: 20 }}>
          <div style={{
            width: '100%', maxWidth: 600, aspectRatio: `${machine.sheetW}/${machine.sheetH}`,
            background: 'rgba(0,0,0,0.3)', border: '2px solid rgba(255,255,255,0.08)',
            borderRadius: 10, position: 'relative', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}>
            {/* Overlay top-left */}
            <div style={{ position: 'absolute', top: 10, left: 14, fontSize: '0.62rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="fas fa-expand" /> {machine.sheetW} × {machine.sheetH} mm
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="fas fa-crop-alt" /> {cutW} × {cutH} mm
              </span>
            </div>

            {/* Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${useCols}, 1fr)`,
              gridTemplateRows: `repeat(${useRows}, 1fr)`,
              gap: 4, width: '100%', height: '100%',
            }}>
              {Array.from({ length: ups }, (_, i) => (
                <div key={i} style={{
                  background: 'rgba(245,130,32,0.1)', border: '1.5px solid rgba(245,130,32,0.3)',
                  borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem', fontWeight: 600, color: 'rgba(245,130,32,0.5)',
                }}>{i + 1}</div>
              ))}
            </div>

            {/* Overlay bottom-right */}
            <div style={{ position: 'absolute', bottom: 10, right: 14, display: 'flex', gap: 6 }}>
              <ImpoChip><strong>{ups}</strong>-up</ImpoChip>
              <ImpoChip><strong>{sheets}</strong> φύλλα</ImpoChip>
              <ImpoChip><i className="fas fa-clock" /><strong>~{timeMin}&apos;</strong></ImpoChip>
            </div>
          </div>

          {/* Imposition mode buttons */}
          <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
            {IMPO_MODES.map((m) => (
              <button key={m} onClick={() => setImpoMode(m)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600,
                border: `1px solid ${m === impoMode ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}`,
                background: m === impoMode ? 'rgba(245,130,32,0.08)' : 'transparent',
                color: m === impoMode ? 'var(--accent)' : '#64748b',
                cursor: 'pointer', transition: 'all 0.2s',
              }}>{m}</button>
            ))}
          </div>
        </div>

        {/* ═══ RESULTS SIDEBAR ═══ */}
        <div style={{
          width: 300, flexShrink: 0, background: 'rgba(0,0,0,0.2)',
          borderLeft: '1px solid var(--border)', padding: 16,
          overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {/* Price hero */}
          <div style={{ textAlign: 'center', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Τελική Τιμή</div>
            <div style={{ fontSize: '2.6rem', fontWeight: 900, color: 'var(--accent)', letterSpacing: '-0.03em', lineHeight: 1, margin: '4px 0' }}>€{fmt(totalPrice)}</div>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}><strong style={{ fontWeight: 700 }}>€{fmt(pricePerUnit)}</strong> / τεμάχιο</div>
          </div>

          {/* Stat pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            <StatPill label="Ups" value={String(ups)} />
            <StatPill label="Φύλλα" value={String(sheets)} />
            <StatPill label="Stock" value={String(sheets)} />
            <StatPill label="Χρόνος" value={`~${timeMin}'`} />
          </div>

          {/* Cost breakdown */}
          <CostGroup title="Κόστη">
            <CostLine label="Χαρτί" val={`€${fmt(costPaper)}`} />
            <CostLine label="Εκτύπωση" val={`€${fmt(costPrint)}`} />
            {costGuillotine > 0 && <CostLine label="Γκιλοτίνα" val={`€${fmt(costGuillotine)}`} />}
            {costLamination > 0 && <CostLine label="Πλαστικοποίηση" val={`€${fmt(costLamination)}`} />}
          </CostGroup>

          <CostGroup title="Έσοδα">
            <CostLine label="Κέρδος εκτύπωσης" val={`€${fmt(profitPrint)}`} />
            <CostLine label="Markup χαρτιού" val={`€${fmt(markupPaper)}`} />
            {profitGuillotine > 0 && <CostLine label="Γκιλοτίνα" val={`€${fmt(profitGuillotine)}`} />}
            {profitLamination > 0 && <CostLine label="Πλαστικοποίηση" val={`€${fmt(profitLamination)}`} />}
          </CostGroup>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '2px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>Σύνολο</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--accent)' }}>€{fmt(totalPrice)}</span>
          </div>

          <button style={{
            width: '100%', padding: '11px 0', borderRadius: 7,
            background: 'var(--accent)', color: '#fff', border: 'none',
            fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 4px 16px rgba(245,130,32,0.3)', transition: 'all 0.25s', marginTop: 'auto',
          }}>
            <i className="fas fa-cart-plus" /> Προσθήκη στο Καλάθι
          </button>
        </div>
      </div>

      {/* ═══ MODALS ═══ */}

      {/* PAPER MODAL */}
      <ModalPortal open={modal === 'paper'} onClose={closeModal}>
        <ModalBox>
          <ModalHead icon="fas fa-scroll" iconColor="var(--teal)" title="Χαρτί" onClose={closeModal} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 38,
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', marginBottom: 12,
          }}>
            <i className="fas fa-search" style={{ color: '#64748b', fontSize: '0.75rem' }} />
            <input value={paperSearch} onChange={(e) => setPaperSearch(e.target.value)}
              placeholder="Αναζήτηση χαρτιού..."
              style={{ border: 'none', background: 'transparent', color: 'var(--text)', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none', flex: 1 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            {/* Filters */}
            <div style={{ width: 220, flexShrink: 0 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--teal)', marginBottom: 4 }}>Προμηθευτής</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                {SUPPLIERS.map((s) => (
                  <Pill key={s} active={supplier === s} onClick={() => setSupplier(s)} color="var(--teal)">{s}</Pill>
                ))}
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--teal)', marginBottom: 4 }}>Κατηγορία</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {CATEGORIES.map((c) => (
                  <Pill key={c} onClick={() => {}} color="var(--teal)">{c}</Pill>
                ))}
              </div>
            </div>
            {/* Paper list */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.72rem', color: '#64748b', textAlign: 'center', marginBottom: 6 }}>— Επιλογή —</div>
              {PAPERS.filter((p) => !paperSearch || p.name.toLowerCase().includes(paperSearch.toLowerCase())).map((p, i) => {
                const isActive = p.name === paper.name && p.weight === paper.weight && p.size === paper.size;
                return (
                  <div key={i} onClick={() => { setPaper(p); closeModal(); }} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7,
                    cursor: 'pointer', transition: 'background 0.15s', fontSize: '0.82rem', color: '#94a3b8',
                    border: `1px solid ${isActive ? 'color-mix(in srgb, var(--teal) 40%, transparent)' : 'transparent'}`,
                    background: isActive ? 'color-mix(in srgb, var(--teal) 6%, transparent)' : 'transparent',
                  }}>
                    <span style={{ color: 'var(--teal)', fontSize: '0.7rem', width: 16 }}>
                      {isActive && <i className="fas fa-check" />}
                    </span>
                    {p.name} ({p.weight}, {p.size})
                    <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--teal)', fontSize: '0.78rem' }}>€{p.price.toFixed(3)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </ModalBox>
      </ModalPortal>

      {/* JOB MODAL */}
      <ModalPortal open={modal === 'job'} onClose={closeModal}>
        <ModalBox small>
          <ModalHead icon="fas fa-ruler-combined" iconColor="var(--accent)" title="Εργασία" onClose={closeModal} />
          <MfLabel>Προϊόν / Archetype</MfLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
            {ARCHETYPES.map((a) => (
              <Pill key={a} active={job.archetype === a} onClick={() => setJob({ ...job, archetype: a })}>{a}</Pill>
            ))}
          </div>
          <MfLabel>Διαστάσεις (mm)</MfLabel>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MfInput value={job.width} onChange={(v) => setJob({ ...job, width: Number(v) || 0 })} style={{ width: 90, textAlign: 'center' }} />
              <span style={{ color: '#64748b', fontWeight: 600 }}>×</span>
              <MfInput value={job.height} onChange={(v) => setJob({ ...job, height: Number(v) || 0 })} style={{ width: 90, textAlign: 'center' }} />
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <MfLabel>Bleed</MfLabel>
              <MfInput value={job.bleed} onChange={(v) => setJob({ ...job, bleed: Number(v) || 0 })} style={{ width: 60, textAlign: 'center' }} />
            </div>
          </div>
          <MfLabel>Ποσότητα</MfLabel>
          <MfInput value={job.qty} onChange={(v) => setJob({ ...job, qty: Number(v) || 0 })} style={{ width: 140, fontSize: '1.1rem', fontWeight: 800 }} />
          <div style={{ marginTop: 14 }}>
            <MfLabel>Όψεις</MfLabel>
            <ToggleBar value={String(job.sides)} onChange={(v) => setJob({ ...job, sides: Number(v) as 1 | 2 })} options={[{ v: '1', l: 'Μονή' }, { v: '2', l: 'Διπλή' }]} />
          </div>
        </ModalBox>
      </ModalPortal>

      {/* COLOR MODAL */}
      <ModalPortal open={modal === 'color'} onClose={closeModal}>
        <ModalBox small>
          <ModalHead icon="fas fa-palette" iconColor="var(--blue)" title="Χρώμα" onClose={closeModal} />
          <MfLabel>Χρωματικό μοντέλο</MfLabel>
          <div style={{ marginBottom: 14 }}>
            <ToggleBar value={color.model} onChange={(v) => setColor({ ...color, model: v as 'cmyk' | 'bw' })} options={[{ v: 'cmyk', l: '4χρ CMYK' }, { v: 'bw', l: 'Ασπρόμαυρο' }]} />
          </div>
          <MfLabel>Ειδικά χρώματα (Offset)</MfLabel>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
            <div>
              <MfLabel>PMS Front</MfLabel>
              <MfInput value={color.pmsFront} onChange={(v) => setColor({ ...color, pmsFront: Number(v) || 0 })} style={{ width: 60, textAlign: 'center' }} />
            </div>
            <div>
              <MfLabel>PMS Back</MfLabel>
              <MfInput value={color.pmsBack} onChange={(v) => setColor({ ...color, pmsBack: Number(v) || 0 })} style={{ width: 60, textAlign: 'center' }} />
            </div>
            <div>
              <MfLabel>Βερνίκι</MfLabel>
              <ToggleBar value={color.varnish} onChange={(v) => setColor({ ...color, varnish: v as 'none' | 'oil' })} options={[{ v: 'none', l: 'Όχι' }, { v: 'oil', l: 'Λαδιού' }]} />
            </div>
          </div>
        </ModalBox>
      </ModalPortal>

      {/* FINISH MODAL */}
      <ModalPortal open={modal === 'finish'} onClose={closeModal}>
        <ModalBox small>
          <ModalHead icon="fas fa-scissors" iconColor="var(--violet)" title="Φινίρισμα" onClose={closeModal} />
          <MfLabel>Γκιλοτίνα</MfLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
            {['Polar 78', 'Χωρίς'].map((g) => (
              <Pill key={g} active={finish.guillotine === g} onClick={() => setFinish({ ...finish, guillotine: g })} color="var(--violet)">{g}</Pill>
            ))}
          </div>
          <MfLabel>Πλαστικοποίηση</MfLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
            {['Matt 1 όψη', 'Gloss 1 όψη', 'Matt 2 όψεις', 'Χωρίς'].map((l) => (
              <Pill key={l} active={finish.lamination === l} onClick={() => setFinish({ ...finish, lamination: l })} color="var(--violet)">{l}</Pill>
            ))}
          </div>
          <MfLabel>Βιβλιοδεσία</MfLabel>
          <ToggleBar value={finish.binding} onChange={(v) => setFinish({ ...finish, binding: v })}
            options={[{ v: 'none', l: 'Καμία' }, { v: 'staple', l: 'Συρραφή' }, { v: 'glue', l: 'Κόλλα' }, { v: 'spiral', l: 'Σπιράλ' }]}
          />
        </ModalBox>
      </ModalPortal>
    </div>
  );
}

/* ═══ SUB-COMPONENTS ═══ */

function SummaryTag({ icon, iconColor, onClick, children }: { icon: string; iconColor: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 12px', borderRadius: 8,
      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
      fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.2s',
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <i className={icon} style={{ fontSize: '0.65rem', color: iconColor }} />
      {children}
    </div>
  );
}

function ImpoChip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
      padding: '3px 8px', borderRadius: 5, fontSize: '0.65rem', fontWeight: 600, color: '#94a3b8',
      display: 'flex', alignItems: 'center', gap: 4,
    }}>{children}</div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: '1 1 calc(50% - 3px)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 10px' }}>
      <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 800, marginTop: 1 }}>{value}</div>
    </div>
  );
}

function CostGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', paddingBottom: 3, borderBottom: '1px solid var(--border)', marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

function CostLine({ label, val }: { label: string; val: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '0.75rem' }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
    </div>
  );
}

function MfLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block' }}>{children}</span>;
}

function MfInput({ value, onChange, style }: { value: string | number; onChange: (v: string) => void; style?: React.CSSProperties }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} style={{
      height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.04)', color: 'var(--text)', padding: '0 10px',
      fontSize: '0.85rem', fontFamily: 'inherit', transition: 'border-color 0.2s',
      outline: 'none', ...style,
    }} />
  );
}
