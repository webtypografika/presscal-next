'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { calcImposition } from '@/lib/calc/imposition';
import type { ImpositionInput } from '@/lib/calc/imposition';
import type { ImpositionMode, ImpositionResult, CalculatorResult } from '@/types/calculator';
import ImpositionCanvas from './imposition-canvas';
import { parsePDF } from '@/lib/calc/pdf-utils';
import type { ParsedPDF } from '@/lib/calc/pdf-utils';

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
  // Offset CMYK: front/back active colors
  offFrontC: boolean; offFrontM: boolean; offFrontY: boolean; offFrontK: boolean;
  offBackC: boolean; offBackM: boolean; offBackY: boolean; offBackK: boolean;
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
  // ─── DB DATA ───
  const [machines, setMachines] = useState<DbMachine[]>(DEMO_MACHINES);
  const [papers, setPapers] = useState<DbMaterial[]>(DEMO_PAPERS);
  const [postpress, setPostpress] = useState<DbPostpress[]>([]);
  const [products, setProducts] = useState<DbProduct[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // ─── STATE ───
  const [activeMachine, setActiveMachine] = useState(0);
  const [activePaperId, setActivePaperId] = useState<string>(DEMO_PAPERS[0].id);
  const [activePanel, setActivePanel] = useState<'machine' | 'paper' | 'job' | 'color' | 'finish' | 'mode-settings'>('job');
  const [impoMode, setImpoMode] = useState<ImpositionMode>('nup');

  const [supplier, setSupplier] = useState('');
  const [paperCat, setPaperCat] = useState('');
  const [paperSearch, setPaperSearch] = useState('');

  const [job, setJob] = useState<JobData>({ archetype: 'single_leaf', width: 210, height: 297, bleed: 3, bleedOn: true, qty: 500, sides: 2, rotation: false, pages: 8, sheetsPerPad: 50, bodyPages: 64, customMult: 1 });
  const [color, setColor] = useState<ColorData>({
    model: 'cmyk', coverage: 'mid',
    offFrontC: true, offFrontM: true, offFrontY: true, offFrontK: true,
    offBackC: false, offBackM: false, offBackY: false, offBackK: false,
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
  const [impoRotation, setImpoRotation] = useState<0 | 90 | 180 | 270>(0);
  const [impoDuplexOrient, setImpoDuplexOrient] = useState<'h2h' | 'h2f'>('h2h');
  const [impoColorBar, setImpoColorBar] = useState(false);
  const [impoColorBarType, setImpoColorBarType] = useState<'cmyk' | 'cmyk_tint50'>('cmyk');
  const [impoColorBarEdge, setImpoColorBarEdge] = useState<'tail' | 'gripper'>('tail');
  const [impoPlateSlug, setImpoPlateSlug] = useState(false);
  const [impoModeTab, setImpoModeTab] = useState<'spacing' | 'position' | 'rotation' | 'marks'>('spacing');
  // Machine sheet override (null = use machine default)
  const [machineSheetW, setMachineSheetW] = useState<number | null>(null);
  const [machineSheetH, setMachineSheetH] = useState<number | null>(null);
  // Waste
  const [wastePercent, setWastePercent] = useState(2);
  const [wasteFixed, setWasteFixed] = useState(0);

  // PDF
  const [pdf, setPdf] = useState<ParsedPDF | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [calcResult, setCalcResult] = useState<CalculatorResult | null>(null);
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

  // ─── DERIVED ───
  const machine = machines[activeMachine] || machines[0];
  const paper = papers.find(p => p.id === activePaperId) || papers[0];
  const sheetW = machineSheetW || machine?.maxLS || 330;
  const sheetH = machineSheetH || machine?.maxSS || 487;

  const guillotines = postpress.filter(p => p.subtype === 'guillotine');
  const laminators = postpress.filter(p => p.subtype === 'lam_roll' || p.subtype === 'lam_sheet');
  const binders = postpress.filter(p => ['spiral', 'glue_bind', 'staple'].includes(p.subtype));

  // Unique suppliers from papers
  const suppliers = [...new Set(papers.map(p => p.supplier).filter(Boolean))] as string[];

  // Derive category from groupName or first word of name (e.g. "MUNKEN PURE 90gr" → "Munken")
  function paperCategory(p: DbMaterial): string {
    if (p.groupName) return p.groupName;
    const firstWord = (p.name || '').split(/\s+/)[0];
    if (firstWord.length >= 3) return firstWord.charAt(0) + firstWord.slice(1).toLowerCase();
    return '';
  }
  const categories = [...new Set(papers.map(paperCategory).filter(Boolean))];

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
      paperW: sheetW,
      paperH: sheetH,
      marginTop: machine?.marginTop || 0,
      marginBottom: machine?.marginBottom || 0,
      marginLeft: machine?.marginLeft || 0,
      marginRight: machine?.marginRight || 0,
    },
    forceUps: impoForceUps || undefined,
    rotation: job.rotation ? 90 : 0,
    pages: job.archetype === 'booklet' ? job.pages : undefined,
  };

  const impo: ImpositionResult = calcImposition(impoInput);
  const ups = Math.max(impo.ups, 1);
  const rawSheets = impo.totalSheets || Math.ceil(job.qty / ups);
  const wasteSheets = wasteFixed + Math.ceil(rawSheets * wastePercent / 100);
  const sheets = rawSheets + wasteSheets;
  const printSheets = job.sides === 2 ? sheets * 2 : sheets;
  const timeMin = Math.ceil(printSheets * 0.06);

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
          paperId: activePaperId,
          jobW: job.width,
          jobH: job.height,
          qty: job.qty,
          sides: job.sides,
          colorMode: color.model === 'cmyk' ? 'color' : 'bw',
          bleed: job.bleed,
          impositionMode: impoMode,
          impoRotation: 0,
          impoDuplexOrient: 'h2h',
          impoGutter: 0,
          impoBleed: job.bleed,
          impoCropMarks: false,
          coverageLevel: 'mid',
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
          if (data.result) setCalcResult(data.result);
        })
        .catch(() => {})
        .finally(() => setCalculating(false));
    }, 300);
    return () => { if (calcTimer.current) clearTimeout(calcTimer.current); };
  }, [machine.id, activePaperId, job, color.model, impoMode, finish]);

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
        {/* Machine name (click → machine panel) */}
        <button onClick={() => togglePanel('machine')} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
          borderRadius: 8, border: `1px solid ${activePanel === 'machine' ? 'color-mix(in srgb, var(--blue) 50%, transparent)' : 'color-mix(in srgb, var(--blue) 25%, transparent)'}`,
          background: 'color-mix(in srgb, var(--blue) 6%, transparent)',
          color: 'var(--blue)', fontSize: '0.78rem', fontWeight: 600,
          cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0, fontFamily: 'inherit',
        }}>
          <i className={machine?.cat === 'offset' ? 'fas fa-industry' : 'fas fa-print'} style={{ fontSize: '0.65rem' }} />
          {machine?.name || 'Μηχανή'}
        </button>

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
            <i className="fas fa-clock" style={{ fontSize: '0.55rem' }} /><strong style={{ color: 'var(--text)' }}>~{timeMin}&apos;</strong>
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
        </div>
        {calculating && <i className="fas fa-spinner fa-spin" style={{ color: 'var(--accent)', fontSize: '0.7rem', flexShrink: 0 }} />}
      </div>

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
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                  <MfInput value={sheetW} onChange={v => setMachineSheetW(Number(v) || null)} style={{ width: 70, textAlign: 'center' }} />
                  <span style={{ color: '#475569', fontWeight: 600 }}>×</span>
                  <MfInput value={sheetH} onChange={v => setMachineSheetH(Number(v) || null)} style={{ width: 70, textAlign: 'center' }} />
                  {(machineSheetW || machineSheetH) && (
                    <button onClick={() => { setMachineSheetW(null); setMachineSheetH(null); }}
                      style={{ border: 'none', background: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.65rem', padding: '0 4px' }}
                      title="Reset">
                      <i className="fas fa-undo" />
                    </button>
                  )}
                </div>

                <MfLabel>ΦΥΡΑ</MfLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MfInput value={wastePercent} onChange={v => setWastePercent(Math.max(0, Number(v) || 0))} style={{ width: '100%', textAlign: 'center' }} />
                      <span style={{ fontSize: '0.65rem', color: '#64748b' }}>%</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.65rem', color: '#475569' }}>+</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MfInput value={wasteFixed} onChange={v => setWasteFixed(Math.max(0, Number(v) || 0))} style={{ width: '100%', textAlign: 'center' }} />
                      <span style={{ fontSize: '0.65rem', color: '#64748b' }}>φύλ</span>
                    </div>
                  </div>
                  {wasteSheets > 0 && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--danger)', fontWeight: 600, flexShrink: 0 }}>={wasteSheets}</span>
                  )}
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
              {/* Filters — 2 column row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                <FilterDrop icon="fas fa-folder" label="Κατηγορία" value={paperCat} options={categories} onChange={setPaperCat} color="var(--teal)" />
                {suppliers.length > 0
                  ? <FilterDrop icon="fas fa-truck" label="Προμηθευτής" value={supplier} options={suppliers} onChange={setSupplier} color="var(--teal)" />
                  : <div />
                }
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
                  const grouped = new Map<string, typeof fp>();
                  for (const p of fp) { const cat = paperCategory(p) || 'Λοιπά'; if (!grouped.has(cat)) grouped.set(cat, []); grouped.get(cat)!.push(p); }
                  return [...grouped.entries()].map(([cat, items]) => (
                    <div key={cat}>
                      <div style={{ fontSize: '0.58rem', fontWeight: 600, color: 'var(--teal)', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '6px 0 3px', position: 'sticky', top: 0, background: 'rgba(0,0,0,0.2)', zIndex: 1 }}>{cat} ({items.length})</div>
                      {items.map(p => {
                        const isActive = p.id === activePaperId;
                        return (
                          <div key={p.id} onClick={() => setActivePaperId(p.id)} style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 6,
                            cursor: 'pointer', fontSize: '0.75rem', color: '#94a3b8',
                            border: `1px solid ${isActive ? 'color-mix(in srgb, var(--teal) 40%, transparent)' : 'transparent'}`,
                            background: isActive ? 'color-mix(in srgb, var(--teal) 6%, transparent)' : 'transparent',
                            transition: 'background 0.15s',
                          }}>
                            <span style={{ color: 'var(--teal)', fontSize: '0.6rem', width: 12, flexShrink: 0 }}>{isActive && <i className="fas fa-check" />}</span>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                            <span style={{ fontSize: '0.62rem', color: '#475569', flexShrink: 0 }}>{p.thickness}g</span>
                            <span style={{ fontWeight: 600, color: 'var(--teal)', fontSize: '0.7rem', flexShrink: 0 }}>€{(p.costPerUnit || 0).toFixed(3)}</span>
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
                <ToggleBar value={String(job.sides)} onChange={(v) => setJob({ ...job, sides: Number(v) as 1 | 2 })} options={[{ v: '1', l: 'Μονή' }, { v: '2', l: 'Διπλή' }]} />
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
                  {products.map(p => {
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
                <MfLabel>CMYK ΤΣΙΓΚΟΙ</MfLabel>
                {/* Presets */}
                <div style={{ display: 'flex', gap: 3, marginBottom: 8, flexWrap: 'wrap' }}>
                  {[
                    { l: '4/0', f: [true,true,true,true], b: [false,false,false,false] },
                    { l: '4/4', f: [true,true,true,true], b: [true,true,true,true] },
                    { l: '1/0', f: [false,false,false,true], b: [false,false,false,false] },
                    { l: '1/1', f: [false,false,false,true], b: [false,false,false,true] },
                    { l: '2/0', f: [true,false,false,true], b: [false,false,false,false] },
                  ].map(p => (
                    <Pill key={p.l} onClick={() => setColor({ ...color,
                      offFrontC: p.f[0], offFrontM: p.f[1], offFrontY: p.f[2], offFrontK: p.f[3],
                      offBackC: p.b[0], offBackM: p.b[1], offBackY: p.b[2], offBackK: p.b[3],
                    })}>{p.l}</Pill>
                  ))}
                </div>
                {/* Front CMYK dots */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: '0.62rem', color: '#64748b', width: 44, flexShrink: 0 }}>Εμπρός</span>
                  {([
                    { k: 'offFrontC' as const, c: '#00aeef', l: 'C' },
                    { k: 'offFrontM' as const, c: '#e91e90', l: 'M' },
                    { k: 'offFrontY' as const, c: '#f0b400', l: 'Y' },
                    { k: 'offFrontK' as const, c: '#333', l: 'K' },
                  ]).map(d => (
                    <button key={d.k} onClick={() => setColor({ ...color, [d.k]: !color[d.k] })} style={{
                      width: 28, height: 28, borderRadius: '50%', border: `2px solid ${color[d.k] ? d.c : 'var(--border)'}`,
                      background: color[d.k] ? d.c : 'transparent', color: color[d.k] ? '#fff' : '#475569',
                      fontSize: '0.6rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{d.l}</button>
                  ))}
                  <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 600, marginLeft: 'auto' }}>
                    {[color.offFrontC, color.offFrontM, color.offFrontY, color.offFrontK].filter(Boolean).length}
                  </span>
                </div>
                {/* Back CMYK dots */}
                {job.sides === 2 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: '0.62rem', color: '#64748b', width: 44, flexShrink: 0 }}>Πίσω</span>
                    {([
                      { k: 'offBackC' as const, c: '#00aeef', l: 'C' },
                      { k: 'offBackM' as const, c: '#e91e90', l: 'M' },
                      { k: 'offBackY' as const, c: '#f0b400', l: 'Y' },
                      { k: 'offBackK' as const, c: '#333', l: 'K' },
                    ]).map(d => (
                      <button key={d.k} onClick={() => setColor({ ...color, [d.k]: !color[d.k] })} style={{
                        width: 28, height: 28, borderRadius: '50%', border: `2px solid ${color[d.k] ? d.c : 'var(--border)'}`,
                        background: color[d.k] ? d.c : 'transparent', color: color[d.k] ? '#fff' : '#475569',
                        fontSize: '0.6rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{d.l}</button>
                    ))}
                    <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 600, marginLeft: 'auto' }}>
                      {[color.offBackC, color.offBackM, color.offBackY, color.offBackK].filter(Boolean).length}
                    </span>
                  </div>
                )}

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
                  {job.sides === 2 && (
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

                {/* Perfecting + Method */}
                {job.sides === 2 && (<>
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
                  <MfLabel>ΜΕΘΟΔΟΣ 2 ΟΨΕΩΝ</MfLabel>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {([
                      { v: 'sheetwise' as const, l: 'Sheetwise' },
                      { v: 'turn' as const, l: 'Τούμπα Γων.' },
                      { v: 'tumble' as const, l: 'Τούμπα Δόντ.' },
                    ]).map(m => (
                      <Pill key={m.v} active={color.printMethod === m.v} onClick={() => setColor({ ...color, printMethod: m.v })}>{m.l}</Pill>
                    ))}
                  </div>
                </>)}
              </>) : (<>
                {/* ═══ DIGITAL COLOR ═══ */}
                <MfLabel>ΧΡΩΜΑ</MfLabel>
                <div style={{ marginBottom: 12 }}>
                  <ToggleBar value={color.model} onChange={(v) => setColor({ ...color, model: v as 'cmyk' | 'bw' })} options={[{ v: 'cmyk', l: 'Έγχρωμο (CMYK)' }, { v: 'bw', l: 'Ασπρόμαυρο (K)' }]} />
                </div>

                {/* Coverage */}
                <MfLabel>ΚΑΛΥΨΗ</MfLabel>
                <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                  {([
                    { v: 'low' as const, l: 'Χαμηλή', c: 'var(--success)', desc: '5% — Κείμενο' },
                    { v: 'mid' as const, l: 'Μεσαία', c: 'var(--accent)', desc: '20% — Κείμενο + εικόνες' },
                    { v: 'high' as const, l: 'Υψηλή', c: 'var(--danger)', desc: '60% — Φωτογραφίες' },
                  ]).map(cv => (
                    <Pill key={cv.v} active={color.coverage === cv.v} onClick={() => setColor({ ...color, coverage: cv.v })} color={cv.c}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: cv.c, flexShrink: 0 }} />
                      {cv.l}
                    </Pill>
                  ))}
                </div>
                <div style={{ fontSize: '0.6rem', color: '#64748b', marginBottom: 12 }}>
                  {color.coverage === 'low' && 'Κείμενο, φόρμες'}
                  {color.coverage === 'mid' && 'Κείμενο με εικόνες, γραφήματα'}
                  {color.coverage === 'high' && 'Φωτογραφίες, full-page γραφικά'}
                </div>
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
                    <MfInput value={impoGutter} onChange={v => setImpoGutter(Math.max(0, Number(v) || 0))} style={{ width: '100%', textAlign: 'center' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <MfLabel>BLEED (MM)</MfLabel>
                    <MfInput value={effectiveBleed} onChange={v => setImpoBleedOverride(Number(v) || 0)} style={{ width: '100%', textAlign: 'center' }} />
                  </div>
                </div>

                {/* N-Up: Force Cols/Rows */}
                {(impoMode === 'nup' || impoMode === 'cutstack') && (
                  <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <MfLabel>FORCE COLS</MfLabel>
                      <MfInput value={impoForceCols ?? ''} onChange={v => setImpoForceCols(v ? Number(v) : null)} style={{ width: '100%', textAlign: 'center' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <MfLabel>FORCE ROWS</MfLabel>
                      <MfInput value={impoForceRows ?? ''} onChange={v => setImpoForceRows(v ? Number(v) : null)} style={{ width: '100%', textAlign: 'center' }} />
                    </div>
                  </div>
                )}

                {/* Booklet */}
                {impoMode === 'booklet' && (
                  <div style={{ marginBottom: 10 }}>
                    <MfLabel>ΣΕΛΙΔΕΣ (×4)</MfLabel>
                    <MfInput value={job.pages || 8} onChange={v => setJob({ ...job, pages: Math.max(4, Number(v) || 4) })} style={{ width: 80, textAlign: 'center' }} />
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
                      <MfInput value={job.bodyPages || 64} onChange={v => setJob({ ...job, bodyPages: Math.max(4, Number(v) || 4) })} style={{ width: '100%', textAlign: 'center' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <MfLabel>ΠΑΧΟΣ (MM)</MfLabel>
                      <MfInput value={0.1} onChange={() => {}} style={{ width: '100%', textAlign: 'center' }} />
                    </div>
                  </div>
                </>)}

                {/* Work&Turn */}
                {impoMode === 'workturn' && (
                  <div style={{ marginBottom: 10 }}>
                    <MfLabel>ΤΡΟΠΟΣ ΑΝΑΣΤΡΟΦΗΣ</MfLabel>
                    <ToggleBar value="turn" onChange={() => {}} options={[{ v: 'turn', l: 'Work & Turn' }, { v: 'tumble', l: 'Work & Tumble' }]} />
                  </div>
                )}
              </>)}

              {/* Tab: Θέση (Position) */}
              {impoModeTab === 'position' && (<>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <MfLabel>OFFSET X (MM)</MfLabel>
                    <MfInput value={impoOffsetX} onChange={v => setImpoOffsetX(Number(v) || 0)} style={{ width: '100%', textAlign: 'center' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <MfLabel>OFFSET Y (MM)</MfLabel>
                    <MfInput value={impoOffsetY} onChange={v => setImpoOffsetY(Number(v) || 0)} style={{ width: '100%', textAlign: 'center' }} />
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
                <div style={{ display: 'flex', gap: 3, marginBottom: 12 }}>
                  {([0, 90, 180, 270] as const).map(deg => (
                    <Pill key={deg} active={impoRotation === deg} onClick={() => setImpoRotation(deg)}>
                      {deg}°
                    </Pill>
                  ))}
                </div>

                {job.sides === 2 && (<>
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
                  </>)}
                </div>

                {/* Plate Slug (offset only) */}
                {machine?.cat === 'offset' && (
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
                )}
              </>)}
            </>)}
          </div>
        </div>

        {/* ═══ CENTER: Imposition ═══ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 10px', minWidth: 0 }}>

          {/* Imposition mode buttons + gear — TOP */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 6, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
            {IMPO_MODES.map((m) => {
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

          {/* Canvas — fills remaining space */}
          <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '100%', height: '100%', maxWidth: 900, position: 'relative' }}>
              <ImpositionCanvas
                impo={impo}
                sheetW={sheetW}
                sheetH={sheetH}
                marginTop={machine?.marginTop || 0}
                marginBottom={machine?.marginBottom || 0}
                marginLeft={machine?.marginLeft || 0}
                marginRight={machine?.marginRight || 0}
                bleed={effectiveBleed}
                gutter={impoGutter}
                cropMarks={impoCropMarks}
                machCat={machine?.cat as 'digital' | 'offset' | undefined}
                pdf={pdf}
                onDrop={handlePdfFiles}
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
                <ImpoChip><strong>{ups}</strong>-up</ImpoChip>
                <ImpoChip><strong>{sheets}</strong> φύλ</ImpoChip>
                <ImpoChip><i className="fas fa-clock" /><strong>~{timeMin}&apos;</strong></ImpoChip>
                {calculating && <ImpoChip><i className="fas fa-spinner fa-spin" /></ImpoChip>}
              </div>
            </div>
            <input ref={pdfInputRef} type="file" accept=".pdf" style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.length) handlePdfFiles(e.target.files); e.target.value = ''; }}
            />
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
