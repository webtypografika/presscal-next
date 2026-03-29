'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { calcImposition } from '@/lib/calc/imposition';
import type { ImpositionInput } from '@/lib/calc/imposition';
import type { ImpositionMode, ImpositionResult, CalculatorResult } from '@/types/calculator';
import ImpositionCanvas from './imposition-canvas';
import { parsePDF } from '@/lib/calc/pdf-utils';
import type { ParsedPDF } from '@/lib/calc/pdf-utils';
import { downloadImpositionPDF } from '@/lib/calc/pdf-export';

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
  pad: ['nup'],
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
  // ─── DB DATA ───
  const [machines, setMachines] = useState<DbMachine[]>(DEMO_MACHINES);
  const [papers, setPapers] = useState<DbMaterial[]>(DEMO_PAPERS);
  const [postpress, setPostpress] = useState<DbPostpress[]>([]);
  const [products, setProducts] = useState<DbProduct[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

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
  const [finish, setFinish] = useState<FinishData>({ guillotineId: '', guillotineName: 'Χωρίς', lamMachineId: '', lamFilmId: '', lamName: 'Χωρίς', lamSides: 1, binding: 'none', bindingMachineId: '' });

  // Imposition settings
  const [impoGutter, setImpoGutter] = useState(0);
  const [impoBleedOverride, setImpoBleedOverride] = useState<number | null>(null); // null = use job.bleed
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
  const [impoColorBar, setImpoColorBar] = useState(false);
  const [impoColorBarType, setImpoColorBarType] = useState<'cmyk' | 'cmyk_tint50'>('cmyk');
  const [impoColorBarEdge, setImpoColorBarEdge] = useState<'tail' | 'gripper'>('tail');
  const [impoColorBarOffY, setImpoColorBarOffY] = useState(0); // mm micro-adjust
  const [impoPlateSlug, setImpoPlateSlug] = useState(false);
  const [impoPlateSlugEdge, setImpoPlateSlugEdge] = useState<'tail' | 'gripper'>('tail');
  const [impoModeTab, setImpoModeTab] = useState<'spacing' | 'position' | 'rotation' | 'marks'>('spacing');
  // Machine sheet override (null = use machine default)
  const [machineSheetW, setMachineSheetW] = useState<number | null>(null);
  const [machineSheetH, setMachineSheetH] = useState<number | null>(null);
  // Feed direction: sef = short edge first, lef = long edge first
  const [feedEdge, setFeedEdge] = useState<'sef' | 'lef'>('lef');
  // Speed override (null = use machine default)
  const [speedOverride, setSpeedOverride] = useState<number | null>(null);
  // Waste (φύλλα μοντάζ)
  const [wasteFixed, setWasteFixed] = useState(0);

  // PDF
  const [pdf, setPdf] = useState<ParsedPDF | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [calcResult, setCalcResult] = useState<CalculatorResult | null>(null);
  const [calcDebug, setCalcDebug] = useState<Record<string, unknown> | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const calcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const togglePanel = useCallback((key: 'machine' | 'paper' | 'job' | 'color' | 'finish' | 'mode-settings') => {
    setActivePanel(key);
  }, []);

  // ─── PDF UPLOAD ───
  const handlePdfFiles = useCallback(async (files: FileList) => {
    const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
    if (pdfFiles.length === 0) return;
    setPdfLoading(true);
    try {
      const parsed = await parsePDF(pdfFiles[0]);
      setPdf(parsed);
      // Auto-set job dimensions from PDF trim size
      if (parsed.pageSizes.length > 0) {
        const pg = parsed.pageSizes[0];
        setJob(prev => ({
          ...prev,
          width: Math.round(pg.trimW * 10) / 10,
          height: Math.round(pg.trimH * 10) / 10,
          bleed: pg.bleedDetected > 0 ? pg.bleedDetected : prev.bleed,
        }));
      }
      // Auto-set coverage from PDF analysis
      if (parsed.coverage) {
        setColor(prev => ({ ...prev, coverage: 'pdf' as const }));
      }
    } catch (err) {
      console.error('PDF parse error:', err);
    } finally {
      setPdfLoading(false);
    }
  }, []);

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
        if (data.products?.length) setProducts(data.products);
        setDataLoaded(true);
      })
      .catch(() => setDataLoaded(true)); // use demo data on failure
  }, []);

  // ─── ARCHETYPE ↔ MODE ↔ SIDES VALIDATION ───
  // Auto-correct mode when archetype changes
  useEffect(() => {
    const valid = ARCHETYPE_MODES[job.archetype] || ARCHETYPE_MODES.single_leaf;
    if (!valid.includes(impoMode)) setImpoMode(valid[0]);
  }, [job.archetype]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-correct sides when mode forces duplex
  useEffect(() => {
    if (FORCE_DUPLEX.has(impoMode) && job.sides !== 2) {
      setJob(prev => ({ ...prev, sides: 2 }));
    }
  }, [impoMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── DERIVED ───
  const machine = machines[activeMachine] || machines[0];
  const paper = papers.find(p => p.id === activePaperId) || papers[0];
  const sheetW = machineSheetW || machine?.maxLS || 330;
  const sheetH = machineSheetH || machine?.maxSS || 487;
  // Visual dimensions: SEF = portrait (short edge at top), LEF = landscape (long edge at top)
  const vizW = feedEdge === 'sef' ? sheetH : sheetW;
  const vizH = feedEdge === 'sef' ? sheetW : sheetH;

  const guillotines = postpress.filter(p => p.subtype === 'guillotine');
  const laminators = postpress.filter(p => p.subtype === 'lam_roll' || p.subtype === 'lam_sheet');
  const binders = postpress.filter(p => ['spiral', 'glue_bind', 'staple'].includes(p.subtype));

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
  const impoInput: ImpositionInput = {
    mode: impoMode,
    trimW: job.width,
    trimH: job.height,
    bleed: effectiveBleed,
    qty: job.qty,
    sides: job.sides,
    gutter: impoGutter,
    area: {
      paperW: vizW,
      paperH: vizH,
      marginTop: machine?.marginTop || 0,
      marginBottom: machine?.marginBottom || 0,
      marginLeft: machine?.marginLeft || 0,
      marginRight: machine?.marginRight || 0,
    },
    forceUps: impoForceUps || undefined,
    forceCols: impoForceCols || undefined,
    forceRows: impoForceRows || undefined,
    rotation: impoRotation || (job.rotation ? 90 : 0),
    pages: job.archetype === 'booklet' ? job.pages : job.archetype === 'perfect_bound' ? job.bodyPages : undefined,
    turnType: impoTurnType,
  };

  const impo: ImpositionResult = calcImposition(impoInput);
  const ups = Math.max(impo.ups, 1);
  const rawSheets = impo.totalSheets || Math.ceil(job.qty / ups);
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
  const timeMin = machine?.cat === 'offset'
    ? Math.ceil((sheets / runSpeed) * 60 + machineSetupMin)
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
          qty: job.qty,
          sides: job.sides,
          colorMode: color.model === 'cmyk' ? 'color' : 'bw',
          bleed: effectiveBleed,
          impositionMode: impoMode,
          impoRotation: impoRotation || (job.rotation ? 90 : 0),
          impoDuplexOrient: impoDuplexOrient,
          impoGutter: impoGutter,
          impoBleed: effectiveBleed,
          impoForceUps: impoForceUps || undefined,
          impoTurnType: impoTurnType,
          impoCropMarks: impoCropMarks,
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
  }, [machine.id, activePaperId, job, color, wasteFixed, sheetW, sheetH, feedEdge, impoMode, impoGutter, impoRotation, impoDuplexOrient, impoForceUps, impoForceCols, impoForceRows, impoBleedOverride, impoCropMarks, effectiveBleed, finish, pdf?.coverage]);

  // ─── DISPLAY VALUES ───
  const r = calcResult;
  const costPaper = r?.costPaper ?? sheets * (paper?.costPerUnit || 0.1);
  const costPrint = r?.costPrint ?? printSheets * 0.30;
  const costGuillotine = r?.costGuillotine ?? 0;
  const costLamination = r?.costLamination ?? 0;
  const totalCost = r?.totalCost ?? (costPaper + costPrint + costGuillotine + costLamination);

  const profitAmount = r?.profitAmount ?? totalCost * 0.5;
  const totalPrice = r?.sellPrice ?? totalCost + profitAmount;
  const pricePerUnit = r?.pricePerPiece ?? (job.qty > 0 ? totalPrice / job.qty : 0);
  const totalStockSheets = r?.totalStockSheets ?? sheets;

  const fmt = (n: number) => n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', marginTop: -8 }}>

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, overflow: 'hidden' }}>
          <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <i className="fas fa-th" style={{ fontSize: '0.55rem' }} /><strong style={{ color: 'var(--text)' }}>{ups}</strong> up
          </span>
          <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <i className="fas fa-copy" style={{ fontSize: '0.55rem' }} /><strong style={{ color: 'var(--text)' }}>{sheets}</strong> φύλ
          </span>
          <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <i className="fas fa-clock" style={{ fontSize: '0.55rem' }} /><strong style={{ color: 'var(--text)' }}>~{timeMin >= 60 ? `${(timeMin / 60).toFixed(1)}h` : `${timeMin}'`}</strong>
          </span>

          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

          {/* Cost chips */}
          <span style={{ fontSize: '0.68rem', color: '#94a3b8', flexShrink: 0 }}>
            Χαρτί <strong style={{ color: 'var(--text)' }}>€{fmt(costPaper)}</strong>
          </span>
          <span style={{ fontSize: '0.68rem', color: '#94a3b8', flexShrink: 0 }}>
            Εκτ. <strong style={{ color: 'var(--text)' }}>€{fmt(costPrint)}</strong>
          </span>
          {costGuillotine > 0 && <span style={{ fontSize: '0.68rem', color: '#94a3b8', flexShrink: 0 }}>Γκιλ. <strong style={{ color: 'var(--text)' }}>€{fmt(costGuillotine)}</strong></span>}
          {costLamination > 0 && <span style={{ fontSize: '0.68rem', color: '#94a3b8', flexShrink: 0 }}>Πλαστ. <strong style={{ color: 'var(--text)' }}>€{fmt(costLamination)}</strong></span>}
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Price hero */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 600, color: 'var(--accent)', lineHeight: 1, letterSpacing: '-0.02em' }}>€{fmt(totalPrice)}</div>
            <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>€{fmt(pricePerUnit)}/τεμ · κέρδος €{fmt(profitAmount)}</div>
          </div>
          <button style={{
            padding: '7px 14px', borderRadius: 7,
            background: 'var(--accent)', color: '#fff', border: 'none',
            fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            boxShadow: '0 2px 12px rgba(245,130,32,0.3)', transition: 'all 0.2s', flexShrink: 0,
          }}>
            <i className="fas fa-cart-plus" /> Καλάθι
          </button>
          <button onClick={async () => {
            try {
              await downloadImpositionPDF({
                imposition: impo,
                pdfBytes: pdf?.bytes,
                pdfPageSizes: pdf?.pageSizes?.map(p => ({ trimW: p.trimW, trimH: p.trimH })),
                machineCat: machine.cat as 'digital' | 'offset',
                machineName: machine.name,
                paperName: paper?.name,
                jobW: job.width,
                jobH: job.height,
                bleed: effectiveBleed,
                gutter: impoGutter,
                showCropMarks: impoCropMarks,
                showRegistration: machine.cat === 'offset',
                showColorBar: impoColorBar,
                colorBarType: impoColorBarType as 'cmyk' | 'cmyk_tint50',
                colorBarEdge: impoColorBarEdge as 'tail' | 'gripper',
                colorBarOffsetY: impoColorBarOffY,
                showPlateSlug: impoPlateSlug,
                plateSlugEdge: impoPlateSlugEdge,
                keepSourceMarks: impoKeepSourceMarks,
                isDuplex: job.sides === 2,
                duplexOrient: impoDuplexOrient,
                rotation: impoRotation,
                turnType: impoTurnType,
                jobDescription: `${job.width}x${job.height}mm - ${job.qty} pcs - ${impoMode}`,
              });
            } catch (e) {
              console.error('PDF export error:', e);
              alert('PDF export error: ' + (e as Error).message);
            }
          }} style={{
            padding: '7px 10px', borderRadius: 7,
            background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', border: '1px solid var(--glass-border)',
            fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'all 0.2s', flexShrink: 0,
          }} title="Εξαγωγή imposition PDF">
            <i className="fas fa-file-pdf" /> PDF
          </button>
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
          {calcDebug?.debug ? <span>product: <b style={{ color: 'var(--accent)' }}>{String((calcDebug.debug as Record<string, unknown>)?.productPricing || '—')}</b></span> : null}
        </div>
      )}

      {/* ═══ MAIN: LEFT PANEL + CENTER ═══ */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ═══ LEFT PANEL ═══ */}
        <div style={{
          width: 310, flexShrink: 0, background: 'rgba(0,0,0,0.2)',
          borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Panel tabs */}
          <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
            {([
              { key: 'machine' as const, icon: 'fas fa-print', color: 'var(--blue)', label: 'Μηχανή' },
              { key: 'paper' as const, icon: 'fas fa-scroll', color: 'var(--teal)', label: 'Χαρτί' },
              { key: 'job' as const, icon: 'fas fa-ruler-combined', color: 'var(--accent)', label: 'Εργασία' },
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
                    <div key={m.id} onClick={() => { setActiveMachine(i); setMachineSheetW(null); setMachineSheetH(null); }}
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
                  onSelect={(ls, ss) => { setMachineSheetW(ls); setMachineSheetH(ss); }}
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
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 12 }}>
                  <MfInput value={sheetH}
                    onChange={v => setMachineSheetH(Number(v) || null)}
                    style={{ width: 70, textAlign: 'center' }} />
                  <span style={{ color: '#475569', fontWeight: 600 }}>×</span>
                  <MfInput value={sheetW}
                    onChange={v => setMachineSheetW(Number(v) || null)}
                    style={{ width: 70, textAlign: 'center' }} />
                  <button onClick={() => setFeedEdge(f => f === 'sef' ? 'lef' : 'sef')}
                    style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--blue)', cursor: 'pointer', fontSize: '0.5rem', fontWeight: 700, padding: '4px 6px', borderRadius: 4, fontFamily: 'inherit' }}
                    title={feedEdge === 'sef' ? 'Short Edge First → Long Edge First' : 'Long Edge First → Short Edge First'}>
                    {feedEdge === 'sef' ? 'SEF' : 'LEF'}
                  </button>
                </div>

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

              {/* Qty + Bleed row */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <MfLabel>ΠΟΣΟΤΗΤΑ</MfLabel>
                  <MfInput value={job.qty} onChange={(v) => setJob({ ...job, qty: Number(v) || 0 })} style={{ width: '100%', textAlign: 'center', fontWeight: 600 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <MfLabel>BLEED</MfLabel>
                    <button onClick={() => setJob({ ...job, bleedOn: !job.bleedOn })} style={{
                      padding: '1px 6px', borderRadius: 4, border: 'none', fontSize: '0.55rem', fontWeight: 600,
                      background: job.bleedOn ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
                      color: job.bleedOn ? 'var(--success)' : '#475569',
                      cursor: 'pointer', marginLeft: 'auto',
                    }}>{job.bleedOn ? 'ON' : 'OFF'}</button>
                  </div>
                  <MfInput value={job.bleed} onChange={(v) => setJob({ ...job, bleed: Number(v) || 0 })} style={{
                    width: '100%', textAlign: 'center',
                    opacity: job.bleedOn ? 1 : 0.4,
                  }} />
                </div>
              </div>

              {/* Sides */}
              <MfLabel>ΟΨΕΙΣ</MfLabel>
              <div style={{ marginBottom: 12 }}>
                {FORCE_DUPLEX.has(impoMode) ? (
                  <div style={{ fontSize: '0.62rem', color: '#64748b', padding: '6px 0' }}>
                    <i className="fas fa-lock" style={{ marginRight: 4, fontSize: '0.5rem' }} />Διπλή όψη ({impoMode === 'workturn' ? 'Work&Turn' : impoMode === 'booklet' ? 'Booklet' : 'Perfect Bound'})
                  </div>
                ) : (
                  <ToggleBar value={String(job.sides)} onChange={(v) => setJob({ ...job, sides: Number(v) as 1 | 2 })} options={[{ v: '1', l: 'Μονή' }, { v: '2', l: 'Διπλή' }]} />
                )}
              </div>

              {/* Force UPs */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <MfLabel>FORCE UP</MfLabel>
                  <MfInput value={impoForceUps ?? ''} onChange={(v) => setImpoForceUps(v ? Number(v) : null)} style={{ width: '100%', textAlign: 'center' }} />
                </div>
                <div style={{ flex: 1 }} />
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
              {job.archetype === 'booklet' && (
                <div style={{ marginBottom: 10 }}>
                  <MfLabel>ΣΕΛΙΔΕΣ (×4)</MfLabel>
                  <MfInput value={job.pages || 8} onChange={(v) => setJob({ ...job, pages: Math.max(4, Number(v) || 4) })} style={{ width: 80, textAlign: 'center' }} />
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
                  <MfInput value={job.bodyPages || 64} onChange={(v) => setJob({ ...job, bodyPages: Math.max(4, Number(v) || 4) })} style={{ width: 80, textAlign: 'center' }} />
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
                      <Pill key={p.l} active={active} onClick={() => setColor({ ...color, platesFront: p.f, platesBack: p.b })}>{p.l}</Pill>
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
                <Pill active={!finish.lamMachineId} onClick={() => setFinish({ ...finish, lamMachineId: '', lamFilmId: '', lamName: 'Χωρίς' })} color="var(--violet)">Χωρίς</Pill>
                {laminators.map((l) => (
                  <Pill key={l.id} active={finish.lamMachineId === l.id} onClick={() => setFinish({ ...finish, lamMachineId: l.id, lamName: l.name })} color="var(--violet)">{l.name}</Pill>
                ))}
              </div>
              {finish.lamMachineId && (<>
                <MfLabel>ΟΨΕΙΣ ΠΛΑΣΤΙΚΟΠΟΙΗΣΗΣ</MfLabel>
                <ToggleBar value={String(finish.lamSides)} onChange={(v) => setFinish({ ...finish, lamSides: Number(v) as 1 | 2 })} options={[{ v: '1', l: '1 Όψη' }, { v: '2', l: '2 Όψεις' }]} />
                <div style={{ height: 10 }} />
              </>)}
              <MfLabel>ΒΙΒΛΙΟΔΕΣΙΑ</MfLabel>
              <ToggleBar value={finish.binding} onChange={(v) => setFinish({ ...finish, binding: v })}
                options={[{ v: 'none', l: 'Καμία' }, { v: 'staple', l: 'Συρραφή' }, { v: 'glue', l: 'Κόλλα' }, { v: 'spiral', l: 'Σπιράλ' }]}
              />
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
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="fas fa-cog" style={{ fontSize: '0.62rem' }} />
                  {IMPO_MODES.find(m => m.key === impoMode)?.label}
                </span>
              </div>

              {/* Sub-tabs */}
              <div style={{ display: 'flex', gap: 2, marginBottom: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 7, padding: 2 }}>
                {([
                  { k: 'spacing' as const, l: 'Αποστάσεις', i: 'fas fa-arrows-alt-h' },
                  { k: 'position' as const, l: 'Θέση', i: 'fas fa-crosshairs' },
                  { k: 'rotation' as const, l: 'Στροφή', i: 'fas fa-sync-alt' },
                  { k: 'marks' as const, l: 'Σημάδια', i: 'fas fa-crop-alt' },
                ]).map(t => (
                  <button key={t.k} onClick={() => setImpoModeTab(t.k)} style={{
                    flex: 1, padding: '5px 0', borderRadius: 5, border: 'none', cursor: 'pointer',
                    background: impoModeTab === t.k ? 'rgba(245,130,32,0.1)' : 'transparent',
                    color: impoModeTab === t.k ? 'var(--accent)' : '#64748b',
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
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <MfLabel>GUTTER (MM)</MfLabel>
                    <MfStepper value={impoGutter} onChange={v => setImpoGutter(Math.max(0, Number(v) || 0))} step={0.5} min={0} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <MfLabel>BLEED (MM)</MfLabel>
                    <MfStepper value={effectiveBleed} onChange={v => setImpoBleedOverride(Number(v) || 0)} step={0.5} min={0} />
                  </div>
                </div>

                {/* N-Up: Force Cols/Rows */}
                {(impoMode === 'nup' || impoMode === 'cutstack') && (
                  <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <MfLabel>FORCE COLS</MfLabel>
                      <MfStepper value={impoForceCols ?? ''} onChange={v => setImpoForceCols(v ? Number(v) : null)} step={1} min={1} max={20} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <MfLabel>FORCE ROWS</MfLabel>
                      <MfStepper value={impoForceRows ?? ''} onChange={v => setImpoForceRows(v ? Number(v) : null)} step={1} min={1} max={20} />
                    </div>
                  </div>
                )}

                {/* Booklet */}
                {impoMode === 'booklet' && (
                  <div style={{ marginBottom: 10 }}>
                    <MfLabel>ΣΕΛΙΔΕΣ (×4)</MfLabel>
                    <MfStepper value={job.pages || 8} onChange={v => setJob({ ...job, pages: Math.max(4, Number(v) || 4) })} step={4} min={4} />
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
                      <MfLabel>ΠΑΧΟΣ (MM)</MfLabel>
                      <MfStepper value={0.1} onChange={() => {}} step={0.01} min={0.01} />
                    </div>
                  </div>
                </>)}

                {/* Work&Turn */}
                {impoMode === 'workturn' && (
                  <div style={{ marginBottom: 10 }}>
                    <MfLabel>ΤΡΟΠΟΣ ΑΝΑΣΤΡΟΦΗΣ</MfLabel>
                    <ToggleBar value={impoTurnType} onChange={v => setImpoTurnType(v as 'turn' | 'tumble')} options={[{ v: 'turn', l: 'Work & Turn' }, { v: 'tumble', l: 'Work & Tumble' }]} />
                  </div>
                )}
              </>)}

              {/* Tab: Θέση (Position) */}
              {impoModeTab === 'position' && (<>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <MfLabel>OFFSET X (MM)</MfLabel>
                    <MfStepper value={impoOffsetX} onChange={v => setImpoOffsetX(Number(v) || 0)} step={0.5} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <MfLabel>OFFSET Y (MM)</MfLabel>
                    <MfStepper value={impoOffsetY} onChange={v => setImpoOffsetY(Number(v) || 0)} step={0.5} />
                  </div>
                </div>
                <div style={{ fontSize: '0.6rem', color: '#64748b', marginBottom: 10 }}>
                  <i className="fas fa-info-circle" style={{ marginRight: 3 }} />
                  Μετακίνηση ολόκληρου του grid μέσα στο φύλλο
                </div>
              </>)}

              {/* Tab: Στροφή (Rotation) */}
              {impoModeTab === 'rotation' && (<>
                <MfLabel>ΠΕΡΙΣΤΡΟΦΗ PDF</MfLabel>
                <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                  {[0, 90, 180, 270].map(deg => (
                    <Pill key={deg} active={impoRotation === deg} onClick={() => setImpoRotation(deg)}>
                      {deg}°
                    </Pill>
                  ))}
                </div>
                <MfStepper value={impoRotation} onChange={v => setImpoRotation(((Number(v) || 0) % 360 + 360) % 360)} step={1} min={0} max={359} />
                <div style={{ fontSize: '0.55rem', color: '#64748b', marginTop: 3, marginBottom: 10 }}>
                  <i className="fas fa-info-circle" style={{ marginRight: 3 }} />0-359° ελεύθερη περιστροφή
                </div>

                {job.sides === 2 && impoMode !== 'workturn' && (<>
                  <MfLabel>DUPLEX ORIENTATION</MfLabel>
                  <ToggleBar value={impoDuplexOrient} onChange={v => setImpoDuplexOrient(v as 'h2h' | 'h2f')}
                    options={[{ v: 'h2h', l: 'Head-Head' }, { v: 'h2f', l: 'Head-Foot' }]} />
                </>)}
              </>)}

              {/* Tab: Σημάδια (Marks) */}
              {impoModeTab === 'marks' && (<>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  <button onClick={() => setImpoCropMarks(!impoCropMarks)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                    borderRadius: 7, border: `1px solid ${impoCropMarks ? 'var(--accent)' : 'var(--border)'}`,
                    background: impoCropMarks ? 'rgba(245,130,32,0.06)' : 'transparent',
                    color: impoCropMarks ? 'var(--accent)' : '#64748b',
                    fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                  }}>
                    <i className="fas fa-crop-alt" style={{ fontSize: '0.58rem' }} /> Crop Marks
                    <span style={{ marginLeft: 'auto', fontSize: '0.58rem' }}>{impoCropMarks ? 'ON' : 'OFF'}</span>
                  </button>
                  <button onClick={() => setImpoKeepSourceMarks(!impoKeepSourceMarks)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                    borderRadius: 7, border: `1px solid ${impoKeepSourceMarks ? 'var(--accent)' : 'var(--border)'}`,
                    background: impoKeepSourceMarks ? 'rgba(245,130,32,0.06)' : 'transparent',
                    color: impoKeepSourceMarks ? 'var(--accent)' : '#64748b',
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
                    <div>
                      <MfLabel>OFFSET Y (MM)</MfLabel>
                      <MfStepper value={impoColorBarOffY} onChange={v => setImpoColorBarOffY(Number(v) || 0)} step={0.5} />
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
                    border: `1px solid ${active ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}`,
                    borderRight: active ? 'none' : undefined,
                    background: active ? 'rgba(245,130,32,0.08)' : 'transparent',
                    color: active ? 'var(--accent)' : '#64748b',
                    cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
                  }}>{m.label}</button>
                  {active && (
                    <button onClick={() => togglePanel(activePanel === 'mode-settings' ? 'job' : 'mode-settings')} style={{
                      padding: '0 10px', borderRadius: '0 7px 7px 0', fontSize: '0.68rem',
                      border: 'none',
                      background: activePanel === 'mode-settings' ? 'var(--accent)' : 'rgba(245,130,32,0.25)',
                      color: activePanel === 'mode-settings' ? '#fff' : 'var(--accent)',
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
                gutter={impoGutter}
                cropMarks={impoCropMarks}
                machCat={machine?.cat as 'digital' | 'offset' | undefined}
                sides={job.sides}
                offsetX={impoOffsetX}
                offsetY={impoOffsetY}
                showColorBar={impoColorBar}
                colorBarEdge={impoColorBarEdge as 'tail' | 'gripper'}
                colorBarOffY={impoColorBarOffY}
                showPlateSlug={impoPlateSlug}
                plateSlugEdge={impoPlateSlugEdge}
                pdf={pdf}
                onDrop={handlePdfFiles}
                feedEdge={feedEdge}
              />
              {/* PDF upload overlay (top-left) */}
              <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', gap: 4, alignItems: 'center', zIndex: 2 }}>
                <button onClick={() => pdfInputRef.current?.click()} style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                  borderRadius: 5, border: `1px solid ${pdf ? 'color-mix(in srgb, var(--success) 30%, transparent)' : 'rgba(255,255,255,0.1)'}`,
                  background: pdf ? 'rgba(16,185,129,0.12)' : 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
                  color: pdf ? 'var(--success)' : '#64748b',
                  fontSize: '0.62rem', fontWeight: 600, cursor: 'pointer',
                }}>
                  <i className={pdfLoading ? 'fas fa-spinner fa-spin' : 'fas fa-file-pdf'} style={{ fontSize: '0.58rem' }} />
                  {pdf ? pdf.fileName.slice(0, 20) : 'PDF'}
                </button>
                {pdf && (
                  <>
                    <span style={{ fontSize: '0.58rem', color: '#94a3b8', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', padding: '2px 5px', borderRadius: 4 }}>
                      {pdf.pageCount}pg · {pdf.pageSizes[0]?.trimW}×{pdf.pageSizes[0]?.trimH}
                    </span>
                    <button onClick={() => setPdf(null)} style={{ border: 'none', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', color: '#64748b', cursor: 'pointer', fontSize: '0.55rem', padding: '2px 5px', borderRadius: 4 }}>
                      <i className="fas fa-times" />
                    </button>
                  </>
                )}
              </div>
              {/* Info chips overlay (bottom-right) */}
              <div style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4, pointerEvents: 'none', zIndex: 2 }}>
                <ImpoChip><i className={feedEdge === 'sef' ? 'fas fa-arrows-alt-v' : 'fas fa-arrows-alt-h'} style={{ fontSize: '0.5rem' }} /> {feedEdge === 'sef' ? 'SEF' : 'LEF'}</ImpoChip>
                <ImpoChip><strong>{ups}</strong>-up</ImpoChip>
                <ImpoChip><strong>{sheets}</strong> φύλ</ImpoChip>
                <ImpoChip><i className="fas fa-clock" /><strong>~{timeMin >= 60 ? `${(timeMin / 60).toFixed(1)}h` : `${timeMin}'`}</strong></ImpoChip>
                {calculating && <ImpoChip><i className="fas fa-spinner fa-spin" /></ImpoChip>}
              </div>
            </div>
            <input ref={pdfInputRef} type="file" accept=".pdf" style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.length) handlePdfFiles(e.target.files); e.target.value = ''; }}
            />
          </div>

          {/* ═══ DEV PANELS (right of canvas) ═══ */}
          {calcResult && (() => {
            const bd = (calcResult.printDetail?.costBreakdown ?? {}) as Record<string, unknown>;
            const chargePaper = Number(bd.chargePaper) || 0;
            const chargePrint = Number(bd.chargePrint) || 0;
            const paperProfit = chargePaper - calcResult.costPaper;
            const printProfit = chargePrint - calcResult.costPrint;
            const guillProfit = calcResult.chargeGuillotine - calcResult.costGuillotine;
            const lamProfit = calcResult.chargeLamination - calcResult.costLamination;
            const bindProfit = (Number(bd.chargeBinding) || 0) - calcResult.costBinding;
            return (
            <div style={{ width: 280, flexShrink: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 8px 8px 0' }}>
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
                        {p.chemicals.ipa > 0 && <DevRow label={`  IPA (${p.chemicals.ipaMlH}ml/h · €${p.chemicals.ipaCpl}/lt · ${(p.chemicals.runHours * 60).toFixed(0)}')`} value={p.chemicals.ipa} indent />}
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
                {calcResult.costGuillotine > 0 && (<><DevDivider /><DevRow label="Γκιλοτίνα" value={calcResult.costGuillotine} /></>)}
                {calcResult.costLamination > 0 && <DevRow label="Πλαστικοποίηση" value={calcResult.costLamination} />}
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

                {guillProfit !== 0 && <DevRow label="Γκιλοτίνα" value={guillProfit} />}
                {lamProfit !== 0 && <DevRow label="Πλαστικοποίηση" value={lamProfit} />}
                {bindProfit !== 0 && <DevRow label="Βιβλιοδεσία" value={bindProfit} />}
                <DevDivider />
                <DevRow label="Κέρδος" value={calcResult.profitAmount} bold color="var(--accent)" />
                <DevRow label="Τιμή Πώλησης" value={calcResult.sellPrice} bold color="var(--success)" />
                <DevDivider />
                <DevRow label="Ανά τεμάχιο" value={calcResult.pricePerPiece} sub={`${calcResult.ups}-up · ${calcResult.totalMachineSheets} φύλ`} bold />
              </DevPanel>
            </div>
            );
          })()}
          </div>

        </div>

      </div>

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
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
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
