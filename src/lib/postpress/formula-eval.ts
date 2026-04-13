// Shared evaluator for custom postpress pricing.
// Used by: postpress machine config (client preview) + cost engine (server charge).

// ─── TYPES ───

export type ComponentType = 'setup' | 'per_piece' | 'per_sheet' | 'per_face' | 'per_m2' | 'per_kg' | 'per_minute';

export interface PricingComponent {
  id: string;
  type: ComponentType;
  price: number;
  label?: string;
}

export interface FormulaParam { id: string; name: string; label: string; value: number; unit: string }
export interface FormulaRow   { id: string; name: string; label: string; expression: string; isFinal: boolean }
export interface FormulaBuilderData { params: FormulaParam[]; formulas: FormulaRow[] }

export interface JobVars {
  qty: number;
  sheets: number;
  sides: number;
  area_m2: number;
  gsm: number;
  speed: number;          // machine speed (sheets/hour) — for per_minute
  copies?: number;        // alias of qty
  weight_kg?: number;     // derived
}

// ─── SIMPLE COMPONENTS ───

export function computeComponent(c: PricingComponent, vars: JobVars): number {
  const { qty, sheets, sides, area_m2, gsm, speed } = vars;
  const price = c.price || 0;
  if (price <= 0) return 0;
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

export function sumComponents(components: PricingComponent[], vars: JobVars): number {
  return components.reduce((s, c) => s + computeComponent(c, vars), 0);
}

// ─── SAFE FORMULA EVALUATOR (no eval) ───
// Supports: + - * / % ^  parentheses  numbers  identifiers (vars + fns)
// Functions: min, max, ceil, floor, round, abs, sqrt, pow

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
    if (/[a-zA-Z_\u03b1-\u03c9\u0391-\u03a9]/.test(expr[i])) {
      let id = '';
      while (i < expr.length && /[a-zA-Z0-9_\u03b1-\u03c9\u0391-\u03a9]/.test(expr[i])) id += expr[i++];
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
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  ceil:  (x) => Math.ceil(x),
  floor: (x) => Math.floor(x),
  round: (x) => Math.round(x),
  abs:   (x) => Math.abs(x),
  sqrt:  (x) => Math.sqrt(x),
  pow:   (a, b) => Math.pow(a, b),
};

export function safeEval(expr: string, vars: Record<string, number>): number {
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
      if (name in vars) return vars[name];
      throw new Error(`Άγνωστη μεταβλητή: ${name}`);
    }
    throw new Error(`Μη αναμενόμενο: ${JSON.stringify(t)}`);
  }
  const result = parseExpr();
  if (!isFinite(result)) return 0;
  return result;
}

// Evaluate a full formula builder → returns value of the "final" formula (or last one).
export function evalFormulaBuilder(fb: FormulaBuilderData, jobVars: JobVars): number {
  const ctx: Record<string, number> = {
    qty: jobVars.qty,
    sheets: jobVars.sheets,
    copies: jobVars.copies ?? jobVars.qty,
    area_m2: jobVars.area_m2,
    weight_kg: jobVars.weight_kg ?? (jobVars.area_m2 * jobVars.gsm * jobVars.qty / 1000),
  };
  for (const p of fb.params) if (p.name) ctx[p.name] = p.value;

  let lastValue = 0;
  let finalValue: number | null = null;
  for (const f of fb.formulas) {
    let v: number;
    try {
      v = safeEval(f.expression, ctx);
    } catch {
      v = 0;
    }
    if (f.name) ctx[f.name] = v;
    if (f.isFinal) finalValue = v;
    lastValue = v;
  }
  return finalValue ?? lastValue;
}
