'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { PostpressMachine, Material } from '@/generated/prisma/client';
import { FOLD_TYPES } from '@/lib/postpress/fold-types';

// ─── SAFE MATH EVALUATOR (no eval) ───
interface Token { type: string; v?: string | number }

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    if (/\s/.test(expr[i])) { i++; continue; }
    if (/\d|\./.test(expr[i])) {
      let n = '';
      while (i < expr.length && /[\d.]/.test(expr[i])) n += expr[i++];
      tokens.push({ type: 'num', v: parseFloat(n) });
      continue;
    }
    if (/[a-zA-Z_α-ωΑ-Ω]/.test(expr[i])) {
      let id = '';
      while (i < expr.length && /[a-zA-Z0-9_α-ωΑ-Ω]/.test(expr[i])) id += expr[i++];
      tokens.push({ type: 'id', v: id });
      continue;
    }
    if ('+-*/%^'.includes(expr[i])) { tokens.push({ type: 'op', v: expr[i++] }); continue; }
    if (expr[i] === '(') { tokens.push({ type: '(' }); i++; continue; }
    if (expr[i] === ')') { tokens.push({ type: ')' }); i++; continue; }
    if (expr[i] === ',') { tokens.push({ type: ',' }); i++; continue; }
    throw new Error(`Μη έγκυρος χαρακτήρας: "${expr[i]}"`);
  }
  return tokens;
}

const MATH_FNS: Record<string, (...args: number[]) => number> = {
  min: (...a) => Math.min(...a), max: (...a) => Math.max(...a),
  ceil: (x) => Math.ceil(x), floor: (x) => Math.floor(x), round: (x) => Math.round(x),
  abs: (x) => Math.abs(x), sqrt: (x) => Math.sqrt(x), pow: (a, b) => Math.pow(a, b),
};

function safeEval(expr: string, vars: Record<string, number>): number {
  if (!expr.trim()) return 0;
  const tokens = tokenize(expr);
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  function parseExpr(): number { return parseAdd(); }
  function parseAdd(): number {
    let left = parseMul();
    while (peek()?.type === 'op' && (peek()!.v === '+' || peek()!.v === '-')) {
      const op = eat().v; const right = parseMul();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  function parseMul(): number {
    let left = parsePow();
    while (peek()?.type === 'op' && (peek()!.v === '*' || peek()!.v === '/' || peek()!.v === '%')) {
      const op = eat().v; const right = parsePow();
      left = op === '*' ? left * right : op === '/' ? (right === 0 ? 0 : left / right) : left % right;
    }
    return left;
  }
  function parsePow(): number {
    let left = parseUnary();
    while (peek()?.type === 'op' && peek()!.v === '^') { eat(); left = Math.pow(left, parseUnary()); }
    return left;
  }
  function parseUnary(): number {
    if (peek()?.type === 'op' && peek()!.v === '-') { eat(); return -parseAtom(); }
    if (peek()?.type === 'op' && peek()!.v === '+') { eat(); return parseAtom(); }
    return parseAtom();
  }
  function parseAtom(): number {
    const t = peek();
    if (!t) throw new Error('Μη αναμενόμενο τέλος');
    if (t.type === 'num') { eat(); return t.v as number; }
    if (t.type === '(') { eat(); const v = parseExpr(); if (peek()?.type === ')') eat(); return v; }
    if (t.type === 'id') {
      const name = t.v as string; eat();
      // Function call?
      if (peek()?.type === '(') {
        eat();
        const args: number[] = [];
        if (peek()?.type !== ')') {
          args.push(parseExpr());
          while (peek()?.type === ',') { eat(); args.push(parseExpr()); }
        }
        if (peek()?.type === ')') eat();
        const fn = MATH_FNS[name.toLowerCase()];
        if (!fn) throw new Error(`Άγνωστη συνάρτηση: ${name}`);
        return fn(...args);
      }
      // Variable
      if (name in vars) return vars[name];
      throw new Error(`Άγνωστη μεταβλητή: ${name}`);
    }
    throw new Error(`Μη αναμενόμενο: ${JSON.stringify(t)}`);
  }
  const result = parseExpr();
  if (!isFinite(result)) return 0;
  return result;
}

// ─── FORMULA BUILDER TYPES ───
interface FormulaParam { id: string; name: string; label: string; value: number; unit: string }
interface FormulaRow { id: string; name: string; label: string; expression: string; isFinal: boolean }
interface FormulaBuilderData { params: FormulaParam[]; formulas: FormulaRow[] }

const BUILTIN_VARS: { name: string; label: string; icon: string; color: string; description: string; example: string }[] = [
  { name: 'qty',       label: 'Ποσότητα',     icon: 'fa-cubes',            color: 'var(--blue)',   description: 'Πόσα τελικά τεμάχια ζήτησε ο πελάτης. Έρχεται από τη φόρμα του calculator.', example: 'π.χ. 1000 τεμ' },
  { name: 'sheets',    label: 'Φύλλα',        icon: 'fa-file',             color: 'var(--teal)',   description: 'Πόσα φύλλα μηχανής περνούν από την εκτύπωση (qty ÷ ups + φύρες).', example: 'π.χ. 250 φύλλα' },
  { name: 'copies',    label: 'Αντίτυπα',     icon: 'fa-copy',             color: 'var(--violet)', description: 'Ίδιο με qty — alias για να βολεύει ο τύπος.', example: 'π.χ. 1000' },
  { name: 'area_m2',   label: 'Εμβαδόν m²',   icon: 'fa-vector-square',    color: 'var(--amber)',  description: 'Εμβαδόν τεμαχίου σε m² (πλάτος × ύψος).', example: 'π.χ. 0.21 (A4)' },
  { name: 'weight_kg', label: 'Βάρος kg',     icon: 'fa-weight-hanging',   color: '#f472b6',       description: 'Συνολικό βάρος χαρτιού σε kg (area_m2 × gsm × qty ÷ 1000).', example: 'π.χ. 12.5 kg' },
];

// Math functions with descriptions + examples (for advanced help panel)
const MATH_FNS_REF: { name: string; signature: string; description: string; example: string }[] = [
  { name: 'min',   signature: 'min(a, b, ...)', description: 'Μικρότερη από τις τιμές.', example: 'min(500, qty*0.1) → καπ στα 500€' },
  { name: 'max',   signature: 'max(a, b, ...)', description: 'Μεγαλύτερη από τις τιμές.', example: 'max(20, qty*0.02) → τουλάχιστον 20€' },
  { name: 'ceil',  signature: 'ceil(x)',        description: 'Στρογγυλοποίηση προς τα πάνω.', example: 'ceil(3.2) = 4' },
  { name: 'floor', signature: 'floor(x)',       description: 'Στρογγυλοποίηση προς τα κάτω.', example: 'floor(3.8) = 3' },
  { name: 'round', signature: 'round(x)',       description: 'Στρογγυλοποίηση στο πλησιέστερο.', example: 'round(3.5) = 4' },
  { name: 'abs',   signature: 'abs(x)',         description: 'Απόλυτη τιμή.', example: 'abs(-5) = 5' },
  { name: 'sqrt',  signature: 'sqrt(x)',        description: 'Τετραγωνική ρίζα.', example: 'sqrt(16) = 4' },
  { name: 'pow',   signature: 'pow(a, b)',      description: 'Ύψωση σε δύναμη (= a^b).', example: 'pow(2, 3) = 8' },
];

// Common pricing patterns (copy-paste snippets)
const COMMON_PATTERNS: { title: string; description: string; expression: string; icon: string }[] = [
  { title: 'Ελάχιστο + μέγιστο',     description: 'Τιμή με floor και cap', expression: 'min(500, max(20, qty * 0.05))',          icon: 'fa-arrows-up-down' },
  { title: 'Παρτίδες',                description: 'Χρέωση ανά ομάδα τεμαχίων', expression: 'ceil(qty / 500) * 80',               icon: 'fa-boxes-stacked' },
  { title: 'Ανά m² × ποσότητα',       description: 'Τιμή βάσει εμβαδού', expression: 'area_m2 * qty * 1.50',                       icon: 'fa-vector-square' },
  { title: 'Setup + per-piece',       description: 'Πάγιο + χρέωση ανά τεμ', expression: '50 + qty * 0.05',                         icon: 'fa-plug' },
  { title: 'Καπ στα μεγάλα orders',   description: 'Ανεβαίνει ως €500, μετά σταματάει', expression: 'min(500, qty * 0.10)',                     icon: 'fa-gauge' },
  { title: 'Βάρος × τιμή/kg',         description: 'Τιμολόγηση ανά βάρος', expression: 'weight_kg * 2.50',                           icon: 'fa-weight-hanging' },
];

const emptyFormulaBuilder = (): FormulaBuilderData => ({
  params: [{ id: crypto.randomUUID(), name: 'rate', label: 'Τιμή/τεμ', value: 0.05, unit: '€/τεμ' }],
  formulas: [{ id: crypto.randomUUID(), name: 'cost', label: 'Κόστος', expression: 'qty * rate', isFinal: true }],
});

// ─── CUSTOM PRICING COMPONENTS (Simple mode) ───
interface PricingComponent {
  id: string;
  type: 'setup' | 'per_piece' | 'per_sheet' | 'per_face' | 'per_m2' | 'per_kg' | 'per_minute';
  price: string;     // stored as string (input value)
  label?: string;    // optional custom label override
}

const COMPONENT_TYPES: {
  key: PricingComponent['type'];
  label: string;
  icon: string;
  color: string;
  unit: string;
  formula: string;
}[] = [
  { key: 'setup',      label: 'Πάγιο Setup',  icon: 'fa-plug',           color: '#64748b',        unit: '€',       formula: 'X (μια φορά)' },
  { key: 'per_piece',  label: 'Ανά τεμάχιο',  icon: 'fa-cube',           color: 'var(--blue)',    unit: '€/τεμ',   formula: 'X × τεμ' },
  { key: 'per_sheet',  label: 'Ανά φύλλο',    icon: 'fa-file',           color: 'var(--teal)',    unit: '€/φύλλο', formula: 'X × φύλλα' },
  { key: 'per_face',   label: 'Ανά όψη',      icon: 'fa-copy',           color: 'var(--violet)',  unit: '€/όψη',   formula: 'X × φύλλα × όψεις' },
  { key: 'per_m2',     label: 'Ανά m²',       icon: 'fa-vector-square',  color: 'var(--amber)',   unit: '€/m²',    formula: 'X × m² × τεμ' },
  { key: 'per_kg',     label: 'Ανά kg',       icon: 'fa-weight-hanging', color: '#f472b6',        unit: '€/kg',    formula: 'X × βάρος_συν' },
  { key: 'per_minute', label: 'Ανά λεπτό',    icon: 'fa-clock',          color: '#fb923c',        unit: '€/λεπτό', formula: 'X × λεπτά' },
];

const componentMeta = (type: PricingComponent['type']) => COMPONENT_TYPES.find(c => c.key === type)!;

// Compute a single component contribution given sample job vars.
// Used for preview in machine modal and by cost engine in production.
function computeComponent(c: PricingComponent, vars: { qty: number; sheets: number; sides: number; area_m2: number; gsm: number; speed: number }): number {
  const price = parseFloat(c.price) || 0;
  if (price <= 0) return 0;
  const { qty, sheets, sides, area_m2, gsm, speed } = vars;
  switch (c.type) {
    case 'setup':      return price;
    case 'per_piece':  return price * qty;
    case 'per_sheet':  return price * sheets;
    case 'per_face':   return price * sheets * sides;
    case 'per_m2':     return price * area_m2 * qty;
    case 'per_kg':     return price * (area_m2 * gsm * qty / 1000);
    case 'per_minute': return speed > 0 ? price * (sheets / (speed / 60)) : 0;
  }
}
import { createPostpressMachine, updatePostpressMachine, deletePostpressMachine, getLamMaterials, createLamMaterial } from './actions';

// ─── 3-PASS CUT MODEL (client-side for examples) ───
interface CutResult { totalCuts: number; totalStacks: number; totalMins: number; p1: number; p2: number; p3: number }

function calc3Pass(rows: number, cols: number, totalSheets: number, gsm: number, coated: boolean, liftH: number): CutResult {
  const trimCuts = 4;
  const secsPerCut = 20;
  const secsPerStack = 90;
  const thick = gsm * (coated ? 1.0 : 1.25) / 1000;
  const liftMM = liftH * 10;
  const sps = Math.max(1, Math.floor(liftMM / thick));
  const stacks1 = totalSheets > 0 ? Math.ceil(totalSheets / sps) : 1;

  if (rows <= 1 && cols <= 1) {
    const p1 = trimCuts * stacks1;
    return { totalCuts: p1, totalStacks: stacks1, totalMins: (p1 * secsPerCut + stacks1 * secsPerStack) / 60, p1, p2: 0, p3: 0 };
  }
  let fc: number, fs: number, sc: number;
  if (cols <= rows) { fc = cols - 1; fs = cols; sc = rows - 1; }
  else { fc = rows - 1; fs = rows; sc = cols - 1; }

  const p1 = trimCuts * stacks1;
  const p2 = fc * stacks1;
  const full = stacks1 > 1 ? stacks1 - 1 : 0;
  let last = totalSheets - full * sps; if (last <= 0) last = sps;
  const bFull = Math.max(1, Math.floor(liftMM / (sps * thick)));
  const lFull = full * Math.ceil(fs / bFull);
  const bLast = Math.max(1, Math.floor(liftMM / (last * thick)));
  const lLast = Math.ceil(fs / bLast);
  const stacks3 = lFull + lLast;
  const p3 = sc * stacks3;
  const tc = p1 + p2 + p3;
  const th = stacks1 + stacks3;
  return { totalCuts: tc, totalStacks: th, totalMins: (tc * secsPerCut + th * secsPerStack) / 60, p1, p2, p3 };
}

const EXAMPLES = [
  { name: 'Κάρτες 90×50', icon: 'fa-id-card', paper: 'Velvet 350gsm', sheet: 'SRA3', gsm: 350, coated: true, rows: 6, cols: 5, qtys: [1000, 10000] },
  { name: 'Σουπλά 420×297', icon: 'fa-utensils', paper: 'Offset 80gsm', sheet: '64×90', gsm: 80, coated: false, rows: 2, cols: 2, qtys: [1000, 10000] },
  { name: 'A4 Φυλλάδιο', icon: 'fa-file-alt', paper: 'Velvet 200gsm', sheet: '50×70', gsm: 200, coated: true, rows: 2, cols: 2, qtys: [1000, 10000] },
];

// ─── SUBTYPE META ───
type SubtypeGroup = 'cut' | 'lam' | 'finish' | 'bind' | 'other';
const SUBTYPES: { key: string; label: string; icon: string; color: string; cat: string; group: SubtypeGroup; desc: string }[] = [
  { key: 'guillotine', label: 'Γκιλοτίνα',     icon: 'fa-cut',          color: 'var(--violet)', cat: 'sheet', group: 'cut',    desc: 'Πολύπλαση κοπή φύλλων' },
  { key: 'laminator',  label: 'Πλαστικοποίηση', icon: 'fa-scroll',       color: 'var(--teal)',   cat: 'sheet', group: 'lam',    desc: 'Ρολό ή pouch' },
  { key: 'crease',     label: 'Πύκμανση',       icon: 'fa-grip-lines',   color: '#0ea5e9',       cat: 'sheet', group: 'finish', desc: 'Πύκμανση χωρίς τσάκισμα' },
  { key: 'fold',       label: 'Διπλωτική',      icon: 'fa-arrows-alt-v', color: 'var(--blue)',   cat: 'sheet', group: 'finish', desc: 'Διπλώσεις φύλλων' },
  { key: 'gathering',  label: 'Συνθετική',      icon: 'fa-stream',       color: '#a855f7',       cat: 'sheet', group: 'finish', desc: 'Συλλογή signatures (saddle/flat)' },
  { key: 'staple',     label: 'Συρραπτικό',     icon: 'fa-paperclip',    color: 'var(--amber)',  cat: 'sheet', group: 'bind',   desc: 'Φυλλάδια / μπλοκ' },
  { key: 'glue_bind',  label: 'Θερμοκόλληση',   icon: 'fa-book',         color: 'var(--amber)',  cat: 'sheet', group: 'bind',   desc: 'Δέσιμο με κόλλα' },
  { key: 'spiral',     label: 'Σπιράλ',         icon: 'fa-ring',         color: 'var(--amber)',  cat: 'sheet', group: 'bind',   desc: 'Δέσιμο με σπιράλ' },
  { key: 'custom',     label: 'Άλλο',           icon: 'fa-cogs',         color: '#64748b',       cat: 'sheet', group: 'other',  desc: 'Δικός σου τύπος' },
];

const SUBTYPE_GROUPS: { key: SubtypeGroup; label: string; icon: string }[] = [
  { key: 'cut',    label: 'Κοπή',           icon: 'fa-cut' },
  { key: 'lam',    label: 'Πλαστικοποίηση', icon: 'fa-scroll' },
  { key: 'finish', label: 'Φινίρισμα',      icon: 'fa-arrows-alt-v' },
  { key: 'bind',   label: 'Βιβλιοδεσία',    icon: 'fa-book' },
  { key: 'other',  label: 'Άλλο',           icon: 'fa-cogs' },
];

// Section header icon by label keyword (used in step-2 section cards)
function sectionIcon(label: string): string {
  if (label.includes('ΠΡΟΔΙΑΓΡΑΦΕΣ')) return 'fa-cog';
  if (label.includes('ΧΡΕΩΣΗ') || label.includes('ΤΙΜΟΛΟΓΗΣΗ')) return 'fa-tag';
  if (label.includes('ΧΡΟΝΟΙ')) return 'fa-stopwatch';
  if (label.includes('ΕΚΠΤΩΣΗ')) return 'fa-percent';
  if (label.includes('ΑΝΑΛΩΣΙΜΑ')) return 'fa-toolbox';
  if (label.includes('ΥΛΙΚΑ')) return 'fa-scroll';
  if (label.includes('ΠΛΑΣΤΙΚΟΠΟΙΗΣΗΣ')) return 'fa-layer-group';
  if (label.includes('ΜΕΤΑΒΛΗΤΕΣ')) return 'fa-microchip';
  if (label.includes('ΠΑΡΑΜΕΤΡΟΙ')) return 'fa-sliders-h';
  if (label.includes('ΤΥΠΟΙ')) return 'fa-function';
  if (label.includes('ΔΟΚΙΜΑΣΤΙΚ')) return 'fa-flask';
  return 'fa-folder';
}

const subtypeMeta = (key: string) => SUBTYPES.find(s => s.key === key) ?? SUBTYPES[SUBTYPES.length - 1];

// ─── SPEC FIELDS PER SUBTYPE ───
interface SpecField { key: string; label: string; unit?: string; type?: 'number' | 'text' | 'slider' | 'toggle'; min?: number; max?: number; step?: number }

const SPEC_FIELDS: Record<string, SpecField[]> = {
  guillotine: [
    { key: '_label', label: 'ΠΡΟΔΙΑΓΡΑΦΕΣ' },
    { key: 'cut_width', label: 'Άνοιγμα (Μπούκα)', unit: 'cm' },
    { key: 'lift_h', label: 'Ύψος Στίβας', unit: 'cm' },
    { key: '_label', label: 'ΧΡΕΩΣΗ' },
    { key: 'rate_per_cut', label: 'Μαχαιριές', unit: '€ / μαχαιριά', type: 'slider', min: 0, max: 1, step: 0.01 },
    { key: 'rate_weight', label: 'Βάρος', unit: '€ / 1000φ @100gsm', type: 'slider', min: 0, max: 10, step: 0.10 },
    { key: 'rate_per_stack', label: 'Στίβες', unit: '€ / στίβα', type: 'slider', min: 0, max: 5, step: 0.05 },
    { key: 'rate_per_minute', label: 'Χρόνος', unit: '€ / λεπτό', type: 'slider', min: 0, max: 5, step: 0.05 },
    { key: '_label', label: 'ΕΚΠΤΩΣΗ ΠΟΣΟΤΗΤΑΣ' },
    { key: 'discount_step', label: 'Βήμα (τεμ.)', unit: 'τεμ' },
    { key: 'discount_pct', label: 'Μείωση %', unit: '%' },
    { key: 'discount_max', label: 'Max %', unit: '%' },
  ],
  // laminator specs are rendered dynamically based on lam_mode — see LAMINATOR_SPECS below
  laminator: [],
  fold: [
    { key: '_label', label: 'ΠΡΟΔΙΑΓΡΑΦΕΣ' },
    { key: 'max_w', label: 'Μέγιστο πλάτος', unit: 'mm' },
    { key: 'min_gsm', label: 'Min γραμμάριο', unit: 'gsm' },
    { key: 'max_gsm', label: 'Max γραμμάριο', unit: 'gsm' },
    { key: 'speed', label: 'Ταχύτητα', unit: 'φ/ώρα' },
    { key: '_label', label: 'ΧΡΕΩΣΗ' },
    // Placeholder — actual render is custom (price table per fold type)
    { key: '_fold_prices_placeholder', label: '' },
    { key: '_label', label: 'ΕΚΠΤΩΣΗ ΠΟΣΟΤΗΤΑΣ' },
    { key: 'discount_step', label: 'Βήμα (τεμ.)', unit: 'τεμ' },
    { key: 'discount_pct', label: 'Μείωση %', unit: '%' },
    { key: 'discount_max', label: 'Max %', unit: '%' },
  ],
  crease: [
    { key: '_label', label: 'ΠΡΟΔΙΑΓΡΑΦΕΣ' },
    { key: 'max_sheet_w', label: 'Μέγιστο πλάτος φύλλου', unit: 'mm' },
    { key: 'min_gsm', label: 'Min γραμμάριο', unit: 'gsm' },
    { key: 'max_gsm', label: 'Max γραμμάριο', unit: 'gsm' },
    { key: 'max_creases', label: 'Πυκμώσεις/πέρασμα', unit: '' },
    { key: 'speed', label: 'Ταχύτητα', unit: 'φ/ώρα' },
    { key: 'has_perf', label: 'Διάτρηση μαζί', type: 'toggle' },
    { key: '_label', label: 'ΧΡΕΩΣΗ' },
    { key: 'rate_per_crease', label: 'Τιμή πύκμανσης', unit: '€/πύκμ./φύλλο' },
    { key: '_label', label: 'ΕΚΠΤΩΣΗ ΠΟΣΟΤΗΤΑΣ' },
    { key: 'discount_step', label: 'Βήμα (τεμ.)', unit: 'τεμ' },
    { key: 'discount_pct', label: 'Μείωση %', unit: '%' },
    { key: 'discount_max', label: 'Max %', unit: '%' },
  ],
  gathering: [
    { key: '_label', label: 'ΠΡΟΔΙΑΓΡΑΦΕΣ' },
    { key: 'stations', label: 'Σταθμοί (pockets)', unit: '' },
    { key: 'max_sig_w', label: 'Μέγιστο πλάτος σήματος', unit: 'mm' },
    { key: 'max_sig_h', label: 'Μέγιστο ύψος σήματος', unit: 'mm' },
    { key: 'speed', label: 'Ταχύτητα', unit: 'βιβλία/ώρα' },
    { key: '_label', label: 'ΧΡΕΩΣΗ' },
    // Placeholder — actual render is custom (mode toggle + price)
    { key: '_gather_pricing_placeholder', label: '' },
    { key: '_label', label: 'ΕΚΠΤΩΣΗ ΠΟΣΟΤΗΤΑΣ' },
    { key: 'discount_step', label: 'Βήμα (τεμ.)', unit: 'τεμ' },
    { key: 'discount_pct', label: 'Μείωση %', unit: '%' },
    { key: 'discount_max', label: 'Max %', unit: '%' },
  ],
  staple: [
    { key: '_label', label: 'ΠΡΟΔΙΑΓΡΑΦΕΣ' },
    // Custom render: staple_mode picker + spine/stack limits
    { key: '_staple_specs_placeholder', label: '' },
    { key: '_label', label: 'ΧΡΟΝΟΙ ΠΑΡΑΓΩΓΗΣ' },
    { key: 'speed_booklet', label: 'Φυλλάδια', unit: 'τεμ/ώρα' },
    { key: 'speed_pad', label: 'Μπλοκ', unit: 'τεμ/ώρα' },
    { key: '_label', label: 'ΤΙΜΟΛΟΓΗΣΗ' },
    { key: 'price_booklet', label: 'Τιμή φυλλαδίου', unit: '€/τεμ' },
    { key: 'price_pad', label: 'Τιμή μπλοκ', unit: '€/τεμ' },
    { key: '_label', label: 'ΕΚΠΤΩΣΗ ΠΟΣΟΤΗΤΑΣ' },
    { key: 'discount_step', label: 'Βήμα (τεμ.)', unit: 'τεμ' },
    { key: 'discount_pct', label: 'Μείωση %', unit: '%' },
    { key: 'discount_max', label: 'Max %', unit: '%' },
  ],
  glue_bind: [
    { key: '_label', label: 'ΠΡΟΔΙΑΓΡΑΦΕΣ' },
    { key: 'max_spine', label: 'Μέγιστη ράχη', unit: 'mm' },
    { key: '_label', label: 'ΤΙΜΟΛΟΓΗΣΗ' },
    { key: 'price_per_unit', label: 'Τιμή', unit: '€/τεμ' },
    { key: '_label', label: 'ΕΚΠΤΩΣΗ ΠΟΣΟΤΗΤΑΣ' },
    { key: 'discount_step', label: 'Βήμα (τεμ.)', unit: 'τεμ' },
    { key: 'discount_pct', label: 'Μείωση %', unit: '%' },
    { key: 'discount_max', label: 'Max %', unit: '%' },
  ],
  spiral: [
    { key: '_label', label: 'ΠΡΟΔΙΑΓΡΑΦΕΣ' },
    { key: 'max_spine', label: 'Μέγιστη ράχη', unit: 'mm' },
    { key: '_label', label: 'ΤΙΜΟΛΟΓΗΣΗ' },
    // Custom render: dynamic tiers (up_to_pages → price)
    { key: '_spiral_tiers_placeholder', label: '' },
    { key: '_label', label: 'ΕΚΠΤΩΣΗ ΠΟΣΟΤΗΤΑΣ' },
    { key: 'discount_step', label: 'Βήμα (τεμ.)', unit: 'τεμ' },
    { key: 'discount_pct', label: 'Μείωση %', unit: '%' },
    { key: 'discount_max', label: 'Max %', unit: '%' },
  ],
  custom: [
    { key: '_label', label: 'ΕΚΠΤΩΣΗ ΠΟΣΟΤΗΤΑΣ' },
    { key: 'discount_step', label: 'Βήμα (τεμ.)', unit: 'τεμ' },
    { key: 'discount_pct', label: 'Μείωση %', unit: '%' },
    { key: 'discount_max', label: 'Max %', unit: '%' },
  ],
};

// ─── FORM STATE ───
interface FormState {
  id?: string;
  name: string;
  subtype: string;
  cat: string;
  notes: string;
  setupCost: string;
  speed: string;
  minCharge: string;
  hourlyRate: string;
  specs: Record<string, string>;
}

const emptyForm = (subtype = 'guillotine'): FormState => ({
  name: '',
  subtype,
  cat: subtypeMeta(subtype).cat,
  notes: '',
  setupCost: '',
  speed: '',
  minCharge: '',
  hourlyRate: '',
  specs: {},
});

function machineToForm(m: PostpressMachine): FormState {
  const specs = (m.specs ?? {}) as Record<string, unknown>;
  const specStrings: Record<string, string> = {};
  for (const [k, v] of Object.entries(specs)) {
    if (k === 'formula_builder' && typeof v === 'object') {
      specStrings[k] = JSON.stringify(v);
    } else {
      specStrings[k] = v != null ? String(v) : '';
    }
  }
  return {
    id: m.id,
    name: m.name,
    subtype: m.subtype,
    cat: m.cat,
    notes: m.notes ?? '',
    setupCost: m.setupCost != null ? String(m.setupCost) : '',
    speed: m.speed != null ? String(m.speed) : '',
    minCharge: m.minCharge != null ? String(m.minCharge) : '',
    hourlyRate: m.hourlyRate != null ? String(m.hourlyRate) : '',
    specs: specStrings,
  };
}

// ─── COMPONENT ───
interface Props { machines: PostpressMachine[] }

// ─── MATERIAL FORM STATE ───
interface MatFormState {
  name: string;
  type: 'roll' | 'pouch';
  width: string;         // mm
  height: string;        // mm (pouch only)
  thickness: string;     // microns
  rollLength: string;    // meters (roll only)
  rollPrice: string;     // € per roll
  pouchPackPrice: string; // € per package (pouch)
  pouchPackQty: string;   // pieces per package (pouch)
  markup: string;        // % markup on cost
  sellPrice: string;     // € sell per m² (roll) or per piece (pouch)
  // Full inventory fields
  subtype: string;       // 'gloss' | 'matt' | 'soft_touch' | etc
  supplier: string;
  supplierEmail: string;
  notes: string;
  stock: string;
  stockTarget: string;
  stockAlert: string;
}

const emptyMatForm = (type: 'roll' | 'pouch' = 'roll'): MatFormState => ({
  name: '', type, width: '', height: '', thickness: '',
  rollLength: '', rollPrice: '', pouchPackPrice: '', pouchPackQty: '',
  markup: '', sellPrice: '',
  subtype: '', supplier: '', supplierEmail: '', notes: '',
  stock: '', stockTarget: '', stockAlert: '',
});

export function PostpressList({ machines }: Props) {
  const [filter, setFilter] = useState<string>('all');
  const [editing, setEditing] = useState<FormState | null>(null);
  const [step, setStep] = useState<'select' | 'configure'>('configure');
  const [saving, setSaving] = useState(false);

  const openCreate = useCallback(() => { setEditing(emptyForm()); setStep('select'); }, []);
  const openEdit = useCallback((m: PostpressMachine) => { setEditing(machineToForm(m)); setStep('configure'); }, []);
  const [formulaBuilder, setFormulaBuilder] = useState<FormulaBuilderData | null>(null);
  const formulaRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [spiralTiers, setSpiralTiers] = useState<Array<{ upTo: string; price: string }>>([]);
  const [customMode, setCustomMode] = useState<'simple' | 'advanced'>('simple');
  const [components, setComponents] = useState<PricingComponent[]>([]);

  // Lamination materials
  const [lamMaterials, setLamMaterials] = useState<Material[]>([]);
  const [matForm, setMatForm] = useState<MatFormState | null>(null);
  const [savingMat, setSavingMat] = useState(false);

  // Fetch materials when editing a lamination machine
  useEffect(() => {
    if (editing && (editing.subtype === 'laminator' || editing.subtype === 'lam_roll' || editing.subtype === 'lam_sheet')) {
      getLamMaterials().then(setLamMaterials);
    }
  }, [editing?.subtype, editing?.id]);

  // Initialize formula builder when editing a custom machine
  useEffect(() => {
    if (editing?.subtype === 'custom') {
      const raw = editing.specs.formula_builder;
      if (raw) {
        try { setFormulaBuilder(JSON.parse(raw)); } catch { setFormulaBuilder(emptyFormulaBuilder()); }
      } else {
        setFormulaBuilder(emptyFormulaBuilder());
      }
    } else {
      setFormulaBuilder(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.subtype, editing?.id]);

  // Initialize custom pricing (mode + components) when editing a custom machine
  useEffect(() => {
    if (editing?.subtype === 'custom') {
      const rawMode = editing.specs.custom_mode;
      setCustomMode(rawMode === 'advanced' ? 'advanced' : 'simple');
      const rawComponents = editing.specs.custom_components;
      if (rawComponents) {
        try {
          const parsed = typeof rawComponents === 'string' ? JSON.parse(rawComponents) : rawComponents;
          if (Array.isArray(parsed)) {
            setComponents(parsed.map((c: { type?: string; price?: number; label?: string; id?: string }) => ({
              id: c.id || crypto.randomUUID(),
              type: (c.type as PricingComponent['type']) || 'per_piece',
              price: c.price != null ? String(c.price) : '',
              label: c.label,
            })));
            return;
          }
        } catch {}
      }
      setComponents([]);
    } else {
      setComponents([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.subtype, editing?.id]);

  // Initialize spiral tiers when editing a spiral machine
  useEffect(() => {
    if (editing?.subtype === 'spiral') {
      const raw = editing.specs.spiral_tiers;
      if (raw) {
        try {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (Array.isArray(parsed)) {
            setSpiralTiers(parsed.map((t: { upTo?: number; price?: number }) => ({
              upTo: t.upTo != null ? String(t.upTo) : '',
              price: t.price != null ? String(t.price) : '',
            })));
            return;
          }
        } catch {}
      }
      setSpiralTiers([{ upTo: '', price: '' }]);
    } else {
      setSpiralTiers([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.subtype, editing?.id]);

  const handleSaveMaterial = useCallback(async () => {
    if (!matForm || !matForm.name.trim()) return;
    setSavingMat(true);
    try {
      const isRoll = matForm.type === 'roll';
      const w = parseFloat(matForm.width) || null;
      const rollLen = parseFloat(matForm.rollLength) || null;
      const rollPrice = parseFloat(matForm.rollPrice) || 0;

      let costPerUnit: number | null = null;
      let sellPerUnit: number | null = null;
      let markup: number | null = parseFloat(matForm.markup) || null;
      let unit = 'τεμ';
      const specs: Record<string, number> = {};

      if (isRoll) {
        // €/m² = rollPrice / (width_m × rollLength_m)
        if (w && rollLen) {
          costPerUnit = rollPrice / ((w / 1000) * rollLen);
        }
        specs.roll_price = rollPrice;
        unit = 'μέτρο';
      } else {
        // Pouch: cost per piece = packPrice / packQty
        const packPrice = parseFloat(matForm.pouchPackPrice) || 0;
        const packQty = parseFloat(matForm.pouchPackQty) || 1;
        costPerUnit = packPrice / packQty;
        specs.pack_price = packPrice;
        specs.qty_per_pack = packQty;
        unit = 'τεμ';
      }

      // Sell price: user can set directly or via markup
      const userSell = parseFloat(matForm.sellPrice) || null;
      if (userSell) {
        sellPerUnit = userSell;
        // Derive markup from sell/cost if cost exists
        if (costPerUnit && costPerUnit > 0) {
          markup = ((userSell - costPerUnit) / costPerUnit) * 100;
        }
      } else if (markup != null && costPerUnit) {
        sellPerUnit = costPerUnit * (1 + markup / 100);
      }

      await createLamMaterial({
        name: matForm.name.trim(),
        cat: isRoll ? 'roll' : 'film',
        subtype: matForm.subtype || matForm.type,
        width: w,
        height: isRoll ? null : (parseFloat(matForm.height) || null),
        thickness: parseFloat(matForm.thickness) || null,
        rollLength: isRoll ? rollLen : null,
        costPerUnit,
        markup,
        sellPerUnit,
        unit,
        supplier: matForm.supplier || undefined,
        supplierEmail: matForm.supplierEmail || undefined,
        notes: matForm.notes || undefined,
        stock: parseFloat(matForm.stock) || null,
        stockTarget: parseFloat(matForm.stockTarget) || null,
        stockAlert: parseFloat(matForm.stockAlert) || null,
        specs,
      });
      // Refresh list
      const updated = await getLamMaterials();
      setLamMaterials(updated);
      setMatForm(null);
    } finally {
      setSavingMat(false);
    }
  }, [matForm]);

  const filtered = filter === 'all' ? machines : machines.filter(m => m.subtype === filter);

  // Count per subtype (only show tabs that have machines + always show 'all')
  const subtypeCounts: Record<string, number> = {};
  for (const m of machines) subtypeCounts[m.subtype] = (subtypeCounts[m.subtype] || 0) + 1;
  const activeSubtypes = SUBTYPES.filter(s => subtypeCounts[s.key]);

  const handleSave = useCallback(async () => {
    if (!editing || !editing.name.trim()) return;
    setSaving(true);
    try {
      const numSpecs: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(editing.specs)) {
        if (k === 'formula_builder') continue; // handled separately
        if (k === 'spiral_tiers') { numSpecs[k] = v; continue; } // preserve array as-is
        // Preserve string modes/enums (not numbers)
        if (typeof v === 'string' && /^[a-z_]+$/.test(v) && isNaN(parseFloat(v))) {
          numSpecs[k] = v;
          continue;
        }
        if (v !== '') numSpecs[k] = parseFloat(v as string) || 0;
      }
      // Merge formula builder + components for custom subtype
      if (editing.subtype === 'custom') {
        numSpecs.custom_mode = customMode;
        if (formulaBuilder) numSpecs.formula_builder = formulaBuilder;
        numSpecs.custom_components = components
          .map(c => ({ id: c.id, type: c.type, price: parseFloat(c.price) || 0, ...(c.label ? { label: c.label } : {}) }))
          .filter(c => c.price > 0);
      }
      // Merge spiral tiers
      if (editing.subtype === 'spiral') {
        numSpecs.spiral_tiers = spiralTiers
          .map(t => ({ upTo: parseInt(t.upTo) || 0, price: parseFloat(t.price) || 0 }))
          .filter(t => t.upTo > 0 && t.price > 0)
          .sort((a, b) => a.upTo - b.upTo);
      }
      const payload = {
        name: editing.name.trim(),
        cat: editing.cat,
        subtype: editing.subtype,
        notes: editing.notes,
        setupCost: editing.setupCost ? parseFloat(editing.setupCost) : null,
        speed: editing.speed ? parseFloat(editing.speed) : null,
        minCharge: editing.minCharge ? parseFloat(editing.minCharge) : null,
        hourlyRate: editing.hourlyRate ? parseFloat(editing.hourlyRate) : null,
        specs: numSpecs,
      };
      if (editing.id) {
        await updatePostpressMachine(editing.id, payload);
      } else {
        await createPostpressMachine(payload);
      }
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }, [editing, formulaBuilder, spiralTiers, customMode, components]);

  // Shared input style
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.04)',
    color: 'var(--text)', fontSize: '0.85rem', fontFamily: 'inherit',
    outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '0.68rem', fontWeight: 600, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
    display: 'block',
  };

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 46, height: 46, borderRadius: '50%',
            border: '2px solid color-mix(in srgb, var(--violet) 35%, transparent)',
            background: 'color-mix(in srgb, var(--violet) 10%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', color: 'var(--violet)',
          }}>
            <i className="fas fa-cut" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Μετεκτύπωση</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{machines.length} μηχανήματα</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--accent)', color: '#fff',
            padding: '10px 20px', borderRadius: 10, border: 'none',
            fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(245,130,32,0.3)',
            transition: 'box-shadow 0.2s',
          }}
        >
          <i className="fas fa-plus" /> Νέο Μηχάνημα
        </button>
      </div>

      {/* Filter tabs — colored per subtype when active */}
      {activeSubtypes.length > 1 && (
        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3, marginBottom: 24, flexWrap: 'wrap', width: 'fit-content' }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '7px 16px', borderRadius: 8, border: 'none',
              fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
              color: filter === 'all' ? 'var(--text)' : 'var(--text-muted)',
              background: filter === 'all' ? 'rgba(255,255,255,0.08)' : 'transparent',
              transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <i className="fas fa-layer-group" style={{ fontSize: '0.72rem', opacity: 0.7 }} />
            Όλα <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{machines.length}</span>
          </button>
          {activeSubtypes.map(s => {
            const active = filter === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setFilter(s.key)}
                style={{
                  padding: '7px 16px', borderRadius: 8, border: 'none',
                  fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                  color: active ? s.color : 'var(--text-muted)',
                  background: active ? `color-mix(in srgb, ${s.color} 14%, transparent)` : 'transparent',
                  boxShadow: active ? `inset 0 0 0 1px color-mix(in srgb, ${s.color} 30%, transparent)` : 'none',
                  transition: 'all 0.2s ease',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <i className={`fas ${s.icon}`} style={{ fontSize: '0.72rem' }} />
                {s.label} <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{subtypeCounts[s.key]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Machine cards */}
      {filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <i className="fas fa-cut" style={{ fontSize: '2.5rem', color: 'var(--text-muted)', opacity: 0.2 }} />
          <p style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Δεν υπάρχουν μηχανήματα μετεκτύπωσης</p>
          <button
            onClick={openCreate}
            style={{ marginTop: 16, fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            + Προσθέστε το πρώτο μηχάνημα
          </button>
        </div>
      ) : (() => {
        const renderCard = (machine: PostpressMachine) => {
          const meta = subtypeMeta(machine.subtype);
          const specs = (machine.specs ?? {}) as Record<string, number>;
          return (
            <div
              key={machine.id}
              className="card pp-card"
              style={{ '--card-accent': meta.color, cursor: 'pointer' } as React.CSSProperties}
              onClick={() => openEdit(machine)}
            >
              <div className="pp-card-glow" />
              {/* Top row: orb + subtype chip */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  border: `2px solid color-mix(in srgb, ${meta.color} 40%, transparent)`,
                  background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.05rem', color: meta.color,
                  transition: 'all 400ms var(--spring)',
                  flexShrink: 0,
                }}>
                  <i className={`fas ${meta.icon}`} />
                </div>
                <span style={{
                  fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: meta.color,
                  padding: '3px 8px', borderRadius: 4,
                  background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
                  whiteSpace: 'nowrap',
                }}>
                  {meta.label}
                </span>
              </div>

              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 4 }}>
                {machine.name}
                {specs.cal_default ? <i className="fas fa-star" style={{ marginLeft: 6, fontSize: '0.6rem', color: 'var(--accent)', opacity: 0.7 }} title="Default στον Calculator" /> : null}
              </h3>
              {machine.speed ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{machine.speed} φ/ώρα</p>
              ) : null}
              {machine.setupCost != null && machine.setupCost > 0 && (
                <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 4 }}>
                  Setup €{machine.setupCost}
                  {machine.hourlyRate ? ` · €${machine.hourlyRate}/ώρα` : ''}
                </p>
              )}
              {/* Quick spec peek */}
              {(specs.costPerCut || specs.costPerUnit || specs.max_w) && (
                <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2 }}>
                  {specs.costPerCut ? `€${specs.costPerCut}/κοπή` : ''}
                  {specs.costPerUnit ? `€${specs.costPerUnit}/τεμ` : ''}
                  {specs.max_w ? `${specs.max_w}mm` : ''}
                  {specs.dual_roll ? ' · Διπλό ρολό' : ''}
                  {specs.seal_margin ? ` · ${specs.seal_margin}mm seal` : ''}
                </p>
              )}
              {/* Custom formula summary */}
              {machine.subtype === 'custom' && (() => {
                const mode = (specs.custom_mode as unknown as string) === 'advanced' ? 'advanced' : 'simple';
                if (mode === 'advanced' && specs.formula_builder) {
                  const fb = specs.formula_builder as unknown as FormulaBuilderData;
                  if (!fb?.formulas) return null;
                  const finalF = fb.formulas.find(f => f.isFinal);
                  return (
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2 }}>
                      <i className="fas fa-function" style={{ marginRight: 4, fontSize: '0.6rem', color: 'var(--violet)' }} />
                      {fb.params?.length || 0} παράμ. · {fb.formulas.length} τύπ{fb.formulas.length === 1 ? 'ος' : 'οι'}
                      {finalF ? <span style={{ color: 'var(--accent)' }}> · {finalF.label || finalF.name}</span> : null}
                    </p>
                  );
                }
                // Simple mode summary
                const comps = specs.custom_components as unknown as PricingComponent[] | undefined;
                if (!Array.isArray(comps) || !comps.length) return null;
                return (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2 }}>
                    <i className="fas fa-sliders" style={{ marginRight: 4, fontSize: '0.6rem', color: 'var(--blue)' }} />
                    {comps.length} συστατικ{comps.length === 1 ? 'ό' : 'ά'}: {comps.map(c => componentMeta(c.type).label).join(' + ')}
                  </p>
                );
              })()}

              {/* Actions */}
              <div className="pp-card-actions" style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', gap: 4, opacity: 0, transition: 'opacity 0.2s' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); openEdit(machine); }}
                  title="Επεξεργασία"
                  style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', transition: 'color 0.2s' }}
                >
                  <i className="fas fa-pen" />
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm(`Διαγραφή ${machine.name};`)) {
                      await deletePostpressMachine(machine.id);
                    }
                  }}
                  title="Διαγραφή"
                  style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', transition: 'color 0.2s' }}
                >
                  <i className="fas fa-trash" />
                </button>
              </div>
            </div>
          );
        };

        const shouldGroup = filter === 'all' && activeSubtypes.length >= 2 && machines.length >= 4;

        if (!shouldGroup) {
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {filtered.map(renderCard)}
            </div>
          );
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {activeSubtypes.map(s => {
              const group = machines.filter(m => m.subtype === s.key);
              if (!group.length) return null;
              return (
                <section key={s.key}>
                  {/* Section header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
                    paddingBottom: 10,
                    borderBottom: `1px solid color-mix(in srgb, ${s.color} 25%, transparent)`,
                  }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: `color-mix(in srgb, ${s.color} 14%, transparent)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: s.color, fontSize: '0.8rem',
                    }}>
                      <i className={`fas ${s.icon}`} />
                    </span>
                    <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: s.color, letterSpacing: '0.02em' }}>
                      {s.label}
                    </h2>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)',
                      padding: '2px 8px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.04)',
                    }}>
                      {group.length}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                    {group.map(renderCard)}
                  </div>
                </section>
              );
            })}
          </div>
        );
      })()}

      {/* ── EDIT / CREATE MODAL ── */}
      {editing && createPortal(
        <div
          className="pp-modal-backdrop"
          onClick={() => setEditing(null)}
        >
          <div
            className="pp-modal"
            style={{ '--modal-accent': subtypeMeta(editing.subtype).color } as React.CSSProperties}
            onClick={e => e.stopPropagation()}
          >
            {/* Top accent strip */}
            <div className="pp-modal-strip" />

            {/* Close button */}
            <button
              onClick={() => setEditing(null)}
              className="pp-modal-close"
              title="Κλείσιμο"
            >
              <i className="fas fa-times" />
            </button>

            <div className="pp-modal-body">
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
                {/* Back button (only in create flow, step 2) */}
                {!editing.id && step === 'configure' && (
                  <button
                    onClick={() => setStep('select')}
                    title="Πίσω στην επιλογή τύπου"
                    style={{
                      width: 38, height: 38, borderRadius: 10,
                      border: '1px solid var(--glass-border)',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'var(--text-muted)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.95rem', flexShrink: 0,
                      transition: 'all 0.18s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = subtypeMeta(editing.subtype).color; e.currentTarget.style.borderColor = `color-mix(in srgb, ${subtypeMeta(editing.subtype).color} 40%, transparent)`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--glass-border)'; }}
                  >
                    <i className="fas fa-arrow-left" />
                  </button>
                )}
                <div style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: `color-mix(in srgb, ${subtypeMeta(editing.subtype).color} 14%, transparent)`,
                  border: `1.5px solid color-mix(in srgb, ${subtypeMeta(editing.subtype).color} 40%, transparent)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: subtypeMeta(editing.subtype).color, fontSize: '1.4rem',
                  flexShrink: 0,
                }}>
                  <i className={`fas ${editing.id || step === 'configure' ? subtypeMeta(editing.subtype).icon : 'fa-th-large'}`} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em',
                    color: subtypeMeta(editing.subtype).color, textTransform: 'uppercase',
                    marginBottom: 4,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    {editing.id ? (
                      <>Επεξεργασία · {subtypeMeta(editing.subtype).label}</>
                    ) : step === 'select' ? (
                      <>Νέο Μηχάνημα · Βήμα 1/2</>
                    ) : (
                      <>{subtypeMeta(editing.subtype).label} · Βήμα 2/2</>
                    )}
                  </div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>
                    {editing.id
                      ? (editing.name || 'Χωρίς όνομα')
                      : step === 'select'
                        ? 'Επίλεξε τύπο μηχανήματος'
                        : 'Ρυθμίσεις μηχανήματος'}
                  </h2>
                </div>

                {/* Step indicator dots */}
                {!editing.id && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: subtypeMeta(editing.subtype).color,
                    }} />
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: step === 'configure' ? subtypeMeta(editing.subtype).color : 'rgba(255,255,255,0.12)',
                    }} />
                  </div>
                )}
              </div>

              {/* ── STEP 1: subtype picker ── */}
              {!editing.id && step === 'select' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {SUBTYPE_GROUPS.map(g => {
                    const items = SUBTYPES.filter(s => s.group === g.key);
                    if (!items.length) return null;
                    return (
                      <div key={g.key}>
                        <div style={{
                          fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)',
                          letterSpacing: '0.1em', marginBottom: 8,
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          <i className={`fas ${g.icon}`} style={{ fontSize: '0.65rem', opacity: 0.6 }} />
                          {g.label.toUpperCase()}
                          <span style={{ flex: 1, height: 1, background: 'var(--glass-border)', marginLeft: 4 }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                          {items.map(s => (
                            <button
                              key={s.key}
                              onClick={() => {
                                setEditing({ ...emptyForm(s.key), subtype: s.key, cat: s.cat });
                                setStep('configure');
                              }}
                              className="pp-subtype-tile pp-subtype-tile-lg"
                              style={{ '--tile-color': s.color } as React.CSSProperties}
                            >
                              <div className="pp-subtype-icon pp-subtype-icon-lg">
                                <i className={`fas ${s.icon}`} />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minWidth: 0 }}>
                                <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{s.label}</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>{s.desc}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── STEP 2: configure ── */}
              {(editing.id || step === 'configure') && (<>

              {/* Βασικά */}
              <div className="pp-section-card" style={{ marginBottom: 18 }}>
                <div className="pp-section-head">
                  <i className="fas fa-info-circle" />
                  <span>ΒΑΣΙΚΑ ΣΤΟΙΧΕΙΑ</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={labelStyle}>ΟΝΟΜΑ</label>
                    <input
                      value={editing.name}
                      onChange={e => setEditing({ ...editing, name: e.target.value })}
                      placeholder="π.χ. Polar 92"
                      style={{ ...inputStyle, padding: '10px 12px', fontSize: '0.9rem' }}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>ΣΗΜΕΙΩΣΕΙΣ</label>
                    <input
                      value={editing.notes}
                      onChange={e => setEditing({ ...editing, notes: e.target.value })}
                      placeholder="Προαιρετικές σημειώσεις..."
                      style={{ ...inputStyle, padding: '10px 12px', fontSize: '0.9rem' }}
                    />
                  </div>
                </div>
                <button
                  onClick={() => setEditing({ ...editing, specs: { ...editing.specs, cal_default: editing.specs.cal_default === '1' ? '0' : '1' } })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 16px', borderRadius: 8,
                    border: `1.5px solid ${editing.specs.cal_default === '1' ? 'var(--accent)' : 'var(--glass-border)'}`,
                    background: editing.specs.cal_default === '1' ? 'rgba(245,130,32,0.08)' : 'rgba(255,255,255,0.03)',
                    color: editing.specs.cal_default === '1' ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.2s',
                  }}
                >
                  <i className="fas fa-star" style={{ fontSize: '0.7rem', opacity: editing.specs.cal_default === '1' ? 1 : 0.3 }} />
                  {editing.specs.cal_default === '1' ? 'Ενεργό by default στον Calculator' : 'Ενεργοποίηση by default στον Calculator'}
                </button>
              </div>

              {/* Κόστος βάσης */}
              <div className="pp-section-card" style={{ marginBottom: 6 }}>
                <div className="pp-section-head">
                  <i className="fas fa-coins" />
                  <span>ΚΟΣΤΟΣ ΒΑΣΗΣ</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>ΠΑΓΙΟ SETUP (€)</label>
                    <input
                      value={editing.setupCost}
                      onChange={e => setEditing({ ...editing, setupCost: e.target.value })}
                      type="number" step="0.01" min="0" placeholder="0"
                      style={{ ...inputStyle, padding: '10px 12px' }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>ΕΛΑΧΙΣΤΗ ΧΡΕΩΣΗ (€)</label>
                    <input
                      value={editing.minCharge}
                      onChange={e => setEditing({ ...editing, minCharge: e.target.value })}
                      type="number" step="0.01" min="0" placeholder="0"
                      style={{ ...inputStyle, padding: '10px 12px' }}
                    />
                  </div>
                </div>
              </div>

            {/* ── LAMINATOR: mode toggle + mode-specific specs ── */}
            {(editing.subtype === 'laminator' || editing.subtype === 'lam_roll' || editing.subtype === 'lam_sheet') && (() => {
              const lamMode = editing.specs.lam_mode || 'roll';
              return (
                <div className="pp-section-card" style={{ marginTop: 18, marginBottom: 6 }}>
                  <div className="pp-section-head">
                    <i className="fas fa-layer-group" />
                    <span>ΤΥΠΟΣ ΠΛΑΣΤΙΚΟΠΟΙΗΣΗΣ</span>
                  </div>
                <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3, marginBottom: 16, width: 'fit-content' }}>
                  {(['roll', 'pouch'] as const).map(mode => (
                    <button key={mode} onClick={() => setEditing({ ...editing, specs: { ...editing.specs, lam_mode: mode } })}
                      style={{
                        padding: '8px 22px', borderRadius: 8, border: 'none', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                        color: lamMode === mode ? 'var(--teal)' : 'var(--text-muted)',
                        background: lamMode === mode ? 'color-mix(in srgb, var(--teal) 15%, transparent)' : 'transparent',
                        transition: 'all 0.2s',
                      }}>
                      <i className={`fas ${mode === 'roll' ? 'fa-scroll' : 'fa-layer-group'}`} style={{ marginRight: 8 }} />
                      {mode === 'roll' ? 'Ρολό' : 'Pouch'}
                    </button>
                  ))}
                </div>

                {/* Common: max_w */}
                <div style={{ display: 'grid', gridTemplateColumns: lamMode === 'roll' ? '1fr 1fr 1fr' : '1fr 1fr', gap: 14, marginBottom: 6 }}>
                  <div>
                    <label style={labelStyle}>ΑΝΟΙΓΜΑ ΜΠΟΥΚΑ (mm)</label>
                    <input value={editing.specs.max_w ?? ''} onChange={e => setEditing({ ...editing, specs: { ...editing.specs, max_w: e.target.value } })} type="number" placeholder="330" style={{ ...inputStyle, padding: '10px 12px' }} />
                  </div>
                  {lamMode === 'roll' && (
                    <div>
                      <label style={labelStyle}>ΤΑΧΥΤΗΤΑ (φ/ώρα)</label>
                      <input value={editing.specs.speed ?? ''} onChange={e => setEditing({ ...editing, specs: { ...editing.specs, speed: e.target.value } })} type="number" placeholder="500" style={{ ...inputStyle, padding: '10px 12px' }} />
                    </div>
                  )}
                  {lamMode === 'roll' ? (
                    <div>
                      <label style={labelStyle}>ΔΙΠΛΟ ΡΟΛΟ</label>
                      <button onClick={() => setEditing({ ...editing, specs: { ...editing.specs, dual_roll: editing.specs.dual_roll === '1' ? '0' : '1' } })}
                        style={{
                          width: '100%', padding: '10px 12px', borderRadius: 8,
                          border: `1.5px solid ${editing.specs.dual_roll === '1' ? 'var(--teal)' : 'var(--glass-border)'}`,
                          background: editing.specs.dual_roll === '1' ? 'color-mix(in srgb, var(--teal) 12%, transparent)' : 'rgba(255,255,255,0.04)',
                          color: editing.specs.dual_roll === '1' ? 'var(--teal)' : 'var(--text-muted)',
                          fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                        }}>
                        <i className={`fas ${editing.specs.dual_roll === '1' ? 'fa-check-circle' : 'fa-circle'}`} style={{ marginRight: 8 }} />
                        {editing.specs.dual_roll === '1' ? '2 ρολά — 2 όψεις/πέρασμα' : '1 ρολό'}
                      </button>
                    </div>
                  ) : (
                    <div>
                      <label style={labelStyle}>ΠΕΡΙΘΩΡΙΟ ΣΦΡΑΓΙΣΗΣ (mm)</label>
                      <input value={editing.specs.seal_margin ?? ''} onChange={e => setEditing({ ...editing, specs: { ...editing.specs, seal_margin: e.target.value } })} type="number" step="0.5" min="0" max="20" placeholder="5" style={{ ...inputStyle, padding: '10px 12px' }} />
                    </div>
                  )}
                </div>
                </div>
              );
            })()}

            {/* Subtype-specific spec fields */}
            {(SPEC_FIELDS[editing.subtype] ?? []).length > 0 && (() => {
              const fields = SPEC_FIELDS[editing.subtype] ?? [];
              const sections: { label: string; fields: SpecField[] }[] = [];
              let cur: { label: string; fields: SpecField[] } = { label: '', fields: [] };
              for (const f of fields) {
                if (f.key === '_label') {
                  if (cur.fields.length > 0) sections.push(cur);
                  cur = { label: f.label, fields: [] };
                } else {
                  cur.fields.push(f);
                }
              }
              if (cur.fields.length > 0) sections.push(cur);

              return sections.map((sec, si) => {
                // Custom render: spiral pricing (dynamic tiers table)
                if (editing.subtype === 'spiral' && sec.label === 'ΤΙΜΟΛΟΓΗΣΗ') {
                  return (
                    <div key={si} className="pp-section-card" style={{ marginTop: si === 0 ? 18 : 14 }}>
                      <div className="pp-section-head">
                        <i className="fas fa-tag" />
                        <span>ΤΙΜΟΛΟΓΗΣΗ ΑΝΑ ΣΕΛΙΔΕΣ</span>
                      </div>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                        Ο calculator θα διαλέξει τη γραμμή με το μικρότερο όριο σελίδων που ικανοποιεί το job.
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {/* Header */}
                        <div style={{
                          display: 'grid', gridTemplateColumns: '24px 1fr 1fr 32px', gap: 10, alignItems: 'center',
                          padding: '0 8px',
                        }}>
                          <span />
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>ΜΕΧΡΙ ΣΕΛΙΔΕΣ</span>
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>ΤΙΜΗ (€/τεμ)</span>
                          <span />
                        </div>
                        {spiralTiers.length === 0 && (
                          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', padding: 10 }}>
                            Καμία γραμμή — πάτα + παρακάτω
                          </p>
                        )}
                        {spiralTiers.map((t, i) => (
                          <div key={i} style={{
                            display: 'grid', gridTemplateColumns: '24px 1fr 1fr 32px', gap: 10, alignItems: 'center',
                            padding: '6px 8px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid var(--glass-border)',
                          }}>
                            <span style={{
                              width: 22, height: 22, borderRadius: 4,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: 'color-mix(in srgb, var(--modal-accent) 14%, transparent)',
                              color: 'var(--modal-accent)', fontSize: '0.68rem', fontWeight: 700,
                            }}>{i + 1}</span>
                            <input
                              value={t.upTo}
                              onChange={e => {
                                const next = [...spiralTiers];
                                next[i] = { ...next[i], upTo: e.target.value };
                                setSpiralTiers(next);
                              }}
                              type="number" step="1" min="1" placeholder="π.χ. 50"
                              style={{ ...inputStyle, padding: '7px 10px', fontFamily: "'DM Mono', monospace" }}
                            />
                            <input
                              value={t.price}
                              onChange={e => {
                                const next = [...spiralTiers];
                                next[i] = { ...next[i], price: e.target.value };
                                setSpiralTiers(next);
                              }}
                              type="number" step="0.01" min="0" placeholder="π.χ. 2.00"
                              style={{ ...inputStyle, padding: '7px 10px', fontFamily: "'DM Mono', monospace" }}
                            />
                            <button
                              onClick={() => setSpiralTiers(spiralTiers.filter((_, idx) => idx !== i))}
                              title="Διαγραφή γραμμής"
                              style={{
                                width: 28, height: 28, borderRadius: 6, border: 'none',
                                background: 'transparent', color: 'var(--text-muted)',
                                cursor: 'pointer', fontSize: '0.75rem',
                              }}
                            >
                              <i className="fas fa-trash" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => setSpiralTiers([...spiralTiers, { upTo: '', price: '' }])}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            padding: '8px 14px', borderRadius: 8,
                            border: '1.5px dashed var(--glass-border)', background: 'transparent',
                            color: 'var(--modal-accent)', fontSize: '0.78rem', fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit', marginTop: 4,
                          }}
                        >
                          <i className="fas fa-plus" style={{ fontSize: '0.65rem' }} /> Προσθήκη γραμμής
                        </button>
                      </div>
                    </div>
                  );
                }

                // Custom render: staple capability picker + spine/stack limits
                if (editing.subtype === 'staple' && sec.label === 'ΠΡΟΔΙΑΓΡΑΦΕΣ') {
                  const mode = editing.specs.staple_mode || 'both'; // saddle | flat | both
                  const showSaddle = mode === 'saddle' || mode === 'both';
                  const showFlat = mode === 'flat' || mode === 'both';
                  return (
                    <div key={si} className="pp-section-card" style={{ marginTop: si === 0 ? 18 : 14 }}>
                      <div className="pp-section-head">
                        <i className="fas fa-cog" />
                        <span>ΠΡΟΔΙΑΓΡΑΦΕΣ</span>
                      </div>
                      <label style={labelStyle}>ΤΥΠΟΣ ΣΥΡΡΑΠΤΙΚΟΥ</label>
                      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3, marginBottom: 16, width: 'fit-content' }}>
                        {([
                          { k: 'saddle', l: 'Saddle (φυλλάδιο)', i: 'fa-bookmark' },
                          { k: 'flat',   l: 'Flat (μπλοκ)',     i: 'fa-layer-group' },
                          { k: 'both',   l: 'Και τα δύο',        i: 'fa-arrows-up-down-left-right' },
                        ] as const).map(opt => (
                          <button key={opt.k}
                            onClick={() => setEditing({ ...editing, specs: { ...editing.specs, staple_mode: opt.k } })}
                            style={{
                              padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                              color: mode === opt.k ? 'var(--modal-accent)' : 'var(--text-muted)',
                              background: mode === opt.k ? 'color-mix(in srgb, var(--modal-accent) 15%, transparent)' : 'transparent',
                              fontFamily: 'inherit', transition: 'all 0.2s',
                            }}>
                            <i className={`fas ${opt.i}`} style={{ marginRight: 6, fontSize: '0.7rem' }} />
                            {opt.l}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        {showSaddle && (
                          <div>
                            <label style={labelStyle}>MAX ΡΑΧΗ ΦΥΛΛΑΔΙΟΥ (mm)</label>
                            <input
                              value={editing.specs.max_spine_mm ?? ''}
                              onChange={e => setEditing({ ...editing, specs: { ...editing.specs, max_spine_mm: e.target.value } })}
                              type="number" step="0.5" min="0" placeholder="6"
                              style={{ ...inputStyle, padding: '10px 12px' }}
                            />
                          </div>
                        )}
                        {showFlat && (
                          <div>
                            <label style={labelStyle}>MAX ΣΤΟΙΒΑ ΜΠΛΟΚ (mm)</label>
                            <input
                              value={editing.specs.max_stack_mm ?? ''}
                              onChange={e => setEditing({ ...editing, specs: { ...editing.specs, max_stack_mm: e.target.value } })}
                              type="number" step="0.5" min="0" placeholder="20"
                              style={{ ...inputStyle, padding: '10px 12px' }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // Custom render: gathering pricing (per_book vs per_signature) + capability
                if (editing.subtype === 'gathering' && sec.label === 'ΧΡΕΩΣΗ') {
                  const mode = editing.specs.gather_charge_mode || 'per_book';
                  const cap = editing.specs.gather_mode || 'both'; // saddle | flat | both
                  return (
                    <div key={si} className="pp-section-card" style={{ marginTop: si === 0 ? 18 : 14 }}>
                      <div className="pp-section-head">
                        <i className="fas fa-tag" />
                        <span>ΧΡΕΩΣΗ</span>
                      </div>

                      {/* Capability picker */}
                      <label style={labelStyle}>ΤΥΠΟΣ ΣΥΝΘΕΤΙΚΗΣ</label>
                      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3, marginBottom: 16, width: 'fit-content' }}>
                        {([
                          { k: 'saddle', l: 'Saddle (καρφιτσωτό)', i: 'fa-bookmark' },
                          { k: 'flat', l: 'Flat (perfect-bound)', i: 'fa-layer-group' },
                          { k: 'both', l: 'Και τα δύο', i: 'fa-arrows-up-down-left-right' },
                        ] as const).map(opt => (
                          <button key={opt.k}
                            onClick={() => setEditing({ ...editing, specs: { ...editing.specs, gather_mode: opt.k } })}
                            style={{
                              padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                              color: cap === opt.k ? 'var(--modal-accent)' : 'var(--text-muted)',
                              background: cap === opt.k ? 'color-mix(in srgb, var(--modal-accent) 15%, transparent)' : 'transparent',
                              fontFamily: 'inherit', transition: 'all 0.2s',
                            }}>
                            <i className={`fas ${opt.i}`} style={{ marginRight: 6, fontSize: '0.7rem' }} />
                            {opt.l}
                          </button>
                        ))}
                      </div>

                      {/* Charge mode toggle */}
                      <label style={labelStyle}>ΤΡΟΠΟΣ ΧΡΕΩΣΗΣ</label>
                      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3, marginBottom: 14, width: 'fit-content' }}>
                        {(['per_book', 'per_signature'] as const).map(m => (
                          <button key={m}
                            onClick={() => setEditing({ ...editing, specs: { ...editing.specs, gather_charge_mode: m } })}
                            style={{
                              padding: '8px 18px', borderRadius: 8, border: 'none', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                              color: mode === m ? 'var(--modal-accent)' : 'var(--text-muted)',
                              background: mode === m ? 'color-mix(in srgb, var(--modal-accent) 15%, transparent)' : 'transparent',
                              fontFamily: 'inherit', transition: 'all 0.2s',
                            }}>
                            <i className={`fas ${m === 'per_book' ? 'fa-book' : 'fa-stream'}`} style={{ marginRight: 8 }} />
                            {m === 'per_book' ? 'Ανά βιβλίο' : 'Ανά σήμα × βιβλίο'}
                          </button>
                        ))}
                      </div>
                      {mode === 'per_book' ? (
                        <div>
                          <label style={labelStyle}>ΤΙΜΗ ΑΝΑ ΒΙΒΛΙΟ (€/βιβλίο)</label>
                          <input
                            value={editing.specs.gather_price_per_book ?? ''}
                            onChange={e => setEditing({ ...editing, specs: { ...editing.specs, gather_price_per_book: e.target.value } })}
                            type="number" step="0.001" min="0" placeholder="0.05"
                            style={{ ...inputStyle, padding: '10px 12px', maxWidth: 220 }}
                          />
                          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 8 }}>
                            Χρέωση = τιμή × βιβλία, ανεξαρτήτου αριθμού signatures
                          </p>
                        </div>
                      ) : (
                        <div>
                          <label style={labelStyle}>ΤΙΜΗ ΑΝΑ SIGNATURE (€/σήμα ανά βιβλίο)</label>
                          <input
                            value={editing.specs.gather_price_per_signature ?? ''}
                            onChange={e => setEditing({ ...editing, specs: { ...editing.specs, gather_price_per_signature: e.target.value } })}
                            type="number" step="0.001" min="0" placeholder="0.01"
                            style={{ ...inputStyle, padding: '10px 12px', maxWidth: 220 }}
                          />
                          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 8 }}>
                            Χρέωση = τιμή × signatures × βιβλία
                          </p>
                        </div>
                      )}
                    </div>
                  );
                }

                // Custom render: fold pricing (mode toggle → per-type table OR flat per-sheet)
                if (editing.subtype === 'fold' && sec.label === 'ΧΡΕΩΣΗ') {
                  const mode = editing.specs.fold_charge_mode || 'per_type';
                  return (
                    <div key={si} className="pp-section-card" style={{ marginTop: si === 0 ? 18 : 14 }}>
                      <div className="pp-section-head">
                        <i className="fas fa-tag" />
                        <span>ΧΡΕΩΣΗ</span>
                      </div>
                      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3, marginBottom: 14, width: 'fit-content' }}>
                        {(['per_type', 'per_sheet'] as const).map(m => (
                          <button key={m}
                            onClick={() => setEditing({ ...editing, specs: { ...editing.specs, fold_charge_mode: m } })}
                            style={{
                              padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                              color: mode === m ? 'var(--modal-accent)' : 'var(--text-muted)',
                              background: mode === m ? 'color-mix(in srgb, var(--modal-accent) 15%, transparent)' : 'transparent',
                              fontFamily: 'inherit', transition: 'all 0.2s',
                            }}>
                            <i className={`fas ${m === 'per_type' ? 'fa-table-list' : 'fa-file'}`} style={{ marginRight: 8 }} />
                            {m === 'per_type' ? 'Ανά τύπο δίπλωσης' : 'Ανά φύλλο (ενιαία)'}
                          </button>
                        ))}
                      </div>

                      {mode === 'per_type' ? (<>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                          Τιμή ανά φύλλο (€) ανάλογα με τον τύπο. Άφησε κενό όσους τύπους δεν υποστηρίζεις.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {FOLD_TYPES.map(ft => {
                            const priceKey = `fold_price_${ft.key}`;
                            const needsRA = ft.passes > 1;
                            const hasRA = editing.specs.right_angle === '1';
                            const disabled = needsRA && !hasRA;
                            const toggleRA = () => setEditing({ ...editing, specs: { ...editing.specs, right_angle: hasRA ? '0' : '1' } });
                            return (
                              <div key={ft.key} style={{
                                display: 'grid', gridTemplateColumns: '28px 1fr auto 110px 110px', gap: 10, alignItems: 'center',
                                padding: '6px 8px', borderRadius: 8,
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid var(--glass-border)',
                              }}>
                                <div style={{
                                  width: 24, height: 24, borderRadius: 6,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: `color-mix(in srgb, var(--modal-accent) ${disabled ? 6 : 12}%, transparent)`,
                                  color: 'var(--modal-accent)', fontSize: '0.7rem',
                                  opacity: disabled ? 0.5 : 1,
                                }}>
                                  <i className={`fas ${ft.icon}`} />
                                </div>
                                <div style={{ opacity: disabled ? 0.5 : 1 }}>
                                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>{ft.label}</div>
                                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                    {ft.folds} δίπλ{ft.folds === 1 ? 'α' : 'ες'} · {ft.passes} πέρασμα{ft.passes === 1 ? '' : 'τα'}
                                  </div>
                                </div>
                                {/* Right-angle inline toggle (only for cross-fold rows) */}
                                {needsRA ? (
                                  <button
                                    onClick={toggleRA}
                                    title={hasRA
                                      ? 'Right-angle station ενεργό — απενεργοποίηση για όλες τις σταυρωτές'
                                      : 'Ενεργοποίηση right-angle station (απαιτείται για σταυρωτές)'}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 5,
                                      padding: '4px 9px', borderRadius: 6,
                                      border: `1px solid ${hasRA ? 'var(--modal-accent)' : 'var(--glass-border)'}`,
                                      background: hasRA
                                        ? 'color-mix(in srgb, var(--modal-accent) 14%, transparent)'
                                        : 'rgba(255,255,255,0.03)',
                                      color: hasRA ? 'var(--modal-accent)' : 'var(--text-muted)',
                                      fontSize: '0.66rem', fontWeight: 600, cursor: 'pointer',
                                      fontFamily: 'inherit', whiteSpace: 'nowrap',
                                    }}
                                  >
                                    <i className={`fas ${hasRA ? 'fa-check-circle' : 'fa-circle-exclamation'}`} style={{ fontSize: '0.62rem' }} />
                                    Right-angle
                                  </button>
                                ) : <span />}
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'right', opacity: disabled ? 0.5 : 1 }}>€/φύλλο</span>
                                <input
                                  value={editing.specs[priceKey] ?? ''}
                                  onChange={e => setEditing({ ...editing, specs: { ...editing.specs, [priceKey]: e.target.value } })}
                                  type="number" step="0.001" min="0" placeholder="—"
                                  disabled={disabled}
                                  style={{ ...inputStyle, padding: '7px 10px', textAlign: 'right', fontFamily: "'DM Mono', monospace", cursor: disabled ? 'not-allowed' : undefined, opacity: disabled ? 0.5 : 1 }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </>) : (
                        <div>
                          <label style={labelStyle}>ΤΙΜΗ ΦΥΛΛΟΥ (€/φύλλο)</label>
                          <input
                            value={editing.specs.fold_price_flat ?? ''}
                            onChange={e => setEditing({ ...editing, specs: { ...editing.specs, fold_price_flat: e.target.value } })}
                            type="number" step="0.001" min="0" placeholder="0.05"
                            style={{ ...inputStyle, padding: '10px 12px', maxWidth: 220 }}
                          />
                          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 8 }}>
                            Χρέωση = τιμή × φύλλα, ανεξαρτήτου τύπου δίπλωσης
                          </p>
                        </div>
                      )}
                    </div>
                  );
                }

                // Custom render: crease pricing (per-crease vs per-sheet toggle)
                if (editing.subtype === 'crease' && sec.label === 'ΧΡΕΩΣΗ') {
                  const mode = editing.specs.crease_charge_mode || 'per_crease';
                  return (
                    <div key={si} className="pp-section-card" style={{ marginTop: si === 0 ? 18 : 14 }}>
                      <div className="pp-section-head">
                        <i className="fas fa-tag" />
                        <span>ΧΡΕΩΣΗ</span>
                      </div>
                      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3, marginBottom: 14, width: 'fit-content' }}>
                        {(['per_crease', 'per_sheet'] as const).map(m => (
                          <button key={m}
                            onClick={() => setEditing({ ...editing, specs: { ...editing.specs, crease_charge_mode: m } })}
                            style={{
                              padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                              color: mode === m ? 'var(--modal-accent)' : 'var(--text-muted)',
                              background: mode === m ? 'color-mix(in srgb, var(--modal-accent) 15%, transparent)' : 'transparent',
                              fontFamily: 'inherit', transition: 'all 0.2s',
                            }}>
                            <i className={`fas ${m === 'per_crease' ? 'fa-grip-lines' : 'fa-file'}`} style={{ marginRight: 8 }} />
                            {m === 'per_crease' ? 'Ανά πύκμανση' : 'Ανά φύλλο'}
                          </button>
                        ))}
                      </div>
                      {mode === 'per_crease' ? (
                        <div>
                          <label style={labelStyle}>ΤΙΜΗ ΠΥΚΜΑΝΣΗΣ (€/πύκμ./φύλλο)</label>
                          <input
                            value={editing.specs.rate_per_crease ?? ''}
                            onChange={e => setEditing({ ...editing, specs: { ...editing.specs, rate_per_crease: e.target.value } })}
                            type="number" step="0.001" min="0" placeholder="0.025"
                            style={{ ...inputStyle, padding: '10px 12px', maxWidth: 220 }}
                          />
                          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 8 }}>
                            Χρέωση = τιμή × πυκμώσεις × φύλλα
                          </p>
                        </div>
                      ) : (
                        <div>
                          <label style={labelStyle}>ΤΙΜΗ ΦΥΛΛΟΥ (€/φύλλο)</label>
                          <input
                            value={editing.specs.rate_per_sheet ?? ''}
                            onChange={e => setEditing({ ...editing, specs: { ...editing.specs, rate_per_sheet: e.target.value } })}
                            type="number" step="0.001" min="0" placeholder="0.05"
                            style={{ ...inputStyle, padding: '10px 12px', maxWidth: 220 }}
                          />
                          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 8 }}>
                            Χρέωση = τιμή × φύλλα, ανεξαρτήτου πυκμάνσεων
                          </p>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                <div key={si} className="pp-section-card" style={{ marginTop: si === 0 ? 18 : 14 }}>
                  <div className="pp-section-head">
                    <i className={`fas ${sectionIcon(sec.label)}`} />
                    <span>{sec.label}</span>
                  </div>
                  {sec.fields.some(f => f.type === 'slider') ? (<>
                    {/* Presets */}
                    {(() => {
                      const presets: { label: string; icon: string; values: Record<string, string> }[] = [
                        { label: 'Μαχαιριές', icon: 'fa-scissors', values: { rate_per_cut: '0.12', rate_weight: '0', rate_per_stack: '0', rate_per_minute: '0' } },
                        { label: 'Βάρος', icon: 'fa-weight-hanging', values: { rate_per_cut: '0', rate_weight: '2.00', rate_per_stack: '0', rate_per_minute: '0' } },
                        { label: 'Στίβες', icon: 'fa-layer-group', values: { rate_per_cut: '0', rate_weight: '0', rate_per_stack: '0.80', rate_per_minute: '0' } },
                        { label: 'Χρόνος', icon: 'fa-clock', values: { rate_per_cut: '0', rate_weight: '0', rate_per_stack: '0', rate_per_minute: '1.20' } },
                        { label: 'Μιξ Κοπή+Βάρος', icon: 'fa-blender', values: { rate_per_cut: '0.08', rate_weight: '1.50', rate_per_stack: '0', rate_per_minute: '0' } },
                        { label: 'Πλήρες', icon: 'fa-sliders-h', values: { rate_per_cut: '0.06', rate_weight: '1.00', rate_per_stack: '0.40', rate_per_minute: '0.60' } },
                      ];
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                          <span style={{ fontSize: '0.68rem', color: '#475569', fontWeight: 600, display: 'flex', alignItems: 'center', marginRight: 4 }}>Σενάρια:</span>
                          {presets.map(p => (
                            <button
                              key={p.label}
                              onClick={() => setEditing({ ...editing, specs: { ...editing.specs, ...p.values } })}
                              style={{
                                padding: '5px 12px', borderRadius: 7, border: '1px solid var(--glass-border)',
                                background: 'rgba(255,255,255,0.03)', color: '#94a3b8',
                                fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 5,
                                transition: 'all 0.15s',
                              }}
                            >
                              <i className={`fas ${p.icon}`} style={{ fontSize: '0.6rem' }} />
                              {p.label}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                      {sec.fields.map(f => {
                        const icons: Record<string, string> = { rate_per_cut: 'fa-scissors', rate_weight: 'fa-weight-hanging', rate_per_stack: 'fa-layer-group', rate_per_minute: 'fa-clock' };
                        const colors: Record<string, string> = { rate_per_cut: 'var(--violet)', rate_weight: 'var(--teal)', rate_per_stack: 'var(--blue)', rate_per_minute: 'var(--amber)' };
                        const clr = colors[f.key] || 'var(--accent)';
                        return (
                          <div key={f.key} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                            padding: '16px 10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 12,
                            border: '1px solid var(--glass-border)',
                          }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: 8,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: `color-mix(in srgb, ${clr} 15%, transparent)`,
                              color: clr, fontSize: '0.8rem',
                            }}>
                              <i className={`fas ${icons[f.key] || 'fa-circle'}`} />
                            </div>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#cbd5e1' }}>{f.label}</span>
                            <span style={{ fontSize: '0.62rem', color: '#64748b', marginTop: -4 }}>{f.unit}</span>
                            <input
                              type="range"
                              min={f.min ?? 0} max={f.max ?? 1} step={f.step ?? 0.01}
                              value={editing.specs[f.key] ?? '0'}
                              onChange={e => setEditing({ ...editing, specs: { ...editing.specs, [f.key]: e.target.value } })}
                              className="pp-slider"
                              style={{ width: '100%', accentColor: clr }}
                            />
                            <input
                              type="number"
                              min={f.min ?? 0} max={f.max ?? 999} step={f.step ?? 0.01}
                              value={editing.specs[f.key] ?? ''}
                              onChange={e => setEditing({ ...editing, specs: { ...editing.specs, [f.key]: e.target.value } })}
                              placeholder="0.00"
                              style={{
                                width: '80%', padding: '7px 8px', borderRadius: 8,
                                border: `1.5px solid color-mix(in srgb, ${clr} 30%, transparent)`,
                                background: 'rgba(255,255,255,0.03)',
                                color: clr, fontSize: '0.95rem', fontWeight: 700,
                                textAlign: 'center' as const, fontFamily: 'inherit', outline: 'none',
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    {/* ── ΔΟΚΙΜΑΣΤΙΚΟΙ ΥΠΟΛΟΓΙΣΜΟΙ ── */}
                    {editing.subtype === 'guillotine' && (() => {
                      const liftH = parseFloat(editing.specs.lift_h || '0') || 8;
                      const rCut = parseFloat(editing.specs.rate_per_cut || '0');
                      const rWeight = parseFloat(editing.specs.rate_weight || '0');
                      const rStack = parseFloat(editing.specs.rate_per_stack || '0');
                      const rMin = parseFloat(editing.specs.rate_per_minute || '0');
                      const setupC = parseFloat(editing.setupCost || '0');
                      const minCh = parseFloat(editing.minCharge || '0');
                      const hasRates = rCut > 0 || rWeight > 0 || rStack > 0 || rMin > 0;
                      if (!hasRates) return null;

                      function calcEx(ex: typeof EXAMPLES[0], qty: number) {
                        const ups = ex.rows * ex.cols;
                        const sheets = Math.ceil(qty / ups);
                        const cp = calc3Pass(ex.rows, ex.cols, sheets, ex.gsm, ex.coated, liftH);
                        const chCut = cp.totalCuts * rCut;
                        const chWeight = (ex.gsm / 100) * rWeight * (sheets / 1000);
                        const chStack = cp.totalStacks * rStack;
                        const chTime = cp.totalMins * rMin;
                        let charge = setupC + chCut + chWeight + chStack + chTime;
                        if (minCh > 0 && charge < minCh) charge = minCh;
                        const perUnit = qty > 0 ? charge / qty : 0;
                        return { ...cp, sheets, ups, charge, perUnit };
                      }

                      const fmt = (v: number) => v.toFixed(2) + '€';
                      const fmtT = (m: number) => m < 1 ? '<1\'' : '~' + Math.round(m) + '\'';

                      return (
                        <div style={{ marginTop: 18 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <i className="fas fa-flask" style={{ fontSize: '0.7rem', color: 'var(--accent)' }} />
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.06em' }}>ΔΟΚΙΜΑΣΤΙΚΟΙ ΥΠΟΛΟΓΙΣΜΟΙ</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                            {EXAMPLES.map(ex => {
                              const r1 = calcEx(ex, ex.qtys[0]);
                              const r2 = calcEx(ex, ex.qtys[1]);
                              return (
                                <div key={ex.name} style={{
                                  padding: '14px 12px', borderRadius: 10,
                                  background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)',
                                }}>
                                  {/* Header */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                    <i className={`fas ${ex.icon}`} style={{ fontSize: '0.65rem', color: '#64748b' }} />
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0' }}>{ex.name}</span>
                                  </div>
                                  <div style={{ fontSize: '0.65rem', color: '#475569', marginBottom: 10 }}>
                                    {ex.paper} · {ex.sheet} · {r1.ups}-up
                                  </div>
                                  {/* Two qty columns */}
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    {[{ r: r1, q: ex.qtys[0] }, { r: r2, q: ex.qtys[1] }].map(({ r, q }) => (
                                      <div key={q} style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: 4 }}>{q.toLocaleString('el')} τεμ</div>
                                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
                                          <span style={{ fontSize: '0.62rem', color: 'var(--blue)', fontWeight: 600 }}>
                                            <i className="fas fa-coins" style={{ fontSize: '0.5rem', marginRight: 2 }} />{fmt(r.perUnit)}
                                          </span>
                                          <span style={{ fontSize: '0.62rem', color: '#475569' }}>→</span>
                                          <span style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 700 }}>{fmt(r.charge)}</span>
                                        </div>
                                        <div style={{ fontSize: '0.58rem', color: '#475569', marginTop: 3 }}>
                                          <i className="fas fa-cut" style={{ marginRight: 2 }} />
                                          {r.p1}+{r.p2}+{r.p3}={r.totalCuts} · {fmtT(r.totalMins)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </>) : (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sec.label.includes('ΕΚΠΤΩΣΗ') ? 3 : 2}, 1fr)`, gap: 14 }}>
                      {sec.fields.map(f => (
                        <div key={f.key}>
                          <label style={labelStyle}>{f.label} {f.unit ? `(${f.unit})` : ''}</label>
                          {f.type === 'toggle' ? (
                            <button
                              onClick={() => setEditing({ ...editing, specs: { ...editing.specs, [f.key]: editing.specs[f.key] === '1' ? '0' : '1' } })}
                              style={{
                                width: '100%', padding: '10px 12px', borderRadius: 8,
                                border: `1.5px solid ${editing.specs[f.key] === '1' ? 'var(--modal-accent, var(--teal))' : 'var(--glass-border)'}`,
                                background: editing.specs[f.key] === '1' ? 'color-mix(in srgb, var(--modal-accent, var(--teal)) 12%, transparent)' : 'rgba(255,255,255,0.04)',
                                color: editing.specs[f.key] === '1' ? 'var(--modal-accent, var(--teal))' : 'var(--text-muted)',
                                fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                transition: 'all 0.2s',
                              }}
                            >
                              <i className={`fas ${editing.specs[f.key] === '1' ? 'fa-check-circle' : 'fa-circle'}`} style={{ marginRight: 8 }} />
                              {editing.specs[f.key] === '1' ? 'Ναι' : 'Όχι'}
                            </button>
                          ) : (
                            <input
                              value={editing.specs[f.key] ?? ''}
                              onChange={e => setEditing({ ...editing, specs: { ...editing.specs, [f.key]: e.target.value } })}
                              type={f.type === 'text' ? 'text' : 'number'}
                              step={f.step ?? 0.01} min={f.min ?? 0}
                              style={{ ...inputStyle, padding: '10px 12px' }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                );
              });
            })()}

            {/* ── CUSTOM PRICING: mode toggle ── */}
            {editing.subtype === 'custom' && (() => {
              // Sample vars for live preview
              const sampleVars = { qty: 1000, sheets: 250, sides: 2, area_m2: 0.21, gsm: 150, speed: Number(editing.speed) || 500 };
              const componentCharges = components.map(c => ({ c, v: computeComponent(c, sampleVars) }));
              const subtotal = componentCharges.reduce((s, x) => s + x.v, 0);
              const minCh = parseFloat(editing.minCharge) || 0;
              const total = minCh > 0 && subtotal < minCh ? minCh : subtotal;

              return (
                <div className="pp-section-card" style={{ marginTop: 22 }}>
                  <div className="pp-section-head">
                    <i className="fas fa-tag" />
                    <span>ΤΙΜΟΛΟΓΗΣΗ</span>
                  </div>

                  <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3, marginBottom: 18, width: 'fit-content' }}>
                    {(['simple', 'advanced'] as const).map(m => (
                      <button key={m}
                        onClick={() => setCustomMode(m)}
                        style={{
                          padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                          color: customMode === m ? 'var(--modal-accent)' : 'var(--text-muted)',
                          background: customMode === m ? 'color-mix(in srgb, var(--modal-accent) 15%, transparent)' : 'transparent',
                          fontFamily: 'inherit', transition: 'all 0.2s',
                        }}>
                        <i className={`fas ${m === 'simple' ? 'fa-sliders' : 'fa-function'}`} style={{ marginRight: 8 }} />
                        {m === 'simple' ? 'Απλή' : 'Advanced'}
                      </button>
                    ))}
                  </div>

                  {customMode === 'simple' && (<>
                    {/* Component list */}
                    {components.length === 0 ? (
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                        Διάλεξε τύπους χρέωσης παρακάτω — συνδυάζονται αθροιστικά
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                        {components.map((c, i) => {
                          const meta = componentMeta(c.type);
                          const contribution = componentCharges[i]?.v ?? 0;
                          return (
                            <div key={c.id} style={{
                              display: 'grid', gridTemplateColumns: '32px 1fr 120px 100px 32px', gap: 10, alignItems: 'center',
                              padding: '8px 10px', borderRadius: 8,
                              background: 'rgba(255,255,255,0.02)',
                              border: `1px solid color-mix(in srgb, ${meta.color} 20%, var(--glass-border))`,
                              borderLeftWidth: 3, borderLeftColor: meta.color,
                            }}>
                              <div style={{
                                width: 28, height: 28, borderRadius: 6,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
                                color: meta.color, fontSize: '0.78rem',
                              }}>
                                <i className={`fas ${meta.icon}`} />
                              </div>
                              <div>
                                <input
                                  value={c.label ?? ''}
                                  onChange={e => setComponents(components.map(x => x.id === c.id ? { ...x, label: e.target.value } : x))}
                                  placeholder={meta.label}
                                  style={{
                                    ...inputStyle,
                                    padding: '3px 6px',
                                    fontSize: '0.82rem',
                                    fontWeight: 600,
                                    color: 'var(--text)',
                                    background: 'transparent',
                                    border: '1px solid transparent',
                                    marginBottom: 2,
                                  }}
                                  title="Δικό σου όνομα (προαιρετικό)"
                                />
                                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: "'DM Mono', monospace", paddingLeft: 6 }}>
                                  {meta.label} · {meta.formula}
                                </div>
                              </div>
                              <input
                                value={c.price}
                                onChange={e => setComponents(components.map(x => x.id === c.id ? { ...x, price: e.target.value } : x))}
                                type="number" step="0.001" min="0" placeholder="0.00"
                                style={{ ...inputStyle, padding: '7px 10px', textAlign: 'right', fontFamily: "'DM Mono', monospace" }}
                              />
                              <span style={{ fontSize: '0.7rem', color: contribution > 0 ? 'var(--accent)' : 'var(--text-muted)', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
                                = €{contribution.toFixed(2)}
                              </span>
                              <button
                                onClick={() => setComponents(components.filter(x => x.id !== c.id))}
                                title="Αφαίρεση"
                                style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.72rem' }}
                              ><i className="fas fa-trash" /></button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Tile picker — add new component */}
                    <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 8, marginTop: components.length > 0 ? 6 : 0 }}>
                      + ΠΡΟΣΘΗΚΗ ΣΥΣΤΑΤΙΚΟΥ ΧΡΕΩΣΗΣ
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                      {COMPONENT_TYPES.map(ct => (
                        <button key={ct.key}
                          onClick={() => setComponents([...components, { id: crypto.randomUUID(), type: ct.key, price: '' }])}
                          title={ct.formula}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px',
                            borderRadius: 8, border: '1px dashed var(--glass-border)',
                            background: `color-mix(in srgb, ${ct.color} 5%, transparent)`,
                            color: ct.color, fontSize: '0.72rem', fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                            textAlign: 'left',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, ${ct.color} 12%, transparent)`; e.currentTarget.style.borderStyle = 'solid'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = `color-mix(in srgb, ${ct.color} 5%, transparent)`; e.currentTarget.style.borderStyle = 'dashed'; }}
                        >
                          <i className={`fas ${ct.icon}`} style={{ fontSize: '0.68rem' }} />
                          {ct.label}
                        </button>
                      ))}
                    </div>

                    {/* Live preview */}
                    {components.length > 0 && (
                      <div style={{
                        marginTop: 16, padding: '12px 14px', borderRadius: 10,
                        background: 'color-mix(in srgb, var(--modal-accent) 5%, rgba(255,255,255,0.02))',
                        border: '1px solid color-mix(in srgb, var(--modal-accent) 20%, transparent)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <i className="fas fa-flask" style={{ fontSize: '0.7rem', color: 'var(--modal-accent)' }} />
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--modal-accent)', letterSpacing: '0.06em' }}>ΔΟΚΙΜΑΣΤΙΚΟΣ ΥΠΟΛΟΓΙΣΜΟΣ</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: '0.66rem', color: 'var(--text-muted)', marginBottom: 10, fontFamily: "'DM Mono', monospace" }}>
                          <span>τεμ=<strong style={{ color: 'var(--blue)' }}>1000</strong></span>
                          <span>φύλλα=<strong style={{ color: 'var(--teal)' }}>250</strong></span>
                          <span>όψεις=<strong style={{ color: 'var(--violet)' }}>2</strong></span>
                          <span>m²=<strong style={{ color: 'var(--amber)' }}>0.21</strong></span>
                          <span>gsm=<strong style={{ color: '#f472b6' }}>150</strong></span>
                          <span>ταχ=<strong style={{ color: '#fb923c' }}>{sampleVars.speed}</strong></span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--glass-border)', paddingTop: 8 }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>
                            {minCh > 0 && subtotal < minCh ? `Min charge (€${minCh.toFixed(2)})` : 'Σύνολο'}
                          </span>
                          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)' }}>€{total.toFixed(2)}</span>
                        </div>
                        <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: 2 }}>
                          ανά τεμάχιο: €{(total / 1000).toFixed(4)}
                        </div>
                      </div>
                    )}
                  </>)}
                </div>
              );
            })()}

            {/* ── FORMULA BUILDER (advanced mode) ── */}
            {editing.subtype === 'custom' && customMode === 'advanced' && formulaBuilder && (() => {
              const fb = formulaBuilder;
              const updateFB = (patch: Partial<FormulaBuilderData>) => setFormulaBuilder({ ...fb, ...patch });

              // Helper: insert variable name at cursor in a formula input
              const insertVar = (formulaId: string, varName: string) => {
                const el = formulaRefs.current[formulaId];
                if (el) {
                  const s = el.selectionStart ?? el.value.length;
                  const e = el.selectionEnd ?? s;
                  const before = el.value.slice(0, s);
                  const after = el.value.slice(e);
                  const pad = (str: string, pos: number) => (pos > 0 && !/[\s(+\-*/%^,]$/.test(str)) ? ' ' : '';
                  const newExpr = before + pad(before, s) + varName + pad(after, 0) + after;
                  updateFB({ formulas: fb.formulas.map(f => f.id === formulaId ? { ...f, expression: newExpr } : f) });
                  setTimeout(() => { const np = s + varName.length + (pad(before, s) ? 1 : 0); el.setSelectionRange(np, np); el.focus(); }, 10);
                } else {
                  // Fallback: append
                  updateFB({ formulas: fb.formulas.map(f => f.id === formulaId ? { ...f, expression: (f.expression ? f.expression + ' ' : '') + varName } : f) });
                }
              };

              // Build variable context for live preview
              const sampleVars: Record<string, number> = { qty: 1000, sheets: 500, copies: 1000, area_m2: 0.21, weight_kg: 12.5 };
              for (const p of fb.params) if (p.name) sampleVars[p.name] = p.value;

              // Evaluate formulas in order for preview
              const formulaResults: { value: number | null; error: string | null }[] = fb.formulas.map(f => {
                try {
                  const v = safeEval(f.expression, sampleVars);
                  if (f.name) sampleVars[f.name] = v;
                  return { value: v, error: null };
                } catch (err) {
                  return { value: null, error: (err as Error).message };
                }
              });

              // Available vars for each formula
              const availableVars = (upToIdx: number) => {
                const vars: { name: string; label: string; icon: string; color: string; type: string }[] =
                  BUILTIN_VARS.map(b => ({ name: b.name, label: b.label, icon: b.icon, color: b.color, type: 'builtin' }));
                for (const p of fb.params) if (p.name) vars.push({ name: p.name, label: p.label || p.name, icon: 'fa-sliders-h', color: 'var(--blue)', type: 'param' });
                for (let i = 0; i < upToIdx; i++) {
                  const f = fb.formulas[i];
                  if (f.name) vars.push({ name: f.name, label: f.label || f.name, icon: 'fa-function', color: 'var(--violet)', type: 'formula' });
                }
                return vars;
              };

              const chipStyle = (color: string, active = false): React.CSSProperties => ({
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 7,
                border: `1.5px solid color-mix(in srgb, ${color} ${active ? '50%' : '25%'}, transparent)`,
                background: `color-mix(in srgb, ${color} ${active ? '12%' : '5%'}, transparent)`,
                color: active ? color : '#94a3b8',
                fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                fontFamily: "'DM Mono', monospace",
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              });

              const sectionDivider = (label: string, color: string, icon: string) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 12 }}>
                  <div style={{ height: 1, flex: 1, background: 'var(--glass-border)' }} />
                  <i className={`fas ${icon}`} style={{ fontSize: '0.6rem', color }} />
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', color }}>{label}</span>
                  <div style={{ height: 1, flex: 1, background: 'var(--glass-border)' }} />
                </div>
              );

              return (<>
                {/* ── HOW IT WORKS (collapsible quick-start) ── */}
                <details style={{ marginTop: 18, borderRadius: 10, border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
                  <summary style={{
                    padding: '10px 14px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
                    color: 'var(--accent)', letterSpacing: '0.04em',
                    display: 'flex', alignItems: 'center', gap: 8,
                    listStyle: 'none',
                  }}>
                    <i className="fas fa-circle-question" />
                    <span>Πώς λειτουργεί το Advanced — διάβασέ με αν σε μπερδεύει</span>
                    <i className="fas fa-chevron-down" style={{ marginLeft: 'auto', fontSize: '0.65rem', opacity: 0.6 }} />
                  </summary>
                  <div style={{ padding: '4px 16px 14px', fontSize: '0.75rem', color: '#cbd5e1', lineHeight: 1.55 }}>
                    <p style={{ marginBottom: 8 }}>Γράφεις <strong style={{ color: 'var(--accent)' }}>μαθηματικούς τύπους</strong> που χρησιμοποιούν μεταβλητές από το job (π.χ. <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3, color: 'var(--blue)', fontFamily: "'DM Mono', monospace" }}>qty</code>, <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3, color: 'var(--teal)', fontFamily: "'DM Mono', monospace" }}>sheets</code>) και δικές σου παραμέτρους. Ο calculator τα υπολογίζει για κάθε job.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', marginTop: 10, fontSize: '0.72rem' }}>
                      <span style={{ color: '#64748b', fontWeight: 700 }}>1️⃣ Μεταβλητές συστήματος</span>
                      <span>Έρχονται αυτόματα από το job (qty, sheets, area_m2…). Μην τις αλλάζεις, χρησιμοποίησέ τες.</span>
                      <span style={{ color: '#64748b', fontWeight: 700 }}>2️⃣ Παράμετροι μηχανής</span>
                      <span>Δικές σου «σταθερές» — π.χ. <code style={{ fontFamily: "'DM Mono', monospace", color: 'var(--blue)' }}>rate = 0.05</code> (€/τεμ). Τις ορίζεις μια φορά.</span>
                      <span style={{ color: '#64748b', fontWeight: 700 }}>3️⃣ Τύποι υπολογισμού</span>
                      <span>Γράφεις έκφραση (π.χ. <code style={{ fontFamily: "'DM Mono', monospace" }}>qty * rate + 20</code>). Ένας τύπος έχει ⭐ = <strong>τελικό κόστος</strong>.</span>
                      <span style={{ color: '#64748b', fontWeight: 700 }}>🔧 Διαθέσιμα</span>
                      <span>Βασικά: <code>+  -  *  /  ^</code>. Συναρτήσεις: <code>min, max, ceil, floor, round, abs, sqrt, pow</code>.</span>
                      <span style={{ color: '#64748b', fontWeight: 700 }}>⚠️ Δεν γίνεται</span>
                      <span>Συνθήκες (<code>if</code>). Αν θες floor/cap χρησιμοποίησε <code style={{ fontFamily: "'DM Mono', monospace" }}>max/min</code>.</span>
                    </div>
                  </div>
                </details>

                {/* ── BUILT-IN VARIABLES REFERENCE ── */}
                {sectionDivider('ΜΕΤΑΒΛΗΤΕΣ ΣΥΣΤΗΜΑΤΟΣ', '#64748b', 'fa-microchip')}
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                  Έρχονται αυτόματα από το job — χρησιμοποίησέ τες στους τύπους σου. Πέρνα το ποντίκι για λεπτομέρειες.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
                  {BUILTIN_VARS.map(b => (
                    <div key={b.name}
                      title={`${b.description}\n${b.example}`}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 4,
                        padding: '10px 12px', borderRadius: 10,
                        background: `color-mix(in srgb, ${b.color} 7%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${b.color} 22%, transparent)`,
                        borderLeft: `3px solid ${b.color}`,
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className={`fas ${b.icon}`} style={{ fontSize: '0.72rem', color: b.color }} />
                        <code style={{ fontSize: '0.85rem', fontWeight: 700, color: b.color, fontFamily: "'DM Mono', monospace" }}>{b.name}</code>
                        <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{b.example}</span>
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#cbd5e1', lineHeight: 1.35 }}>
                        <strong style={{ color: '#e2e8f0' }}>{b.label}</strong> — {b.description}
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── MATH FUNCTIONS REFERENCE ── */}
                {sectionDivider('ΜΑΘΗΜΑΤΙΚΕΣ ΣΥΝΑΡΤΗΣΕΙΣ', '#94a3b8', 'fa-calculator')}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 6 }}>
                  {MATH_FNS_REF.map(fn => (
                    <div key={fn.name} title={`${fn.description}\n${fn.example}`} style={{
                      padding: '8px 10px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--glass-border)',
                      display: 'flex', flexDirection: 'column', gap: 3,
                    }}>
                      <code style={{ fontSize: '0.75rem', fontWeight: 700, color: '#cbd5e1', fontFamily: "'DM Mono', monospace" }}>{fn.signature}</code>
                      <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{fn.description}</span>
                      <code style={{ fontSize: '0.62rem', color: '#4ade80', fontFamily: "'DM Mono', monospace" }}>{fn.example}</code>
                    </div>
                  ))}
                </div>

                {/* ── PARAMETERS ── */}
                {sectionDivider('ΠΑΡΑΜΕΤΡΟΙ ΜΗΧΑΝΗΣ', 'var(--blue)', 'fa-sliders-h')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {fb.params.map((p, pi) => (
                    <div key={p.id} style={{
                      display: 'grid', gridTemplateColumns: '120px 1fr 80px 100px 32px', gap: 8, alignItems: 'center',
                      padding: '10px 12px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.02)',
                      borderLeft: '3px solid var(--blue)',
                      border: '1px solid var(--glass-border)', borderLeftWidth: 3, borderLeftColor: 'var(--blue)',
                    }}>
                      <input
                        value={p.name} placeholder="name"
                        onChange={e => {
                          const name = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                          updateFB({ params: fb.params.map((x, i) => i === pi ? { ...x, name } : x) });
                        }}
                        style={{ ...inputStyle, padding: '7px 8px', fontSize: '0.82rem', fontFamily: "'DM Mono', monospace", color: 'var(--blue)' }}
                      />
                      <input
                        value={p.label} placeholder="Ετικέτα"
                        onChange={e => updateFB({ params: fb.params.map((x, i) => i === pi ? { ...x, label: e.target.value } : x) })}
                        style={{ ...inputStyle, padding: '7px 8px', fontSize: '0.82rem' }}
                      />
                      <input
                        type="number" step="any" value={p.value} placeholder="0"
                        onChange={e => updateFB({ params: fb.params.map((x, i) => i === pi ? { ...x, value: parseFloat(e.target.value) || 0 } : x) })}
                        style={{ ...inputStyle, padding: '7px 8px', fontSize: '0.82rem', textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}
                      />
                      <input
                        value={p.unit} placeholder="μονάδα"
                        onChange={e => updateFB({ params: fb.params.map((x, i) => i === pi ? { ...x, unit: e.target.value } : x) })}
                        style={{ ...inputStyle, padding: '7px 8px', fontSize: '0.72rem', color: '#64748b' }}
                      />
                      <button
                        onClick={() => updateFB({ params: fb.params.filter((_, i) => i !== pi) })}
                        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.75rem', padding: 4 }}
                        title="Διαγραφή"
                      >
                        <i className="fas fa-trash" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => updateFB({ params: [...fb.params, { id: crypto.randomUUID(), name: '', label: '', value: 0, unit: '' }] })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                      borderRadius: 8, border: '1.5px dashed var(--glass-border)',
                      background: 'transparent', color: 'var(--blue)',
                      fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      width: 'fit-content',
                    }}
                  >
                    <i className="fas fa-plus" style={{ fontSize: '0.65rem' }} /> Νέα παράμετρος
                  </button>
                </div>

                {/* ── COMMON PATTERNS (copy-paste snippets) ── */}
                {sectionDivider('ΕΤΟΙΜΑ ΠΑΡΑΔΕΙΓΜΑΤΑ', '#4ade80', 'fa-wand-magic-sparkles')}
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                  Κλικ σε ένα παράδειγμα → ο τύπος μπαίνει στον πρώτο ενεργό τύπο υπολογισμού (⭐).
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                  {COMMON_PATTERNS.map(p => (
                    <button key={p.title}
                      onClick={() => {
                        // Insert into final formula (or first formula if none marked)
                        const target = fb.formulas.find(fm => fm.isFinal) || fb.formulas[0];
                        if (!target) return;
                        updateFB({ formulas: fb.formulas.map(fm => fm.id === target.id ? { ...fm, expression: p.expression } : fm) });
                      }}
                      title={`${p.description}\n\n${p.expression}`}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
                        padding: '10px 12px', borderRadius: 10,
                        background: 'color-mix(in srgb, #4ade80 5%, rgba(255,255,255,0.02))',
                        border: '1px solid color-mix(in srgb, #4ade80 22%, transparent)',
                        borderLeft: '3px solid #4ade80',
                        cursor: 'pointer', textAlign: 'left',
                        fontFamily: 'inherit', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, #4ade80 10%, rgba(255,255,255,0.02))'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'color-mix(in srgb, #4ade80 5%, rgba(255,255,255,0.02))'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                        <i className={`fas ${p.icon}`} style={{ fontSize: '0.7rem', color: '#4ade80' }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e2e8f0' }}>{p.title}</span>
                        <i className="fas fa-arrow-right" style={{ marginLeft: 'auto', fontSize: '0.6rem', color: '#64748b' }} />
                      </div>
                      <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{p.description}</div>
                      <code style={{ fontSize: '0.66rem', color: '#cbd5e1', fontFamily: "'DM Mono', monospace", background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4, marginTop: 2 }}>{p.expression}</code>
                    </button>
                  ))}
                </div>

                {/* ── FORMULAS ── */}
                {sectionDivider('ΤΥΠΟΙ ΥΠΟΛΟΓΙΣΜΟΥ', 'var(--accent)', 'fa-function')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {fb.formulas.map((f, fi) => {
                    const vars = availableVars(fi);
                    const result = formulaResults[fi];
                    const isFinal = f.isFinal;
                    return (
                      <div key={f.id} style={{
                        padding: '14px 14px 12px', borderRadius: 12,
                        background: isFinal ? 'color-mix(in srgb, var(--accent) 5%, rgba(255,255,255,0.02))' : 'rgba(255,255,255,0.02)',
                        border: `1.5px solid ${isFinal ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--glass-border)'}`,
                        borderLeftWidth: 3, borderLeftColor: isFinal ? 'var(--accent)' : 'var(--violet)',
                      }}>
                        {/* Top row: name, label, final toggle, delete */}
                        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto auto', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                          <input
                            value={f.name} placeholder="name"
                            onChange={e => {
                              const name = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                              updateFB({ formulas: fb.formulas.map((x, i) => i === fi ? { ...x, name } : x) });
                            }}
                            style={{ ...inputStyle, padding: '7px 8px', fontSize: '0.82rem', fontFamily: "'DM Mono', monospace", color: 'var(--violet)' }}
                          />
                          <input
                            value={f.label} placeholder="Ετικέτα (π.χ. Κόστος εργασίας)"
                            onChange={e => updateFB({ formulas: fb.formulas.map((x, i) => i === fi ? { ...x, label: e.target.value } : x) })}
                            style={{ ...inputStyle, padding: '7px 8px', fontSize: '0.82rem' }}
                          />
                          <button
                            onClick={() => updateFB({ formulas: fb.formulas.map((x, i) => ({ ...x, isFinal: i === fi })) })}
                            title={isFinal ? 'Τελικό κόστος' : 'Ορισμός ως τελικό κόστος'}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                              color: isFinal ? 'var(--accent)' : '#475569', fontSize: '0.85rem',
                              transition: 'color 0.2s',
                            }}
                          >
                            <i className={`fas fa-star`} />
                          </button>
                          {fb.formulas.length > 1 && (
                            <button
                              onClick={() => {
                                const updated = fb.formulas.filter((_, i) => i !== fi);
                                if (f.isFinal && updated.length > 0) updated[updated.length - 1].isFinal = true;
                                updateFB({ formulas: updated });
                              }}
                              style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.75rem', padding: 4 }}
                            >
                              <i className="fas fa-trash" />
                            </button>
                          )}
                        </div>
                        {/* Variable chips toolbar (with tooltips) */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                          {vars.map(v => {
                            // Compose tooltip based on var type
                            let tip: string;
                            if (v.type === 'builtin') {
                              const meta = BUILTIN_VARS.find(b => b.name === v.name);
                              tip = meta ? `${meta.label} — ${meta.description}\n${meta.example}` : v.label;
                            } else if (v.type === 'param') {
                              const p = fb.params.find(pp => pp.name === v.name);
                              tip = `Παράμετρος μηχανής: ${p?.label || v.name} = ${p?.value ?? 0} ${p?.unit || ''}`.trim();
                            } else {
                              const prev = fb.formulas.find(pf => pf.name === v.name);
                              tip = `Άλλος τύπος: ${prev?.label || v.name} (αποτέλεσμα της "${prev?.expression ?? ''}")`;
                            }
                            return (
                              <button key={v.name} onClick={() => insertVar(f.id, v.name)} style={chipStyle(v.color, true)} title={tip}>
                                <i className={`fas ${v.icon}`} style={{ fontSize: '0.55rem' }} />
                                {v.name}
                              </button>
                            );
                          })}
                          {/* Math functions (with tooltips) */}
                          {MATH_FNS_REF.filter(fn => ['min', 'max', 'ceil', 'floor', 'round'].includes(fn.name)).map(fn => (
                            <button key={fn.name} onClick={() => insertVar(f.id, fn.name + '()')} style={chipStyle('#64748b')} title={`${fn.signature} — ${fn.description}\n${fn.example}`}>
                              ƒ {fn.name}
                            </button>
                          ))}
                        </div>
                        {/* Expression input */}
                        <div style={{ position: 'relative' }}>
                          <span style={{
                            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                            fontSize: '0.85rem', fontWeight: 700, color: '#475569', pointerEvents: 'none',
                          }}>=</span>
                          <input
                            ref={el => { formulaRefs.current[f.id] = el; }}
                            value={f.expression} placeholder="π.χ. qty * rate + setup"
                            onChange={e => updateFB({ formulas: fb.formulas.map((x, i) => i === fi ? { ...x, expression: e.target.value } : x) })}
                            style={{
                              ...inputStyle, padding: '10px 12px 10px 24px',
                              fontSize: '0.88rem', fontFamily: "'DM Mono', monospace",
                              color: result?.error ? '#f87171' : isFinal ? 'var(--accent)' : '#e2e8f0',
                              borderColor: result?.error ? 'color-mix(in srgb, #ef4444 40%, transparent)' : isFinal ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 'var(--glass-border)',
                            }}
                          />
                        </div>
                        {/* Result / Error */}
                        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                          {result?.error ? (
                            <span style={{ fontSize: '0.7rem', color: '#f87171' }}>
                              <i className="fas fa-exclamation-triangle" style={{ marginRight: 4 }} />{result.error}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: isFinal ? 'var(--accent)' : '#64748b' }}>
                              {isFinal && <i className="fas fa-coins" style={{ marginRight: 4, fontSize: '0.6rem' }} />}
                              {f.label || f.name || 'αποτέλεσμα'} = <strong style={{ color: isFinal ? 'var(--accent)' : '#e2e8f0', fontSize: isFinal ? '0.85rem' : '0.72rem' }}>{(result?.value ?? 0).toFixed(2)}€</strong>
                              {!isFinal && <span style={{ color: '#475569' }}> (sample: qty=1000)</span>}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => updateFB({ formulas: [...fb.formulas, { id: crypto.randomUUID(), name: '', label: '', expression: '', isFinal: false }] })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                      borderRadius: 8, border: '1.5px dashed var(--glass-border)',
                      background: 'transparent', color: 'var(--violet)',
                      fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      width: 'fit-content',
                    }}
                  >
                    <i className="fas fa-plus" style={{ fontSize: '0.65rem' }} /> Νέος τύπος
                  </button>
                </div>

                {/* ── LIVE PREVIEW ── */}
                {sectionDivider('ΔΟΚΙΜΑΣΤΙΚΟΣ ΥΠΟΛΟΓΙΣΜΟΣ', 'var(--accent)', 'fa-flask')}
                <div style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: 'color-mix(in srgb, var(--accent) 4%, rgba(255,255,255,0.02))',
                  border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
                }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    {BUILTIN_VARS.map(b => (
                      <span key={b.name}><strong style={{ color: b.color }}>{b.name}</strong>={sampleVars[b.name] ?? 0}</span>
                    ))}
                    {fb.params.filter(p => p.name).map(p => (
                      <span key={p.id}><strong style={{ color: 'var(--blue)' }}>{p.name}</strong>={p.value}{p.unit ? ` ${p.unit}` : ''}</span>
                    ))}
                  </div>
                  {fb.formulas.map((f, fi) => {
                    const r = formulaResults[fi];
                    return (
                      <div key={f.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 0',
                        borderBottom: fi < fb.formulas.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {f.isFinal && <i className="fas fa-star" style={{ fontSize: '0.55rem', color: 'var(--accent)' }} />}
                          <span style={{ fontSize: '0.78rem', color: f.isFinal ? 'var(--accent)' : '#94a3b8', fontWeight: f.isFinal ? 700 : 500 }}>{f.label || f.name || '—'}</span>
                          <span style={{ fontSize: '0.68rem', color: '#475569', fontFamily: "'DM Mono', monospace" }}>{f.expression}</span>
                        </div>
                        {r?.error ? (
                          <span style={{ fontSize: '0.72rem', color: '#f87171' }}>Σφάλμα</span>
                        ) : (
                          <span style={{
                            fontSize: f.isFinal ? '1rem' : '0.82rem',
                            fontWeight: f.isFinal ? 800 : 600,
                            color: f.isFinal ? 'var(--accent)' : '#e2e8f0',
                          }}>
                            {(r?.value ?? 0).toFixed(2)}€
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>);
            })()}

            {/* ── LINKED MATERIALS (laminator) ── */}
            {(editing.subtype === 'laminator' || editing.subtype === 'lam_roll' || editing.subtype === 'lam_sheet') && (() => {
              const rollMats = lamMaterials.filter(m => m.cat === 'roll' || (m.cat === 'film' && !m.height));
              const pouchMats = lamMaterials.filter(m => m.cat === 'film' && m.width && m.height);
              const matSpecs = (mat: Material) => (mat.specs ?? {}) as Record<string, number>;
              const matTab = matForm?.type || 'roll';

              // Render material card
              const MatCard = ({ mat, isR }: { mat: Material; isR: boolean }) => {
                const sp = matSpecs(mat);
                return (
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: 2 }}>{mat.name}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                      {isR ? (<>
                        {mat.width ? `${mat.width}mm` : ''}{mat.rollLength ? ` × ${mat.rollLength}m` : ''}
                        {sp.roll_price ? ` — €${sp.roll_price}` : ''}{mat.costPerUnit ? ` (€${mat.costPerUnit.toFixed(3)}/m²)` : ''}
                      </>) : (<>
                        {mat.width && mat.height ? `${mat.width}×${mat.height}mm` : ''}
                        {sp.qty_per_pack ? ` — ${sp.qty_per_pack}τεμ/πακ` : ''}{mat.costPerUnit ? ` — €${mat.costPerUnit.toFixed(3)}/τεμ` : ''}
                      </>)}
                    </div>
                    {mat.sellPerUnit != null && mat.sellPerUnit > 0 && (
                      <div style={{ fontSize: '0.65rem', color: '#4ade80', marginTop: 2 }}>
                        Πώληση: €{mat.sellPerUnit.toFixed(4)}{isR ? '/m²' : '/τεμ'}
                        {mat.markup != null && mat.markup > 0 ? ` (${mat.markup.toFixed(0)}%)` : ''}
                      </div>
                    )}
                    {mat.stock != null && (
                      <div style={{ fontSize: '0.65rem', color: '#475569', marginTop: 2 }}>Απόθεμα: {mat.stock} {mat.unit}</div>
                    )}
                  </div>
                );
              };

              // Compute cost for pricing preview
              const matCost = (() => {
                if (!matForm) return 0;
                if (matForm.type === 'roll') {
                  const w = parseFloat(matForm.width) || 0;
                  const len = parseFloat(matForm.rollLength) || 0;
                  const rp = parseFloat(matForm.rollPrice) || 0;
                  return w > 0 && len > 0 && rp > 0 ? rp / ((w / 1000) * len) : 0;
                }
                const pp = parseFloat(matForm.pouchPackPrice) || 0;
                const pq = parseFloat(matForm.pouchPackQty) || 1;
                return pp > 0 ? pp / pq : 0;
              })();

              return (
                <div className="pp-section-card" style={{ marginTop: 14 }}>
                  <div className="pp-section-head">
                    <i className="fas fa-scroll" />
                    <span>ΥΛΙΚΑ ΠΛΑΣΤΙΚΟΠΟΙΗΣΗΣ</span>
                  </div>

                  {/* Roll section */}
                  {rollMats.length > 0 && (<>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', marginBottom: 6, letterSpacing: '0.04em' }}>
                      <i className="fas fa-scroll" style={{ marginRight: 6, color: 'var(--teal)' }} />ΡΟΛΑ ΦΙΛΜ
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
                      {rollMats.map(mat => <MatCard key={mat.id} mat={mat} isR />)}
                    </div>
                  </>)}

                  {/* Pouch section */}
                  {pouchMats.length > 0 && (<>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', marginBottom: 6, letterSpacing: '0.04em' }}>
                      <i className="fas fa-layer-group" style={{ marginRight: 6, color: 'var(--teal)' }} />POUCH
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
                      {pouchMats.map(mat => <MatCard key={mat.id} mat={mat} isR={false} />)}
                    </div>
                  </>)}

                  {rollMats.length === 0 && pouchMats.length === 0 && !matForm && (
                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 10 }}>Δεν υπάρχουν υλικά πλαστικοποίησης στην αποθήκη</p>
                  )}

                  {/* Add new material */}
                  {!matForm ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setMatForm(emptyMatForm('roll'))} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px dashed var(--teal)', background: 'transparent', color: 'var(--teal)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                        <i className="fas fa-plus" style={{ fontSize: '0.65rem' }} /> Νέο Ρολό Φιλμ
                      </button>
                      <button onClick={() => setMatForm(emptyMatForm('pouch'))} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px dashed var(--teal)', background: 'transparent', color: 'var(--teal)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                        <i className="fas fa-plus" style={{ fontSize: '0.65rem' }} /> Νέο Pouch
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding: 16, borderRadius: 12, border: '1.5px solid color-mix(in srgb, var(--teal) 40%, transparent)', background: 'color-mix(in srgb, var(--teal) 5%, transparent)' }}>
                      {/* Roll / Pouch toggle */}
                      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 2, marginBottom: 14, width: 'fit-content' }}>
                        {(['roll', 'pouch'] as const).map(t => (
                          <button key={t} onClick={() => setMatForm({ ...emptyMatForm(t), name: matForm.name, thickness: matForm.thickness })}
                            style={{ padding: '6px 18px', borderRadius: 6, border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                              color: matTab === t ? 'var(--teal)' : 'var(--text-muted)', background: matTab === t ? 'color-mix(in srgb, var(--teal) 15%, transparent)' : 'transparent' }}>
                            {t === 'roll' ? 'Ρολό Φιλμ' : 'Pouch'}
                          </button>
                        ))}
                      </div>

                      {/* Name + thickness */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                        <div>
                          <label style={labelStyle}>ΟΝΟΜΑ</label>
                          <input value={matForm.name} onChange={e => setMatForm({ ...matForm, name: e.target.value })} placeholder={matTab === 'roll' ? 'π.χ. Gloss 30mic' : 'π.χ. Α3 Matt Pouch'} style={{ ...inputStyle, padding: '8px 10px' }} autoFocus />
                        </div>
                        <div>
                          <label style={labelStyle}>ΠΑΧΟΣ (microns)</label>
                          <input value={matForm.thickness} onChange={e => setMatForm({ ...matForm, thickness: e.target.value })} type="number" placeholder="30" style={{ ...inputStyle, padding: '8px 10px' }} />
                        </div>
                      </div>

                      {matTab === 'roll' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                          <div><label style={labelStyle}>ΠΛΑΤΟΣ (mm)</label><input value={matForm.width} onChange={e => setMatForm({ ...matForm, width: e.target.value })} type="number" placeholder="330" style={{ ...inputStyle, padding: '8px 10px' }} /></div>
                          <div><label style={labelStyle}>ΜΕΤΡΑ ΡΟΛΟΥ</label><input value={matForm.rollLength} onChange={e => setMatForm({ ...matForm, rollLength: e.target.value })} type="number" placeholder="200" style={{ ...inputStyle, padding: '8px 10px' }} /></div>
                          <div><label style={labelStyle}>ΤΙΜΗ ΡΟΛΟΥ (€)</label><input value={matForm.rollPrice} onChange={e => setMatForm({ ...matForm, rollPrice: e.target.value })} type="number" step="0.01" placeholder="45.00" style={{ ...inputStyle, padding: '8px 10px' }} /></div>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                          <div><label style={labelStyle}>ΠΛΑΤΟΣ (mm)</label><input value={matForm.width} onChange={e => setMatForm({ ...matForm, width: e.target.value })} type="number" placeholder="303" style={{ ...inputStyle, padding: '8px 10px' }} /></div>
                          <div><label style={labelStyle}>ΥΨΟΣ (mm)</label><input value={matForm.height} onChange={e => setMatForm({ ...matForm, height: e.target.value })} type="number" placeholder="426" style={{ ...inputStyle, padding: '8px 10px' }} /></div>
                          <div><label style={labelStyle}>ΤΙΜΗ ΠΑΚΕΤΟΥ (€)</label><input value={matForm.pouchPackPrice} onChange={e => setMatForm({ ...matForm, pouchPackPrice: e.target.value })} type="number" step="0.01" placeholder="12.00" style={{ ...inputStyle, padding: '8px 10px' }} /></div>
                          <div><label style={labelStyle}>ΤΕΜ / ΠΑΚΕΤΟ</label><input value={matForm.pouchPackQty} onChange={e => setMatForm({ ...matForm, pouchPackQty: e.target.value })} type="number" placeholder="100" style={{ ...inputStyle, padding: '8px 10px' }} /></div>
                        </div>
                      )}

                      {/* ── PRICING: dropdown method ── */}
                      {(() => {
                        const costLabel = matTab === 'roll' ? '€/m²' : '€/τεμ';
                        const pricingMode = matForm.sellPrice && !matForm.markup ? 'sell' : 'markup';
                        return (<>
                          <label style={labelStyle}>ΤΙΜΟΛΟΓΗΣΗ</label>
                          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 2, marginBottom: 10, width: 'fit-content' }}>
                            <button onClick={() => setMatForm({ ...matForm, sellPrice: '', markup: matForm.markup })}
                              style={{ padding: '5px 14px', borderRadius: 6, border: 'none', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                color: pricingMode === 'markup' ? 'var(--accent)' : 'var(--text-muted)', background: pricingMode === 'markup' ? 'rgba(245,130,32,0.12)' : 'transparent' }}>
                              Markup %
                            </button>
                            <button onClick={() => setMatForm({ ...matForm, markup: '', sellPrice: matForm.sellPrice })}
                              style={{ padding: '5px 14px', borderRadius: 6, border: 'none', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                color: pricingMode === 'sell' ? 'var(--accent)' : 'var(--text-muted)', background: pricingMode === 'sell' ? 'rgba(245,130,32,0.12)' : 'transparent' }}>
                              Τιμή Πώλησης
                            </button>
                          </div>
                          {pricingMode === 'markup' ? (
                            <div style={{ marginBottom: 10 }}>
                              <input value={matForm.markup} onChange={e => setMatForm({ ...matForm, markup: e.target.value, sellPrice: '' })} type="number" step="1" min="0" placeholder="π.χ. 100" style={{ ...inputStyle, padding: '8px 10px', width: 160 }} />
                            </div>
                          ) : (
                            <div style={{ marginBottom: 10 }}>
                              <input value={matForm.sellPrice} onChange={e => setMatForm({ ...matForm, sellPrice: e.target.value, markup: '' })} type="number" step="0.001" min="0" placeholder={`${costLabel}`} style={{ ...inputStyle, padding: '8px 10px', width: 160 }} />
                            </div>
                          )}
                          {/* Live preview */}
                          {matCost > 0 && (() => {
                            const mk = parseFloat(matForm.markup) || 0;
                            const sp = parseFloat(matForm.sellPrice) || 0;
                            const sell = sp > 0 ? sp : mk > 0 ? matCost * (1 + mk / 100) : 0;
                            const derivedMk = sp > 0 && matCost > 0 ? ((sp - matCost) / matCost) * 100 : mk;
                            const profit = sell > 0 ? sell - matCost : 0;
                            const areaInfo = matTab === 'roll' ? (() => { const w = parseFloat(matForm.width) || 0; const len = parseFloat(matForm.rollLength) || 0; return w > 0 && len > 0 ? `${((w / 1000) * len).toFixed(1)} m²` : ''; })() : '';
                            return (
                              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', marginBottom: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Κόστος: <strong style={{ color: 'var(--teal)' }}>€{matCost.toFixed(4)}{costLabel.replace('€','')}</strong></span>
                                {areaInfo && <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Εμβαδόν: <strong style={{ color: '#cbd5e1' }}>{areaInfo}</strong></span>}
                                {sell > 0 && <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Πώληση: <strong style={{ color: 'var(--accent)' }}>€{sell.toFixed(4)}{costLabel.replace('€','')}</strong></span>}
                                {derivedMk > 0 && <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Markup: <strong style={{ color: '#cbd5e1' }}>{derivedMk.toFixed(1)}%</strong></span>}
                                {profit > 0 && <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Κέρδος: <strong style={{ color: '#4ade80' }}>€{profit.toFixed(4)}{costLabel.replace('€','')}</strong></span>}
                              </div>
                            );
                          })()}
                        </>);
                      })()}

                      {/* ── INVENTORY & SUPPLIER ── */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 10 }}>
                        <div style={{ height: 1, flex: 1, background: 'var(--glass-border)' }} />
                        <span style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.06em', color: '#475569' }}>ΑΠΟΘΗΚΗ & ΠΡΟΜΗΘΕΥΤΗΣ</span>
                        <div style={{ height: 1, flex: 1, background: 'var(--glass-border)' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                        <div><label style={labelStyle}>ΕΙΔΟΣ</label><input value={matForm.subtype} onChange={e => setMatForm({ ...matForm, subtype: e.target.value })} placeholder="π.χ. gloss, matt, soft touch" style={{ ...inputStyle, padding: '8px 10px' }} /></div>
                        <div><label style={labelStyle}>ΠΡΟΜΗΘΕΥΤΗΣ</label><input value={matForm.supplier} onChange={e => setMatForm({ ...matForm, supplier: e.target.value })} placeholder="π.χ. Antalis" style={{ ...inputStyle, padding: '8px 10px' }} /></div>
                        <div><label style={labelStyle}>EMAIL ΠΡΟΜΗΘΕΥΤΗ</label><input value={matForm.supplierEmail} onChange={e => setMatForm({ ...matForm, supplierEmail: e.target.value })} placeholder="orders@..." type="email" style={{ ...inputStyle, padding: '8px 10px' }} /></div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: 10, marginBottom: 10 }}>
                        <div><label style={labelStyle}>ΑΠΟΘΕΜΑ</label><input value={matForm.stock} onChange={e => setMatForm({ ...matForm, stock: e.target.value })} type="number" min="0" placeholder="0" style={{ ...inputStyle, padding: '8px 10px' }} /></div>
                        <div><label style={labelStyle}>ΣΤΟΧΟΣ</label><input value={matForm.stockTarget} onChange={e => setMatForm({ ...matForm, stockTarget: e.target.value })} type="number" min="0" placeholder="—" style={{ ...inputStyle, padding: '8px 10px' }} /></div>
                        <div><label style={labelStyle}>ΕΙΔΟΠΟΙΗΣΗ</label><input value={matForm.stockAlert} onChange={e => setMatForm({ ...matForm, stockAlert: e.target.value })} type="number" min="0" placeholder="—" style={{ ...inputStyle, padding: '8px 10px' }} /></div>
                        <div><label style={labelStyle}>ΣΗΜΕΙΩΣΕΙΣ</label><input value={matForm.notes} onChange={e => setMatForm({ ...matForm, notes: e.target.value })} placeholder="Προαιρετικές σημειώσεις..." style={{ ...inputStyle, padding: '8px 10px' }} /></div>
                      </div>

                      {/* Save / Cancel */}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={handleSaveMaterial} disabled={savingMat || !matForm.name.trim()}
                          style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', opacity: savingMat || !matForm.name.trim() ? 0.5 : 1 }}>
                          {savingMat ? 'Αποθήκευση...' : 'Δημιουργία'}
                        </button>
                        <button onClick={() => setMatForm(null)}
                          style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                          Ακύρωση
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

              </>)}{/* /step 2 */}
            </div>{/* /pp-modal-body */}

            {/* Sticky footer */}
            <div className="pp-modal-footer">
              {!editing.id && step === 'select' ? (
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginRight: 'auto', alignSelf: 'center' }}>
                  Διάλεξε τύπο μηχανήματος για να συνεχίσεις
                </span>
              ) : null}
              <button
                onClick={() => setEditing(null)}
                style={{
                  padding: '11px 24px', borderRadius: 10, border: '1px solid var(--glass-border)',
                  background: 'transparent', color: 'var(--text-muted)',
                  fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Ακύρωση
              </button>
              {(editing.id || step === 'configure') && (
                <button
                  onClick={handleSave}
                  disabled={saving || !editing.name.trim()}
                  style={{
                    padding: '11px 28px', borderRadius: 10, border: 'none',
                    background: 'var(--accent)', color: '#fff',
                    fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer',
                    opacity: saving || !editing.name.trim() ? 0.5 : 1,
                    boxShadow: '0 4px 16px rgba(245,130,32,0.3)',
                  }}
                >
                  {saving ? 'Αποθήκευση...' : editing.id ? 'Ενημέρωση' : 'Δημιουργία'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        /* ── Modal shell ── */
        .pp-modal-backdrop {
          position: fixed; inset: 0; z-index: 200;
          display: flex; align-items: center; justify-content: center;
          background: rgba(5, 10, 24, 0.6);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          animation: pp-fade 0.18s ease-out;
        }
        @keyframes pp-fade { from { opacity: 0; } to { opacity: 1; } }
        .pp-modal {
          position: relative;
          width: 760px; max-width: calc(100vw - 32px);
          max-height: 92vh;
          display: flex; flex-direction: column;
          border-radius: 16px;
          border: 1px solid var(--glass-border);
          background: var(--bg-elevated, #0f1729);
          box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6),
                      0 0 0 1px color-mix(in srgb, var(--modal-accent) 18%, transparent);
          overflow: hidden;
          animation: pp-pop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes pp-pop {
          from { opacity: 0; transform: translateY(8px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .pp-modal-strip {
          height: 4px;
          background: linear-gradient(90deg,
            var(--modal-accent),
            color-mix(in srgb, var(--modal-accent) 50%, transparent) 70%,
            transparent);
        }
        .pp-modal-close {
          position: absolute; top: 14px; right: 14px;
          width: 32px; height: 32px; border-radius: 8px;
          border: 1px solid var(--glass-border);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-muted);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; font-size: 0.85rem;
          transition: all 0.18s ease;
          z-index: 2;
        }
        .pp-modal-close:hover {
          background: rgba(255, 80, 80, 0.12);
          border-color: rgba(255, 80, 80, 0.4);
          color: #f87171;
        }
        .pp-modal-body {
          flex: 1; min-height: 0;
          overflow-y: auto;
          padding: 28px 32px 24px;
        }
        .pp-modal-body::-webkit-scrollbar { width: 8px; }
        .pp-modal-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        .pp-modal-body::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.14); }
        .pp-modal-footer {
          display: flex; justify-content: flex-end; gap: 10px;
          padding: 16px 32px;
          border-top: 1px solid var(--glass-border);
          background: linear-gradient(180deg,
            color-mix(in srgb, var(--modal-accent) 4%, transparent),
            rgba(0, 0, 0, 0.25));
          flex-shrink: 0;
        }

        /* ── Section card ── */
        .pp-section-card {
          padding: 18px 18px 16px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid var(--glass-border);
          border-top: 2px solid color-mix(in srgb, var(--modal-accent) 35%, transparent);
        }
        .pp-section-head {
          display: flex; align-items: center; gap: 8px;
          font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em;
          color: var(--modal-accent);
          margin-bottom: 14px;
          text-transform: uppercase;
        }
        .pp-section-head i { font-size: 0.72rem; opacity: 0.85; }

        /* ── Subtype tile ── */
        .pp-subtype-tile {
          position: relative;
          display: flex; align-items: center; gap: 10px;
          padding: 11px 12px;
          border-radius: 10px;
          border: 1.5px solid var(--glass-border);
          background: rgba(255, 255, 255, 0.025);
          color: var(--text);
          cursor: pointer;
          font-family: inherit;
          text-align: left;
          transition: all 0.18s ease;
        }
        .pp-subtype-tile:hover {
          border-color: color-mix(in srgb, var(--tile-color) 50%, transparent);
          background: color-mix(in srgb, var(--tile-color) 6%, rgba(255,255,255,0.02));
        }
        .pp-subtype-tile[data-active="true"] {
          border-color: var(--tile-color);
          background: color-mix(in srgb, var(--tile-color) 12%, transparent);
          box-shadow: 0 0 0 1px var(--tile-color), 0 4px 14px color-mix(in srgb, var(--tile-color) 25%, transparent);
        }
        .pp-subtype-icon {
          width: 34px; height: 34px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          background: color-mix(in srgb, var(--tile-color) 16%, transparent);
          color: var(--tile-color);
          font-size: 0.95rem;
          flex-shrink: 0;
        }
        .pp-subtype-check {
          position: absolute; top: 8px; right: 10px;
          font-size: 0.75rem; color: var(--tile-color);
        }
        /* Larger variant for step 1 picker */
        .pp-subtype-tile-lg {
          padding: 14px 14px;
          gap: 12px;
        }
        .pp-subtype-tile-lg:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 22px color-mix(in srgb, var(--tile-color) 18%, transparent);
        }
        .pp-subtype-icon-lg {
          width: 42px; height: 42px;
          font-size: 1.1rem;
          border-radius: 10px;
        }

        .pp-card {
          position: relative;
          overflow: hidden;
          border-left: 3px solid var(--card-accent, var(--accent)) !important;
          background: linear-gradient(135deg,
            color-mix(in srgb, var(--card-accent, var(--accent)) 4%, var(--bg-surface)),
            var(--bg-surface) 60%) !important;
          transition: transform 0.25s ease, box-shadow 0.3s ease, border-color 0.25s ease, background 0.25s ease;
        }
        .pp-card::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent);
          transform: translateX(-100%);
          transition: transform 0.6s ease;
          pointer-events: none;
        }
        .pp-card:hover::before { transform: translateX(130%); }
        .pp-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(0,0,0,0.35),
                      0 0 0 1px color-mix(in srgb, var(--card-accent, var(--accent)) 30%, transparent);
          background: linear-gradient(135deg,
            color-mix(in srgb, var(--card-accent, var(--accent)) 8%, var(--bg-elevated)),
            var(--bg-elevated) 60%) !important;
        }
        .pp-card-glow {
          position: absolute; inset: -1px; border-radius: var(--radius);
          background: radial-gradient(ellipse at 0% 0%, color-mix(in srgb, var(--card-accent, var(--accent)) 18%, transparent), transparent 60%);
          opacity: 0; transition: opacity 0.4s ease; pointer-events: none;
        }
        .pp-card:hover .pp-card-glow { opacity: 1; }
        .pp-card:hover .pp-card-actions { opacity: 1 !important; }
        .pp-card-actions button:hover { color: var(--accent) !important; background: rgba(255,255,255,0.05) !important; }
      `}</style>
    </>
  );
}
