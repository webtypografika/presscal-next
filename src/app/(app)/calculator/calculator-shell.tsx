'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { calcImposition } from '@/lib/calc/imposition';
import type { ImpositionInput } from '@/lib/calc/imposition';
import type { ImpositionMode, ImpositionResult, CalculatorResult, StepBlock } from '@/types/calculator';
import ImpositionCanvas from './imposition-canvas';
import DuplexNavigator from './signature-navigator';
import { parsePDF } from '@/lib/calc/pdf-utils';
import type { ParsedPDF } from '@/lib/calc/pdf-utils';
import { downloadImpositionPDF } from '@/lib/calc/pdf-export';
import PlateOrderModal from './plate-order-modal';
import { FOLD_TYPES } from '@/lib/postpress/fold-types';

/* ═══════════════════════════════════════════════════
   PressCal Calculator — Draft H (Live Engine)
   ═══════════════════════════════════════════════════ */

// ─── TYPES ───
interface JobData {
  archetype: string;
  width: number;
  height: number;
  bleed: number;
  bleedOn: boolean;
  qty: number;
  sides: 1 | 2;
  rotation: boolean;
  // Archetype-specific
  pages?: number;           // booklet
  sheetsPerPad?: number;    // pad
  bodyPages?: number;       // perfect bound
  customMult?: number;      // custom
  productId?: string;       // linked global product
}
interface ColorData {
  model: 'cmyk' | 'bw';
  coverage: 'low' | 'mid' | 'high' | 'pdf';
  // Offset plates per side
  platesFront: number;
  platesBack: number;
  pmsFront: number;
  pmsBack: number;
  varnish: 'none' | 'oil' | 'coating';
  varnishTiming: 'inline' | 'separate';
  perfecting: boolean;
  printMethod: 'sheetwise' | 'turn' | 'tumble';
}
interface FinishData {
  guillotineId: string;
  guillotineName: string;
  lamMachineId: string;
  lamFilmId: string;
  lamName: string;
  lamSides: 1 | 2;
  binding: string;
  bindingMachineId: string;
  creaseMachineId: string;
  creaseCount: number;
  foldMachineId: string;
  foldType: string;
  gatherMachineId: string;
  gatherSignatures: number;
  customMachineIds: string[];
}
interface DbMachine {
  id: string;
  name: string;
  cat: string;
  maxLS: number | null;
  maxSS: number | null;
  marginTop: number | null;
  marginBottom: number | null;
  marginLeft: number | null;
  marginRight: number | null;
  specs: Record<string, unknown>;
}
interface DbMaterial {
  id: string;
  name: string;
  groupName: string | null;
  supplier: string | null;
  width: number | null;
  height: number | null;
  thickness: number | null;
  costPerUnit: number | null;
  unit: string;
}
interface DbFilm {
  id: string;
  name: string;
  groupName: string | null;
  cat: string;
  costPerUnit: number | null;
  unit: string;
  width: number | null;
  height: number | null;
  rollLength: number | null;
  specs: Record<string, unknown>;
}
interface DbPostpress {
  id: string;
  name: string;
  subtype: string;
  setupCost: number | null;
  speed: number | null;
  hourlyRate: number | null;
  specs: Record<string, unknown>;
}

interface DbProduct {
  id: string;
  name: string;
  archetype: string;
  pages: number | null;
  sheetsPerPad: number | null;
  bodyPages: number | null;
  customMult: number | null;
  offset: Record<string, unknown>;
  digital: Record<string, unknown>;
  isFavourite?: boolean;
}

// ─── FALLBACK DEMO DATA ───
const DEMO_MACHINES: DbMachine[] = [
  { id: 'demo-1', name: 'Xerox C70', cat: 'digital', maxLS: 330, maxSS: 487, marginTop: 5, marginBottom: 5, marginLeft: 5, marginRight: 5, specs: { costMode: 'simple_in', clickA4Color: 0.04, clickA4Bw: 0.01, clickA3Color: 0.08, clickA3Bw: 0.02 } },
  { id: 'demo-2', name: 'Konica C1100', cat: 'digital', maxLS: 330, maxSS: 487, marginTop: 4, marginBottom: 4, marginLeft: 4, marginRight: 4, specs: { costMode: 'simple_in', clickA4Color: 0.03, clickA4Bw: 0.008, clickA3Color: 0.06, clickA3Bw: 0.016 } },
  { id: 'demo-3', name: 'Heidelberg SM52', cat: 'offset', maxLS: 520, maxSS: 360, marginTop: 10, marginBottom: 10, marginLeft: 10, marginRight: 10, specs: { towers: 4, speed: 8000, perfecting: false, hasVarnishTower: false, defaultWaste: 50, inkGm2: 1.5, plateCost: 8, blanketCost: 30, blanketLife: 50000, hourCost: 45, setupMin: 15 } },
];
const DEMO_PAPERS: DbMaterial[] = [
  { id: 'demo-p1', name: 'Γραφής 70gsm', groupName: 'Uncoated', supplier: 'Graphcom', width: 860, height: 610, thickness: 70, costPerUnit: 0.085, unit: 'φύλλο' },
  { id: 'demo-p2', name: 'Γραφής 80gsm', groupName: 'Uncoated', supplier: 'Graphcom', width: 860, height: 610, thickness: 80, costPerUnit: 0.095, unit: 'φύλλο' },
  { id: 'demo-p3', name: 'Γραφής 100gsm', groupName: 'Uncoated', supplier: 'Alef eni', width: 860, height: 610, thickness: 100, costPerUnit: 0.118, unit: 'φύλλο' },
  { id: 'demo-p4', name: 'Velvet 150gsm', groupName: 'Coated', supplier: 'Graphcom', width: 700, height: 1000, thickness: 150, costPerUnit: 0.22, unit: 'φύλλο' },
  { id: 'demo-p5', name: 'Gloss 200gsm', groupName: 'Coated', supplier: 'Περράκης', width: 700, height: 1000, thickness: 200, costPerUnit: 0.32, unit: 'φύλλο' },
];

// ─── IMPOSITION MODES ───
const IMPO_MODES: { key: ImpositionMode; label: string }[] = [
  { key: 'nup', label: 'N-Up' },
  { key: 'booklet', label: 'Booklet' },
  { key: 'perfect_bound', label: 'Perfect Bound' },
  { key: 'cutstack', label: 'Cut&Stack' },
  { key: 'workturn', label: 'Work&Turn' },
  { key: 'gangrun', label: 'Gang Run' },
  { key: 'stepmulti', label: 'Step Multi' },
];

// ─── ARCHETYPES ───
const ARCHETYPES = [
  { id: 'single_leaf', label: 'Φύλλο', icon: 'fas fa-file' },
  { id: 'pad', label: 'Μπλοκ', icon: 'fas fa-layer-group' },
  { id: 'booklet', label: 'Φυλλάδιο', icon: 'fas fa-book-open' },
  { id: 'perfect_bound', label: 'Κολλητό', icon: 'fas fa-book' },
  { id: 'die_cut', label: 'Ντεκόπ', icon: 'fas fa-shapes' },
  { id: 'custom', label: 'Custom', icon: 'fas fa-cog' },
];

// ─── ARCHETYPE ↔ MODE VALIDATION ───
const ARCHETYPE_MODES: Record<string, ImpositionMode[]> = {
  single_leaf: ['nup', 'cutstack', 'workturn', 'gangrun', 'stepmulti'],
  pad: ['nup', 'cutstack'],
  booklet: ['booklet'],
  perfect_bound: ['perfect_bound'],
  die_cut: ['nup', 'stepmulti'],
  custom: ['nup', 'cutstack', 'gangrun', 'stepmulti'],
};
const FORCE_DUPLEX: Set<ImpositionMode> = new Set(['booklet', 'perfect_bound', 'workturn']);
const HIDE_BACK_PLATES: Set<ImpositionMode> = new Set(['workturn']);


/* ═══ MODAL PORTAL ═══ */
function ModalPortal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
      background: 'rgb(20,30,55)',
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

/* ═══ OVERRIDES POPUP ═══ */
function OverridesPopup({ overrides, onChange, anchor, onClose }: {
  overrides: Record<string, number | undefined>;
  onChange: (key: string, val: number | undefined) => void;
  anchor: HTMLElement | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && anchor && !anchor.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, anchor]);

  const pos = anchor?.getBoundingClientRect();
  if (!pos) return null;

  const inp: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '5px 8px', color: 'var(--text)', fontSize: '0.8rem', textAlign: 'right', outline: 'none',
  };
  const lbl: React.CSSProperties = { fontSize: '0.68rem', color: '#94a3b8', marginBottom: 2 };
  const section: React.CSSProperties = { marginBottom: 12 };
  const sectionTitle: React.CSSProperties = { fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 };

  function numInput(key: string, placeholder: string, suffix?: string) {
    const val = overrides[key];
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input type="number" value={val ?? ''} placeholder={placeholder}
          onChange={e => onChange(key, e.target.value ? Number(e.target.value) : undefined)}
          style={inp} />
        {suffix && <span style={{ fontSize: '0.65rem', color: '#64748b', flexShrink: 0 }}>{suffix}</span>}
      </div>
    );
  }

  return createPortal(
    <div ref={ref} style={{
      position: 'fixed', left: pos.left, top: pos.bottom + 8, transform: 'none',
      width: 340, maxHeight: 480, overflow: 'auto',
      background: '#0f172a', border: '1px solid var(--border)', borderRadius: 12,
      boxShadow: '0 12px 48px rgba(0,0,0,0.6)', zIndex: 9999, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)' }}>
          <i className="fas fa-sliders-h" style={{ marginRight: 6, color: 'var(--accent)' }} />Προσαρμογές
        </span>
        <button onClick={() => onChange('_reset', undefined)} style={{ border: 'none', background: 'transparent', color: '#f87171', fontSize: '0.65rem', cursor: 'pointer', fontWeight: 600 }}>
          <i className="fas fa-undo" style={{ marginRight: 3 }} />Reset
        </button>
      </div>

      {/* Εκπτώσεις */}
      <div style={section}>
        <div style={sectionTitle}><i className="fas fa-percentage" style={{ fontSize: '0.55rem' }} />Εκπτώσεις %</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><div style={lbl}>Χαρτί €/φύλλο</div>{numInput('paperPriceOverride', 'auto', '€')}</div>
          <div><div style={lbl}>Πλάκες</div>{numInput('plateDiscount', '0', '%')}</div>
          <div><div style={lbl}>Ωριαίο</div>{numInput('hourlyOverride', 'auto', '€/h')}</div>
          <div><div style={lbl}>Γκιλοτίνα</div>{numInput('guillotineDiscount', '0', '%')}</div>
          <div><div style={lbl}>Πλαστικοποίηση</div>{numInput('lamDiscount', '0', '%')}</div>
          <div><div style={lbl}>Βιβλιοδεσία</div>{numInput('bindingDiscount', '0', '%')}</div>
        </div>
      </div>

      {/* Extra χρεώσεις */}
      <div style={section}>
        <div style={sectionTitle}><i className="fas fa-plus-circle" style={{ fontSize: '0.55rem' }} />Extra Χρεώσεις</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><div style={lbl}>Ανά τεμάχιο</div>{numInput('extraPerPiece', '0', '€')}</div>
          <div><div style={lbl}>Ανά φύλλο</div>{numInput('extraPerSheet', '0', '€')}</div>
          <div><div style={lbl}>Ανά όψη</div>{numInput('extraPerFace', '0', '€')}</div>
          <div><div style={lbl}>Συνολικά</div>{numInput('extraFixed', '0', '€')}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ═══ HOVER CHIP (cost/profit popup via portal) ═══ */
function HoverChip({ icon, color, label, rows, total, totalLabel, title }: {
  icon: string; color: string; label: string; title: string;
  rows: { label: string; value: number }[];
  total: number; totalLabel: string;
}) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleEnter() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ x: r.left + r.width / 2, y: r.top });
    }
    setShow(true);
  }
  function handleLeave() {
    hideTimer.current = setTimeout(() => setShow(false), 150);
  }
  function popupEnter() { if (hideTimer.current) clearTimeout(hideTimer.current); }
  function popupLeave() { hideTimer.current = setTimeout(() => setShow(false), 150); }

  const fmt2 = (n: number) => n.toFixed(2);
  return (
    <>
      <span ref={ref} onMouseEnter={handleEnter} onMouseLeave={handleLeave}
        style={{ fontSize: '0.72rem', color, cursor: 'default', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <i className={icon} style={{ fontSize: '0.55rem' }} /><strong>{label}</strong>
      </span>
      {show && createPortal(
        <div onMouseEnter={popupEnter} onMouseLeave={popupLeave} style={{
          position: 'fixed', left: pos.x, top: pos.y, transform: 'translate(-50%, -100%)',
          marginTop: -8, padding: '10px 14px', minWidth: 190,
          background: '#0f172a', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', flexDirection: 'column', gap: 5,
        }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color, marginBottom: 2 }}>{title}</div>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', gap: 16 }}>
              <span style={{ color: '#94a3b8' }}>{r.label}</span>
              <strong style={{ color: 'var(--text)' }}>€{fmt2(r.value)}</strong>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 2, paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
            <span style={{ color, fontWeight: 600 }}>{totalLabel}</span>
            <strong style={{ color }}>€{fmt2(total)}</strong>
          </div>
        </div>,
        document.body,
      )}
    </>
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
function ToggleBar({ options, value, onChange, color }: { options: { v: string; l: string }[]; value: string; onChange: (v: string) => void; color?: string }) {
  const c = color || 'var(--accent)';
  const bgAlpha = color ? `color-mix(in srgb, ${c} 12%, transparent)` : 'rgba(245,130,32,0.12)';
  return (
    <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
      {options.map((o, i) => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{
          flex: 1, padding: '8px 0', textAlign: 'center', fontSize: '0.82rem', fontWeight: 600,
          background: value === o.v ? bgAlpha : 'transparent',
          border: 'none', color: value === o.v ? c : '#64748b',
          cursor: 'pointer', transition: 'all 0.2s',
          borderRight: i < options.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
        }}>{o.l}</button>
      ))}
    </div>
  );
}

/* ═══ DEV PANEL COMPONENTS ═══ */

function DevPanel({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.25)', borderRadius: 8, border: '1px solid var(--border)',
      padding: '8px 10px', fontSize: '0.62rem', fontFamily: 'monospace',
    }}>
      <div style={{ fontSize: '0.55rem', fontWeight: 700, color, letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase' }}>{title}</div>
      {children}
    </div>
  );
}

function DevRow({ label, sub, value, bold, color, indent }: { label: string; sub?: string; value: number; bold?: boolean; color?: string; indent?: boolean }) {
  const dimmed = !bold && value === 0;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '1px 0', opacity: dimmed ? 0.35 : 1, paddingLeft: indent ? 10 : 0 }}>
      <div style={{ minWidth: 0, overflow: 'hidden' }}>
        <div style={{ color: bold ? (color || 'var(--text)') : indent ? '#64748b' : '#94a3b8', fontWeight: bold ? 700 : 400, fontSize: indent ? '0.55rem' : undefined }}>{label}</div>
        {sub && <div style={{ color: '#64748b', fontSize: '0.5rem' }}>{sub}</div>}
      </div>
      <span style={{ color: color || (bold ? 'var(--text)' : '#cbd5e1'), fontWeight: bold ? 700 : 400, flexShrink: 0, marginLeft: 8 }}>€{value.toFixed(2)}</span>
    </div>
  );
}

function DevDivider() {
  return <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '4px 0' }} />;
}

/* ═══ MACHINE PAPER PRESETS ═══ */

type CustomPaper = { name: string; ss: number; ls: number };

function MachinePaperPresets({ machine, sheetW, sheetH, onSelect, onUpdate }: {
  machine: DbMachine;
  sheetW: number;
  sheetH: number;
  onSelect: (ls: number, ss: number) => void;
  onUpdate: (papers: CustomPaper[]) => void;
}) {
  const papers: CustomPaper[] = (machine?.specs?.custom_papers as CustomPaper[]) ?? [];

  function save(updated: CustomPaper[]) {
    onUpdate(updated);
    fetch('/api/calculator', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineId: machine.id, custom_papers: updated }),
    });
  }

  function addCurrent() {
    if (papers.some(p => p.ss === sheetH && p.ls === sheetW)) return;
    save([...papers, { name: `${sheetH}×${sheetW}`, ss: sheetH, ls: sheetW }]);
  }

  function del(i: number, e: React.MouseEvent) {
    e.stopPropagation();
    save(papers.filter((_, idx) => idx !== i));
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
      {papers.map((p, i) => {
        const active = sheetW === p.ls && sheetH === p.ss;
        return (
          <button key={i} onClick={() => onSelect(p.ls, p.ss)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '2px 4px 2px 8px', fontSize: '0.6rem', borderRadius: 4, cursor: 'pointer',
              border: active ? '1px solid var(--blue)' : '1px solid var(--border)',
              background: active ? 'var(--blue)' : 'transparent',
              color: active ? '#fff' : 'var(--text-dim)',
            }}>
            {p.name}
            <span onClick={(e) => del(i, e)}
              style={{ fontSize: '0.5rem', opacity: 0.5, padding: '0 2px', cursor: 'pointer' }}>✕</span>
          </button>
        );
      })}
      <button onClick={addCurrent}
        style={{ padding: '2px 8px', fontSize: '0.6rem', borderRadius: 4, cursor: 'pointer', border: '1px dashed var(--border)', background: 'none', color: 'var(--text-dim)' }}>
        +
      </button>
    </div>
  );
}

/* ═══ CALCULATOR COMPONENT ═══ */
export default function CalculatorShell() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // ─── DB DATA ───
  const [machines, setMachines] = useState<DbMachine[]>(DEMO_MACHINES);
  const [papers, setPapers] = useState<DbMaterial[]>(DEMO_PAPERS);
  const [postpress, setPostpress] = useState<DbPostpress[]>([]);
  const [films, setFilms] = useState<DbFilm[]>([]);
  const [products, setProducts] = useState<DbProduct[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [presskitEnabled, setPresskitEnabled] = useState(false);

  // ─── STATE ───
  const [activeMachine, setActiveMachine] = useState(0);
  const [activeCalcModule, setActiveCalcModule] = useState<'sheetfed' | 'plotter'>('sheetfed');
  const [showModulePopup, setShowModulePopup] = useState(false);
  const moduleBtnRef = useRef<HTMLDivElement>(null);
  const [activePaperId, setActivePaperId] = useState<string>(DEMO_PAPERS[0].id);
  const [activePanel, setActivePanel] = useState<'machine' | 'paper' | 'job' | 'color' | 'finish' | 'mode-settings'>('job');
  const [impoMode, setImpoMode] = useState<ImpositionMode>('nup');

  const [supplier, setSupplier] = useState('');
  const [paperCat, setPaperCat] = useState('');
  const [paperSearch, setPaperSearch] = useState('');
  const [showFavPapers, setShowFavPapers] = useState(false);

  const [job, setJob] = useState<JobData>({ archetype: 'single_leaf', width: 210, height: 297, bleed: 3, bleedOn: true, qty: 500, sides: 2, rotation: false, pages: 8, sheetsPerPad: 50, bodyPages: 64, customMult: 1 });
  const [color, setColor] = useState<ColorData>({
    model: 'cmyk', coverage: 'mid',
    platesFront: 4, platesBack: 0,
    pmsFront: 0, pmsBack: 0,
    varnish: 'none', varnishTiming: 'inline', perfecting: false, printMethod: 'sheetwise',
  });
  const [finish, setFinish] = useState<FinishData>({ guillotineId: '', guillotineName: 'Χωρίς', lamMachineId: '', lamFilmId: '', lamName: 'Χωρίς', lamSides: 1, binding: 'none', bindingMachineId: '', creaseMachineId: '', creaseCount: 1, foldMachineId: '', foldType: '', gatherMachineId: '', gatherSignatures: 1, customMachineIds: [] });
  const [devPanelHidden, setDevPanelHidden] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('calc-dev-panel-hidden') === '1';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('calc-dev-panel-hidden', devPanelHidden ? '1' : '0');
    }
  }, [devPanelHidden]);

  // Imposition settings
  const [impoGutter, setImpoGutter] = useState(6);
  const [impoBleedOverride, setImpoBleedOverride] = useState<number | null>(null); // null = use job.bleed
  const [impoContentScale, setImpoContentScale] = useState(100); // % content scale (100 = 1:1)
  const [impoCropMarks, setImpoCropMarks] = useState(true);
  const [impoKeepSourceMarks, setImpoKeepSourceMarks] = useState(false);
  const [impoForceUps, setImpoForceUps] = useState<number | null>(null);
  const [impoForceCols, setImpoForceCols] = useState<number | null>(null);
  const [impoForceRows, setImpoForceRows] = useState<number | null>(null);
  const [impoOffsetX, setImpoOffsetX] = useState(0);
  const [impoOffsetY, setImpoOffsetY] = useState(0);
  const [impoRotation, setImpoRotation] = useState<number>(0);
  const [impoDuplexOrient, setImpoDuplexOrient] = useState<'h2h' | 'h2f'>('h2h');
  const [impoTurnType, setImpoTurnType] = useState<'turn' | 'tumble'>('turn');
  // Cut & Stack
  const [csStackOrder, setCsStackOrder] = useState<'row' | 'column' | 'snake'>('row');
  const [csStartNum, setCsStartNum] = useState(1);
  const [csNumbering, setCsNumbering] = useState(false);
  const [csNumPrefix, setCsNumPrefix] = useState('');
  const [csNumDigits, setCsNumDigits] = useState(4);
  const [csNumFontSize, setCsNumFontSize] = useState(8);
  const [csNumColor, setCsNumColor] = useState<'black' | 'red'>('black');
  const [csNumFont, setCsNumFont] = useState<'Helvetica' | 'Courier'>('Helvetica');
  const [csNumPosX, setCsNumPosX] = useState(0.5); // 0-1 normalized
  const [csNumPosY, setCsNumPosY] = useState(0.95);
  const [csNumRotation, setCsNumRotation] = useState(0);
  const [csExtraNum, setCsExtraNum] = useState<{ posX: number; posY: number; fontSize: number; rotation: number }[]>([]);
  const [csFixedBack, setCsFixedBack] = useState(false);
  // Gang Run — layout persisted to localStorage (pdf bytes NOT persisted; user re-uploads)
  const [gangJobs, setGangJobs] = useState<{ id: string; label: string; qty: number; pdf?: ParsedPDF }[]>(() => {
    if (typeof window === 'undefined') return [{ id: crypto.randomUUID(), label: 'Δουλειά 1', qty: 1 }];
    try {
      const saved = localStorage.getItem('calc-gang-state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.jobs) && parsed.jobs.length > 0) {
          return parsed.jobs.map((j: { id: string; label: string; qty: number }) => ({
            id: j.id, label: j.label, qty: j.qty,
          }));
        }
      }
    } catch { /* ignore corrupt state */ }
    return [{ id: crypto.randomUUID(), label: 'Δουλειά 1', qty: 1 }];
  });
  const [gangCellAssign, setGangCellAssign] = useState<Record<number, number>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('calc-gang-state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.cellAssign && typeof parsed.cellAssign === 'object') return parsed.cellAssign;
      }
    } catch { /* ignore */ }
    return {};
  });
  // Gang brush: when active, clicking a cell paints it with this job (0-based).
  // Null = legacy cycle-through-jobs behavior.
  const [gangBrushJob, setGangBrushJob] = useState<number | null>(null);
  // Persist gang layout (jobs metadata + cell assignments) on change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('calc-gang-state', JSON.stringify({
        jobs: gangJobs.map(gj => ({ id: gj.id, label: gj.label, qty: gj.qty })),
        cellAssign: gangCellAssign,
      }));
    } catch { /* quota exceeded — ignore */ }
  }, [gangJobs, gangCellAssign]);
  // Step Multi
  const [smBlocks, setSmBlocks] = useState<StepBlock[]>([
    { pageNum: 1, backPageNum: null, trimW: 90, trimH: 55, cols: 1, rows: 1, rotation: 0, x: 0, y: 0, blockW: 0, blockH: 0, _manualGrid: true },
  ]);
  const [smBlockPdfs, setSmBlockPdfs] = useState<(ParsedPDF | undefined)[]>([]);
  const [csBackPdf, setCsBackPdf] = useState<{ bytes: Uint8Array; name: string } | null>(null);
  const [pbPaperThickness, setPbPaperThickness] = useState(0.1); // mm per sheet
  const [impoColorBar, setImpoColorBar] = useState(false);
  const [impoColorBarType, setImpoColorBarType] = useState<'cmyk' | 'cmyk_tint50'>('cmyk');
  const [impoColorBarEdge, setImpoColorBarEdge] = useState<'tail' | 'gripper'>('tail');
  const [impoColorBarOffY, setImpoColorBarOffY] = useState(0); // mm micro-adjust
  const [impoColorBarScale, setImpoColorBarScale] = useState(100); // % scale
  const [impoPlateSlug, setImpoPlateSlug] = useState(false);
  const [impoPlateSlugEdge, setImpoPlateSlugEdge] = useState<'tail' | 'gripper'>('tail');
  const [impoModeTab, setImpoModeTab] = useState<'spacing' | 'marks'>('spacing');
  const [activeSigSheet, setActiveSigSheet] = useState(0);
  const [sigShowBack, setSigShowBack] = useState(false);
  // Machine sheet override (null = use machine default)
  const [machineSheetW, setMachineSheetW] = useState<number | null>(null);
  const [machineSheetH, setMachineSheetH] = useState<number | null>(null);
  // Temporary string state for typing in LS/SS inputs
  const [machineSheetWStr, setMachineSheetWStr] = useState<string | null>(null);
  const [machineSheetHStr, setMachineSheetHStr] = useState<string | null>(null);
  // Feed direction: sef = short edge first, lef = long edge first
  const [feedEdge, setFeedEdge] = useState<'sef' | 'lef'>('lef');
  // Speed override (null = use machine default)
  const [speedOverride, setSpeedOverride] = useState<number | null>(null);
  // Waste (φύλλα μοντάζ)
  const [wasteFixed, setWasteFixed] = useState(0);
  const [prodMultiplier, setProdMultiplier] = useState(1);

  // Overrides & Discounts
  const [showOverrides, setShowOverrides] = useState(false);
  const overridesBtnRef = useRef<HTMLSpanElement>(null);
  const [overrides, setOverrides] = useState<{
    paperPriceOverride?: number;    // €/φύλλο override
    plateDiscount?: number;         // % έκπτωση πλάκες
    hourlyOverride?: number;        // €/h override
    guillotineDiscount?: number;    // % έκπτωση γκιλοτίνα
    lamDiscount?: number;           // % έκπτωση πλαστικοποίηση
    bindingDiscount?: number;       // % έκπτωση βιβλιοδεσία
    extraPerPiece?: number;         // € extra ανά τεμάχιο
    extraPerSheet?: number;         // € extra ανά φύλλο
    extraPerFace?: number;          // € extra ανά όψη
    extraFixed?: number;            // € extra συνολικά
  }>({});
  const hasOverrides = Object.values(overrides).some(v => v !== undefined && v !== 0);

  // PDF
  const [pdf, setPdf] = useState<ParsedPDF | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [calcResult, setCalcResult] = useState<CalculatorResult | null>(null);
  const [calcDebug, setCalcDebug] = useState<Record<string, unknown> | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);
  const pdfBtnRef = useRef<HTMLDivElement>(null);
  const pdfMenuItemStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'inherit' };
  const [showPlateOrder, setShowPlateOrder] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const calcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Quote link (from URL params only — no sessionStorage fallback to avoid
  // saving to the wrong quote if the user navigates via sidebar)
  const [quoteLink, setQuoteLink] = useState<{ quoteId: string; itemId: string; desc: string; quoteNumber: string } | null>(null);
  const [linkedFile, setLinkedFile] = useState<{ path: string; name: string } | null>(null);
  const [savingToQuote, setSavingToQuote] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const firstPdfLoad = useRef(true); // true until first PDF is loaded

  const togglePanel = useCallback((key: 'machine' | 'paper' | 'job' | 'color' | 'finish' | 'mode-settings') => {
    setActivePanel(key);
  }, []);

  // ─── PARSE PDF (internal — used by the auto-load flow only) ───
  // Drag-drop and manual PDF upload have been removed from the calc. This
  // helper is still used by the "auto-load linked PDF" effect: when the calc
  // opens with a linkedFile, we fetch the bytes and parse them for preview +
  // auto-fill job dimensions. No DB writes happen here — the linkedFile is
  // owned by the item and only mutated via the "🔗 Σύνδεση αρχείου" menu.
  const handlePdfFiles = useCallback(async (files: FileList) => {
    const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
    if (pdfFiles.length === 0) return;
    setPdfLoading(true);
    try {
      const parsed = await parsePDF(pdfFiles[0]);
      setPdf(parsed);
      // Start at 1-UP on every new PDF — user asks for it as a deliberate default,
      // then grows the grid manually via the canvas handle.
      // BUT: skip reset on first PDF load when restoring from a quote
      // (prefill already set the correct cols/rows from calcData).
      const isRestore = firstPdfLoad.current && prefillDone.current;
      firstPdfLoad.current = false;
      if (!isRestore) {
        setImpoForceCols(1);
        setImpoForceRows(1);
      }
      if (parsed.pageSizes.length > 0) {
        const pg = parsed.pageSizes[0];
        setJob(prev => ({
          ...prev,
          width: Math.round(pg.trimW * 10) / 10,
          height: Math.round(pg.trimH * 10) / 10,
          bleed: pg.bleedDetected > 0 ? pg.bleedDetected : prev.bleed,
          ...(parsed.pageCount === 1 ? { sides: 1 as const } : {}),
          ...(impoMode === 'cutstack' && parsed.pageCount > 1 ? { qty: parsed.pageCount } : {}),
          ...((impoMode === 'booklet' || prev.archetype === 'booklet') && parsed.pageCount >= 4 ? { pages: parsed.pageCount } : {}),
          ...((impoMode === 'perfect_bound' || prev.archetype === 'perfect_bound') && parsed.pageCount >= 4 ? { bodyPages: parsed.pageCount } : {}),
        }));
      }
      if (parsed.coverage) {
        setColor(prev => ({ ...prev, coverage: 'pdf' as const }));
      }
      if (impoMode === 'stepmulti' && parsed.pageSizes.length > 0) {
        const pg = parsed.pageSizes[0];
        setSmBlocks(prev => prev.map((b, i) => i === 0 ? {
          ...b,
          trimW: Math.round(pg.trimW * 10) / 10,
          trimH: Math.round(pg.trimH * 10) / 10,
          cols: 1, rows: 1, blockW: 0, blockH: 0, _manualGrid: true,
        } : b));
        setSmBlockPdfs(prev => { const next = [...prev]; next[0] = parsed; return next; });
      }
    } catch (err) {
      console.error('PDF parse error:', err);
    } finally {
      setPdfLoading(false);
    }
  }, [impoMode]);

  // ─── FETCH DATA FROM DB ───
  useEffect(() => {
    fetch('/api/calculator')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (data.machines?.length) setMachines(data.machines);
        if (data.materials?.length) {
          setPapers(data.materials);
          setActivePaperId(data.materials[0].id);
        }
        if (data.postpress?.length) setPostpress(data.postpress);
        if (data.films?.length) setFilms(data.films);
        if (data.products?.length) setProducts(data.products);
        if (data.presskitEnabled != null) setPresskitEnabled(data.presskitEnabled);
        setDataLoaded(true);
      })
      .catch(() => setDataLoaded(true)); // use demo data on failure
  }, []);

  // ─── AUTO-SELECT DEFAULT POSTPRESS MACHINES ───
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (!dataLoaded || defaultsApplied.current || !postpress.length) return;
    defaultsApplied.current = true;
    const defGuillotine = postpress.find(p => p.subtype === 'guillotine' && (p.specs as Record<string, unknown>)?.cal_default);
    const defLaminator = postpress.find(p => (p.subtype === 'laminator' || p.subtype === 'lam_roll' || p.subtype === 'lam_sheet') && (p.specs as Record<string, unknown>)?.cal_default);
    if (defGuillotine || defLaminator) {
      setFinish(prev => ({
        ...prev,
        guillotineId: defGuillotine?.id || prev.guillotineId,
        guillotineName: defGuillotine?.name || prev.guillotineName,
        lamMachineId: defLaminator?.id || prev.lamMachineId,
        lamName: defLaminator?.name || prev.lamName,
        lamFilmId: defLaminator ? (films[0]?.id || '') : prev.lamFilmId,
      }));
    }
  }, [dataLoaded, postpress, films]);

  // ─── PRE-FILL FROM URL PARAMS (quote → calculator) ───
  const prefillDone = useRef(false);
  useEffect(() => {
    if (!dataLoaded || prefillDone.current) return;
    const w = searchParams.get('w');
    const h = searchParams.get('h');
    const hasQuoteLink = searchParams.get('quoteId') && searchParams.get('itemId');
    const hasFile = searchParams.get('filePath') && searchParams.get('fileName');
    if (!w && !h && !hasQuoteLink && !hasFile) return; // no params to apply
    prefillDone.current = true;

    // ─── Job dimensions & basics ───
    const updates: Partial<JobData> = {};
    if (w) updates.width = parseInt(w);
    if (h) updates.height = parseInt(h);
    const qty = searchParams.get('qty');
    if (qty) updates.qty = parseInt(qty);
    const sides = searchParams.get('sides');
    if (sides) updates.sides = parseInt(sides) as 1 | 2;
    const pages = searchParams.get('pages');
    if (pages) updates.pages = parseInt(pages);
    const archetype = searchParams.get('archetype');
    if (archetype) updates.archetype = archetype as JobData['archetype'];
    const productId = searchParams.get('productId');
    if (productId) updates.productId = productId;
    const bleedParam = searchParams.get('bleed');
    if (bleedParam) { updates.bleed = parseFloat(bleedParam); updates.bleedOn = true; }
    setJob(prev => ({ ...prev, ...updates }));

    // ─── Color from URL ───
    const colorsF = searchParams.get('colorsF');
    const colorsB = searchParams.get('colorsB');
    const colorMode = searchParams.get('colorMode');
    const pmsFront = searchParams.get('pmsFront');
    const pmsBack = searchParams.get('pmsBack');
    const oilVarnish = searchParams.get('oilVarnish');
    const coverageLevel = searchParams.get('coverageLevel');
    if (colorsF || colorsB || colorMode) {
      const f = parseInt(colorsF || '4');
      const b = parseInt(colorsB || '0');
      setColor(prev => ({
        ...prev,
        model: colorMode === 'bw' ? 'bw' : (f <= 1 && b <= 1) ? 'bw' : 'cmyk',
        platesFront: f,
        platesBack: b,
        pmsFront: pmsFront ? parseInt(pmsFront) : prev.pmsFront,
        pmsBack: pmsBack ? parseInt(pmsBack) : prev.pmsBack,
        varnish: oilVarnish ? 'oil' : prev.varnish,
        coverage: (coverageLevel as ColorData['coverage']) || prev.coverage,
      }));
    }

    // ─── Machine selection by ID ───
    const machineId = searchParams.get('machineId');
    if (machineId) {
      const mi = machines.findIndex(m => m.id === machineId);
      if (mi >= 0) setActiveMachine(mi);
    }

    // ─── Paper selection by ID ───
    const paperId = searchParams.get('paperId');
    if (paperId) setActivePaperId(paperId);

    // ─── Feed edge ───
    const fe = searchParams.get('feedEdge');
    if (fe === 'sef' || fe === 'lef') setFeedEdge(fe);

    // ─── Machine sheet override ───
    const msw = searchParams.get('machineSheetW');
    const msh = searchParams.get('machineSheetH');
    if (msw) setMachineSheetW(parseFloat(msw));
    if (msh) setMachineSheetH(parseFloat(msh));

    // ─── Imposition settings ───
    const imMode = searchParams.get('impoMode');
    if (imMode) setImpoMode(imMode as ImpositionMode);
    const imRot = searchParams.get('impoRotation');
    if (imRot) setImpoRotation(parseInt(imRot));
    const imGut = searchParams.get('impoGutter');
    if (imGut) setImpoGutter(parseFloat(imGut));
    const imForce = searchParams.get('impoForceUps');
    if (imForce) setImpoForceUps(parseInt(imForce));
    const imForceCols = searchParams.get('impoForceCols');
    if (imForceCols) setImpoForceCols(parseInt(imForceCols));
    const imForceRows = searchParams.get('impoForceRows');
    if (imForceRows) setImpoForceRows(parseInt(imForceRows));
    const imDuplex = searchParams.get('impoDuplexOrient');
    if (imDuplex === 'h2h' || imDuplex === 'h2f') setImpoDuplexOrient(imDuplex);
    const imTurn = searchParams.get('impoTurnType');
    if (imTurn === 'turn' || imTurn === 'tumble') setImpoTurnType(imTurn);
    const wf = searchParams.get('wasteFixed');
    if (wf) setWasteFixed(parseInt(wf));

    // ─── Finishing ───
    const guillId = searchParams.get('guillotineId');
    const lamMachId = searchParams.get('lamMachineId');
    const lamFlmId = searchParams.get('lamFilmId');
    const lamSd = searchParams.get('lamSides');
    const bindType = searchParams.get('bindingType');
    const bindMachId = searchParams.get('bindingMachineId');
    const creaseId = searchParams.get('creaseMachineId');
    const creaseCnt = searchParams.get('creaseCount');
    const foldId = searchParams.get('foldMachineId');
    const foldTp = searchParams.get('foldType');
    const gatherId = searchParams.get('gatherMachineId');
    const gatherSigs = searchParams.get('gatherSignatures');
    const customIds = searchParams.get('customMachineIds');
    if (guillId || lamMachId || lamFlmId || bindType || creaseId || foldId || gatherId || customIds) {
      setFinish(prev => ({
        ...prev,
        guillotineId: guillId || prev.guillotineId,
        lamMachineId: lamMachId || prev.lamMachineId,
        lamFilmId: lamFlmId || prev.lamFilmId,
        lamSides: lamSd ? parseInt(lamSd) as 1 | 2 : prev.lamSides,
        binding: (bindType || prev.binding) as FinishData['binding'],
        bindingMachineId: bindMachId || prev.bindingMachineId,
        creaseMachineId: creaseId || prev.creaseMachineId,
        creaseCount: creaseCnt ? parseInt(creaseCnt) || prev.creaseCount : prev.creaseCount,
        foldMachineId: foldId || prev.foldMachineId,
        foldType: foldTp || prev.foldType,
        gatherMachineId: gatherId || prev.gatherMachineId,
        gatherSignatures: gatherSigs ? parseInt(gatherSigs) || prev.gatherSignatures : prev.gatherSignatures,
        customMachineIds: customIds ? customIds.split(',').filter(Boolean) : prev.customMachineIds,
      }));
    }

    // ─── Overrides ───
    const ovParam = searchParams.get('overrides');
    if (ovParam) {
      try { setOverrides(JSON.parse(ovParam)); } catch {}
    }

    // ─── Quote link — URL is the source of truth (refresh keeps query params).
    // No sessionStorage restore: previously, navigating to /calculator via the
    // sidebar after costing a different quote would resurrect the old link and
    // silently save items to the wrong quote.
    const quoteId = searchParams.get('quoteId');
    const itemId = searchParams.get('itemId');
    const desc = searchParams.get('desc');
    const quoteNumber = searchParams.get('quoteNumber');
    if (quoteId) {
      setQuoteLink({ quoteId, itemId: itemId || '', desc: desc || '', quoteNumber: quoteNumber || '' });
      setActivePanel('machine');
    } else {
      setQuoteLink(null);
    }
    // Clean up any stale entry from older builds
    try { sessionStorage.removeItem('calcQuoteLink'); } catch {}

    // ─── Linked file info ───
    const filePath = searchParams.get('filePath');
    const fileName = searchParams.get('fileName');
    if (filePath && fileName) {
      setLinkedFile({ path: filePath, name: fileName });
    }
  }, [dataLoaded, searchParams, machines]);

  // ─── REFRESH LINKED FILE FROM DB ON WINDOW FOCUS ───
  // After the user picks a file in PressKit (separate app) the linkedFile is
  // written to the DB. When they switch back to this tab, pull the fresh
  // value so the calc can auto-load the newly linked PDF.
  useEffect(() => {
    if (!quoteLink?.quoteId || !quoteLink?.itemId) return;
    const refresh = async () => {
      try {
        const res = await fetch(`/api/quotes/${quoteLink.quoteId}/items`);
        if (!res.ok) return;
        const data = await res.json();
        const item = (data.items as any[])?.find(i => i.id === quoteLink.itemId);
        const lf = item?.linkedFile;
        if (lf?.path && lf?.name && lf.path !== linkedFile?.path) {
          setLinkedFile({ path: lf.path, name: lf.name });
        }
      } catch {}
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [quoteLink?.quoteId, quoteLink?.itemId, linkedFile?.path]);

  // ─── AUTO-LOAD LINKED PDF VIA HELPER FILE SERVER OR STORAGE ───
  useEffect(() => {
    if (!linkedFile?.path || !linkedFile.name.toLowerCase().endsWith('.pdf')) return
    const loadPdf = async () => {
      try {
        setPdfLoading(true)
        // Stored files: fetch directly from Next.js. Temp files: via Helper's local server.
        const url = linkedFile.path.startsWith('/storage/')
          ? linkedFile.path
          : `http://localhost:17824/?path=${encodeURIComponent(linkedFile.path)}`
        const res = await fetch(url)
        if (!res.ok) throw new Error('File not available')
        const blob = await res.blob()
        const file = new File([blob], linkedFile.name, { type: 'application/pdf' })
        const dt = new DataTransfer()
        dt.items.add(file)
        await handlePdfFiles(dt.files)
      } catch (e) {
        console.log('Auto-load PDF failed (Helper file server may not be running):', e)
      } finally {
        setPdfLoading(false)
      }
    }
    loadPdf()
  }, [linkedFile, handlePdfFiles])

  // ─── ARCHETYPE ↔ MODE ↔ SIDES VALIDATION ───
  // Set default feed direction from machine specs
  useEffect(() => {
    const s = (machines[activeMachine]?.specs as Record<string, unknown> | undefined);
    const dir = (s?.feed_direction as string) || 'sef';
    if (dir === 'sef' || dir === 'lef') setFeedEdge(dir);
    else setFeedEdge('sef'); // 'both' defaults to SEF
  }, [activeMachine, machines]);

  // Auto-correct mode when archetype changes
  useEffect(() => {
    const valid = ARCHETYPE_MODES[job.archetype] || ARCHETYPE_MODES.single_leaf;
    if (!valid.includes(impoMode)) setImpoMode(valid[0]);
  }, [job.archetype]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select product: favourite first, or only product for archetype
  useEffect(() => {
    if (!products.length || job.productId) return;
    const matching = products.filter(p => p.archetype === job.archetype);
    if (matching.length === 0) return;
    const fav = matching.find(p => p.isFavourite);
    const pick = fav || (matching.length === 1 ? matching[0] : null);
    if (pick) {
      setJob(prev => ({
        ...prev,
        productId: pick.id,
        pages: pick.pages ?? prev.pages,
        sheetsPerPad: pick.sheetsPerPad ?? prev.sheetsPerPad,
        bodyPages: pick.bodyPages ?? prev.bodyPages,
        customMult: pick.customMult ?? prev.customMult,
      }));
    }
  }, [job.archetype, products]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-correct sides when mode forces duplex
  useEffect(() => {
    if (FORCE_DUPLEX.has(impoMode) && job.sides !== 2) {
      setJob(prev => ({ ...prev, sides: 2 }));
    }
  }, [impoMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Offset: auto-set sides from back plate count
  useEffect(() => {
    const m = machines[activeMachine];
    if (m?.cat !== 'offset' || FORCE_DUPLEX.has(impoMode)) return;
    const hasBack = (color.platesBack + color.pmsBack) > 0;
    setJob(prev => ({ ...prev, sides: hasBack ? 2 : 1 }));
  }, [color.platesBack, color.pmsBack, activeMachine]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cut&Stack: auto-set qty to PDF page count
  useEffect(() => {
    if (impoMode === 'cutstack' && pdf && pdf.pageCount > 1) {
      setJob(prev => ({ ...prev, qty: pdf.pageCount }));
    }
  }, [impoMode, pdf]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step Multi: sync block 0 trim from global PDF when entering mode or PDF changes
  useEffect(() => {
    if (impoMode !== 'stepmulti' || !pdf?.pageSizes?.[0]) return;
    const pg = pdf.pageSizes[0];
    const tw = Math.round(pg.trimW * 10) / 10;
    const th = Math.round(pg.trimH * 10) / 10;
    setSmBlocks(prev => {
      const b0 = prev[0];
      if (!b0 || (b0.trimW === tw && b0.trimH === th)) return prev;
      return prev.map((b, i) => i === 0 ? { ...b, trimW: tw, trimH: th, cols: 1, rows: 1, blockW: 0, blockH: 0, _manualGrid: true } : b);
    });
    setSmBlockPdfs(prev => { if (prev[0] === pdf) return prev; const next = [...prev]; next[0] = pdf; return next; });
  }, [impoMode, pdf]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset signature navigator when mode or page count changes
  useEffect(() => { setActiveSigSheet(0); setSigShowBack(false); }, [impoMode, job.pages, job.bodyPages]);

  // ×ΣΕΙΡΕΣ only applies to Cut & Stack — reset to 1 when switching to any other mode.
  useEffect(() => { if (impoMode !== 'cutstack') setProdMultiplier(1); }, [impoMode]);

  // ─── DERIVED ───
  const machine = machines[activeMachine] || machines[0];
  const paper = papers.find(p => p.id === activePaperId) || papers[0];
  // Normalize: sheetW = always LS (long side), sheetH = always SS (short side)
  const rawSheetA = machineSheetW || machine?.maxLS || 330;
  const rawSheetB = machineSheetH || machine?.maxSS || 487;
  const sheetW = Math.max(rawSheetA, rawSheetB); // LS (long side)
  const sheetH = Math.min(rawSheetA, rawSheetB); // SS (short side)
  // Visual dimensions: left edge of canvas = feed side (paper enters from left)
  // LEF: long edge enters (left=LS) → portrait (LS tall, SS wide)
  // SEF: short edge enters (left=SS) → landscape (SS tall, LS wide)
  const vizW = feedEdge === 'lef' ? sheetH : sheetW;  // LEF: SS wide, SEF: LS wide
  const vizH = feedEdge === 'lef' ? sheetW : sheetH;  // LEF: LS tall (feed side), SEF: SS tall (feed side)

  // Machine opening = maxSS. Check if feed direction is possible.
  const machSpecs = machine?.specs as Record<string, unknown> | undefined;
  const machineFeedDir = (machSpecs?.feed_direction as string) || 'sef';
  const machineOpening = Math.min(machine?.maxLS || 9999, machine?.maxSS || 9999); // SS = opening
  // LEF: LS enters → needs LS ≤ opening. SEF: SS enters → always fits (SS ≤ opening by definition).
  const canLEF = machineFeedDir !== 'sef' || sheetW <= machineOpening; // sef-only machine: LEF only if LS fits in opening
  const canSEF = machineFeedDir !== 'lef' || sheetW <= machineOpening; // lef-only: SEF only if... always true since SS ≤ opening
  // Actually: LEF impossible when LS > opening (regardless of machine setting)
  const lefPossible = sheetW <= machineOpening;
  // SEF always possible since SS ≤ opening by definition

  // Auto-correct: if LEF selected but LS > opening → force SEF
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (feedEdge === 'lef' && !lefPossible) setFeedEdge('sef'); }, [feedEdge, lefPossible]);

  const guillotines = postpress.filter(p => p.subtype === 'guillotine');
  const laminators = postpress.filter(p => p.subtype === 'laminator' || p.subtype === 'lam_roll' || p.subtype === 'lam_sheet');
  const binders = postpress.filter(p => ['spiral', 'glue_bind', 'staple'].includes(p.subtype));
  const creasers = postpress.filter(p => p.subtype === 'crease');
  const folders = postpress.filter(p => p.subtype === 'fold');
  const gatherers = postpress.filter(p => p.subtype === 'gathering');
  const customMachines = postpress.filter(p => p.subtype === 'custom');

  // Unique suppliers — filtered by current category
  const suppliersForCat = paperCat
    ? papers.filter(p => paperCategory(p) === paperCat)
    : papers;
  const suppliers = [...new Set(suppliersForCat.map(p => p.supplier).filter(Boolean))] as string[];

  // Derive category from groupName or first word of name (e.g. "MUNKEN PURE 90gr" → "Munken")
  function paperCategory(p: DbMaterial): string {
    if (p.groupName) return p.groupName;
    const firstWord = (p.name || '').split(/\s+/)[0];
    if (firstWord.length >= 3) return firstWord.charAt(0) + firstWord.slice(1).toLowerCase();
    return '';
  }
  const catsForSupplier = supplier
    ? papers.filter(p => p.supplier === supplier)
    : papers;
  const categories = [...new Set(catsForSupplier.map(paperCategory).filter(Boolean))];

  // ─── CLIENT-SIDE IMPOSITION (instant feedback) ───
  const effectiveBleed = job.bleedOn ? (impoBleedOverride ?? job.bleed) : 0;
  // No gutter clamp: the engine uses progressive internal bleed (imposition.ts internalBleed)
  // so gutter=0 with bleed>0 yields μονοτομή (no internal bleed, outer bleed only).
  const engineGutter = impoGutter;

  const impoInput: ImpositionInput = {
    mode: impoMode,
    trimW: job.width,
    trimH: job.height,
    bleed: effectiveBleed,
    qty: job.qty,
    sides: job.sides,
    gutter: engineGutter,
    area: {
      paperW: vizW,
      paperH: vizH,
      // Offset: DB marginTop=gripper(bottom), marginBottom=tail(top) → swap for visual layout
      marginTop: machine?.cat === 'offset' ? (machine?.marginBottom || 0) : (machine?.marginTop || 0),
      marginBottom: machine?.cat === 'offset' ? (machine?.marginTop || 0) : (machine?.marginBottom || 0),
      marginLeft: machine?.marginLeft || 0,
      marginRight: machine?.marginRight || 0,
    },
    forceUps: impoForceUps || undefined,
    forceCols: impoForceCols || undefined,
    forceRows: impoForceRows || undefined,
    rotation: impoRotation || (job.rotation ? 90 : 0),
    duplexOrient: impoDuplexOrient,
    pages: (job.archetype === 'booklet' || impoMode === 'booklet') ? job.pages
      : (job.archetype === 'perfect_bound' || impoMode === 'perfect_bound') ? job.bodyPages
      : undefined,
    paperThickness: pbPaperThickness,
    turnType: impoTurnType,
    // Cut & Stack
    stackOrder: csStackOrder,
    stackStartNum: csStartNum,
    // Gang Run
    gangPageCount: impoMode === 'gangrun' ? gangJobs.length : undefined,
    gangCellAssign: impoMode === 'gangrun' ? Object.fromEntries(
      Object.entries(gangCellAssign).map(([k, v]) => [k, v + 1])  // engine uses 1-based page numbers
    ) : undefined,
    // Per-job qty (preferred, semantic) — engine divides by cellsPerPage to get sheets.
    gangJobQty: impoMode === 'gangrun' ? Object.fromEntries(
      gangJobs.map((gj, idx) => [idx + 1, Math.max(1, gj.qty || 1)])
    ) : undefined,
    gangAutoOptimize: impoMode === 'gangrun' ? Object.keys(gangCellAssign).length === 0 : undefined,
    // Step Multi
    stepBlocks: impoMode === 'stepmulti' ? smBlocks : undefined,
  };

  const impo: ImpositionResult = calcImposition(impoInput);

  // Shared PDF export options
  const pdfExportOpts = {
    imposition: impo, pdfBytes: pdf?.bytes,
    pdfPageSizes: pdf?.pageSizes?.map((p: any) => ({ trimW: p.trimW, trimH: p.trimH })),
    sourceFileName: pdf?.fileName, machineCat: machine.cat as 'digital' | 'offset',
    machineName: machine.name, paperName: paper?.name,
    jobW: job.width, jobH: job.height, bleed: effectiveBleed, gutter: impoGutter,
    contentScale: impoContentScale, showCropMarks: impoCropMarks,
    showRegistration: machine.cat === 'offset', showColorBar: impoColorBar,
    colorBarType: impoColorBarType as 'cmyk' | 'cmyk_tint50',
    colorBarEdge: impoColorBarEdge as 'tail' | 'gripper',
    colorBarOffsetY: impoColorBarOffY, colorBarScale: impoColorBarScale,
    showPlateSlug: impoPlateSlug, plateSlugEdge: impoPlateSlugEdge,
    keepSourceMarks: impoKeepSourceMarks, isDuplex: job.sides === 2,
    duplexOrient: impoDuplexOrient, rotation: impoRotation, turnType: impoTurnType,
    stackPositions: impo.stackPositions,
    csStackSize: impo.totalSheets || Math.ceil(job.qty / Math.max(impo.ups, 1)),
    csGetStackNum: impo.stackPositions ? (posIdx: number) => impo.stackPositions![posIdx]?.stackNum ?? posIdx : undefined,
    numberingEnabled: impoMode === 'cutstack' && csNumbering,
    numberPrefix: csNumPrefix, numberStartNum: csStartNum, numberDigits: csNumDigits,
    numberFontSize: csNumFontSize, numberColor: csNumColor === 'red' ? '#cc0000' : '#000000',
    numberFont: csNumFont, numberRotation: csNumRotation || undefined,
    numberGlobalPos: { x: csNumPosX, y: csNumPosY },
    numberExtra: csExtraNum.length > 0 ? csExtraNum : undefined,
    fixedBack: impoMode === 'cutstack' && csFixedBack, fixedBackPdfBytes: csBackPdf?.bytes,
    gangJobPdfBytes: impoMode === 'gangrun' ? gangJobs.map(gj => gj.pdf?.bytes) : undefined,
    blocks: impoMode === 'stepmulti' ? impo.blocks : undefined,
    smBlockPdfBytes: impoMode === 'stepmulti' ? smBlockPdfs.map(p => p?.bytes) : undefined,
    jobDescription: `${job.width}x${job.height}mm - ${job.qty} pcs - ${impoMode}`,
    quoteNumber: quoteLink?.quoteNumber || undefined,
  };

  const ups = Math.max(impo.ups, 1);
  const rawSheetsBase = impo.totalSheets || Math.ceil(job.qty / ups);
  const rawSheets = rawSheetsBase * prodMultiplier;
  const wasteSheets = wasteFixed;
  const sheets = rawSheets + wasteSheets;
  // W&T prints single-sided (same plate both sides after flip), no double count
  const printSheets = (job.sides === 2 && impoMode !== 'workturn') ? sheets * 2 : sheets;
  // Estimated time from machine speed (with optional override)
  const specs = (machine?.specs ?? {}) as Record<string, unknown>;
  const maxSpeed = machine?.cat === 'offset'
    ? (specs.off_speed as number) || 5000
    : (specs.speed_ppm_color as number) || 60;
  // Optimal speed: offset = common speed, digital = speed zone by GSM
  const paperGsm = paper?.thickness || 80;
  const speedZones = (specs.speed_zones as Array<{ gsm_from: number; gsm_to: number; ppm: number }>) ?? [];
  const matchedZone = speedZones.find(z => paperGsm >= z.gsm_from && paperGsm <= z.gsm_to);
  const defaultSpeed = machine?.cat === 'offset'
    ? (specs.off_common_speed as number) || maxSpeed
    : (matchedZone?.ppm || maxSpeed);
  const runSpeed = speedOverride || defaultSpeed;
  const machineSetupMin = machine?.cat === 'offset'
    ? (specs.off_setup_min as number) || 15
    : (specs.warmup_minutes as number) || 5;
  // Offset: passes = ceil(frontColors/towers) + ceil(backColors/towers) for sheetwise
  const offTowers = (specs.off_towers as number) || 4;
  const offFrontColors = color.platesFront + color.pmsFront;
  const offBackColors = job.sides === 2 ? color.platesBack + color.pmsBack : 0;
  const offPasses = Math.ceil(offFrontColors / offTowers) + (job.sides === 2 ? Math.ceil(offBackColors / offTowers) : 0);
  const timeMin = machine?.cat === 'offset'
    ? Math.ceil((sheets * Math.max(offPasses, 1) / runSpeed) * 60 + machineSetupMin)
    : Math.ceil(printSheets / runSpeed + machineSetupMin);

  // ─── AUTO-CALCULATE ON CHANGES (debounced) ───
  useEffect(() => {
    if (calcTimer.current) clearTimeout(calcTimer.current);
    calcTimer.current = setTimeout(() => {
      setCalculating(true);
      fetch('/api/calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId: machine.id,
          machineSheetW: sheetW,
          machineSheetH: sheetH,
          feedEdge,
          paperId: activePaperId,
          productId: job.productId || undefined,
          jobW: job.width,
          jobH: job.height,
          qty: job.qty * prodMultiplier,
          sides: job.sides,
          colorMode: color.model === 'cmyk' ? 'color' : 'bw',
          bleed: effectiveBleed,
          impositionMode: impoMode,
          impoRotation: impoRotation || (job.rotation ? 90 : 0),
          impoDuplexOrient: impoDuplexOrient,
          impoGutter: impoGutter,
          pages: (impoMode === 'booklet' || job.archetype === 'booklet') ? job.pages
            : (impoMode === 'perfect_bound' || job.archetype === 'perfect_bound') ? job.bodyPages
            : finish.binding === 'spiral' ? (job.bodyPages || job.pages)
            : undefined,
          paperThickness: pbPaperThickness || undefined,
          impoBleed: effectiveBleed,
          impoForceUps: impoForceUps || undefined,
          impoForceCols: impoForceCols || undefined,
          impoForceRows: impoForceRows || undefined,
          impoTurnType: impoTurnType,
          impoCropMarks: impoCropMarks,
          // Gang Run — server must know jobs + assignments to compute sheets correctly
          gangPageCount: impoMode === 'gangrun' ? gangJobs.length : undefined,
          gangCellAssign: impoMode === 'gangrun' ? Object.fromEntries(
            Object.entries(gangCellAssign).map(([k, v]) => [k, v + 1])
          ) : undefined,
          gangJobQty: impoMode === 'gangrun' ? Object.fromEntries(
            gangJobs.map((gj, idx) => [idx + 1, Math.max(1, gj.qty || 1)])
          ) : undefined,
          gangAutoOptimize: impoMode === 'gangrun' ? Object.keys(gangCellAssign).length === 0 : undefined,
          // Cut & Stack
          stackOrder: impoMode === 'cutstack' ? csStackOrder : undefined,
          stackStartNum: impoMode === 'cutstack' ? csStartNum : undefined,
          // Step Multi
          stepBlocks: impoMode === 'stepmulti' ? smBlocks : undefined,
          wasteFixed,
          coverageLevel: color.coverage || 'mid',
          coveragePdf: pdf?.coverage ? { c: pdf.coverage.c, m: pdf.coverage.m, y: pdf.coverage.y, k: pdf.coverage.k } : undefined,
          offsetFrontCmyk: color.platesFront,
          offsetBackCmyk: color.platesBack,
          offsetFrontPms: color.pmsFront,
          offsetBackPms: color.pmsBack,
          offsetOilVarnish: color.varnish === 'oil',
          guillotineId: finish.guillotineId || undefined,
          lamMachineId: finish.lamMachineId || undefined,
          lamFilmId: finish.lamFilmId || undefined,
          lamSides: finish.lamSides,
          bindingType: finish.binding !== 'none' ? finish.binding : '',
          bindingMachineId: finish.bindingMachineId || undefined,
          creaseMachineId: finish.creaseMachineId || undefined,
          creaseCount: finish.creaseCount || undefined,
          foldMachineId: finish.foldMachineId || undefined,
          foldType: finish.foldType || undefined,
          gatherMachineId: finish.gatherMachineId || undefined,
          gatherSignatures: finish.gatherSignatures || undefined,
          customMachineIds: finish.customMachineIds.length ? finish.customMachineIds : undefined,
          // Overrides
          overrides: hasOverrides ? overrides : undefined,
        }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.result) {
            setCalcResult(data.result);
            setCalcDebug({ ...data.result.printDetail, debug: data.debug });
          }
        })
        .catch(() => {})
        .finally(() => setCalculating(false));
    }, 300);
    return () => { if (calcTimer.current) clearTimeout(calcTimer.current); };
  }, [machine.id, activePaperId, job, color, wasteFixed, sheetW, sheetH, feedEdge, impoMode, impoGutter, impoRotation, impoDuplexOrient, impoForceUps, impoForceCols, impoForceRows, impoBleedOverride, impoCropMarks, effectiveBleed, finish, pdf?.coverage, overrides, prodMultiplier, gangJobs, gangCellAssign, smBlocks, csStackOrder, csStartNum]);

  // ─── DISPLAY VALUES ───
  const r = calcResult;
  const costPaper = r?.costPaper ?? sheets * (paper?.costPerUnit || 0.1);
  const costPrint = r?.costPrint ?? printSheets * 0.30;
  const costGuillotine = r?.costGuillotine ?? 0;
  const costLamination = r?.costLamination ?? 0;
  const totalCost = r?.totalCost ?? (costPaper + costPrint + costLamination);

  const lamWarnings = r?.lamWarnings ?? [];
  const profitAmount = r?.profitAmount ?? totalCost * 0.5;
  const totalPrice = r?.sellPrice ?? totalCost + profitAmount;
  const pricePerUnit = r?.pricePerPiece ?? (job.qty > 0 ? totalPrice / job.qty : 0);
  const totalStockSheets = r?.totalStockSheets ?? sheets;

  const fmt = (n: number) => n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', marginTop: -8 }}>

      {/* ═══ QUOTE LINK + LINKED FILE BANNER (single row, split left/right) ═══ */}
      {quoteLink && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '6px 14px',
          background: 'rgba(255,255,255,0.02)',
          borderBottom: '1px solid var(--border)',
          fontSize: '0.78rem', flexShrink: 0,
        }}>
          {/* ── LEFT: Quote link (blue) ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <i className="fas fa-link" style={{ color: 'var(--blue)', fontSize: '0.65rem' }} />
            <span style={{ color: 'var(--text-muted)' }}>Κοστολόγηση για:</span>
            {quoteLink.quoteNumber && (
              <span style={{
                fontWeight: 800, color: 'var(--blue)', fontSize: '0.8rem',
                padding: '2px 8px', borderRadius: 5,
                background: 'color-mix(in srgb, var(--blue) 15%, transparent)',
                border: '1px solid color-mix(in srgb, var(--blue) 30%, transparent)',
                flexShrink: 0,
              }}>{quoteLink.quoteNumber}</span>
            )}
            {quoteLink.desc && (
              <span style={{
                fontWeight: 600, color: 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{quoteLink.desc}</span>
            )}
            <a href={`/quotes/${quoteLink.quoteId}`}
              title="Έξοδος στην προσφορά χωρίς αποθήκευση αλλαγών στον calculator"
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px',
                borderRadius: 6, border: '1px solid color-mix(in srgb, var(--blue) 25%, transparent)',
                background: 'color-mix(in srgb, var(--blue) 10%, transparent)',
                color: 'var(--blue)', fontSize: '0.72rem', fontWeight: 600, textDecoration: 'none',
                flexShrink: 0,
              }}>
              <i className="fas fa-arrow-left" style={{ fontSize: '0.55rem' }} /> Πίσω
            </a>
            <button
              onClick={() => { setQuoteLink(null); router.replace('/calculator'); }}
              title="Αποσύνδεση από προσφορά"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, borderRadius: 5, fontSize: '0.65rem',
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'var(--danger)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <i className="fas fa-times" />
            </button>
          </div>

          {/* ── Divider ── */}
          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />

          {/* ── RIGHT: Linked file (orange) ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
            <i className="fas fa-paperclip" style={{ color: (linkedFile || pdf) ? '#f58220' : 'var(--text-muted)', fontSize: '0.65rem' }} />
            <span style={{ color: 'var(--text-muted)' }}>Αρχείο:</span>
            {(linkedFile || pdf) ? (
              <span style={{
                fontWeight: 600, color: '#f58220',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                minWidth: 0,
              }}>{linkedFile?.name || pdf?.fileName || 'PDF'}</span>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Κανένα</span>
            )}
            {presskitEnabled && linkedFile && (
              <a
                href={`presscal-fh://open-folder?path=${encodeURIComponent(linkedFile.path.replace(/[/\\][^/\\]+$/, ''))}${quoteLink?.quoteId ? `&quoteId=${quoteLink.quoteId}` : ''}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px',
                  borderRadius: 6, border: '1px solid rgba(245,130,32,0.3)',
                  background: 'rgba(245,130,32,0.1)',
                  color: '#f58220', fontSize: '0.72rem', fontWeight: 600, textDecoration: 'none',
                  flexShrink: 0,
                }}
              >
                <i className="fas fa-folder-open" style={{ fontSize: '0.55rem' }} /> Άνοιγμα
              </a>
            )}
            <CalcLinkFileMenu
              quoteId={quoteLink.quoteId}
              itemId={quoteLink.itemId}
              hasLinkedFile={!!linkedFile || !!pdf}
              presskitEnabled={presskitEnabled}
              onBrowserUpload={handlePdfFiles}
            />
          </div>
        </div>
      )}

      {/* ═══ STANDALONE PDF UPLOAD (when not linked to a quote) ═══ */}
      {!quoteLink && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '5px 14px',
          background: 'rgba(255,255,255,0.02)',
          borderBottom: '1px solid var(--border)',
          fontSize: '0.78rem', flexShrink: 0,
        }}>
          <i className="fas fa-paperclip" style={{ color: pdf ? '#f58220' : 'var(--text-muted)', fontSize: '0.65rem' }} />
          <span style={{ color: 'var(--text-muted)' }}>Αρχείο:</span>
          {pdf ? (
            <span style={{
              fontWeight: 600, color: '#f58220',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              minWidth: 0, flex: 1,
            }}>{pdf.fileName || 'PDF'}</span>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', flex: 1 }}>Κανένα</span>
          )}
          <StandalonePdfUpload hasFile={!!pdf} onUpload={handlePdfFiles} />
        </div>
      )}

      {/* ═══ HORIZONTAL COST BAR (was right sidebar) ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px',
        flexShrink: 0, borderBottom: '1px solid var(--border)',
        background: 'rgba(0,0,0,0.15)', flexWrap: 'nowrap', overflow: 'hidden',
      }}>
        {/* Module selector */}
        <div ref={moduleBtnRef} style={{ flexShrink: 0 }}>
          <button onClick={() => setShowModulePopup(p => !p)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
            borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
            background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
            color: 'var(--accent)', fontSize: '0.72rem', fontWeight: 700,
            cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
            letterSpacing: '0.03em',
          }}>
            <i className={activeCalcModule === 'plotter' ? 'fas fa-scroll' : 'fas fa-print'} style={{ fontSize: '0.6rem' }} />
            {activeCalcModule === 'sheetfed' ? 'Sheetfed' : 'Plotter'}
            <i className="fas fa-chevron-down" style={{ fontSize: '0.45rem', opacity: 0.5 }} />
          </button>
          {showModulePopup && createPortal(<>
            <div onClick={() => setShowModulePopup(false)} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
            <div style={{
              position: 'fixed',
              top: (moduleBtnRef.current?.getBoundingClientRect().bottom ?? 60) + 4,
              left: moduleBtnRef.current?.getBoundingClientRect().left ?? 12,
              zIndex: 1000,
              background: 'rgb(20,30,55)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              minWidth: 200, padding: 4,
            }}>
              {([
                { id: 'sheetfed' as const, label: 'Sheetfed', desc: 'Offset & Digital', icon: 'fas fa-print' },
                { id: 'plotter' as const, label: 'Plotter', desc: 'Plotter & Vinyl', icon: 'fas fa-scroll' },
              ]).map(mod => (
                <div key={mod.id} onClick={() => { setActiveCalcModule(mod.id); setShowModulePopup(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7,
                    cursor: 'pointer', transition: 'background 0.15s',
                    background: activeCalcModule === mod.id ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                  }}>
                  <i className={mod.icon} style={{ fontSize: '0.8rem', color: activeCalcModule === mod.id ? 'var(--accent)' : '#64748b', width: 20, textAlign: 'center' }} />
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: activeCalcModule === mod.id ? 'var(--accent)' : 'var(--text)' }}>{mod.label}</div>
                    <div style={{ fontSize: '0.58rem', color: '#64748b' }}>{mod.desc}</div>
                  </div>
                  {activeCalcModule === mod.id && <i className="fas fa-check" style={{ color: 'var(--accent)', fontSize: '0.6rem', marginLeft: 'auto' }} />}
                </div>
              ))}
            </div>
          </>, document.body)}
        </div>


        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Stats inline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, overflow: 'visible' }}>
          <span title="Τεμάχια ανά φύλλο" style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <i className="fas fa-th" style={{ fontSize: '0.55rem' }} /><strong style={{ color: 'var(--text)' }}>{ups}</strong> up
          </span>
          <span title="Φύλλα μοντάζ (τυπογραφικά)" style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <i className="fas fa-layer-group" style={{ fontSize: '0.55rem' }} /><strong style={{ color: 'var(--text)' }}>{rawSheets}</strong> μοντάζ
          </span>
          <span title={`Όψεις εκτύπωσης (${rawSheets} φύλ × ${job.sides} ${job.sides === 2 ? 'όψεις' : 'όψη'})`} style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <i className="fas fa-clone" style={{ fontSize: '0.55rem' }} /><strong style={{ color: 'var(--text)' }}>{job.sides === 2 ? rawSheets * 2 : rawSheets}</strong> όψεις
          </span>
          <span title={`Φύλλα αποθήκης (μοντάζ ${rawSheets} + φύρα ${wasteSheets})`} style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <i className="fas fa-copy" style={{ fontSize: '0.55rem' }} /><strong style={{ color: 'var(--text)' }}>{totalStockSheets}</strong> φύλ. αποθ.
          </span>
          {/* Production multiplier */}
          {prodMultiplier > 1 && (
            <span title="Πολλαπλασιαστής παραγωγής" style={{ fontSize: '0.7rem', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <i className="fas fa-times" style={{ fontSize: '0.5rem' }} /><strong>{prodMultiplier}</strong> παραγωγές
            </span>
          )}
          <span title="Εκτιμώμενος χρόνος" style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <i className="fas fa-clock" style={{ fontSize: '0.55rem' }} /><strong style={{ color: 'var(--text)' }}>~{timeMin >= 60 ? `${(timeMin / 60).toFixed(1)}h` : `${timeMin}'`}</strong>
          </span>

          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

          {/* Overrides button */}
          <span ref={overridesBtnRef} onClick={() => setShowOverrides(v => !v)}
            style={{
              fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
              color: hasOverrides ? 'var(--accent)' : '#64748b',
              background: hasOverrides ? 'rgba(245,130,32,0.1)' : 'transparent',
              padding: '3px 8px', borderRadius: 6,
              border: `1px solid ${hasOverrides ? 'rgba(245,130,32,0.3)' : 'transparent'}`,
            }}>
            <i className="fas fa-sliders-h" style={{ fontSize: '0.55rem' }} />
          </span>
          {showOverrides && <OverridesPopup
            overrides={overrides}
            anchor={overridesBtnRef.current}
            onChange={(key, val) => {
              if (key === '_reset') { setOverrides({}); return; }
              setOverrides(prev => ({ ...prev, [key]: val }));
            }}
            onClose={() => setShowOverrides(false)}
          />}

          {/* Κόστος hover */}
          <HoverChip
            icon="fas fa-coins" color="#f87171" label={`€${fmt(totalCost)}`}
            rows={[
              { label: 'Χαρτί', value: costPaper },
              { label: 'Εκτύπωση', value: costPrint },
              ...(costLamination > 0 ? [{ label: 'Πλαστικοποίηση', value: costLamination }] : []),
              ...((r?.costBinding ?? 0) > 0 ? [{ label: 'Βιβλιοδεσία', value: r?.costBinding ?? 0 }] : []),
            ]}
            total={totalCost} totalLabel="Σύνολο" title="ΚΟΣΤΟΣ"
          />

          {/* Κέρδος hover */}
          {(() => {
            const bd = (r?.printDetail?.costBreakdown ?? {}) as Record<string, unknown>;
            const chPaper = Number(bd.chargePaper) || 0;
            const chPrint = Number(bd.chargePrint) || 0;
            const pPaper = chPaper - costPaper;
            const pPrint = chPrint - costPrint;
            const chGuill = r?.chargeGuillotine ?? 0;
            const pLam = (r?.chargeLamination ?? 0) - costLamination;
            const pBind = (Number(bd.chargeBinding) || 0) - (r?.costBinding ?? 0);
            return <HoverChip
              icon="fas fa-chart-line" color="var(--success)" label={`€${fmt(profitAmount)}`}
              rows={[
                ...(pPaper !== 0 ? [{ label: 'Χαρτί', value: pPaper }] : []),
                { label: 'Εκτύπωση', value: pPrint },
                ...(chGuill > 0 ? [{ label: 'Γκιλοτίνα', value: chGuill }] : []),
                ...(pLam !== 0 ? [{ label: 'Πλαστικοποίηση', value: pLam }] : []),
                ...(pBind !== 0 ? [{ label: 'Βιβλιοδεσία', value: pBind }] : []),
                ...((r?.chargeCrease ?? 0) > 0 ? [{ label: 'Πύκμανση', value: r!.chargeCrease }] : []),
                ...((r?.chargeFold ?? 0) > 0 ? [{ label: 'Διπλωτική', value: r!.chargeFold }] : []),
                ...((r?.chargeGather ?? 0) > 0 ? [{ label: 'Συνθετική', value: r!.chargeGather }] : []),
                ...((r?.chargeCustom ?? 0) > 0 ? [{ label: 'Άλλη μετεκτύπωση', value: r!.chargeCustom }] : []),
              ]}
              total={profitAmount} totalLabel="Σύνολο" title="ΚΕΡΔΟΣ"
            />;
          })()}

          {lamWarnings.length > 0 && <span style={{ fontSize: '0.68rem', color: '#fca5a5', flexShrink: 0 }}><i className="fas fa-exclamation-triangle" style={{ marginRight: 4 }} />Pouch!</span>}
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Price hero */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 600, color: 'var(--accent)', lineHeight: 1, letterSpacing: '-0.02em' }}>€{fmt(totalPrice)}</div>
            <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>€{fmt(pricePerUnit)}/τεμ · κέρδος €{fmt(profitAmount)}</div>
          </div>
          <button
            disabled={savingToQuote}
            onClick={async () => {
              setSavingToQuote(true);
              const calcDataPayload = {
                archetype: job.archetype,
                width: job.width,
                height: job.height,
                qty: job.qty,
                sides: job.sides,
                pages: job.pages,
                totalCost,
                totalPrice,
                pricePerUnit,
                profitAmount,
                sheets: totalStockSheets,
                impoSheets: rawSheetsBase,
                faces: job.sides === 2 ? rawSheets * 2 : rawSheets,
                ups,
                prodMultiplier: prodMultiplier > 1 ? prodMultiplier : undefined,
                machineName: machine?.name,
                paperName: paper?.name,
                machineId: machine?.id,
                paperId: activePaperId,
                productId: job.productId || undefined,
                feedEdge,
                machineSheetW: sheetW,
                machineSheetH: sheetH,
                colorMode: color.model === 'cmyk' ? 'color' : 'bw',
                bleed: effectiveBleed,
                impositionMode: impoMode,
                impoRotation: impoRotation || (job.rotation ? 90 : 0),
                impoGutter,
                impoForceUps: impoForceUps || undefined,
                impoForceCols: impoForceCols || undefined,
                impoForceRows: impoForceRows || undefined,
                impoDuplexOrient,
                impoTurnType,
                wasteFixed,
                coverageLevel: color.coverage || 'mid',
                offsetFrontCmyk: color.platesFront,
                offsetBackCmyk: color.platesBack,
                offsetFrontPms: color.pmsFront,
                offsetBackPms: color.pmsBack,
                offsetOilVarnish: color.varnish === 'oil',
                guillotineId: finish.guillotineId || undefined,
                lamMachineId: finish.lamMachineId || undefined,
                lamFilmId: finish.lamFilmId || undefined,
                lamSides: finish.lamSides,
                bindingType: finish.binding !== 'none' ? finish.binding : '',
                bindingMachineId: finish.bindingMachineId || undefined,
                creaseMachineId: finish.creaseMachineId || undefined,
                creaseCount: finish.creaseCount || undefined,
                foldMachineId: finish.foldMachineId || undefined,
                foldType: finish.foldType || undefined,
                gatherMachineId: finish.gatherMachineId || undefined,
                gatherSignatures: finish.gatherSignatures || undefined,
                customMachineIds: finish.customMachineIds.length ? finish.customMachineIds : undefined,
                overrides: hasOverrides ? overrides : undefined,
              };
              // NOTE: linkedFile is NOT set here. It is owned by the quote item
              // in the DB (written by PressKit's pick-file flow or by the PDF
              // drag-drop sync). The spread below at items[idx] preserves it.
              const itemPayload = {
                id: quoteLink?.itemId || crypto.randomUUID(),
                name: `${job.width}×${job.height} ${job.archetype}`,
                type: 'calculator' as const,
                qty: job.qty,
                unit: 'τεμ',
                cost: Math.round(totalCost * 100) / 100,
                unitPrice: Math.round(pricePerUnit * 1000) / 1000,
                finalPrice: Math.round(totalPrice * 100) / 100,
                profit: Math.round(profitAmount * 100) / 100,
                calcData: calcDataPayload,
              };

              try {
                const { updateQuote, createQuote } = await import('../quotes/actions');

                if (quoteLink?.quoteId) {
                  // Update existing quote item
                  const res = await fetch(`/api/quotes/${quoteLink.quoteId}/items`);
                  if (!res.ok) throw new Error('Failed to fetch quote');
                  const data = await res.json();
                  const items = (data.items as any[]) || [];
                  const idx = items.findIndex((i: any) => i.id === quoteLink.itemId);
                  if (idx >= 0) {
                    items[idx] = { ...items[idx], ...itemPayload };
                  } else {
                    items.push(itemPayload);
                  }
                  // Recalculate totals so the quote page doesn't see stale values
                  const subtotal = items.reduce((s: number, i: any) => s + (i.finalPrice || 0), 0);
                  const vatRate = 24;
                  const vatAmount = Math.round(subtotal * vatRate / 100 * 100) / 100;
                  const grandTotal = Math.round((subtotal + vatAmount) * 100) / 100;
                  const totalCost = items.reduce((s: number, i: any) => s + (i.cost || 0), 0);
                  const totalProfit = Math.round((subtotal - totalCost) * 100) / 100;
                  console.log('[CALC SAVE] Writing calcData:', {
                    impositionMode: calcDataPayload.impositionMode,
                    impoRotation: calcDataPayload.impoRotation,
                    impoGutter: calcDataPayload.impoGutter,
                    impoForceUps: calcDataPayload.impoForceUps,
                    impoForceCols: calcDataPayload.impoForceCols,
                    impoForceRows: calcDataPayload.impoForceRows,
                    ups: calcDataPayload.ups,
                    machineId: calcDataPayload.machineId,
                    paperId: calcDataPayload.paperId,
                  });
                  await updateQuote(quoteLink.quoteId, { items, subtotal, vatRate, vatAmount, grandTotal, totalCost, totalProfit });
                  // Verify save succeeded
                  const verify = await fetch(`/api/quotes/${quoteLink.quoteId}/items`);
                  if (verify.ok) {
                    const vData = await verify.json();
                    const saved = (vData.items as any[])?.find((i: any) => i.id === (quoteLink.itemId || itemPayload.id));
                    console.log('[CALC SAVE] Verified from DB:', {
                      impositionMode: saved?.calcData?.impositionMode,
                      impoRotation: saved?.calcData?.impoRotation,
                      impoGutter: saved?.calcData?.impoGutter,
                      ups: saved?.calcData?.ups,
                      machineId: saved?.calcData?.machineId,
                    });
                    if (!saved?.calcData?.impositionMode) {
                      alert('Προσοχή: Τα δεδομένα μοντάζ δεν αποθηκεύτηκαν σωστά. Δοκίμασε ξανά.');
                      setSavingToQuote(false);
                      return;
                    }
                  }
                  // Stay in calculator — user came from quote, no need to redirect back
                  setSavingToQuote(false);
                  setSaveSuccess(true);
                  setTimeout(() => setSaveSuccess(false), 2000);
                } else {
                  // Create new quote with this item → redirect to the new quote
                  const q = await createQuote({
                    title: `${job.width}×${job.height} ${job.archetype}`,
                    items: [itemPayload],
                    subtotal: itemPayload.finalPrice,
                    vatRate: 24,
                    vatAmount: Math.round(itemPayload.finalPrice * 0.24 * 100) / 100,
                    grandTotal: Math.round(itemPayload.finalPrice * 1.24 * 100) / 100,
                    totalCost: itemPayload.cost,
                    totalProfit: itemPayload.profit,
                  });
                  window.location.href = `/quotes/${q.id}`;
                }
              } catch (e) {
                console.error('Save to quote error:', e);
                setSavingToQuote(false);
                alert('Σφάλμα αποθήκευσης: ' + (e as Error).message);
              }
            }}
            title={quoteLink ? 'Αποθήκευση προδιαγραφών στο item της προσφοράς' : 'Δημιουργία νέας προσφοράς με αυτό το είδος'}
            style={{
              padding: '7px 14px', borderRadius: 7,
              background: saveSuccess ? '#16a34a' : savingToQuote ? 'rgba(245,130,32,0.5)' : 'var(--accent)', color: '#fff', border: 'none',
              fontSize: '0.72rem', fontWeight: 600, cursor: savingToQuote ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              boxShadow: '0 2px 12px rgba(245,130,32,0.3)', transition: 'all 0.2s', flexShrink: 0,
              opacity: savingToQuote ? 0.7 : 1,
            }}
          >
            <i className={savingToQuote ? 'fas fa-spinner fa-spin' : saveSuccess ? 'fas fa-check' : 'fas fa-save'} /> {savingToQuote ? 'Αποθήκευση...' : saveSuccess ? 'Αποθηκεύτηκε ✓' : 'Αποθήκευση'}
          </button>
          {/* PDF Export dropdown */}
          <div style={{ position: 'relative', flexShrink: 0 }} ref={pdfBtnRef}>
            <button onClick={() => setPdfMenuOpen(p => !p)} style={{
              padding: '7px 10px', borderRadius: 7,
              background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', border: '1px solid var(--glass-border)',
              fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'all 0.2s',
            }}>
              <i className="fas fa-file-export" /> Export <i className="fas fa-caret-down" style={{ fontSize: '0.55rem' }} />
            </button>
            {pdfMenuOpen && createPortal(
              <><div onClick={() => setPdfMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} /><div style={{
                position: 'fixed',
                top: (pdfBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                left: (pdfBtnRef.current?.getBoundingClientRect().right ?? 0) - 200,
                zIndex: 9999,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                minWidth: 200, overflow: 'hidden',
              }}>
                {/* Download */}
                <button onClick={async () => {
                  setPdfMenuOpen(false);
                  try {
                    await downloadImpositionPDF(pdfExportOpts);
                  } catch (e) { alert('PDF export error: ' + (e as Error).message); }
                }} style={pdfMenuItemStyle}>
                  <i className="fas fa-download" style={{ width: 16 }} /> Λήψη (Downloads)
                </button>
                {/* Dev snapshot — only useful in local dev. Writes state + PDF to .claude/snapshots/. */}
                {process.env.NODE_ENV !== 'production' && (
                  <button onClick={async () => {
                    setPdfMenuOpen(false);
                    try {
                      const { exportImpositionPDF } = await import('@/lib/calc/pdf-export');
                      const bytes = await exportImpositionPDF(pdfExportOpts);
                      const snapshotState = {
                        impoMode,
                        job,
                        impo,
                        pdfInfo: pdf ? {
                          fileName: pdf.fileName,
                          pageCount: pdf.pageCount,
                          pageSizes: pdf.pageSizes,
                        } : null,
                        machine: machine ? {
                          id: machine.id, name: machine.name, cat: machine.cat,
                          specs: (machine as any).specs,
                        } : null,
                        // Strip binary/PDF fields from gangJobs — they don't round-trip through JSON.
                        gangJobs: gangJobs.map(g => ({
                          id: g.id,
                          label: g.label,
                          qty: g.qty,
                          pdf: g.pdf ? { fileName: g.pdf.fileName, pageCount: g.pdf.pageCount, pageSizes: g.pdf.pageSizes } : null,
                        })),
                        exportOpts: {
                          bleed: pdfExportOpts.bleed,
                          gutter: pdfExportOpts.gutter,
                          rotation: pdfExportOpts.rotation,
                          duplexOrient: (pdfExportOpts as any).duplexOrient,
                          contentScale: (pdfExportOpts as any).contentScale,
                          showCropMarks: (pdfExportOpts as any).showCropMarks,
                          machineCat: (pdfExportOpts as any).machineCat,
                        },
                      };
                      const fd = new FormData();
                      fd.append('state', JSON.stringify(snapshotState));
                      const { buildExportFilename: bld } = await import('@/lib/calc/pdf-export');
                      fd.append('pdf', new Blob([bytes as BlobPart], { type: 'application/pdf' }), bld(pdfExportOpts));
                      fd.append('label', `${impoMode}-${new Date().toISOString().slice(11,19)}`);
                      const res = await fetch('/api/dev/snapshot', { method: 'POST', body: fd });
                      const data = await res.json();
                      if (!res.ok) {
                        alert('Snapshot failed: ' + (data?.error || res.status));
                      } else {
                        alert('Snapshot saved to .claude/snapshots/\n' + (data.written || []).join('\n'));
                      }
                    } catch (e) { alert('Snapshot error: ' + (e as Error).message); }
                  }} style={pdfMenuItemStyle}>
                    <i className="fas fa-camera" style={{ width: 16, color: 'var(--lime)' }} /> Snapshot for Claude
                  </button>
                )}
                {/* Save to customer folder */}
                {/* Save to customer folder — uses linkedFile path OR company.folderPath */}
                {quoteLink?.quoteId && (
                  <button onClick={async () => {
                    setPdfMenuOpen(false);
                    try {
                      // Resolve customer folder: linkedFile dir first, fallback to company.folderPath
                      let folder: string | null = linkedFile?.path
                        ? linkedFile.path.replace(/[/\\][^/\\]+$/, '')
                        : null;
                      if (!folder) {
                        const qRes = await fetch(`/api/quotes/${quoteLink.quoteId}/items`);
                        const qData = qRes.ok ? await qRes.json() : null;
                        folder = qData?.companyFolderPath || null;
                      }
                      if (!folder) { alert('Δεν υπάρχει ορισμένος φάκελος πελάτη. Όρισε τον στη καρτέλα της εταιρείας.'); return; }
                      const { exportImpositionPDF, buildExportFilename } = await import('@/lib/calc/pdf-export');
                      const bytes = await exportImpositionPDF(pdfExportOpts);
                      const sep = folder.includes('\\') ? '\\' : '/';
                      const savePath = `${folder}${sep}${buildExportFilename(pdfExportOpts)}`;
                      let res: Response;
                      try {
                        res = await fetch(`http://localhost:17824/?save=${encodeURIComponent(savePath)}`, {
                          method: 'POST', body: new Blob([bytes as BlobPart]),
                        });
                      } catch {
                        alert('Δεν βρέθηκε το PressKit στη θύρα 17824. Βεβαιώσου ότι το PressKit τρέχει.');
                        return;
                      }
                      if (!res.ok) {
                        const detail = await res.text().catch(() => '');
                        alert(`Αποτυχία αποθήκευσης (${res.status}) στο\n${savePath}\n\n${detail}`);
                      }
                    } catch (e) { alert('PDF export error: ' + (e as Error).message); }
                  }} style={pdfMenuItemStyle}>
                    <i className="fas fa-folder" style={{ width: 16, color: '#f58220' }} /> Φάκελος πελάτη
                  </button>
                )}
                {/* Save to quote job folder — auto-resolves for any status via ensureJobFolder */}
                {quoteLink?.quoteId && (
                  <button onClick={async () => {
                    setPdfMenuOpen(false);
                    try {
                      const { ensureJobFolder } = await import('../quotes/actions');
                      const { jobFolderPath } = await ensureJobFolder(quoteLink.quoteId);
                      if (!jobFolderPath) {
                        alert('Δεν μπόρεσε να δημιουργηθεί φάκελος εργασίας. Όρισε global root στις Ρυθμίσεις ή folderPath στην εταιρεία.');
                        return;
                      }
                      const { exportImpositionPDF, buildExportFilename } = await import('@/lib/calc/pdf-export');
                      const bytes = await exportImpositionPDF(pdfExportOpts);
                      const sep = jobFolderPath.includes('\\') ? '\\' : '/';
                      const savePath = `${jobFolderPath}${sep}${buildExportFilename(pdfExportOpts)}`;
                      let res: Response;
                      try {
                        res = await fetch(`http://localhost:17824/?save=${encodeURIComponent(savePath)}`, {
                          method: 'POST', body: new Blob([bytes as BlobPart]),
                        });
                      } catch {
                        alert('Δεν βρέθηκε το PressKit στη θύρα 17824. Βεβαιώσου ότι το PressKit τρέχει.');
                        return;
                      }
                      if (!res.ok) {
                        const detail = await res.text().catch(() => '');
                        alert(`Αποτυχία αποθήκευσης (${res.status}) στο\n${savePath}\n\n${detail}`);
                      }
                    } catch (e) { alert('PDF export error: ' + (e as Error).message); }
                  }} style={pdfMenuItemStyle}>
                    <i className="fas fa-briefcase" style={{ width: 16, color: 'var(--teal)' }} /> Φάκελος προσφοράς
                  </button>
                )}
              </div></>
            , document.body)}
          </div>
          {machine.cat === 'offset' && (color.platesFront + color.platesBack) > 0 && (
            <button onClick={() => setShowPlateOrder(true)} style={{
              padding: '7px 10px', borderRadius: 7,
              background: 'rgba(255,255,255,0.06)', color: 'var(--amber)', border: '1px solid color-mix(in srgb, var(--amber) 25%, transparent)',
              fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'all 0.2s', flexShrink: 0,
            }} title="Παραγγελία τσίγκων">
              <i className="fas fa-layer-group" /> Τσίγκοι
            </button>
          )}
          <button onClick={() => setShowDebug(d => !d)} style={{
            padding: '7px 8px', borderRadius: 7, border: `1px solid ${showDebug ? 'var(--accent)' : 'var(--glass-border)'}`,
            background: showDebug ? 'rgba(245,130,32,0.08)' : 'rgba(255,255,255,0.04)',
            color: showDebug ? 'var(--accent)' : 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 600,
            cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
          }} title="Debug breakdown">
            <i className="fas fa-bug" />
          </button>
        </div>
        {calculating && <i className="fas fa-spinner fa-spin" style={{ color: 'var(--accent)', fontSize: '0.7rem', flexShrink: 0 }} />}
      </div>

      {/* ═══ PLATE ORDER MODAL ═══ */}
      {showPlateOrder && impo && (
        <PlateOrderModal
          platesFront={color.platesFront}
          platesBack={color.platesBack}
          paperW={impo.paperW}
          paperH={impo.paperH}
          machineName={machine.name}
          jobDescription={`${job.width}x${job.height}mm · ${job.qty} τεμ · ${machine.name} · ${paper?.name || ''}`}
          exportOptions={{
            imposition: impo,
            pdfBytes: pdf?.bytes,
            pdfPageSizes: pdf?.pageSizes?.map(p => ({ trimW: p.trimW, trimH: p.trimH })),
            sourceFileName: pdf?.fileName,
            machineCat: 'offset',
            machineName: machine.name,
            paperName: paper?.name,
            jobW: job.width,
            jobH: job.height,
            bleed: effectiveBleed,
            contentScale: impoContentScale,
            showCropMarks: impoCropMarks,
            showRegistration: true,
            isDuplex: job.sides === 2,
            duplexOrient: impoDuplexOrient,
            rotation: impoRotation,
          }}
          onClose={() => setShowPlateOrder(false)}
          onSent={() => { setShowPlateOrder(false); }}
        />
      )}

      {/* ═══ DEBUG PANEL ═══ */}
      {showDebug && calcResult && (
        <div style={{
          padding: '6px 12px', fontSize: '0.65rem', fontFamily: 'monospace',
          background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--border)',
          display: 'flex', gap: 16, flexWrap: 'wrap', color: '#94a3b8', lineHeight: 1.6,
        }}>
          <span>model: <b style={{ color: 'var(--text)' }}>{calcResult.printModel}</b></span>
          <span>sheets: <b style={{ color: 'var(--text)' }}>{calcResult.rawMachineSheets}+{calcResult.wasteSheets}={calcResult.totalMachineSheets}</b></span>
          <span>stock: <b style={{ color: 'var(--text)' }}>{calcResult.totalStockSheets}</b></span>
          <span>paper: <b style={{ color: 'var(--text)' }}>€{calcResult.costPaper.toFixed(3)}</b></span>
          <span>print: <b style={{ color: 'var(--text)' }}>€{calcResult.costPrint.toFixed(3)}</b></span>
          <span>guill: <b style={{ color: 'var(--text)' }}>€{calcResult.costGuillotine.toFixed(3)}</b></span>
          <span>lam: <b style={{ color: 'var(--text)' }}>€{calcResult.costLamination.toFixed(3)}</b></span>
          <span>bind: <b style={{ color: 'var(--text)' }}>€{calcResult.costBinding.toFixed(3)}</b></span>
          <span>total: <b style={{ color: '#f87171' }}>€{calcResult.totalCost.toFixed(3)}</b></span>
          <span>sell: <b style={{ color: 'var(--success)' }}>€{calcResult.sellPrice.toFixed(3)}</b></span>
          <span>profit: <b style={{ color: 'var(--success)' }}>€{calcResult.profitAmount.toFixed(3)}</b></span>
          {calcDebug?.productPricingApplied ? <span style={{ color: 'var(--accent)' }}>PRODUCT PRICING ✓</span> : null}
          {(calcResult as any)?._dbg ? (() => {
            const d = (calcResult as any)._dbg as Record<string, unknown>;
            return <>
              <span>product: <b style={{ color: 'var(--accent)' }}>{String(d?.productName || '—')}</b></span>
              <span>hourlyRate: <b style={{ color: '#f59e0b' }}>{String(d?.offHourlyRate ?? '—')}</b></span>
              <span>speed: <b>{String(d?.speedUsed ?? '—')}</b></span>
            </>;
          })() : null}
        </div>
      )}

      {/* ═══ MAIN: LEFT PANEL + CENTER ═══ */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ═══ LEFT PANEL ═══ */}
        <div style={{
          width: 310, flexShrink: 0,
          background: activePanel === 'mode-settings' ? 'rgba(132,204,22,0.10)' : 'rgba(0,0,0,0.2)',
          borderRight: `1px solid ${activePanel === 'mode-settings' ? 'rgba(132,204,22,0.30)' : 'var(--border)'}`,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', transition: 'background 0.2s, border-color 0.2s',
        }}>
          {/* Panel tabs */}
          <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
            {([
              { key: 'job' as const, icon: 'fas fa-ruler-combined', color: 'var(--accent)', label: 'Εργασία' },
              { key: 'machine' as const, icon: 'fas fa-print', color: 'var(--blue)', label: 'Μηχανή' },
              { key: 'paper' as const, icon: 'fas fa-scroll', color: 'var(--teal)', label: 'Χαρτί' },
              { key: 'color' as const, icon: 'fas fa-palette', color: 'var(--blue)', label: 'Χρώμα' },
              { key: 'finish' as const, icon: 'fas fa-scissors', color: 'var(--violet)', label: 'Φινίρισμα' },
            ]).map(t => {
              const active = activePanel === t.key;
              return (
                <button key={t.key} onClick={() => togglePanel(t.key)} style={{
                  flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                  background: active ? `color-mix(in srgb, ${t.color} 8%, transparent)` : 'transparent',
                  borderBottom: `2px solid ${active ? t.color : 'transparent'}`,
                  color: active ? t.color : '#64748b', transition: 'all 0.2s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  fontSize: '0.6rem', fontWeight: 600, fontFamily: 'inherit',
                }}>
                  <i className={t.icon} style={{ fontSize: '0.82rem' }} />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>

            {/* ── MACHINE PANEL ── */}
            {activePanel === 'machine' && (<>
              <MfLabel>ΜΗΧΑΝΗ</MfLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {machines.map((m, i) => {
                  const isActive = i === activeMachine;
                  return (
                    <div key={m.id} onClick={() => { setActiveMachine(i); setMachineSheetW(null); setMachineSheetH(null); setMachineSheetWStr(null); setMachineSheetHStr(null); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
                        cursor: 'pointer', transition: 'all 0.15s',
                        border: `1px solid ${isActive ? 'color-mix(in srgb, var(--blue) 50%, transparent)' : 'var(--border)'}`,
                        background: isActive ? 'color-mix(in srgb, var(--blue) 8%, transparent)' : 'transparent',
                      }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isActive ? 'color-mix(in srgb, var(--blue) 15%, transparent)' : 'rgba(255,255,255,0.04)',
                        color: isActive ? 'var(--blue)' : '#64748b', fontSize: '0.78rem',
                      }}>
                        <i className={m.cat === 'offset' ? 'fas fa-industry' : m.cat === 'plotter' ? 'fas fa-scroll' : 'fas fa-print'} />
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.78rem', color: isActive ? 'var(--blue)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.01em' }}>{m.name}</div>
                        <div style={{ fontSize: '0.62rem', color: '#64748b' }}>{m.maxLS}×{m.maxSS}mm · {m.cat}</div>
                      </div>
                      {isActive && <i className="fas fa-check" style={{ color: 'var(--blue)', fontSize: '0.7rem', flexShrink: 0 }} />}
                    </div>
                  );
                })}
              </div>

              {/* ── Ρυθμίσεις μηχανής ── */}
              <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <MfLabel>ΦΥΛΛΟ ΜΗΧΑΝΗΣ (MM)</MfLabel>
                <MachinePaperPresets
                  machine={machine}
                  sheetW={sheetW}
                  sheetH={sheetH}
                  onSelect={(ls, ss) => { setMachineSheetW(ls); setMachineSheetH(ss); setMachineSheetWStr(null); setMachineSheetHStr(null); }}
                  onUpdate={(updated) => {
                    // update local state so pills reflect immediately
                    const idx = machines.findIndex(m => m.id === machine.id);
                    if (idx >= 0) {
                      const copy = [...machines];
                      copy[idx] = { ...copy[idx], specs: { ...(copy[idx].specs as object), custom_papers: updated } };
                      setMachines(copy);
                    }
                  }}
                />
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <MfInput value={machineSheetWStr ?? machineSheetW ?? sheetW}
                      onChange={v => { setMachineSheetWStr(v); const n = Number(v); if (v !== '' && !isNaN(n) && n > 0) { setMachineSheetW(n); } else if (v === '') { setMachineSheetW(null); } }}
                      style={{ width: 70, textAlign: 'center' }}
                    />
                    <span style={{ fontSize: '0.48rem', color: '#64748b', marginTop: 1 }}>LS</span>
                  </div>
                  <span style={{ color: '#475569', fontWeight: 600 }}>×</span>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <MfInput value={machineSheetHStr ?? machineSheetH ?? sheetH}
                      onChange={v => { setMachineSheetHStr(v); const n = Number(v); if (v !== '' && !isNaN(n) && n > 0) { setMachineSheetH(n); } else if (v === '') { setMachineSheetH(null); } }}
                      style={{ width: 70, textAlign: 'center' }}
                    />
                    <span style={{ fontSize: '0.48rem', color: '#64748b', marginTop: 1 }}>SS</span>
                  </div>
                </div>

                {/* ── FEED DIRECTION (digital only — offset always feeds from gripper/bottom) ── */}
                {machine?.cat !== 'offset' && (<>
                <MfLabel>FEED DIRECTION</MfLabel>
                <button
                  onClick={() => {
                    if (feedEdge === 'sef' && !lefPossible) return;
                    setFeedEdge(f => f === 'sef' ? 'lef' : 'sef');
                  }}
                  disabled={feedEdge === 'sef' && !lefPossible}
                  style={{
                    width: '100%', marginBottom: 12,
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 8,
                    border: `2px solid ${feedEdge === 'lef' ? 'var(--blue)' : 'var(--accent)'}`,
                    background: `color-mix(in srgb, ${feedEdge === 'lef' ? 'var(--blue)' : 'var(--accent)'} 8%, transparent)`,
                    color: feedEdge === 'lef' ? 'var(--blue)' : 'var(--accent)',
                    cursor: (feedEdge === 'sef' && !lefPossible) ? 'not-allowed' : 'pointer',
                    opacity: (feedEdge === 'sef' && !lefPossible) ? 0.4 : 1,
                    fontFamily: 'inherit', transition: 'all 0.2s',
                  }}
                  title={feedEdge === 'sef' && !lefPossible ? `LEF αδύνατο — ${sheetW}mm > άνοιγμα ${machineOpening}mm` : 'Κλικ για αλλαγή feed direction'}>
                  <i className={feedEdge === 'lef' ? 'fas fa-arrows-alt-h' : 'fas fa-arrows-alt-v'} style={{ fontSize: '1rem' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.05em' }}>{feedEdge === 'sef' ? 'SEF' : 'LEF'}</span>
                    <span style={{ fontSize: '0.6rem', opacity: 0.7, fontWeight: 500 }}>
                      {feedEdge === 'sef' ? `μπαίνει ${sheetH}mm → κύλινδρος ${sheetW}mm` : `μπαίνει ${sheetW}mm → κύλινδρος ${sheetH}mm`}
                    </span>
                  </div>
                </button>
                </>)}


                <MfLabel>ΦΥΡΑ (φύλλα μοντάζ)</MfLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                  <MfInput value={wasteFixed} onChange={v => setWasteFixed(Math.max(0, Number(v) || 0))} style={{ width: '100%', textAlign: 'center' }} />
                </div>

                <MfLabel>ΤΑΧΥΤΗΤΑ ({machine?.cat === 'offset' ? 'φύλ/ώρα' : 'σελ/λεπτό'})</MfLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MfInput value={speedOverride || defaultSpeed} onChange={v => setSpeedOverride(Number(v) || null)} style={{ width: 90, textAlign: 'center' }} />
                  {speedOverride && (
                    <button onClick={() => setSpeedOverride(null)}
                      style={{ border: 'none', background: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.65rem', padding: '0 4px' }}
                      title="Reset">
                      <i className="fas fa-undo" />
                    </button>
                  )}
                  <span style={{ fontSize: '0.55rem', color: '#64748b' }}>{matchedZone ? `${matchedZone.gsm_from}-${matchedZone.gsm_to}gr` : (specs.off_common_speed ? 'συνήθης' : 'max')}: {defaultSpeed}</span>
                </div>
              </div>
            </>)}

            {/* ── PAPER PANEL ── */}
            {activePanel === 'paper' && (<>
              {/* Selected paper indicator */}
              {paper && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                  padding: '6px 10px', borderRadius: 7,
                  background: 'color-mix(in srgb, var(--teal) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--teal) 25%, transparent)',
                }}>
                  <i className="fas fa-check-circle" style={{ color: 'var(--teal)', fontSize: '0.65rem' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{paper.name}</div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{paper.width}×{paper.height}mm{paper.thickness ? ` · ${paper.thickness}μm` : ''}{paper.costPerUnit ? ` · €${paper.costPerUnit.toFixed(3)}` : ''}</div>
                  </div>
                </div>
              )}
              {/* Search — full width */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 32,
                border: '1px solid var(--border)', borderRadius: 7,
                background: 'rgba(255,255,255,0.04)', marginBottom: 8,
              }}>
                <i className="fas fa-search" style={{ color: '#64748b', fontSize: '0.65rem' }} />
                <input value={paperSearch} onChange={(e) => setPaperSearch(e.target.value)}
                  placeholder="Αναζήτηση χαρτιού..."
                  style={{ border: 'none', background: 'transparent', color: 'var(--text)', fontSize: '0.78rem', fontFamily: 'inherit', outline: 'none', flex: 1 }}
                />
                {paperSearch && <button onClick={() => setPaperSearch('')} style={{ border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.7rem', padding: 0 }}>&times;</button>}
              </div>
              {/* Fav toggle + Filters */}
              {((machine?.specs?.fav_papers as string[]) ?? []).length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <button onClick={() => setShowFavPapers(f => !f)}
                    style={{
                      padding: '4px 12px', fontSize: '0.62rem', fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                      border: showFavPapers ? '1px solid #f59e0b' : '1px solid var(--border)',
                      background: showFavPapers ? 'rgba(245,158,11,0.12)' : 'transparent',
                      color: showFavPapers ? '#f59e0b' : 'var(--text-dim)',
                    }}>
                    <i className="fas fa-star" style={{ marginRight: 4, fontSize: '0.55rem' }} />Αγαπημένα
                  </button>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                {suppliers.length > 0
                  ? <FilterDrop icon="fas fa-truck" label="Προμηθευτής" value={supplier} options={suppliers} onChange={setSupplier} color="var(--teal)" />
                  : <div />
                }
                <FilterDrop icon="fas fa-folder" label="Κατηγορία" value={paperCat} options={categories} onChange={setPaperCat} color="var(--teal)" />
              </div>
              {/* Active chips */}
              {(paperCat || supplier) && (
                <div style={{ display: 'flex', gap: 3, marginBottom: 6, flexWrap: 'wrap' }}>
                  {paperCat && <span onClick={() => setPaperCat('')} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 10, background: 'color-mix(in srgb, var(--teal) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--teal) 25%, transparent)', color: 'var(--teal)', fontSize: '0.62rem', fontWeight: 600, cursor: 'pointer' }}>{paperCat} ×</span>}
                  {supplier && <span onClick={() => setSupplier('')} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 10, background: 'color-mix(in srgb, var(--teal) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--teal) 25%, transparent)', color: 'var(--teal)', fontSize: '0.62rem', fontWeight: 600, cursor: 'pointer' }}>{supplier} ×</span>}
                </div>
              )}
              {/* Paper list grouped */}
              <div style={{ flex: 1 }}>
                {(() => {
                  const fp = papers
                    .filter(p => !paperSearch || p.name.toLowerCase().includes(paperSearch.toLowerCase()))
                    .filter(p => !supplier || p.supplier === supplier)
                    .filter(p => !paperCat || paperCategory(p) === paperCat);
                  if (fp.length === 0) return <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: '0.78rem' }}><i className="fas fa-inbox" style={{ display: 'block', fontSize: '1.2rem', marginBottom: 6 }} />Δεν βρέθηκαν</div>;
                  const favIds: string[] = (machine?.specs?.fav_papers as string[]) ?? [];
                  const filtered = showFavPapers ? fp.filter(p => favIds.includes(p.id)) : fp;
                  const grouped = new Map<string, typeof fp>();
                  for (const p of filtered) { const cat = paperCategory(p) || 'Λοιπά'; if (!grouped.has(cat)) grouped.set(cat, []); grouped.get(cat)!.push(p); }
                  return [...grouped.entries()].map(([cat, items]) => (
                    <div key={cat}>
                      <div style={{ fontSize: '0.58rem', fontWeight: 600, color: 'var(--teal)', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '6px 0 3px', position: 'sticky', top: 0, background: 'rgba(0,0,0,0.2)', zIndex: 1 }}>{cat} ({items.length})</div>
                      {items.map(p => {
                        const isActive = p.id === activePaperId;
                        return (
                          <div key={p.id} onClick={() => setActivePaperId(p.id)}
                            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--teal) 10%, transparent)'; }}
                            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                            style={{
                            display: 'flex', alignItems: 'flex-start', gap: 6, padding: '5px 6px', borderRadius: 6,
                            cursor: 'pointer', color: '#94a3b8',
                            marginBottom: 3,
                            border: `1px solid ${isActive ? 'color-mix(in srgb, var(--teal) 40%, transparent)' : 'color-mix(in srgb, var(--teal) 8%, transparent)'}`,
                            background: isActive ? 'color-mix(in srgb, var(--teal) 6%, transparent)' : 'transparent',
                            transition: 'background 0.15s',
                          }}>
                            <span style={{ color: 'var(--teal)', fontSize: '0.6rem', width: 12, flexShrink: 0, marginTop: 2 }}>{isActive && <i className="fas fa-check" />}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text)', background: 'rgba(255,255,255,0.06)', padding: '0 5px', borderRadius: 4 }}>{p.thickness}gr</span>
                                <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#94a3b8' }}>{p.width}×{p.height}</span>
                                <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--teal)', marginLeft: 'auto' }}>€{(p.costPerUnit || 0).toFixed(3)}</span>
                              </div>
                            </div>
                            <button onClick={(e) => {
                              e.stopPropagation();
                              const favIds: string[] = ((machine?.specs?.fav_papers as string[]) ?? []);
                              const updated = favIds.includes(p.id) ? favIds.filter(id => id !== p.id) : [...favIds, p.id];
                              const idx = machines.findIndex(m => m.id === machine.id);
                              if (idx >= 0) {
                                const copy = [...machines];
                                copy[idx] = { ...copy[idx], specs: { ...(copy[idx].specs as object), fav_papers: updated } };
                                setMachines(copy);
                              }
                              fetch('/api/calculator', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ machineId: machine.id, fav_papers: updated }) });
                            }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px 4px', fontSize: '0.65rem', color: ((machine?.specs?.fav_papers as string[]) ?? []).includes(p.id) ? '#f59e0b' : '#475569', flexShrink: 0 }}>
                              <i className={((machine?.specs?.fav_papers as string[]) ?? []).includes(p.id) ? 'fas fa-star' : 'far fa-star'} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            </>)}

            {/* ── JOB PANEL ── */}
            {activePanel === 'job' && (<>
              {/* Dimensions */}
              <MfLabel>ΔΙΑΣΤΑΣΕΙΣ (MM)</MfLabel>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center', maxWidth: '100%' }}>
                <MfInput value={job.width} onChange={(v) => setJob({ ...job, width: Number(v) || 0 })} style={{ width: 0, flex: 1, minWidth: 0, textAlign: 'center' }} />
                <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.8rem', flexShrink: 0 }}>×</span>
                <MfInput value={job.height} onChange={(v) => setJob({ ...job, height: Number(v) || 0 })} style={{ width: 0, flex: 1, minWidth: 0, textAlign: 'center' }} />
                <button onClick={() => setJob({ ...job, rotation: !job.rotation })} title="Αναστροφή 90°" style={{
                  width: 36, height: 36, borderRadius: 8, border: `1px solid ${job.rotation ? 'var(--accent)' : 'var(--border)'}`,
                  background: job.rotation ? 'rgba(245,130,32,0.08)' : 'transparent',
                  color: job.rotation ? 'var(--accent)' : '#64748b',
                  cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <i className="fas fa-sync-alt" />
                </button>
              </div>

              {/* Qty + Multiplier row (bleed now lives in the canvas controls) */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <div style={{ flex: impoMode === 'cutstack' ? 2 : 1 }}>
                  <MfLabel>ΠΟΣΟΤΗΤΑ</MfLabel>
                  <MfInput value={job.qty} onChange={(v) => setJob({ ...job, qty: Number(v) || 0 })} style={{ width: '100%', textAlign: 'center', fontWeight: 600 }} />
                </div>
                {impoMode === 'cutstack' && (
                  <div style={{ flex: 1 }}>
                    <MfLabel>×ΣΕΙΡΕΣ</MfLabel>
                    <MfInput value={prodMultiplier} onChange={v => setProdMultiplier(Math.max(1, Math.round(Number(v) || 1)))} style={{ width: '100%', textAlign: 'center', fontWeight: 600, color: prodMultiplier > 1 ? 'var(--accent)' : undefined }} />
                  </div>
                )}
              </div>

              {/* Sides */}
              <MfLabel>ΟΨΕΙΣ</MfLabel>
              <div style={{ marginBottom: 12 }}>
                {FORCE_DUPLEX.has(impoMode) ? (
                  <div style={{ fontSize: '0.72rem', color: 'var(--blue)', padding: '6px 0', fontWeight: 600 }}>
                    <i className="fas fa-lock" style={{ marginRight: 6, fontSize: '0.5rem' }} />Διπλή όψη ({impoMode === 'workturn' ? 'Work&Turn' : impoMode === 'booklet' ? 'Booklet' : 'Perfect Bound'})
                  </div>
                ) : machine?.cat === 'offset' ? (
                  <div style={{ fontSize: '0.72rem', color: job.sides === 2 ? 'var(--blue)' : 'var(--text-muted)', padding: '6px 0', fontWeight: 600 }}>
                    <i className={job.sides === 2 ? 'fas fa-clone' : 'fas fa-file'} style={{ marginRight: 6, fontSize: '0.6rem' }} />
                    {job.sides === 2 ? 'Διπλή' : 'Μονή'} όψη
                    <span style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 400, marginLeft: 6 }}>(από χρώματα)</span>
                  </div>
                ) : (
                  <ToggleBar value={String(job.sides)} onChange={(v) => setJob({ ...job, sides: Number(v) as 1 | 2 })} options={[{ v: '1', l: 'Μονή' }, { v: '2', l: 'Διπλή' }]} />
                )}
              </div>


              {/* Divider */}
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0 12px' }} />

              {/* Archetype */}
              <MfLabel>ARCHETYPE</MfLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                {ARCHETYPES.map((a) => (
                  <Pill key={a.id} active={job.archetype === a.id} onClick={() => setJob({ ...job, archetype: a.id })}>
                    <i className={a.icon} style={{ fontSize: '0.55rem', marginRight: 3 }} />{a.label}
                  </Pill>
                ))}
              </div>

              {/* Archetype-specific params */}
              {(job.archetype === 'booklet' || impoMode === 'booklet') && (
                <div style={{ marginBottom: 10 }}>
                  <MfLabel>ΣΕΛΙΔΕΣ (×4)</MfLabel>
                  <MfInput value={job.pages ?? ''} onChange={(v) => setJob({ ...job, pages: Number(v) || undefined })} style={{ width: 80, textAlign: 'center' }} />
                </div>
              )}
              {job.archetype === 'pad' && (
                <div style={{ marginBottom: 10 }}>
                  <MfLabel>ΦΥΛΛΑ / ΜΠΛΟΚ</MfLabel>
                  <MfInput value={job.sheetsPerPad || 50} onChange={(v) => setJob({ ...job, sheetsPerPad: Math.max(1, Number(v) || 1) })} style={{ width: 80, textAlign: 'center' }} />
                </div>
              )}
              {job.archetype === 'perfect_bound' && (
                <div style={{ marginBottom: 10 }}>
                  <MfLabel>ΣΕΛΙΔΕΣ ΣΩΜΑΤΟΣ</MfLabel>
                  <MfInput value={job.bodyPages ?? ''} onChange={(v) => setJob({ ...job, bodyPages: Number(v) || undefined })} style={{ width: 80, textAlign: 'center' }} />
                </div>
              )}
              {job.archetype === 'custom' && (
                <div style={{ marginBottom: 10 }}>
                  <MfLabel>ΠΟΛΛΑΠΛΑΣΙΑΣΤΗΣ</MfLabel>
                  <MfInput value={job.customMult || 1} onChange={(v) => setJob({ ...job, customMult: Number(v) || 1 })} style={{ width: 80, textAlign: 'center' }} />
                </div>
              )}

              {/* Product selection */}
              <MfLabel>ΠΡΟΪΟΝ</MfLabel>
              {products.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {/* Clear selection */}
                  {job.productId && (
                    <div onClick={() => setJob(prev => ({ ...prev, productId: undefined }))} style={{
                      padding: '5px 8px', borderRadius: 6, fontSize: '0.7rem', color: '#64748b',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <i className="fas fa-times" style={{ fontSize: '0.55rem' }} /> Χωρίς προϊόν
                    </div>
                  )}
                  {products.filter(p => p.archetype === job.archetype).map(p => {
                    const active = job.productId === p.id;
                    const arch = ARCHETYPES.find(a => a.id === p.archetype);
                    return (
                      <div key={p.id} onClick={() => {
                        setJob(prev => ({
                          ...prev,
                          productId: p.id,
                          archetype: p.archetype || prev.archetype,
                          pages: p.pages ?? prev.pages,
                          sheetsPerPad: p.sheetsPerPad ?? prev.sheetsPerPad,
                          bodyPages: p.bodyPages ?? prev.bodyPages,
                          customMult: p.customMult ?? prev.customMult,
                        }));
                      }} style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6,
                        cursor: 'pointer', transition: 'all 0.15s',
                        border: `1px solid ${active ? 'color-mix(in srgb, var(--accent) 50%, transparent)' : 'var(--border)'}`,
                        background: active ? 'rgba(245,130,32,0.06)' : 'transparent',
                      }}>
                        {arch && <i className={arch.icon} style={{ fontSize: '0.6rem', color: active ? 'var(--accent)' : '#64748b', flexShrink: 0 }} />}
                        <span style={{ flex: 1, fontSize: '0.72rem', color: active ? 'var(--accent)' : 'var(--text)', fontWeight: active ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        <i className={`${p.isFavourite ? 'fas' : 'far'} fa-star`}
                          onClick={async (e) => {
                            e.stopPropagation();
                            await fetch('/api/calculator', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggleFavourite', productId: p.id }) });
                            setProducts(prev => prev.map(pp => pp.id === p.id ? { ...pp, isFavourite: !pp.isFavourite } : pp.archetype === p.archetype ? { ...pp, isFavourite: false } : pp));
                          }}
                          style={{ fontSize: '0.5rem', color: p.isFavourite ? '#facc15' : '#475569', cursor: 'pointer', flexShrink: 0, padding: '2px' }}
                        />
                        {active && <i className="fas fa-check" style={{ fontSize: '0.55rem', color: 'var(--accent)', flexShrink: 0 }} />}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: '8px 10px', borderRadius: 7, border: '1px dashed var(--border)', fontSize: '0.7rem', color: '#475569', textAlign: 'center' }}>
                  <i className="fas fa-inbox" style={{ marginRight: 4 }} />
                  Δημιουργήστε προϊόντα στο <strong>Global Products</strong>
                </div>
              )}
            </>)}

            {/* ── COLOR PANEL ── */}
            {activePanel === 'color' && (<>
              {machine?.cat === 'offset' ? (<>
                {/* ═══ OFFSET COLOR ═══ */}
                <MfLabel>ΕΠΙΚΑΛΥΨΗ (TAC)</MfLabel>
                <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                  {([
                    { v: 'low' as const, l: '20%' },
                    { v: 'mid' as const, l: '100%' },
                    { v: 'high' as const, l: '300%' },
                  ]).map(o => (
                    <Pill key={o.v} active={color.coverage === o.v} onClick={() => setColor({ ...color, coverage: o.v })} color="var(--blue)">{o.l}</Pill>
                  ))}
                  {pdf?.coverage && (
                    <Pill active={color.coverage === 'pdf'} onClick={() => setColor({ ...color, coverage: 'pdf' })} color="var(--success)">
                      PDF {Math.round(pdf.coverage.tac * 100)}%
                    </Pill>
                  )}
                </div>
                {color.coverage === 'pdf' && pdf?.coverage && (
                  <div style={{ fontSize: '0.55rem', color: '#64748b', marginBottom: 6, display: 'flex', gap: 8 }}>
                    <span style={{ color: '#00aeef' }}>C:{Math.round(pdf.coverage.c * 100)}%</span>
                    <span style={{ color: '#e91e90' }}>M:{Math.round(pdf.coverage.m * 100)}%</span>
                    <span style={{ color: '#f0b400' }}>Y:{Math.round(pdf.coverage.y * 100)}%</span>
                    <span style={{ color: '#999' }}>K:{Math.round(pdf.coverage.k * 100)}%</span>
                  </div>
                )}

                <MfLabel>ΠΛΑΚΕΣ</MfLabel>
                {/* Presets */}
                <div style={{ display: 'flex', gap: 3, marginBottom: 8, flexWrap: 'wrap' }}>
                  {[
                    { l: '1/0', f: 1, b: 0 },
                    { l: '1/1', f: 1, b: 1 },
                    { l: '2/0', f: 2, b: 0 },
                    { l: '2/2', f: 2, b: 2 },
                    { l: '4/0', f: 4, b: 0 },
                    { l: '4/4', f: 4, b: 4 },
                  ].map(p => {
                    const active = color.platesFront === p.f && color.platesBack === p.b;
                    return (
                      <Pill key={p.l} active={active} onClick={() => {
                        setColor({ ...color, platesFront: p.f, platesBack: p.b });
                        if (!FORCE_DUPLEX.has(impoMode)) setJob(prev => ({ ...prev, sides: p.b > 0 ? 2 : 1 }));
                      }}>{p.l}</Pill>
                    );
                  })}
                </div>
                {/* Plates per side */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.58rem', color: '#64748b', marginBottom: 3 }}>Εμπρός</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button onClick={() => setColor({ ...color, platesFront: Math.max(0, color.platesFront - 1) })} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}>−</button>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', width: 20, textAlign: 'center' }}>{color.platesFront}</span>
                      <button onClick={() => setColor({ ...color, platesFront: color.platesFront + 1 })} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}>+</button>
                    </div>
                  </div>
                  {job.sides === 2 && !HIDE_BACK_PLATES.has(impoMode) && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.58rem', color: '#64748b', marginBottom: 3 }}>Πίσω</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => setColor({ ...color, platesBack: Math.max(0, color.platesBack - 1) })} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}>−</button>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', width: 20, textAlign: 'center' }}>{color.platesBack}</span>
                        <button onClick={() => setColor({ ...color, platesBack: color.platesBack + 1 })} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}>+</button>
                      </div>
                    </div>
                  )}
                  {HIDE_BACK_PLATES.has(impoMode) && (
                    <div style={{ flex: 1, fontSize: '0.55rem', color: '#64748b', alignSelf: 'flex-end', paddingBottom: 4 }}>
                      <i className="fas fa-lock" style={{ fontSize: '0.45rem', marginRight: 3 }} />Πίσω = Εμπρός
                    </div>
                  )}
                </div>

                {/* PMS */}
                <MfLabel>PANTONE / PMS</MfLabel>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.58rem', color: '#64748b', marginBottom: 3 }}>Εμπρός</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button onClick={() => setColor({ ...color, pmsFront: Math.max(0, color.pmsFront - 1) })} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}>−</button>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', width: 20, textAlign: 'center' }}>{color.pmsFront}</span>
                      <button onClick={() => setColor({ ...color, pmsFront: color.pmsFront + 1 })} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}>+</button>
                    </div>
                  </div>
                  {job.sides === 2 && !HIDE_BACK_PLATES.has(impoMode) && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.58rem', color: '#64748b', marginBottom: 3 }}>Πίσω</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => setColor({ ...color, pmsBack: Math.max(0, color.pmsBack - 1) })} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}>−</button>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', width: 20, textAlign: 'center' }}>{color.pmsBack}</span>
                        <button onClick={() => setColor({ ...color, pmsBack: color.pmsBack + 1 })} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}>+</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Varnish */}
                <MfLabel>ΒΕΡΝΙΚΙ</MfLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {([
                    { v: 'none' as const, l: 'Κανένα' },
                    { v: 'oil' as const, l: 'OPV (πύργος)' },
                    { v: 'coating' as const, l: 'AQ/UV' },
                  ]).map(o => (
                    <Pill key={o.v} active={color.varnish === o.v} onClick={() => setColor({ ...color, varnish: o.v })} color="var(--violet)">{o.l}</Pill>
                  ))}
                </div>
                {color.varnish !== 'none' && (
                  <div style={{ marginBottom: 10 }}>
                    <MfLabel>ΠΟΤΕ;</MfLabel>
                    <ToggleBar value={color.varnishTiming} onChange={v => setColor({ ...color, varnishTiming: v as 'inline' | 'separate' })}
                      options={[{ v: 'inline', l: 'Ίδια στιγμή' }, { v: 'separate', l: 'Άλλη μέρα' }]} />
                  </div>
                )}

                {/* Perfecting + Method (hidden in Work&Turn — mode handles it) */}
                {job.sides === 2 && !HIDE_BACK_PLATES.has(impoMode) && (<>
                  <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0 10px' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <button onClick={() => setColor({ ...color, perfecting: !color.perfecting })} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                      borderRadius: 8, border: `1px solid ${color.perfecting ? 'color-mix(in srgb, var(--blue) 50%, transparent)' : 'var(--border)'}`,
                      background: color.perfecting ? 'color-mix(in srgb, var(--blue) 8%, transparent)' : 'transparent',
                      color: color.perfecting ? 'var(--blue)' : '#64748b',
                      fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flex: 1,
                    }}>
                      <i className="fas fa-sync-alt" style={{ fontSize: '0.62rem' }} />
                      Perfecting {color.perfecting ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </>)}
              </>) : (<>
                {/* ═══ DIGITAL COLOR ═══ */}
                <MfLabel>ΧΡΩΜΑ</MfLabel>
                <div style={{ marginBottom: 12 }}>
                  <ToggleBar value={color.model} onChange={(v) => setColor({ ...color, model: v as 'cmyk' | 'bw' })} options={[{ v: 'cmyk', l: 'Έγχρωμο (CMYK)' }, { v: 'bw', l: 'Ασπρόμαυρο (K)' }]} />
                </div>

                {/* Coverage */}
                <MfLabel>ΕΠΙΚΑΛΥΨΗ (TAC)</MfLabel>
                <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                  {([
                    { v: 'low' as const, l: '20%' },
                    { v: 'mid' as const, l: '100%' },
                    { v: 'high' as const, l: '300%' },
                  ]).map(o => (
                    <Pill key={o.v} active={color.coverage === o.v} onClick={() => setColor({ ...color, coverage: o.v })} color="var(--blue)">{o.l}</Pill>
                  ))}
                  {pdf?.coverage && (
                    <Pill active={color.coverage === 'pdf'} onClick={() => setColor({ ...color, coverage: 'pdf' })} color="var(--success)">
                      PDF {Math.round(pdf.coverage.tac * 100)}%
                    </Pill>
                  )}
                </div>
                {color.coverage === 'pdf' && pdf?.coverage && (
                  <div style={{ fontSize: '0.55rem', color: '#64748b', marginBottom: 6, display: 'flex', gap: 8 }}>
                    <span style={{ color: '#00aeef' }}>C:{Math.round(pdf.coverage.c * 100)}%</span>
                    <span style={{ color: '#e91e90' }}>M:{Math.round(pdf.coverage.m * 100)}%</span>
                    <span style={{ color: '#f0b400' }}>Y:{Math.round(pdf.coverage.y * 100)}%</span>
                    <span style={{ color: '#999' }}>K:{Math.round(pdf.coverage.k * 100)}%</span>
                  </div>
                )}
              </>)}
            </>)}

            {/* ── FINISH PANEL ── */}
            {activePanel === 'finish' && (<>
              <MfLabel>ΓΚΙΛΟΤΙΝΑ</MfLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
                <Pill active={!finish.guillotineId} onClick={() => setFinish({ ...finish, guillotineId: '', guillotineName: 'Χωρίς' })} color="var(--violet)">Χωρίς</Pill>
                {guillotines.map((g) => (
                  <Pill key={g.id} active={finish.guillotineId === g.id} onClick={() => setFinish({ ...finish, guillotineId: g.id, guillotineName: g.name })} color="var(--violet)">{g.name}</Pill>
                ))}
              </div>
              <MfLabel>ΠΛΑΣΤΙΚΟΠΟΙΗΣΗ</MfLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
                <Pill active={!finish.lamMachineId} onClick={() => setFinish({ ...finish, lamMachineId: '', lamFilmId: '', lamName: 'Χωρίς' })} color="var(--teal)">Χωρίς</Pill>
                {laminators.map((l) => (
                  <Pill key={l.id} active={finish.lamMachineId === l.id} onClick={() => {
                    const dualRoll = (l.specs as Record<string, unknown>)?.dual_roll;
                    setFinish({ ...finish, lamMachineId: l.id, lamName: l.name, lamFilmId: films[0]?.id || '', lamSides: dualRoll === '1' || dualRoll === 1 ? 2 : 1 });
                  }} color="var(--teal)">{l.name}</Pill>
                ))}
              </div>
              {finish.lamMachineId && (() => {
                const selectedLam = laminators.find(x => x.id === finish.lamMachineId);
                const selectedFilm = films.find(f => f.id === finish.lamFilmId);
                // Pouch = film with width + height dimensions
                const isPouch = !!(selectedFilm && selectedFilm.width && selectedFilm.height);
                // Pouch fit check (client-side)
                const sealMargin = Number((selectedLam?.specs as Record<string,unknown>)?.seal_margin) || 5;
                const pouchFitError = isPouch && selectedFilm?.width && selectedFilm?.height
                  ? (() => {
                      const maxW = selectedFilm.width! - sealMargin * 2;
                      const maxH = selectedFilm.height! - sealMargin * 2;
                      const jW = job.width; const jH = job.height;
                      const fits = (jW <= maxW && jH <= maxH) || (jH <= maxW && jW <= maxH);
                      if (fits) return null;
                      return `Το φύλλο ${jW}×${jH}mm δεν χωράει στο pouch ${selectedFilm.width}×${selectedFilm.height}mm (περιθώριο ${sealMargin}mm/πλευρά → μέγιστο ${maxW}×${maxH}mm)`;
                    })()
                  : null;
                return (<>
                  <MfLabel>ΥΛΙΚΟ ΠΛΑΣΤΙΚΟΠΟΙΗΣΗΣ</MfLabel>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
                    {films.map((f) => {
                      const hasSize = f.width && f.height;
                      const info = hasSize ? ` ${f.width}×${f.height}` : '';
                      const tag = hasSize ? ' (Pouch)' : '';
                      return (
                        <Pill key={f.id} active={finish.lamFilmId === f.id} onClick={() => setFinish({ ...finish, lamFilmId: f.id })} color="var(--teal)">{f.name}{info}{tag}</Pill>
                      );
                    })}
                    {!films.length && <span style={{ fontSize: '0.65rem', color: '#64748b' }}>Δεν βρέθηκαν υλικά — προσθέστε από Μετεκτύπωση → Πλαστικοποίηση</span>}
                  </div>
                  {pouchFitError && (
                    <div style={{
                      padding: '8px 12px', borderRadius: 8, marginBottom: 12,
                      background: 'color-mix(in srgb, var(--red, #ef4444) 12%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--red, #ef4444) 30%, transparent)',
                      color: '#fca5a5', fontSize: '0.75rem', fontWeight: 500,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <i className="fas fa-exclamation-triangle" style={{ color: '#ef4444' }} />
                      {pouchFitError}
                    </div>
                  )}
                  {!isPouch && (<>
                    <MfLabel>ΟΨΕΙΣ ΠΛΑΣΤΙΚΟΠΟΙΗΣΗΣ</MfLabel>
                    <ToggleBar value={String(finish.lamSides)} onChange={(v) => setFinish({ ...finish, lamSides: Number(v) as 1 | 2 })} options={[{ v: '1', l: '1 Όψη' }, { v: '2', l: '2 Όψεις' }]} />
                  </>)}
                  <div style={{ height: 10 }} />
                </>);
              })()}
              {creasers.length > 0 && (<>
                <MfLabel>ΠΥΚΜΑΝΣΗ</MfLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                  <Pill active={!finish.creaseMachineId} onClick={() => setFinish({ ...finish, creaseMachineId: '' })} color="#0ea5e9">Χωρίς</Pill>
                  {creasers.map((c) => (
                    <Pill key={c.id} active={finish.creaseMachineId === c.id} onClick={() => setFinish({ ...finish, creaseMachineId: c.id, creaseCount: finish.creaseCount || 1 })} color="#0ea5e9">{c.name}</Pill>
                  ))}
                </div>
                {finish.creaseMachineId && (() => {
                  const selectedCrease = creasers.find(x => x.id === finish.creaseMachineId);
                  const cSpecs = (selectedCrease?.specs as Record<string, unknown>) || {};
                  const mode = (cSpecs.crease_charge_mode as string) || 'per_crease';
                  const maxCreases = Number(cSpecs.max_creases) || 0;
                  // gsm validation
                  const minGsm = Number(cSpecs.min_gsm) || 0;
                  const maxGsm = Number(cSpecs.max_gsm) || 0;
                  const paperGsm = paper?.thickness || 0;
                  const gsmWarning = (minGsm > 0 && paperGsm > 0 && paperGsm < minGsm)
                    ? `Χαρτί ${paperGsm}gsm — κάτω από το ελάχιστο (${minGsm}gsm)`
                    : (maxGsm > 0 && paperGsm > maxGsm)
                    ? `Χαρτί ${paperGsm}gsm — πάνω από το μέγιστο (${maxGsm}gsm)`
                    : null;
                  const warnBanner = gsmWarning ? (
                    <div style={{
                      padding: '6px 10px', borderRadius: 6, marginBottom: 10,
                      background: 'rgba(251,146,60,0.10)',
                      border: '1px solid rgba(251,146,60,0.35)',
                      color: '#fdba74', fontSize: '0.7rem',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <i className="fas fa-triangle-exclamation" style={{ color: '#fb923c' }} />
                      {gsmWarning}
                    </div>
                  ) : null;
                  if (mode === 'per_sheet') {
                    return (<>
                      {warnBanner}
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 14, padding: '6px 10px', borderRadius: 6, background: 'rgba(14,165,233,0.08)' }}>
                        <i className="fas fa-file" style={{ marginRight: 6, color: '#0ea5e9' }} />
                        Χρέωση ανά φύλλο, ανεξαρτήτου πυκμάνσεων
                      </div>
                    </>);
                  }
                  return (<>
                    {warnBanner}
                    <MfLabel>ΠΥΚΜΩΣΕΙΣ ΑΝΑ ΦΥΛΛΟ</MfLabel>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <button
                        onClick={() => setFinish({ ...finish, creaseCount: Math.max(1, finish.creaseCount - 1) })}
                        style={{
                          width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                          background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)',
                          cursor: 'pointer', fontSize: '0.75rem',
                        }}
                      ><i className="fas fa-minus" /></button>
                      <input
                        type="number" min="1" max={maxCreases || undefined}
                        value={finish.creaseCount}
                        onChange={(e) => {
                          const n = Math.max(1, parseInt(e.target.value) || 1);
                          setFinish({ ...finish, creaseCount: maxCreases ? Math.min(n, maxCreases) : n });
                        }}
                        style={{
                          width: 54, padding: '5px 8px', borderRadius: 6, textAlign: 'center',
                          border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)',
                          color: 'var(--text)', fontSize: '0.8rem', fontWeight: 700,
                        }}
                      />
                      <button
                        onClick={() => setFinish({ ...finish, creaseCount: maxCreases ? Math.min(maxCreases, finish.creaseCount + 1) : finish.creaseCount + 1 })}
                        style={{
                          width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                          background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)',
                          cursor: 'pointer', fontSize: '0.75rem',
                        }}
                      ><i className="fas fa-plus" /></button>
                      {maxCreases > 0 && (
                        <span style={{ fontSize: '0.65rem', color: '#64748b' }}>max {maxCreases}/πέρασμα</span>
                      )}
                    </div>
                  </>);
                })()}
              </>)}
              {folders.length > 0 && (<>
                <MfLabel>ΔΙΠΛΩΤΙΚΗ</MfLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                  <Pill active={!finish.foldMachineId} onClick={() => setFinish({ ...finish, foldMachineId: '', foldType: '' })} color="var(--blue)">Χωρίς</Pill>
                  {folders.map((f) => (
                    <Pill key={f.id} active={finish.foldMachineId === f.id} onClick={() => {
                      const fSpecs = (f.specs as Record<string, unknown>) || {};
                      const mode = (fSpecs.fold_charge_mode === 'per_sheet' ? 'per_sheet' : 'per_type');
                      if (mode === 'per_sheet') {
                        setFinish({ ...finish, foldMachineId: f.id, foldType: '' });
                      } else {
                        const hasRA = fSpecs.right_angle === '1' || fSpecs.right_angle === 1;
                        const isBookSig = impoMode === 'booklet' || impoMode === 'perfect_bound';
                        const totalPages = impoMode === 'perfect_bound'
                          ? Number(job.bodyPages) || 0
                          : Number(job.pages) || 0;
                        // Pick cross16 if 16+ pages, cross8 if 8-15, else first parallel
                        let preferred: string | undefined;
                        if (isBookSig && hasRA) {
                          if (totalPages >= 16 && Number(fSpecs['fold_price_cross16']) > 0) preferred = 'cross16';
                          else if (totalPages >= 8 && Number(fSpecs['fold_price_cross8']) > 0) preferred = 'cross8';
                        }
                        const firstPriced = preferred ?? FOLD_TYPES.find(ft =>
                          Number(fSpecs[`fold_price_${ft.key}`]) > 0
                          && (ft.passes <= 1 || (hasRA && isBookSig))
                        )?.key;
                        setFinish({ ...finish, foldMachineId: f.id, foldType: firstPriced || 'half' });
                      }
                    }} color="var(--blue)">{f.name}</Pill>
                  ))}
                </div>
                {finish.foldMachineId && (() => {
                  const selectedFold = folders.find(x => x.id === finish.foldMachineId);
                  const fSpecs = (selectedFold?.specs as Record<string, unknown>) || {};
                  const mode = (fSpecs.fold_charge_mode === 'per_sheet' ? 'per_sheet' : 'per_type');
                  // gsm validation
                  const minGsm = Number(fSpecs.min_gsm) || 0;
                  const maxGsm = Number(fSpecs.max_gsm) || 0;
                  const paperGsm = paper?.thickness || 0;
                  const gsmWarning = (minGsm > 0 && paperGsm > 0 && paperGsm < minGsm)
                    ? `Χαρτί ${paperGsm}gsm — κάτω από το ελάχιστο (${minGsm}gsm)`
                    : (maxGsm > 0 && paperGsm > maxGsm)
                    ? `Χαρτί ${paperGsm}gsm — πάνω από το μέγιστο (${maxGsm}gsm)`
                    : null;
                  const warnBanner = gsmWarning ? (
                    <div style={{
                      padding: '6px 10px', borderRadius: 6, marginBottom: 10,
                      background: 'rgba(251,146,60,0.10)',
                      border: '1px solid rgba(251,146,60,0.35)',
                      color: '#fdba74', fontSize: '0.7rem',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <i className="fas fa-triangle-exclamation" style={{ color: '#fb923c' }} />
                      {gsmWarning}
                    </div>
                  ) : null;
                  if (mode === 'per_sheet') {
                    const price = Number(fSpecs.fold_price_flat) || 0;
                    return (<>
                      {warnBanner}
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 14, padding: '6px 10px', borderRadius: 6, background: 'rgba(59,130,246,0.08)' }}>
                        <i className="fas fa-file" style={{ marginRight: 6, color: 'var(--blue)' }} />
                        {price > 0
                          ? `Χρέωση ανά φύλλο: €${price.toFixed(3)}, ανεξαρτήτου τύπου δίπλωσης`
                          : 'Δεν έχει οριστεί τιμή ανά φύλλο — ενημέρωσε το μηχάνημα στη Μετεκτύπωση.'}
                      </div>
                    </>);
                  }
                  const hasRA = fSpecs.right_angle === '1' || fSpecs.right_angle === 1;
                  const isBookSig = impoMode === 'booklet' || impoMode === 'perfect_bound';
                  const availableTypes = FOLD_TYPES.filter(ft =>
                    Number(fSpecs[`fold_price_${ft.key}`]) > 0
                    && (ft.passes <= 1 || (hasRA && isBookSig))
                  );
                  if (!availableTypes.length) {
                    return (<>
                      {warnBanner}
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 14, padding: '6px 10px', borderRadius: 6, background: 'rgba(59,130,246,0.08)' }}>
                        <i className="fas fa-info-circle" style={{ marginRight: 6, color: 'var(--blue)' }} />
                        Δεν έχει οριστεί τιμή σε κανέναν τύπο — ενημέρωσε το μηχάνημα στη Μετεκτύπωση.
                      </div>
                    </>);
                  }
                  return (<>
                    {warnBanner}
                    <MfLabel>ΤΥΠΟΣ ΔΙΠΛΩΣΗΣ</MfLabel>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
                      {availableTypes.map(ft => (
                        <Pill key={ft.key} active={finish.foldType === ft.key} onClick={() => setFinish({ ...finish, foldType: ft.key })} color="var(--blue)">
                          {ft.label}
                        </Pill>
                      ))}
                    </div>
                  </>);
                })()}
              </>)}
              {gatherers.length > 0 && (() => {
                // Filter machines by impo mode capability
                const isBooklet = impoMode === 'booklet';
                const isPB = impoMode === 'perfect_bound';
                const compatibleGatherers = (isBooklet || isPB)
                  ? gatherers.filter(g => {
                      const gSpecs = (g.specs as Record<string, unknown>) || {};
                      const cap = String(gSpecs.gather_mode || 'both');
                      if (cap === 'both') return true;
                      if (isBooklet && cap === 'saddle') return true;
                      if (isPB && cap === 'flat') return true;
                      return false;
                    })
                  : [];
                if (!compatibleGatherers.length) return null;
                return (<>
                  <MfLabel>ΣΥΝΘΕΤΙΚΗ</MfLabel>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                    <Pill active={!finish.gatherMachineId} onClick={() => setFinish({ ...finish, gatherMachineId: '' })} color="#a855f7">Χωρίς</Pill>
                    {compatibleGatherers.map((g) => (
                      <Pill key={g.id} active={finish.gatherMachineId === g.id} onClick={() => {
                        // Auto-suggest signatures from page count
                        const totalPages = isPB ? (Number(job.bodyPages) || 0) : (Number(job.pages) || 0);
                        const sigs = totalPages >= 16 ? Math.ceil(totalPages / 16) : (totalPages >= 8 ? Math.ceil(totalPages / 8) : 1);
                        setFinish({ ...finish, gatherMachineId: g.id, gatherSignatures: finish.gatherSignatures > 1 ? finish.gatherSignatures : sigs });
                      }} color="#a855f7">{g.name}</Pill>
                    ))}
                  </div>
                  {finish.gatherMachineId && (() => {
                    const selectedGather = gatherers.find(x => x.id === finish.gatherMachineId);
                    const gSpecs = (selectedGather?.specs as Record<string, unknown>) || {};
                    const mode = (gSpecs.gather_charge_mode === 'per_signature' ? 'per_signature' : 'per_book');
                    const stations = Number(gSpecs.stations) || 0;
                    if (mode === 'per_book') {
                      const price = Number(gSpecs.gather_price_per_book) || 0;
                      return (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 14, padding: '6px 10px', borderRadius: 6, background: 'rgba(168,85,247,0.08)' }}>
                          <i className="fas fa-book" style={{ marginRight: 6, color: '#a855f7' }} />
                          {price > 0
                            ? `Χρέωση ανά βιβλίο: €${price.toFixed(3)}, ανεξαρτήτου signatures`
                            : 'Δεν έχει οριστεί τιμή — ενημέρωσε το μηχάνημα.'}
                        </div>
                      );
                    }
                    return (<>
                      <MfLabel>SIGNATURES ΑΝΑ ΒΙΒΛΙΟ</MfLabel>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                        <button
                          onClick={() => setFinish({ ...finish, gatherSignatures: Math.max(1, finish.gatherSignatures - 1) })}
                          style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}
                        ><i className="fas fa-minus" /></button>
                        <input
                          type="number" min="1" max={stations || undefined}
                          value={finish.gatherSignatures}
                          onChange={(e) => {
                            const n = Math.max(1, parseInt(e.target.value) || 1);
                            setFinish({ ...finish, gatherSignatures: stations ? Math.min(n, stations) : n });
                          }}
                          style={{ width: 54, padding: '5px 8px', borderRadius: 6, textAlign: 'center', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', color: 'var(--text)', fontSize: '0.8rem', fontWeight: 700 }}
                        />
                        <button
                          onClick={() => setFinish({ ...finish, gatherSignatures: stations ? Math.min(stations, finish.gatherSignatures + 1) : finish.gatherSignatures + 1 })}
                          style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}
                        ><i className="fas fa-plus" /></button>
                        {stations > 0 && (
                          <span style={{ fontSize: '0.65rem', color: '#64748b' }}>max {stations} pockets</span>
                        )}
                      </div>
                    </>);
                  })()}
                </>);
              })()}
              <MfLabel>ΒΙΒΛΙΟΔΕΣΙΑ</MfLabel>
              <ToggleBar value={finish.binding} onChange={(v) => {
                const subtype = v === 'glue' ? 'glue_bind' : v;
                const firstMatch = binders.find(b => b.subtype === subtype);
                setFinish({ ...finish, binding: v, bindingMachineId: firstMatch?.id || '' });
              }}
                options={[{ v: 'none', l: 'Καμία' }, { v: 'staple', l: 'Συρραφή' }, { v: 'glue', l: 'Κόλλα' }, { v: 'spiral', l: 'Σπιράλ' }]}
                color="var(--amber)"
              />
              {finish.binding !== 'none' && binders.length > 0 && (<>
                <div style={{ height: 10 }} />
                <MfLabel>ΜΗΧΑΝΗΜΑ ΒΙΒΛΙΟΔΕΣΙΑΣ</MfLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
                  {binders
                    .filter(b => b.subtype === (finish.binding === 'glue' ? 'glue_bind' : finish.binding))
                    .filter(b => {
                      // For staple machines, filter by staple_mode (saddle/flat/both) vs job context
                      if (b.subtype !== 'staple') return true;
                      const sSpecs = (b.specs as Record<string, unknown>) || {};
                      const sMode = String(sSpecs.staple_mode || 'both');
                      if (sMode === 'both') return true;
                      const isBooklet = impoMode === 'booklet';
                      if (isBooklet && sMode === 'saddle') return true;
                      if (!isBooklet && sMode === 'flat') return true;
                      return false;
                    })
                    .map((b) => (
                      <Pill key={b.id} active={finish.bindingMachineId === b.id} onClick={() => setFinish({ ...finish, bindingMachineId: b.id })} color="var(--amber)">{b.name}</Pill>
                    ))}
                </div>
                {/* Staple/glue thickness warning */}
                {finish.binding !== 'none' && finish.bindingMachineId && (() => {
                  const selected = binders.find(b => b.id === finish.bindingMachineId);
                  if (!selected) return null;
                  const bSpecs = (selected.specs as Record<string, unknown>) || {};
                  const isBooklet = impoMode === 'booklet';
                  const pages = isBooklet ? (Number(job.pages) || 0) : (Number(job.bodyPages) || 0);
                  const sheetsPerPad = Number(job.sheetsPerPad) || 0;
                  const thicknessMm = pbPaperThickness || 0;
                  let warnMsg: string | null = null;
                  if (selected.subtype === 'staple') {
                    const mode = String(bSpecs.staple_mode || 'both');
                    if ((mode === 'saddle' || mode === 'both') && isBooklet) {
                      const spine = (pages / 4) * thicknessMm;
                      const maxSpine = Number(bSpecs.max_spine_mm) || 0;
                      if (maxSpine > 0 && spine > maxSpine) {
                        warnMsg = `Εκτιμώμενη ράχη ${spine.toFixed(1)}mm — πάνω από το max (${maxSpine}mm)`;
                      }
                    }
                    if (!warnMsg && (mode === 'flat' || mode === 'both') && !isBooklet && sheetsPerPad > 0) {
                      const stack = sheetsPerPad * thicknessMm;
                      const maxStack = Number(bSpecs.max_stack_mm) || 0;
                      if (maxStack > 0 && stack > maxStack) {
                        warnMsg = `Εκτιμώμενη στοίβα ${stack.toFixed(1)}mm — πάνω από το max (${maxStack}mm)`;
                      }
                    }
                  } else if (selected.subtype === 'glue_bind') {
                    const spine = (pages / 2) * thicknessMm;
                    const maxSpine = Number(bSpecs.max_spine) || 0;
                    if (maxSpine > 0 && spine > maxSpine) {
                      warnMsg = `Εκτιμώμενη ράχη ${spine.toFixed(1)}mm — πάνω από το max (${maxSpine}mm)`;
                    }
                  }
                  if (!warnMsg) return null;
                  return (
                    <div style={{
                      padding: '6px 10px', borderRadius: 6, marginBottom: 10,
                      background: 'rgba(251,146,60,0.10)',
                      border: '1px solid rgba(251,146,60,0.35)',
                      color: '#fdba74', fontSize: '0.7rem',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <i className="fas fa-triangle-exclamation" style={{ color: '#fb923c' }} />
                      {warnMsg}
                    </div>
                  );
                })()}
              </>)}
              {customMachines.length > 0 && (<>
                <MfLabel>ΑΛΛΗ ΜΕΤΕΚΤΥΠΩΣΗ</MfLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
                  {customMachines.map((cm) => {
                    const isSelected = finish.customMachineIds.includes(cm.id);
                    return (
                      <Pill
                        key={cm.id}
                        active={isSelected}
                        onClick={() => {
                          const next = isSelected
                            ? finish.customMachineIds.filter(id => id !== cm.id)
                            : [...finish.customMachineIds, cm.id];
                          setFinish({ ...finish, customMachineIds: next });
                        }}
                        color="#64748b"
                      >
                        {cm.name}
                      </Pill>
                    );
                  })}
                </div>
                <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
                  Πολλαπλή επιλογή — οι χρεώσεις αθροίζονται.
                </p>
              </>)}
            </>)}

            {/* ── MODE SETTINGS PANEL ── */}
            {activePanel === 'mode-settings' && (<>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <button onClick={() => setActivePanel('job')} style={{
                  border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.72rem', padding: 0,
                }}>
                  <i className="fas fa-arrow-left" />
                </button>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--impo)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="fas fa-cog" style={{ fontSize: '0.62rem' }} />
                  {IMPO_MODES.find(m => m.key === impoMode)?.label}
                </span>
              </div>

              {/* Sub-tabs */}
              <div style={{ display: 'flex', gap: 2, marginBottom: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 7, padding: 2 }}>
                {([
                  { k: 'spacing' as const, l: 'Αποστάσεις', i: 'fas fa-arrows-alt-h' },
                  { k: 'marks' as const, l: 'Σημάδια', i: 'fas fa-crop-alt' },
                ]).map(t => (
                  <button key={t.k} onClick={() => setImpoModeTab(t.k)} style={{
                    flex: 1, padding: '5px 0', borderRadius: 5, border: 'none', cursor: 'pointer',
                    background: impoModeTab === t.k ? 'rgba(132,204,22,0.12)' : 'transparent',
                    color: impoModeTab === t.k ? 'var(--impo)' : '#64748b',
                    fontSize: '0.6rem', fontWeight: 600, fontFamily: 'inherit',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  }}>
                    <i className={t.i} style={{ fontSize: '0.58rem' }} />
                    {t.l}
                  </button>
                ))}
              </div>

              {/* Tab: Αποστάσεις (Spacing) */}
              {impoModeTab === 'spacing' && (<>
                {impoMode !== 'workturn' && impoMode !== 'booklet' && impoMode !== 'perfect_bound' && impoMode !== 'stepmulti' && (
                  <div style={{ marginBottom: 10 }}>
                    <MfLabel>ΕΝΑΛΛΑΓΗ ΣΕΙΡΩΝ</MfLabel>
                    <ToggleBar value={impoDuplexOrient} onChange={v => setImpoDuplexOrient(v as 'h2h' | 'h2f')}
                      options={[{ v: 'h2h', l: 'Head-Head' }, { v: 'h2f', l: 'Head-Foot' }]} color="var(--impo)" />
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <MfLabel>ΚΛΙΜΑΚΑ (%)</MfLabel>
                    <MfStepper value={impoContentScale} onChange={v => setImpoContentScale(Math.max(10, Math.min(200, Number(v) || 100)))} step={1} min={10} max={200} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                    {impoContentScale !== 100 && (
                      <button onClick={() => setImpoContentScale(100)} style={{
                        border: '1px solid rgba(245,130,32,0.3)', background: 'rgba(245,130,32,0.1)',
                        color: 'var(--impo)', fontSize: '0.6rem', fontWeight: 600, borderRadius: 4,
                        padding: '3px 8px', cursor: 'pointer',
                      }}>Reset 100%</button>
                    )}
                  </div>
                </div>

                {/* Cut & Stack */}
                {impoMode === 'cutstack' && (<>
                  <div style={{ marginBottom: 10 }}>
                    <MfLabel>ΣΕΙΡΑ ΣΤΟΙΒΑΣ</MfLabel>
                    <ToggleBar value={csStackOrder} onChange={v => setCsStackOrder(v as 'row' | 'column' | 'snake')}
                      options={[{ v: 'row', l: 'Row' }, { v: 'column', l: 'Column' }, { v: 'snake', l: 'Snake' }]} color="var(--impo)" />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <MfLabel>ΑΡΧΗ ΑΡΙΘΜΗΣΗΣ</MfLabel>
                    <MfStepper value={csStartNum} onChange={v => setCsStartNum(Math.max(1, Number(v) || 1))} step={1} min={1} />
                  </div>
                  {/* Stack positions info */}
                  {impo.stackPositions && (
                    <div style={{ fontSize: '0.55rem', color: '#64748b', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: '3px 8px' }}>
                      {impo.stackPositions.map(p => (
                        <span key={p.posLabel} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          <strong style={{ color: '#94a3b8' }}>#{p.posLabel}</strong> {p.seqFrom}-{p.seqTo}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* ── Numbering ── */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 10 }}>
                    <button onClick={() => setCsNumbering(!csNumbering)} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', width: '100%',
                      borderRadius: 7, border: `1px solid ${csNumbering ? 'var(--impo)' : 'var(--border)'}`,
                      background: csNumbering ? 'rgba(132,204,22,0.06)' : 'transparent',
                      color: csNumbering ? 'var(--impo)' : '#64748b',
                      fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      <i className="fas fa-hashtag" style={{ fontSize: '0.58rem' }} /> Αρίθμηση
                      <span style={{ marginLeft: 'auto', fontSize: '0.58rem' }}>{csNumbering ? 'ON' : 'OFF'}</span>
                    </button>
                    {csNumbering && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <MfLabel>PREFIX</MfLabel>
                            <MfInput value={csNumPrefix} onChange={v => setCsNumPrefix(v)} style={{ width: '100%', textAlign: 'center' }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <MfLabel>ΨΗΦΙΑ</MfLabel>
                            <MfStepper value={csNumDigits} onChange={v => setCsNumDigits(Math.max(1, Math.min(8, Number(v) || 4)))} step={1} min={1} max={8} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <MfLabel>ΜΕΓΕΘΟΣ (PT)</MfLabel>
                            <MfStepper value={csNumFontSize} onChange={v => setCsNumFontSize(Math.max(4, Number(v) || 8))} step={1} min={4} max={72} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <MfLabel>ΣΤΡΟΦΗ</MfLabel>
                            <MfStepper value={csNumRotation} onChange={v => setCsNumRotation(Number(v) || 0)} step={90} min={0} max={270} />
                          </div>
                        </div>
                        <div>
                          <MfLabel>ΓΡΑΜΜΑΤΟΣΕΙΡΑ</MfLabel>
                          <ToggleBar value={csNumFont} onChange={v => setCsNumFont(v as 'Helvetica' | 'Courier')}
                            options={[{ v: 'Helvetica', l: 'Helvetica' }, { v: 'Courier', l: 'Courier' }]} color="var(--impo)" />
                        </div>
                        <div>
                          <MfLabel>ΧΡΩΜΑ</MfLabel>
                          <ToggleBar value={csNumColor} onChange={v => setCsNumColor(v as 'black' | 'red')}
                            options={[{ v: 'black', l: 'Μαύρο' }, { v: 'red', l: 'Κόκκινο' }]} color="var(--impo)" />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <MfLabel>ΘΕΣΗ X</MfLabel>
                            <MfStepper value={csNumPosX} onChange={v => setCsNumPosX(Math.max(0, Math.min(1, Number(v) || 0.5)))} step={0.05} min={0} max={1} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <MfLabel>ΘΕΣΗ Y</MfLabel>
                            <MfStepper value={csNumPosY} onChange={v => setCsNumPosY(Math.max(0, Math.min(1, Number(v) || 0.95)))} step={0.05} min={0} max={1} />
                          </div>
                        </div>
                        <div style={{ fontSize: '0.5rem', color: '#475569' }}>
                          <i className="fas fa-info-circle" style={{ marginRight: 3 }} />
                          X/Y: 0=αριστερά/κάτω, 1=δεξιά/πάνω
                        </div>

                        {/* Extra numbering positions */}
                        {csExtraNum.map((ex, ei) => (
                          <div key={ei} style={{ marginTop: 8, padding: '8px 8px 6px', borderRadius: 6, border: '1px solid rgba(132,204,22,0.15)', background: 'rgba(132,204,22,0.03)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--impo)', flex: 1 }}>EXTRA #{ei + 2}</span>
                              <button onClick={() => setCsExtraNum(prev => prev.filter((_, i) => i !== ei))} style={{
                                border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.55rem',
                              }}><i className="fas fa-times" /></button>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <div style={{ flex: 1 }}>
                                <MfLabel>X</MfLabel>
                                <MfStepper value={ex.posX} onChange={v => setCsExtraNum(prev => prev.map((e, i) => i === ei ? { ...e, posX: Math.max(0, Math.min(1, Number(v) || 0.5)) } : e))} step={0.05} min={0} max={1} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <MfLabel>Y</MfLabel>
                                <MfStepper value={ex.posY} onChange={v => setCsExtraNum(prev => prev.map((e, i) => i === ei ? { ...e, posY: Math.max(0, Math.min(1, Number(v) || 0.5)) } : e))} step={0.05} min={0} max={1} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <MfLabel>Pt</MfLabel>
                                <MfStepper value={ex.fontSize} onChange={v => setCsExtraNum(prev => prev.map((e, i) => i === ei ? { ...e, fontSize: Number(v) || 8 } : e))} step={1} min={4} max={72} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <MfLabel>Rot</MfLabel>
                                <MfStepper value={ex.rotation} onChange={v => setCsExtraNum(prev => prev.map((e, i) => i === ei ? { ...e, rotation: Number(v) || 0 } : e))} step={90} min={0} max={270} />
                              </div>
                            </div>
                          </div>
                        ))}
                        <button onClick={() => setCsExtraNum(prev => [...prev, { posX: 0.5, posY: 0.1, fontSize: csNumFontSize, rotation: 0 }])} style={{
                          width: '100%', padding: '5px 0', borderRadius: 5, marginTop: 6,
                          border: '1px dashed rgba(132,204,22,0.3)', background: 'transparent',
                          color: 'var(--impo)', fontSize: '0.6rem', fontWeight: 600, cursor: 'pointer',
                        }}><i className="fas fa-plus" style={{ marginRight: 4, fontSize: '0.5rem' }} />Extra αρίθμηση</button>
                      </div>
                    )}
                  </div>

                  {/* ── Fixed Back ── */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 10 }}>
                    <button onClick={() => setCsFixedBack(!csFixedBack)} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', width: '100%',
                      borderRadius: 7, border: `1px solid ${csFixedBack ? 'var(--impo)' : 'var(--border)'}`,
                      background: csFixedBack ? 'rgba(132,204,22,0.06)' : 'transparent',
                      color: csFixedBack ? 'var(--impo)' : '#64748b',
                      fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      <i className="fas fa-clone" style={{ fontSize: '0.58rem' }} /> Πίσω Όψη (Fixed)
                      <span style={{ marginLeft: 'auto', fontSize: '0.58rem' }}>{csFixedBack ? 'ON' : 'OFF'}</span>
                    </button>
                    {csFixedBack && (
                      <div style={{ marginTop: 8 }}>
                        <BackPdfPicker linkedFile={linkedFile} csBackPdf={csBackPdf} setCsBackPdf={setCsBackPdf} />
                        {csBackPdf && (
                          <button onClick={() => setCsBackPdf(null)} style={{
                            marginTop: 4, border: 'none', background: 'none', color: '#64748b',
                            fontSize: '0.55rem', cursor: 'pointer', padding: '2px 0',
                          }}>
                            <i className="fas fa-times" style={{ marginRight: 3 }} />Αφαίρεση
                          </button>
                        )}
                        <div style={{ fontSize: '0.5rem', color: '#475569', marginTop: 4 }}>
                          <i className="fas fa-info-circle" style={{ marginRight: 3 }} />
                          {csBackPdf ? 'Σελ. 1 του PDF σε κάθε cell' : 'Χωρίς PDF: χρήση τελευταίας σελίδας του κύριου PDF'}
                        </div>
                      </div>
                    )}
                  </div>
                </>)}

                {/* Gang Run */}
                {impoMode === 'gangrun' && (<>
                  <div style={{ marginBottom: 10 }}>
                    {(() => {
                      const withPdf = gangJobs.filter(gj => gj.pdf).length;
                      return (
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
                          <MfLabel>ΔΟΥΛΕΙΕΣ</MfLabel>
                          <span style={{ fontSize: '0.55rem', color: '#64748b', fontWeight: 500 }}>
                            {withPdf}/{gangJobs.length} με PDF
                          </span>
                        </div>
                      );
                    })()}
                    {/* Column legend */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '0 8px 4px', fontSize: '0.5rem', color: '#475569', fontWeight: 500,
                    }}>
                      <span style={{ width: 16, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>Τίτλος δουλειάς</span>
                      <span style={{ width: 50, textAlign: 'center', flexShrink: 0 }}>Αντίτυπα</span>
                      {gangJobs.length > 1 && <span style={{ width: 14, flexShrink: 0 }} />}
                    </div>
                    {gangJobs.map((gj, i) => {
                      const jobColor = ['var(--accent)', 'var(--blue)', 'var(--teal)', '#a78bfa', '#f472b6', '#facc15'][i % 6];
                      return (
                      <div key={gj.id} style={{
                        marginBottom: 4, borderRadius: 6,
                        background: `color-mix(in srgb, ${jobColor} 10%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${jobColor} 25%, transparent)`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px' }}>
                          <span style={{
                            width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                            background: jobColor,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.55rem', fontWeight: 800, color: '#fff',
                          }}>{i + 1}</span>
                          <input
                            value={gj.label}
                            onChange={e => setGangJobs(prev => prev.map((j, idx) => idx === i ? { ...j, label: e.target.value } : j))}
                            style={{
                              flex: 1, border: 'none', background: 'transparent', color: 'var(--text)',
                              fontSize: '0.75rem', fontWeight: 600, outline: 'none', fontFamily: 'inherit', minWidth: 0,
                            }}
                            placeholder={`Δουλειά ${i + 1}`}
                          />
                          <input
                            type="number"
                            value={gj.qty}
                            title="Αντίτυπα — πόσες φορές χρειάζεται να τυπωθεί αυτή η δουλειά"
                            onChange={e => setGangJobs(prev => prev.map((j, idx) => idx === i ? { ...j, qty: Math.max(1, Number(e.target.value) || 1) } : j))}
                            style={{
                              width: 50, border: '1px solid var(--border)', borderRadius: 4,
                              background: 'rgba(255,255,255,0.04)', color: 'var(--text)',
                              fontSize: '0.75rem', fontWeight: 700, textAlign: 'center',
                              outline: 'none', fontFamily: 'inherit', padding: '2px 4px',
                            }}
                          />
                          {gangJobs.length > 1 && (
                            <button onClick={() => {
                              setGangJobs(prev => prev.filter((_, idx) => idx !== i));
                              setGangCellAssign(prev => {
                                const next: Record<number, number> = {};
                                for (const [k, v] of Object.entries(prev)) {
                                  if (v < i) next[Number(k)] = v;
                                  else if (v > i) next[Number(k)] = v - 1;
                                }
                                return next;
                              });
                            }} style={{
                              border: 'none', background: 'transparent', color: '#64748b',
                              cursor: 'pointer', fontSize: '0.6rem', padding: '2px',
                            }}>
                              <i className="fas fa-times" />
                            </button>
                          )}
                        </div>
                        {/* Per-job PDF upload */}
                        <div style={{ padding: '0 8px 5px', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <label style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
                            background: gj.pdf ? `color-mix(in srgb, ${jobColor} 18%, transparent)` : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${gj.pdf ? jobColor : 'var(--border)'}`,
                            color: gj.pdf ? jobColor : '#64748b',
                            fontSize: '0.55rem', fontWeight: 600, fontFamily: 'inherit',
                          }}>
                            <i className={`fas ${gj.pdf ? 'fa-file-pdf' : 'fa-upload'}`} style={{ fontSize: '0.5rem' }} />
                            {gj.pdf ? gj.pdf.fileName.slice(0, 20) : 'PDF'}
                            <input type="file" accept=".pdf" hidden onChange={async e => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              const parsed = await parsePDF(f);
                              setGangJobs(prev => prev.map((j, idx) => idx === i ? { ...j, pdf: parsed } : j));
                              e.target.value = '';
                            }} />
                          </label>
                          {gj.pdf && (
                            <button onClick={() => setGangJobs(prev => prev.map((j, idx) => idx === i ? { ...j, pdf: undefined } : j))}
                              style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.5rem', padding: '2px' }}>
                              <i className="fas fa-times" />
                            </button>
                          )}
                          {/* Picker (brush): ενεργοποιείται και τότε κλικ στα cells τα βάφει με αυτή τη δουλειά */}
                          <button
                            onClick={() => setGangBrushJob(prev => prev === i ? null : i)}
                            title={gangBrushJob === i
                              ? 'Ενεργός picker — κλικ στα cells για να τα βάλεις σε αυτή τη δουλειά · ξανακλικ εδώ για απενεργοποίηση'
                              : 'Picker — κλικ, μετά κλικ στα cells για να τα βάλεις σε αυτή τη δουλειά'}
                            style={{
                              marginLeft: 'auto',
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              padding: '2px 7px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
                              background: gangBrushJob === i ? jobColor : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${gangBrushJob === i ? jobColor : 'var(--border)'}`,
                              color: gangBrushJob === i ? '#fff' : jobColor,
                              fontSize: '0.55rem', fontWeight: 700,
                              boxShadow: gangBrushJob === i ? `0 0 0 2px color-mix(in srgb, ${jobColor} 30%, transparent)` : 'none',
                            }}
                          >
                            <i className="fas fa-hand-pointer" style={{ fontSize: '0.5rem' }} />
                            {gangBrushJob === i ? 'Ενεργό' : 'Picker'}
                          </button>
                        </div>
                      </div>
                      );
                    })}
                    <button onClick={() => setGangJobs(prev => [...prev, { id: crypto.randomUUID(), label: `Δουλειά ${prev.length + 1}`, qty: 1 }])}
                      style={{
                        width: '100%', padding: '5px 0', borderRadius: 6,
                        border: '1px dashed var(--border)', background: 'transparent',
                        color: 'var(--teal)', fontSize: '0.68rem', fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit', marginTop: 2,
                      }}>
                      <i className="fas fa-plus" style={{ marginRight: 4, fontSize: '0.5rem' }} />Προσθήκη δουλειάς
                    </button>
                  </div>

                  {/* Cell assignments — mini sheet layout */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <MfLabel>ΑΝΑΘΕΣΗ CELLS ({ups}-up)</MfLabel>
                      {gangBrushJob !== null && (
                        <button
                          onClick={() => setGangBrushJob(null)}
                          style={{
                            fontSize: '0.55rem', fontWeight: 600, padding: '2px 6px',
                            borderRadius: 4, border: '1px solid var(--border)',
                            background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)',
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                          title="Απενεργοποίηση βαψίματος (επιστροφή σε cycle mode)"
                        >
                          <i className="fas fa-times" style={{ marginRight: 3 }} />Έξοδος brush
                        </button>
                      )}
                    </div>
                    {(() => {
                      const gCols = impo.cols || 1;
                      const gRows = impo.rows || 1;
                      const cellAspect = job.width && job.height ? job.width / job.height : 1;
                      const maxGridW = 220;
                      const cellW = Math.min(Math.floor((maxGridW - (gCols - 1) * 3) / gCols), 52);
                      const cellH = Math.round(cellW / cellAspect);
                      const colors = ['var(--accent)', 'var(--blue)', 'var(--teal)', '#a78bfa', '#f472b6', '#facc15'];
                      return (
                        <div style={{
                          display: 'inline-block', padding: 6, borderRadius: 6,
                          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                        }}>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${gCols}, ${cellW}px)`,
                            gridTemplateRows: `repeat(${gRows}, ${cellH}px)`,
                            gap: 3,
                          }}>
                            {Array.from({ length: gRows }, (_, row) =>
                              Array.from({ length: gCols }, (_, col) => {
                                const cellIdx = row * gCols + col;
                                if (cellIdx >= ups) return <div key={`${row}-${col}`} />;
                                const jobIdx = gangCellAssign[cellIdx] ?? 0;
                                const color = colors[jobIdx % colors.length];
                                const cellJob = gangJobs[jobIdx];
                                const hasPdf = !!cellJob?.pdf;
                                const brushActive = gangBrushJob !== null;
                                const brushColor = brushActive ? colors[gangBrushJob % colors.length] : null;
                                const handleCellClick = () => {
                                  setGangCellAssign(prev => {
                                    if (brushActive) return { ...prev, [cellIdx]: gangBrushJob };
                                    return { ...prev, [cellIdx]: (jobIdx + 1) % gangJobs.length };
                                  });
                                };
                                return (
                                  <button key={`${row}-${col}`}
                                    onClick={handleCellClick}
                                    style={{
                                      width: cellW, height: cellH, borderRadius: 3,
                                      border: hasPdf ? `2px solid ${color}` : `2px dashed ${color}`,
                                      background: `color-mix(in srgb, ${color} ${hasPdf ? 18 : 8}%, transparent)`,
                                      color, fontSize: '0.6rem', fontWeight: 800,
                                      cursor: brushActive ? 'crosshair' : 'pointer',
                                      fontFamily: 'inherit',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      padding: 0, position: 'relative',
                                    }}
                                    onMouseEnter={e => {
                                      if (brushActive && brushColor) {
                                        e.currentTarget.style.outline = `2px solid ${brushColor}`;
                                        e.currentTarget.style.outlineOffset = '1px';
                                      }
                                    }}
                                    onMouseLeave={e => { e.currentTarget.style.outline = 'none'; }}
                                    title={brushActive
                                      ? `Κλικ για να βάλεις "${gangJobs[gangBrushJob!]?.label || '?'}" στο cell ${cellIdx + 1}`
                                      : `Cell ${cellIdx + 1}: ${cellJob?.label || '?'} ${hasPdf ? '· έχει PDF' : '· χωρίς PDF'} — κλικ για αλλαγή δουλειάς`}
                                  >
                                    {jobIdx + 1}
                                    {hasPdf && (
                                      <span style={{
                                        position: 'absolute', top: 1, right: 2,
                                        fontSize: '0.42rem', color, opacity: 0.9,
                                      }}>
                                        <i className="fas fa-file-pdf" />
                                      </span>
                                    )}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    <div style={{ fontSize: '0.5rem', color: gangBrushJob !== null ? 'var(--accent)' : '#475569', marginTop: 4, fontWeight: gangBrushJob !== null ? 600 : 400 }}>
                      <i className={`fas ${gangBrushJob !== null ? 'fa-hand-pointer' : 'fa-info-circle'}`} style={{ marginRight: 3 }} />
                      {gangBrushJob !== null
                        ? `Picker ενεργός: κλικ σε cells για "${gangJobs[gangBrushJob]?.label || '?'}"`
                        : 'Πάτησε Picker σε μια δουλειά, μετά κλικ στα cells · ή απλό κλικ σε cell για εναλλαγή'}
                    </div>
                  </div>

                  {/* Gang summary */}
                  {impo.gangData && (
                    <div style={{
                      padding: '8px 10px', borderRadius: 6, marginBottom: 10,
                      background: 'color-mix(in srgb, var(--teal) 6%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--teal) 20%, transparent)',
                      fontSize: '0.62rem', color: '#94a3b8',
                    }}>
                      <div style={{ fontWeight: 700, color: 'var(--teal)', marginBottom: 4 }}>Σύνοψη Gang Run</div>
                      {gangJobs.map((gj, i) => {
                        // Count cells: all positions default to job 0 when unassigned.
                        let cellCount = 0;
                        for (let k = 0; k < ups; k++) {
                          if ((gangCellAssign[k] ?? 0) === i) cellCount++;
                        }
                        // Each sheet prints `cellCount` copies of this job; need ceil(qty / cellCount) sheets.
                        const sheetsForJob = cellCount > 0 ? Math.ceil(gj.qty / cellCount) : 0;
                        return (
                          <div key={gj.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span>
                              {gj.label}
                              {!gj.pdf && <span style={{ color: '#f87171', marginLeft: 4, fontSize: '0.55rem' }} title="Δεν έχει ανέβει PDF"><i className="fas fa-exclamation-triangle" /></span>}
                            </span>
                            <span style={{ fontWeight: 600 }}>{cellCount} cells · {gj.qty} αντίτυπα → {sheetsForJob} φύλλα</span>
                          </div>
                        );
                      })}
                      <div style={{ borderTop: '1px solid color-mix(in srgb, var(--teal) 20%, transparent)', paddingTop: 4, marginTop: 4, fontWeight: 700, color: 'var(--teal)' }}>
                        Σύνολο: {impo.gangData.gangSheetsNeeded} φύλλα
                      </div>
                    </div>
                  )}
                </>)}

                {/* Step Multi */}
                {impoMode === 'stepmulti' && (<>
                  <div style={{ marginBottom: 10 }}>
                    <MfLabel>BLOCKS</MfLabel>
                    {smBlocks.map((blk, i) => {
                      const blkColor = ['var(--accent)', 'var(--blue)', 'var(--teal)', '#a78bfa', '#f472b6', '#facc15'][i % 6];
                      const computed = impo.blocks?.[i];
                      return (
                        <div key={i} style={{
                          marginBottom: 4, borderRadius: 6, padding: '5px 8px',
                          background: `color-mix(in srgb, ${blkColor} 10%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${blkColor} 25%, transparent)`,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{
                              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                              background: blkColor,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.5rem', fontWeight: 800, color: '#fff',
                            }}>{i + 1}</span>
                            {/* PDF upload */}
                            <label style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              padding: '2px 5px', borderRadius: 4, cursor: 'pointer', flexShrink: 0,
                              background: smBlockPdfs[i] ? `color-mix(in srgb, ${blkColor} 18%, transparent)` : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${smBlockPdfs[i] ? blkColor : 'var(--border)'}`,
                              color: smBlockPdfs[i] ? blkColor : '#64748b',
                              fontSize: '0.5rem', fontWeight: 600, fontFamily: 'inherit',
                            }}>
                              <i className={`fas ${smBlockPdfs[i] ? 'fa-file-pdf' : 'fa-upload'}`} style={{ fontSize: '0.45rem' }} />
                              {smBlockPdfs[i] ? smBlockPdfs[i]!.fileName.slice(0, 14) : 'PDF'}
                              <input type="file" accept=".pdf" hidden onChange={async e => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                const parsed = await parsePDF(f);
                                setSmBlockPdfs(prev => { const next = [...prev]; next[i] = parsed; return next; });
                                if (parsed.pageSizes[0]) {
                                  const pg = parsed.pageSizes[0];
                                  setSmBlocks(prev => prev.map((b, idx) => idx === i ? {
                                    ...b, trimW: Math.round(pg.trimW * 10) / 10, trimH: Math.round(pg.trimH * 10) / 10,
                                    cols: 1, rows: 1, blockW: 0, blockH: 0, _manualGrid: true,
                                  } : b));
                                }
                                e.target.value = '';
                              }} />
                            </label>
                            {/* Trim size display */}
                            <span style={{ fontSize: '0.55rem', color: '#94a3b8', fontWeight: 600 }}>
                              {blk.trimW}×{blk.trimH}
                            </span>
                            {/* Computed ups + position */}
                            {computed && (
                              <span style={{ fontSize: '0.5rem', color: '#64748b' }}>
                                {computed.cols}×{computed.rows}={computed.cols * computed.rows}
                              </span>
                            )}
                            {computed && (computed.x > 0.1 || computed.y > 0.1) && (
                              <span style={{ fontSize: '0.45rem', color: '#475569' }}>
                                x:{computed.x.toFixed(1)} y:{computed.y.toFixed(1)}
                              </span>
                            )}
                            <div style={{ flex: 1 }} />
                            {/* Align */}
                            {computed && (<>
                              <button onClick={() => {
                                const pw = vizW - (machine?.marginLeft || 0) - (machine?.marginRight || 0);
                                const cx = (pw - computed.blockW) / 2;
                                setSmBlocks(prev => prev.map((b, idx) => idx === i ? { ...b, x: Math.round(cx * 10) / 10, blockW: 0, blockH: 0, _manualGrid: true } : b));
                              }} style={{
                                border: '1px solid var(--border)', background: 'transparent',
                                color: '#64748b', cursor: 'pointer', fontSize: '0.45rem', padding: '2px 3px', borderRadius: 3,
                              }} title="Center horizontal">
                                <i className="fas fa-arrows-alt-h" />
                              </button>
                              <button onClick={() => {
                                const ph = vizH - (machine?.marginTop || 0) - (machine?.marginBottom || 0);
                                const cy = (ph - computed.blockH) / 2;
                                setSmBlocks(prev => prev.map((b, idx) => idx === i ? { ...b, y: Math.round(cy * 10) / 10, blockW: 0, blockH: 0, _manualGrid: true } : b));
                              }} style={{
                                border: '1px solid var(--border)', background: 'transparent',
                                color: '#64748b', cursor: 'pointer', fontSize: '0.45rem', padding: '2px 3px', borderRadius: 3,
                              }} title="Center vertical">
                                <i className="fas fa-arrows-alt-v" />
                              </button>
                            </>)}
                            {/* Rotate */}
                            <button onClick={() => setSmBlocks(prev => prev.map((b, idx) => idx === i
                              ? { ...b, rotation: ((b.rotation + 90) % 360) as 0 | 90 | 180 | 270, cols: 1, rows: 1, blockW: 0, blockH: 0 }
                              : b
                            ))} style={{
                              border: `1px solid color-mix(in srgb, ${blkColor} 40%, transparent)`,
                              background: blk.rotation ? `color-mix(in srgb, ${blkColor} 15%, transparent)` : 'transparent',
                              color: blk.rotation ? blkColor : '#64748b',
                              cursor: 'pointer', fontSize: '0.5rem', padding: '2px 4px', borderRadius: 3,
                              fontFamily: 'inherit', fontWeight: 700,
                            }} title="Rotate 90°">
                              <i className="fas fa-redo" style={{ fontSize: '0.4rem' }} /> {blk.rotation}°
                            </button>
                            {/* Remove */}
                            {smBlocks.length > 1 && (
                              <button onClick={() => {
                                setSmBlocks(prev => prev.filter((_, idx) => idx !== i));
                                setSmBlockPdfs(prev => prev.filter((_, idx) => idx !== i));
                              }} style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.55rem', padding: '2px' }}>
                                <i className="fas fa-times" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <button onClick={() => setSmBlocks(prev => [...prev, {
                      pageNum: prev.length + 1, backPageNum: null,
                      trimW: prev[0]?.trimW || 90, trimH: prev[0]?.trimH || 55,
                      cols: 1, rows: 1, rotation: 0, x: 0, y: 0, blockW: 0, blockH: 0, _manualGrid: true,
                    }])}
                      style={{
                        width: '100%', padding: '5px 0', borderRadius: 6,
                        border: '1px dashed var(--border)', background: 'transparent',
                        color: 'var(--teal)', fontSize: '0.68rem', fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit', marginTop: 2,
                      }}>
                      <i className="fas fa-plus" style={{ marginRight: 4, fontSize: '0.5rem' }} />Προσθήκη block
                    </button>
                    <div style={{ fontSize: '0.48rem', color: '#475569', marginTop: 4 }}>
                      <i className="fas fa-info-circle" style={{ marginRight: 3 }} />
                      Drag handle στον canvas για αλλαγή grid
                    </div>
                  </div>

                  {/* Step Multi summary — mini layout */}
                  {impo.blocks && impo.blocks.length > 0 && (() => {
                    const areaW = vizW - (machine?.marginLeft || 0) - (machine?.marginRight || 0);
                    const areaH = vizH - (machine?.marginTop || 0) - (machine?.marginBottom || 0);
                    const miniW = 220;
                    const miniScale = miniW / areaW;
                    const miniH = areaH * miniScale;
                    const blkColors = ['var(--accent)', 'var(--blue)', 'var(--teal)', '#a78bfa', '#f472b6', '#facc15'];
                    return (
                      <div style={{ marginBottom: 10 }}>
                        <MfLabel>LAYOUT</MfLabel>
                        <div style={{
                          position: 'relative', width: miniW, height: miniH,
                          background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                          borderRadius: 6, overflow: 'hidden',
                        }}>
                          {impo.blocks.map((blk, i) => {
                            const bW = blk.blockW * miniScale;
                            const bH = blk.blockH * miniScale;
                            const bX = blk.x * miniScale;
                            const bY = blk.y * miniScale;
                            const color = blkColors[i % blkColors.length];
                            return (
                              <div key={i} style={{
                                position: 'absolute', left: bX, top: bY, width: bW, height: bH,
                                background: `color-mix(in srgb, ${color} 15%, transparent)`,
                                border: `1.5px solid ${color}`,
                                borderRadius: 3,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.55rem', fontWeight: 800, color,
                              }}>
                                {i + 1}
                                <span style={{ fontSize: '0.4rem', fontWeight: 500, marginLeft: 3, opacity: 0.7 }}>
                                  {blk.cols}×{blk.rows}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ fontSize: '0.5rem', color: '#475569', marginTop: 4 }}>
                          {impo.blocks.length} blocks · {impo.ups} ups · {impo.totalSheets} φύλλα
                        </div>
                      </div>
                    );
                  })()}
                </>)}

                {/* Booklet */}
                {impoMode === 'booklet' && (
                  <div style={{ marginBottom: 10 }}>
                    <MfLabel>ΣΕΛΙΔΕΣ (×4)</MfLabel>
                    <MfStepper value={job.pages ?? ''} onChange={v => setJob({ ...job, pages: Number(v) || undefined })} step={4} min={4} />
                    <div style={{ fontSize: '0.58rem', color: '#64748b', marginTop: 4 }}>
                      <i className="fas fa-info-circle" style={{ marginRight: 3 }} />Πολλαπλάσιο του 4
                    </div>
                  </div>
                )}

                {/* Perfect Bound */}
                {impoMode === 'perfect_bound' && (<>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <MfLabel>ΣΕΛΙΔΕΣ ΣΩΜΑΤΟΣ</MfLabel>
                      <MfStepper value={job.bodyPages || 64} onChange={v => setJob({ ...job, bodyPages: Math.max(4, Number(v) || 4) })} step={4} min={4} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <MfLabel>ΠΑΧΟΣ ΧΑΡΤΙΟΥ (MM)</MfLabel>
                      <MfStepper value={pbPaperThickness} onChange={v => setPbPaperThickness(Math.max(0.01, Number(v) || 0.1))} step={0.01} min={0.01} max={0.5} />
                    </div>
                  </div>
                  {/* PB info */}
                  {impo.numSigs && (
                    <div style={{ fontSize: '0.55rem', color: '#64748b', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: '3px 10px' }}>
                      <span><strong style={{ color: '#94a3b8' }}>{impo.numSigs}</strong> τυπογρ.</span>
                      <span><strong style={{ color: '#94a3b8' }}>{impo.sigSize || '?'}pp</strong> /τυπ.</span>
                      <span><strong style={{ color: '#94a3b8' }}>{impo.sigsAcross}×{impo.sigsDown}</strong> /φύλ.</span>
                      <span>ράχη <strong style={{ color: '#94a3b8' }}>{impo.spineWidth?.toFixed(1)}</strong>mm</span>
                      {(impo.totalPressSheets ?? 0) > 1 && <span><strong style={{ color: '#94a3b8' }}>{impo.totalPressSheets}</strong> press sheets</span>}
                    </div>
                  )}
                </>)}

                {/* Work&Turn */}
                {impoMode === 'workturn' && (
                  <div style={{ marginBottom: 10 }}>
                    <MfLabel>ΤΡΟΠΟΣ ΑΝΑΣΤΡΟΦΗΣ</MfLabel>
                    <ToggleBar value={impoTurnType} onChange={v => setImpoTurnType(v as 'turn' | 'tumble')} options={[{ v: 'turn', l: 'Work & Turn' }, { v: 'tumble', l: 'Work & Tumble' }]} color="var(--impo)" />
                  </div>
                )}
              </>)}

              {/* Position/Rotation removed — handled via canvas drag + click */}

              {/* Tab: Σημάδια (Marks) */}
              {impoModeTab === 'marks' && (<>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  <button onClick={() => setImpoCropMarks(!impoCropMarks)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                    borderRadius: 7, border: `1px solid ${impoCropMarks ? 'var(--impo)' : 'var(--border)'}`,
                    background: impoCropMarks ? 'rgba(132,204,22,0.06)' : 'transparent',
                    color: impoCropMarks ? 'var(--impo)' : '#64748b',
                    fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                  }}>
                    <i className="fas fa-crop-alt" style={{ fontSize: '0.58rem' }} /> Crop Marks
                    <span style={{ marginLeft: 'auto', fontSize: '0.58rem' }}>{impoCropMarks ? 'ON' : 'OFF'}</span>
                  </button>
                  <button onClick={() => setImpoKeepSourceMarks(!impoKeepSourceMarks)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                    borderRadius: 7, border: `1px solid ${impoKeepSourceMarks ? 'var(--impo)' : 'var(--border)'}`,
                    background: impoKeepSourceMarks ? 'rgba(132,204,22,0.06)' : 'transparent',
                    color: impoKeepSourceMarks ? 'var(--impo)' : '#64748b',
                    fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                  }}>
                    <i className="fas fa-file-alt" style={{ fontSize: '0.58rem' }} /> Σημεία αρχείου
                    <span style={{ marginLeft: 'auto', fontSize: '0.58rem' }}>{impoKeepSourceMarks ? 'ON' : 'OFF'}</span>
                  </button>
                </div>

                {/* Color Bar */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 10 }}>
                  <button onClick={() => setImpoColorBar(!impoColorBar)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                    borderRadius: 7, border: `1px solid ${impoColorBar ? 'var(--blue)' : 'var(--border)'}`,
                    background: impoColorBar ? 'rgba(59,130,246,0.06)' : 'transparent',
                    color: impoColorBar ? 'var(--blue)' : '#64748b',
                    fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%', marginBottom: 6,
                  }}>
                    <i className="fas fa-palette" style={{ fontSize: '0.58rem' }} /> Color Bar
                    <span style={{ marginLeft: 'auto', fontSize: '0.58rem' }}>{impoColorBar ? 'ON' : 'OFF'}</span>
                  </button>
                  {impoColorBar && (<>
                    <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                      <Pill active={impoColorBarType === 'cmyk'} onClick={() => setImpoColorBarType('cmyk')} color="var(--blue)">CMYK</Pill>
                      <Pill active={impoColorBarType === 'cmyk_tint50'} onClick={() => setImpoColorBarType('cmyk_tint50')} color="var(--blue)">CMYK+50%</Pill>
                    </div>
                    <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                      <Pill active={impoColorBarEdge === 'tail'} onClick={() => setImpoColorBarEdge('tail')} color="var(--blue)">Tail</Pill>
                      <Pill active={impoColorBarEdge === 'gripper'} onClick={() => setImpoColorBarEdge('gripper')} color="var(--blue)">Gripper</Pill>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <MfLabel>OFFSET Y (MM)</MfLabel>
                        <MfStepper value={impoColorBarOffY} onChange={v => setImpoColorBarOffY(Number(v) || 0)} step={0.5} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <MfLabel>SCALE %</MfLabel>
                        <MfStepper value={impoColorBarScale} onChange={v => setImpoColorBarScale(Math.max(10, Math.min(200, Number(v) || 100)))} step={10} />
                      </div>
                    </div>
                  </>)}
                </div>

                {/* Plate Slug (offset only) */}
                {machine?.cat === 'offset' && (<>
                  <button onClick={() => setImpoPlateSlug(!impoPlateSlug)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                    borderRadius: 7, border: `1px solid ${impoPlateSlug ? 'var(--violet)' : 'var(--border)'}`,
                    background: impoPlateSlug ? 'rgba(124,58,237,0.06)' : 'transparent',
                    color: impoPlateSlug ? 'var(--violet)' : '#64748b',
                    fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                  }}>
                    <i className="fas fa-tag" style={{ fontSize: '0.58rem' }} /> Plate Slug
                    <span style={{ marginLeft: 'auto', fontSize: '0.58rem' }}>{impoPlateSlug ? 'ON' : 'OFF'}</span>
                  </button>
                  {impoPlateSlug && (
                    <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
                      <Pill active={impoPlateSlugEdge === 'tail'} onClick={() => setImpoPlateSlugEdge('tail')} color="var(--violet)">Tail</Pill>
                      <Pill active={impoPlateSlugEdge === 'gripper'} onClick={() => setImpoPlateSlugEdge('gripper')} color="var(--violet)">Gripper</Pill>
                    </div>
                  )}
                </>)}
              </>)}
            </>)}
          </div>
        </div>

        {/* ═══ CENTER: Imposition ═══ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 10px', minWidth: 0 }}>

          {/* Imposition mode buttons + gear — TOP */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 6, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
            {IMPO_MODES.filter(m => (ARCHETYPE_MODES[job.archetype] || ARCHETYPE_MODES.single_leaf).includes(m.key)).map((m) => {
              const active = m.key === impoMode;
              return (
                <div key={m.key} style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
                  <button onClick={() => setImpoMode(m.key)} style={{
                    padding: '6px 14px', borderRadius: active ? '7px 0 0 7px' : 7, fontSize: '0.75rem', fontWeight: 600,
                    border: `1px solid ${active ? 'var(--impo)' : 'rgba(255,255,255,0.08)'}`,
                    borderRight: active ? 'none' : undefined,
                    background: active ? 'rgba(132,204,22,0.08)' : 'transparent',
                    color: active ? 'var(--impo)' : '#64748b',
                    cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
                  }}>{m.label}</button>
                  {active && (
                    <button onClick={() => togglePanel(activePanel === 'mode-settings' ? 'job' : 'mode-settings')} style={{
                      padding: '0 10px', borderRadius: '0 7px 7px 0', fontSize: '0.68rem',
                      border: 'none',
                      background: activePanel === 'mode-settings' ? 'var(--impo)' : 'rgba(132,204,22,0.25)',
                      color: activePanel === 'mode-settings' ? '#fff' : 'var(--impo)',
                      cursor: 'pointer', transition: 'all 0.2s',
                      display: 'flex', alignItems: 'center',
                    }} title="Ρυθμίσεις mode">
                      <i className="fas fa-cog" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Page/sheet navigator (all modes except W&T) */}
          {/* Gang run: show navigator whenever any job has a PDF OR job is duplex — so user can toggle A/B */}
          {impoMode !== 'workturn' && (pdf || impo.signatureMap || (impoMode === 'gangrun' && (job.sides === 2 || gangJobs.some(gj => gj.pdf)))) && (
            <DuplexNavigator
              impo={impo}
              activePage={activeSigSheet}
              showBack={sigShowBack}
              totalPdfPages={pdf?.pageCount ?? (impoMode === 'gangrun' ? (job.sides === 2 ? 2 : 1) : 0)}
              isDuplex={job.sides === 2}
              ups={impo.ups}
              onPageChange={setActiveSigSheet}
              onSideChange={setSigShowBack}
            />
          )}

          {/* Canvas + Dev panels */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 0 }}>
          {/* Canvas */}
          <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '100%', height: '100%', maxWidth: 900, position: 'relative' }}>
              <ImpositionCanvas
                impo={impo}
                sheetW={vizW}
                sheetH={vizH}
                marginTop={machine?.marginTop || 0}
                marginBottom={machine?.marginBottom || 0}
                marginLeft={machine?.marginLeft || 0}
                marginRight={machine?.marginRight || 0}
                bleed={effectiveBleed}
                gutter={engineGutter}
                cropMarks={impoCropMarks}
                machCat={machine?.cat as 'digital' | 'offset' | undefined}
                sides={job.sides}
                offsetX={impoOffsetX}
                offsetY={impoOffsetY}
                showColorBar={impoColorBar}
                colorBarEdge={impoColorBarEdge as 'tail' | 'gripper'}
                colorBarOffY={impoColorBarOffY}
                colorBarScale={impoColorBarScale}
                showPlateSlug={impoPlateSlug}
                plateSlugEdge={impoPlateSlugEdge}
                pdf={pdf}
                feedEdge={machine?.cat === 'offset' ? 'lef' : feedEdge}
                activeSigSheet={(pdf || impo.signatureMap || (impoMode === 'gangrun' && gangJobs.some(gj => gj.pdf))) ? activeSigSheet : undefined}
                sigShowBack={job.sides === 2 ? sigShowBack : undefined}
                csNumbering={impoMode === 'cutstack' && csNumbering ? {
                  prefix: csNumPrefix,
                  digits: csNumDigits,
                  startNum: csStartNum,
                  posX: csNumPosX,
                  posY: csNumPosY,
                  color: csNumColor === 'red' ? '#cc0000' : '#000000',
                  fontSize: csNumFontSize,
                  font: csNumFont,
                  rotation: csNumRotation,
                  extra: csExtraNum.length > 0 ? csExtraNum : undefined,
                } : undefined}
                gangJobPdfs={impoMode === 'gangrun' ? gangJobs.map(gj => gj.pdf) : undefined}
                gangCellAssign={impoMode === 'gangrun' ? gangCellAssign : undefined}
                smBlockPdfs={impoMode === 'stepmulti' ? smBlockPdfs : undefined}
                smBlocks={impoMode === 'stepmulti' ? smBlocks : undefined}
                onSmBlockUpdate={impoMode === 'stepmulti' ? (idx, cols, rows) => {
                  setSmBlocks(prev => prev.map((b, i) => i === idx ? { ...b, cols, rows, blockW: 0, blockH: 0, _manualGrid: true } : b));
                } : undefined}
                onSmBlockMove={impoMode === 'stepmulti' ? (idx, x, y) => {
                  setSmBlocks(prev => prev.map((b, i) => i === idx ? { ...b, x, y, blockW: 0, blockH: 0, _manualGrid: true } : b));
                } : undefined}
                onGridResize={(impoMode === 'nup' || impoMode === 'cutstack' || impoMode === 'gangrun' || impoMode === 'workturn') ? (cols, rows) => {
                  setImpoForceCols(cols);
                  setImpoForceRows(rows);
                } : undefined}
                onRotate={(impoMode === 'nup' || impoMode === 'cutstack' || impoMode === 'gangrun' || impoMode === 'workturn') ? () => {
                  setImpoRotation(prev => (prev + 90) % 360);
                  setImpoForceCols(1);
                  setImpoForceRows(1);
                } : undefined}
                onOffsetChange={(impoMode === 'nup' || impoMode === 'cutstack' || impoMode === 'gangrun' || impoMode === 'workturn') ? (x, y) => {
                  setImpoOffsetX(x);
                  setImpoOffsetY(y);
                } : undefined}
                contentScale={impoContentScale}
                onGutterChange={v => setImpoGutter(Math.max(0, v))}
                onBleedChange={v => setImpoBleedOverride(v)}
              />
              {/* PDF info chip (top-left) — shown when a linked PDF is loaded */}
              {pdf && (
                <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', gap: 4, alignItems: 'center', zIndex: 2 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                    borderRadius: 5, border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)',
                    background: 'rgba(16,185,129,0.15)',
                    color: 'var(--success)', fontSize: '0.62rem', fontWeight: 600,
                  }}>
                    <i className={pdfLoading ? 'fas fa-spinner fa-spin' : 'fas fa-file-pdf'} style={{ fontSize: '0.58rem' }} />
                    {pdf.fileName.slice(0, 20)}
                  </div>
                  <span style={{ fontSize: '0.58rem', color: '#94a3b8', background: 'rgba(0,0,0,0.6)', padding: '2px 5px', borderRadius: 4 }}>
                    {pdf.pageCount}pg · {pdf.pageSizes[0]?.trimW}×{pdf.pageSizes[0]?.trimH}
                  </span>
                </div>
              )}
              {/* G/B toolbar (top-right) */}
              <div style={{
                position: 'absolute', top: 6, right: 6, display: 'flex', gap: 3, alignItems: 'center', zIndex: 2,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 2,
                  background: 'rgba(0,0,0,0.7)',
                  borderRadius: 5, padding: '2px 4px',
                }}>
                  <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#f58220' }}>Gutter</span>
                  <input
                    type="number" step="0.5" min="0"
                    value={impoGutter}
                    onChange={e => setImpoGutter(Math.max(0, parseFloat(e.target.value) || 0))}
                    style={{
                      width: 36, height: 18, fontSize: '0.6rem', fontWeight: 600, textAlign: 'center',
                      border: '1px solid rgba(245,130,32,0.3)', borderRadius: 3,
                      background: 'rgba(0,0,0,0.4)', color: '#f58220', outline: 'none', padding: 0,
                    }}
                  />
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 2,
                  background: 'rgba(0,0,0,0.7)',
                  borderRadius: 5, padding: '2px 4px',
                }}>
                  <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#ef4444' }}>Bleed</span>
                  <input
                    type="number" step="0.5" min="0"
                    value={effectiveBleed}
                    onChange={e => setImpoBleedOverride(Math.max(0, parseFloat(e.target.value) || 0))}
                    style={{
                      width: 36, height: 18, fontSize: '0.6rem', fontWeight: 600, textAlign: 'center',
                      border: '1px solid rgba(239,68,68,0.3)', borderRadius: 3,
                      background: 'rgba(0,0,0,0.4)', color: '#ef4444', outline: 'none', padding: 0,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* DEV PANELS removed — now in fixed right sidebar */}
          </div>

        </div>

      </div>

      {/* ═══ DEV PANELS (portalled outside app, fixed right sidebar) ═══ */}
      {/* Floating toggle button — always visible when calc result exists */}
      {calcResult && createPortal(
        <button
          onClick={() => setDevPanelHidden(h => !h)}
          title={devPanelHidden ? 'Εμφάνιση κοστολόγησης' : 'Απόκρυψη κοστολόγησης'}
          style={{
            position: 'fixed', top: 12,
            right: devPanelHidden ? 12 : 290,
            width: 34, height: 34, borderRadius: 8,
            background: devPanelHidden ? 'var(--accent)' : 'rgba(12,18,36,0.95)',
            border: '1px solid var(--border)',
            color: devPanelHidden ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer', fontSize: '0.85rem', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: devPanelHidden ? '0 4px 12px rgba(245,130,32,0.35)' : '0 2px 8px rgba(0,0,0,0.4)',
            transition: 'right 0.2s ease, background 0.2s ease',
          }}
        >
          <i className={`fas ${devPanelHidden ? 'fa-coins' : 'fa-times'}`} />
        </button>,
        document.body
      )}
      {calcResult && !devPanelHidden && (() => {
            const bd = (calcResult.printDetail?.costBreakdown ?? {}) as Record<string, unknown>;
            const chargePaper = Number(bd.chargePaper) || 0;
            const chargePrint = Number(bd.chargePrint) || 0;
            const paperProfit = chargePaper - calcResult.costPaper;
            const printProfit = chargePrint - calcResult.costPrint;
            const guillProfit = calcResult.chargeGuillotine - calcResult.costGuillotine;
            const lamProfit = calcResult.chargeLamination - calcResult.costLamination;
            const bindProfit = (Number(bd.chargeBinding) || 0) - calcResult.costBinding;
            return createPortal(
            <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 280, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', background: 'rgb(12, 18, 36)', borderLeft: '1px solid var(--border)', zIndex: 9999 }}>
              {/* COST BREAKDOWN */}
              <DevPanel title="ΚΟΣΤΟΣ" color="#f87171">
                <DevRow label="Χαρτί" sub={`${calcResult.totalStockSheets} φύλ × €${Number(bd.paperCostPerUnit ?? 0).toFixed(3)}`} value={calcResult.costPaper} />
                <DevDivider />
                <DevRow label="Εκτύπωση" sub={calcResult.printModel} value={calcResult.costPrint} />
                {(() => {
                  const pb = bd.printBreakdown as Record<string, unknown> | null;
                  if (!pb) return null;
                  if (calcResult.printModel === 'offset') {
                    const p = pb as Record<string, Record<string, number>>;
                    return (<>
                      {p.plates?.total > 0 && <DevRow label={`Πλάκες (${p.plates.colors} × €${p.plates.cost?.toFixed(2)})`} value={p.plates.total} indent />}
                      {p.ink?.total > 0 && <DevRow label={`Μελάνι (€${p.ink.priceKg}/kg · ${p.ink.coverage})`} value={p.ink.total} indent />}
                      {p.blanket?.total > 0 && <DevRow label={`Τσόχα (${p.blanket.passes} passes × ${p.blanket.life} life)`} value={p.blanket.total} indent />}
                      {p.rollers?.total > 0 && <DevRow label="Ράουλα" value={p.rollers.total} indent />}
                      {p.chemicals?.total > 0 && (<>
                        <DevRow label="Χημικά" value={p.chemicals.total} indent />
                        {p.chemicals.wash > 0 && <DevRow label={`  Wash (${p.chemicals.washPasses}× · ink €${p.chemicals.inkCleanerCpl}/lt + water €${p.chemicals.waterCleanerCpl}/lt · ${p.chemicals.washMl}ml)`} value={p.chemicals.wash} indent />}
                        {p.chemicals.ipa > 0 && <DevRow label={`  IPA (${p.chemicals.ipaMlH}ml/h · €${Number(p.chemicals.ipaCpl).toFixed(2)}/lt · ${(p.chemicals.runHours * 60).toFixed(0)}')`} value={p.chemicals.ipa} indent />}
                      </>)}
                      {p.varnish?.total > 0 && <DevRow label="Βερνίκι" value={p.varnish.total} indent />}
                      {p.coating?.total > 0 && <DevRow label="Coating" value={p.coating.total} indent />}
                      {p.hourly?.total > 0 && <DevRow label={`Ωριαίο (${p.hourly.setupMin}' setup + ${(p.hourly.runHours * 60).toFixed(0)}' run)`} value={p.hourly.total} indent />}
                    </>);
                  } else {
                    // Digital
                    const toner = Number(pb.toner) || 0;
                    const consumables = Number(pb.consumables) || 0;
                    const dep = Number(pb.depreciation) || 0;
                    const zone = Number(pb.zoneMarkup) || 0;
                    return (<>
                      {toner > 0 && <DevRow label={`Τόνερ (inkArea ×${Number(pb.inkAreaMult).toFixed(2)})`} value={toner} indent />}
                      {consumables > 0 && (<>
                        <DevRow label={`Αναλώσιμα (wear ×${pb.wearMult})`} value={consumables} indent />
                        {((pb.precisionItems as Array<{ label: string; perA4: number }>) ?? []).map((item, i) => (
                          <DevRow key={i} label={`  ${item.label}: €${item.perA4.toFixed(4)}/A4`} value={item.perA4 * Number(pb.faces) * Number(pb.wearMult)} indent />
                        ))}
                        <DevRow label={`  Σύνολο/A4: €${Number(pb.nonTonerPerA4).toFixed(4)}`} value={0} indent />
                      </>)}
                      {dep > 0 && <DevRow label="Απόσβεση" value={dep} indent />}
                      {zone > 0 && <DevRow label={`Zone markup +${zone}%`} value={calcResult.costPrint - (toner + consumables + dep)} indent />}
                    </>);
                  }
                })()}
                {calcResult.costLamination > 0 && (<><DevDivider /><DevRow label="Πλαστικοποίηση" value={calcResult.costLamination} /></>)}
                {calcResult.costBinding > 0 && <DevRow label="Βιβλιοδεσία" value={calcResult.costBinding} />}
                <DevDivider />
                <DevRow label="Σύνολο Κόστους" value={calcResult.totalCost} bold color="#f87171" />
              </DevPanel>

              {/* PROFIT BREAKDOWN */}
              <DevPanel title="ΚΕΡΔΟΣ" color="var(--accent)">
                {paperProfit !== 0 && <DevRow label="Χαρτί" sub={`markup ${bd.paperMarkup ?? 0}%`} value={paperProfit} />}

                {Boolean(calcResult.printDetail?.productPricingApplied) ? (<>
                  <DevRow label="Εκτύπωση (Product)" value={printProfit} />
                  {((bd.productDetail as Array<{ label: string; value: number }> | undefined) ?? []).map((d, i) => (
                    <DevRow key={i} label={d.label} value={d.value} indent />
                  ))}
                </>) : (
                  <DevRow label="Εκτύπωση" value={printProfit} />
                )}

                {calcResult.chargeGuillotine > 0 && <DevRow label="Γκιλοτίνα" value={calcResult.chargeGuillotine} />}
                {lamProfit !== 0 && <DevRow label="Πλαστικοποίηση" value={lamProfit} />}
                {bindProfit !== 0 && <DevRow label="Βιβλιοδεσία" value={bindProfit} />}
                {calcResult.chargeCrease > 0 && <DevRow label="Πύκμανση" value={calcResult.chargeCrease} />}
                {calcResult.chargeFold > 0 && <DevRow label="Διπλωτική" value={calcResult.chargeFold} />}
                {calcResult.chargeGather > 0 && <DevRow label="Συνθετική" value={calcResult.chargeGather} />}
                {calcResult.chargeCustom > 0 && (
                  <>
                    <DevRow label="Άλλη μετεκτύπωση" value={calcResult.chargeCustom} />
                    {(calcResult.customBreakdown || []).map(b => (
                      <DevRow key={b.id} label={b.name} value={b.charge} indent />
                    ))}
                  </>
                )}
                <DevDivider />
                <DevRow label="Κέρδος" value={calcResult.profitAmount} bold color="var(--accent)" />
                <DevRow label="Τιμή Πώλησης" value={calcResult.sellPrice} bold color="var(--success)" />
                <DevDivider />
                <DevRow label="Ανά τεμάχιο" value={calcResult.pricePerPiece} sub={`${calcResult.ups}-up · ${calcResult.totalMachineSheets} φύλ`} bold />
              </DevPanel>
            </div>,
            document.body);
          })()}

      {/* Machine modal removed — now in left panel */}
    </div>
  );
}

/* ═══ FILTER DROPDOWN ═══ */
function FilterDrop({ icon, label, value, options, onChange, color }: {
  icon: string; label: string; value: string; options: string[];
  onChange: (v: string) => void; color: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', height: 32, borderRadius: 7, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
        border: `1px solid ${value ? `color-mix(in srgb, ${color} 40%, transparent)` : 'rgba(255,255,255,0.08)'}`,
        background: value ? `color-mix(in srgb, ${color} 6%, transparent)` : 'rgba(255,255,255,0.04)',
        color: value ? color : '#64748b', fontSize: '0.72rem', fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        <i className={icon} style={{ fontSize: '0.58rem', flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>{value || label}</span>
        <i className={`fas fa-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: '0.45rem', opacity: 0.5, flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 3, zIndex: 50,
          maxHeight: 220, overflowY: 'auto',
          background: 'rgb(16,24,46)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: 3, boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}>
          <div onClick={() => { onChange(''); setOpen(false); }} style={{
            padding: '6px 10px', borderRadius: 5, fontSize: '0.72rem', cursor: 'pointer',
            color: !value ? color : '#64748b', fontWeight: !value ? 600 : 400,
            background: !value ? `color-mix(in srgb, ${color} 6%, transparent)` : 'transparent',
            transition: 'background 0.15s', display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span style={{ width: 10, fontSize: '0.55rem', color }}>{!value && <i className="fas fa-check" />}</span>
            Όλα
          </div>
          {options.map(opt => {
            const active = opt === value;
            return (
              <div key={opt} onClick={() => { onChange(opt); setOpen(false); }} style={{
                padding: '6px 10px', borderRadius: 5, fontSize: '0.72rem', cursor: 'pointer',
                color: active ? color : '#94a3b8', fontWeight: active ? 600 : 400,
                background: active ? `color-mix(in srgb, ${color} 6%, transparent)` : 'transparent',
                transition: 'background 0.15s', display: 'flex', alignItems: 'center', gap: 5,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                <span style={{ width: 10, fontSize: '0.55rem', color, flexShrink: 0 }}>{active && <i className="fas fa-check" />}</span>
                {opt}
              </div>
            );
          })}
        </div>
      )}
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
      background: 'rgba(0,0,0,0.7)',
      padding: '3px 8px', borderRadius: 5, fontSize: '0.65rem', fontWeight: 600, color: '#94a3b8',
      display: 'flex', alignItems: 'center', gap: 4,
    }}>{children}</div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: '1 1 calc(50% - 3px)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 10px' }}>
      <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 800, marginTop: 1 }}>{value}</div>
    </div>
  );
}

function CostGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.06em', color: '#64748b', paddingBottom: 3, borderBottom: '1px solid var(--border)', marginBottom: 4 }}>{title}</div>
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

// ─── BACK PDF PICKER (folder files via PressKit localhost:17824) ───
function BackPdfPicker({ linkedFile, csBackPdf, setCsBackPdf }: {
  linkedFile: { path: string; name: string } | null;
  csBackPdf: { bytes: Uint8Array; name: string } | null;
  setCsBackPdf: (v: { bytes: Uint8Array; name: string } | null) => void;
}) {
  const [folderFiles, setFolderFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showList, setShowList] = useState(false);

  const loadFolderFiles = useCallback(async () => {
    if (!linkedFile?.path) return;
    const folder = linkedFile.path.replace(/[/\\][^/\\]+$/, '');
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:17824/?list=${encodeURIComponent(folder)}`);
      if (res.ok) {
        const files: string[] = await res.json();
        // Filter only PDFs and exclude the main file
        const mainName = linkedFile.name;
        setFolderFiles(files.filter(f => f.toLowerCase().endsWith('.pdf') && f !== mainName));
      }
    } catch { /* PressKit not running */ }
    setLoading(false);
    setShowList(true);
  }, [linkedFile]);

  const selectFile = useCallback(async (fileName: string) => {
    if (!linkedFile?.path) return;
    const folder = linkedFile.path.replace(/[/\\][^/\\]+$/, '');
    const sep = folder.includes('\\') ? '\\' : '/';
    const fullPath = `${folder}${sep}${fileName}`;
    try {
      const res = await fetch(`http://localhost:17824/?path=${encodeURIComponent(fullPath)}`);
      if (!res.ok) return;
      const bytes = new Uint8Array(await res.arrayBuffer());
      setCsBackPdf({ bytes, name: fileName });
    } catch {}
    setShowList(false);
  }, [linkedFile, setCsBackPdf]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', gap: 4, width: '100%' }}>
        {/* File picker fallback */}
        <button onClick={() => {
          const inp = document.createElement('input');
          inp.type = 'file'; inp.accept = '.pdf';
          inp.onchange = async () => {
            const f = inp.files?.[0];
            if (!f) return;
            const bytes = new Uint8Array(await f.arrayBuffer());
            setCsBackPdf({ bytes, name: f.name });
          };
          inp.click();
        }} style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
          borderRadius: 6, border: `1px solid ${csBackPdf ? 'color-mix(in srgb, var(--success) 30%, transparent)' : 'var(--border)'}`,
          background: csBackPdf ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
          color: csBackPdf ? 'var(--success)' : '#64748b',
          fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <i className="fas fa-file-pdf" style={{ fontSize: '0.55rem' }} />
          {csBackPdf ? csBackPdf.name.slice(0, 25) : 'PDF πίσω όψης'}
        </button>
        {/* PressKit folder browse */}
        {linkedFile && (
          <button onClick={loadFolderFiles} title="Αρχεία φακέλου" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px 8px',
            borderRadius: 6, border: '1px solid rgba(245,130,32,0.3)',
            background: 'rgba(245,130,32,0.08)', color: '#f58220',
            fontSize: '0.6rem', cursor: 'pointer',
          }}>
            <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-folder-open'}`} />
          </button>
        )}
      </div>
      {/* Dropdown list of folder PDFs */}
      {showList && folderFiles.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}>
          {folderFiles.map(f => (
            <button key={f} onClick={() => selectFile(f)} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
              border: 'none', background: 'transparent', color: 'var(--text-dim)',
              fontSize: '0.65rem', cursor: 'pointer', fontFamily: 'inherit',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,130,32,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <i className="fas fa-file-pdf" style={{ marginRight: 6, color: '#f58220', fontSize: '0.55rem' }} />
              {f}
            </button>
          ))}
        </div>
      )}
      {showList && folderFiles.length === 0 && !loading && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '8px 10px', fontSize: '0.6rem', color: '#64748b',
        }}>
          Δεν βρέθηκαν άλλα PDF στον φάκελο
        </div>
      )}
      {showList && <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setShowList(false)} />}
    </div>
  );
}

function MfLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b', letterSpacing: '0.04em', marginBottom: 4, display: 'block' }}>{children}</span>;
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

function MfStepper({ value, onChange, step = 1, min, max, style }: {
  value: number | string;
  onChange: (v: string) => void;
  step?: number;
  min?: number;
  max?: number;
  style?: React.CSSProperties;
}) {
  const num = typeof value === 'string' ? parseFloat(value) || 0 : value;
  const dec = step < 1 ? (step.toString().split('.')[1]?.length || 1) : 0;
  function bump(dir: 1 | -1) {
    let next = Math.round((num + dir * step) * 1e6) / 1e6;
    if (min != null) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    onChange(dec ? next.toFixed(dec) : String(next));
  }
  const btnStyle: React.CSSProperties = {
    width: 22, height: 30, border: 'none', cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
    fontSize: '0.65rem', fontWeight: 700, display: 'flex',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    transition: 'background 0.15s',
  };
  return (
    <div style={{ display: 'flex', borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', ...style }}>
      <button type="button" onClick={() => bump(-1)} style={btnStyle}>−</button>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          flex: 1, width: 0, height: 30, border: 'none',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.02)', color: 'var(--text)', padding: '0 2px',
          fontSize: '0.8rem', fontFamily: 'inherit', textAlign: 'center', outline: 'none',
        }}
      />
      <button type="button" onClick={() => bump(1)} style={btnStyle}>+</button>
    </div>
  );
}

// ─── LINK FILE MENU (inside calc banner) ───
// Small dropdown that lets the user link a file to the quote item
// Two modes based on presskitEnabled:
// PressKit ON: pick from customer/quote folder or native Windows dialog (presscal-fh:// protocol)
// PressKit OFF: simple browser <input type="file"> for in-memory PDF loading
function CalcLinkFileMenu({ quoteId, itemId, hasLinkedFile, presskitEnabled, onBrowserUpload }: {
  quoteId: string;
  itemId: string;
  hasLinkedFile: boolean;
  presskitEnabled: boolean;
  onBrowserUpload: (files: FileList) => void;
}) {
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<{ customer: string | null; job: string | null }>({ customer: null, job: null });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Load folders lazily when opening (PressKit mode only)
  useEffect(() => {
    if (!presskitEnabled || !open || folders.customer || folders.job) return;
    fetch(`/api/quotes/${quoteId}/items`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) setFolders({ customer: d.companyFolderPath || null, job: d.jobFolderPath || null });
      })
      .catch(() => {});
  }, [open, quoteId, folders, presskitEnabled]);

  useEffect(() => {
    if (!open) { setPos(null); return; }
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = 240;
      const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
      setPos({ top: r.bottom + 4, left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const openPressKit = (folder?: string) => {
    const url = folder
      ? `presscal-fh://pick-file-for-item?quoteId=${quoteId}&itemId=${itemId}&folder=${encodeURIComponent(folder)}`
      : `presscal-fh://pick-file-for-item?quoteId=${quoteId}&itemId=${itemId}`;
    window.location.href = url;
    setOpen(false);
  };

  const openNativeDialog = (startFolder?: string) => {
    const url = startFolder
      ? `presscal-fh://pick-file-dialog?quoteId=${quoteId}&itemId=${itemId}&folder=${encodeURIComponent(startFolder)}`
      : `presscal-fh://pick-file-dialog?quoteId=${quoteId}&itemId=${itemId}`;
    window.location.href = url;
    setOpen(false);
  };

  const handleJobFolder = async () => {
    try {
      const { ensureJobFolder } = await import('../quotes/actions');
      const { jobFolderPath } = await ensureJobFolder(quoteId);
      if (jobFolderPath) openPressKit(jobFolderPath);
      else alert('Δεν ορίστηκε φάκελος εργασίας. Ρύθμισε global root ή φάκελο πελάτη.');
    } catch (e) {
      alert('Σφάλμα: ' + (e as Error).message);
    }
  };

  // Without PressKit: direct browser file picker
  const handleBrowserClick = () => {
    fileRef.current?.click();
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      onBrowserUpload(e.target.files);
    }
    e.target.value = '';
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".pdf" onChange={handleFileChange} style={{ display: 'none' }} />
      <button
        ref={btnRef}
        onClick={presskitEnabled ? () => setOpen(o => !o) : handleBrowserClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px',
          borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
          border: '1px solid rgba(59,130,246,0.3)',
          background: 'rgba(59,130,246,0.08)',
          color: 'var(--blue)', cursor: 'pointer', fontFamily: 'inherit',
        }}
        title={presskitEnabled
          ? (hasLinkedFile ? 'Αλλαγή αρχείου' : 'Σύνδεση αρχείου στο item')
          : 'Επιλογή PDF για preview'
        }
      >
        <i className={`fas ${presskitEnabled ? 'fa-link' : 'fa-file-pdf'}`} style={{ fontSize: '0.55rem' }} />
        {presskitEnabled
          ? (hasLinkedFile ? 'Αλλαγή' : 'Σύνδεση αρχείου')
          : (hasLinkedFile ? 'Αλλαγή PDF' : 'Επιλογή PDF')
        }
      </button>
      {presskitEnabled && open && pos && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999,
            width: 240, background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden',
          }}
        >
          <CalcMenuItem
            icon="fa-user"
            label="Φάκελος πελάτη"
            hint={folders.customer || undefined}
            disabled={!folders.customer}
            disabledHint="Ορίστε folderPath στην εταιρεία"
            onClick={() => openPressKit(folders.customer!)}
          />
          <CalcMenuItem
            icon="fa-briefcase"
            label="Φάκελος προσφοράς"
            hint={folders.job || 'Θα δημιουργηθεί'}
            onClick={handleJobFolder}
          />
          <CalcMenuItem
            icon="fa-folder-open"
            label="Περιήγηση..."
            hint="Native Windows dialog"
            onClick={() => openNativeDialog(folders.customer || folders.job || undefined)}
          />
        </div>,
        document.body,
      )}
    </>
  );
}

/** Simple browser file picker button for standalone calculator (no quote link) */
function StandalonePdfUpload({ hasFile, onUpload }: { hasFile: boolean; onUpload: (files: FileList) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={fileRef} type="file" accept=".pdf" onChange={e => { if (e.target.files?.length) onUpload(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
      <button
        onClick={() => fileRef.current?.click()}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px',
          borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
          border: '1px solid rgba(59,130,246,0.3)',
          background: 'rgba(59,130,246,0.08)',
          color: 'var(--blue)', cursor: 'pointer', fontFamily: 'inherit',
          flexShrink: 0,
        }}
      >
        <i className={`fas ${hasFile ? 'fa-sync-alt' : 'fa-file-pdf'}`} style={{ fontSize: '0.55rem' }} />
        {hasFile ? 'Αλλαγή PDF' : 'Επιλογή PDF'}
      </button>
    </>
  );
}

function CalcMenuItem({ icon, label, hint, disabled, disabledHint, onClick }: {
  icon: string; label: string; hint?: string;
  disabled?: boolean; disabledHint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? disabledHint : hint}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '10px 14px', border: 'none', background: 'transparent',
        color: disabled ? 'var(--text-muted)' : 'var(--text)',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '0.78rem', fontFamily: 'inherit', textAlign: 'left',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <i className={`fas ${icon}`} style={{ fontSize: '0.72rem', width: 14, color: '#f58220' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</div>}
      </div>
    </button>
  );
}
