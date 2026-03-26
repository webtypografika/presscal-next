/**
 * Smart parser for paper/sheet import data.
 * Ported from old PressCal mod_inventory.js executeSmartImport logic.
 *
 * Extracts: gsm (130gr/g/gsm), dimensions (70x100 → 700×1000mm),
 * clean name, sticky categories (rows without price = category header).
 */

export interface ParsedRow {
  name: string;
  groupName: string;
  subtype: string;
  supplier: string;
  supplierEmail: string;
  width: number;
  height: number;
  thickness: number; // gsm
  costPerUnit: number;
  grain: string;
  markup: number;
}

export interface ColumnMapping {
  name: number;   // -1 = auto-detect
  cost: number;
  height: number;  // SS (short side)
  width: number;   // LS (long side)
  grams: number;
  email: number;
}

export interface GlobalFields {
  group: string;
  supplier: string;
  email: string;
}

const AUTO = -1;

/** Extract gsm from text like "130gr", "250g", "90gsm" */
function extractGsm(text: string): number {
  const m = text.match(/(\d+)\s*(gr|g|gsm)/i);
  return m ? parseFloat(m[1]) : 0;
}

/** Extract dimensions from text like "70x100", "64Χ90", "50*70" */
function extractDims(text: string): { w: number; h: number } {
  const m = text.match(/(\d+[,.]?\d*)\s*[xX*Χχ×]\s*(\d+[,.]?\d*)/);
  if (!m) return { w: 0, h: 0 };
  let w = parseFloat(m[1].replace(',', '.'));
  let h = parseFloat(m[2].replace(',', '.'));
  // Dims in cm (both < 200) → convert to mm
  if (w > 0 && h > 0 && Math.max(w, h) < 200) { w *= 10; h *= 10; }
  return { w, h };
}

/** Clean cost string → number */
function parseCost(raw: string): number {
  const clean = raw.replace(/[€$a-zA-Zα-ωΑ-Ω]/g, '').trim().replace(',', '.');
  const v = parseFloat(clean);
  return isNaN(v) ? 0 : v;
}

/** Auto-detect: find first cell that looks like a name (3+ alpha chars) */
function autoName(row: string[]): string {
  const cell = row.find(c => c && /[a-zA-Zα-ωΑ-Ω]{3,}/.test(String(c)));
  return cell ? String(cell).trim() : '';
}

/** Auto-detect: find first cell that looks like a price (digits with decimal) */
function autoCost(row: string[]): string {
  const cell = row.find(c => c && /\d+[.,]\d+/.test(String(c)));
  return cell ? String(cell).trim() : '';
}

/**
 * Parse raw spreadsheet/PDF rows into structured material data.
 * Implements sticky category logic: rows without a valid price
 * that have text become the current category.
 */
export function parseImportRows(
  rawRows: string[][],
  mapping: ColumnMapping,
  globals: GlobalFields,
): ParsedRow[] {
  const results: ParsedRow[] = [];
  let stickyCategory = 'Γενικά';

  for (const row of rawRows) {
    if (!row || row.length < 1) continue;

    // Extract name
    let nameRaw = mapping.name > AUTO
      ? String(row[mapping.name] ?? '').trim()
      : autoName(row);
    nameRaw = nameRaw.replace(/["\n\r]/g, '');

    // Extract cost
    let costRaw = mapping.cost > AUTO
      ? String(row[mapping.cost] ?? '').trim()
      : autoCost(row);
    costRaw = costRaw.replace(/["\n\r]/g, '');

    const testCost = parseCost(costRaw);

    // Sticky category: row with name but no valid cost → becomes category header
    if (nameRaw.length > 2 && (isNaN(testCost) || testCost === 0)) {
      stickyCategory = nameRaw;
      // Unless the name itself contains dimensions or gsm, skip it
      if (!nameRaw.match(/(\d+[,.]?\d*)\s*[xX*Χχ×]\s*(\d+[,.]?\d*)/) && !nameRaw.match(/gr|gsm/i)) {
        continue;
      }
    }

    const finalCost = parseCost(costRaw);

    // Extract gsm + dims from name text
    const parsedGsm = extractGsm(nameRaw);
    const parsedDims = extractDims(nameRaw);

    // Clean the name: remove gsm, dims, units
    let cleanName = nameRaw
      .replace(/(\d+)\s*(gr|g|gsm)/i, '')
      .replace(/(\d+[,.]?\d*)\s*[xX*Χχ×]\s*(\d+[,.]?\d*)/, '')
      .replace(/(cm|mm)/gi, '')
      .replace(/"/g, '')
      .trim();
    if (parsedDims.w === 0 || parsedDims.h === 0) cleanName = nameRaw;

    // Apply column mapping overrides (if user mapped specific columns)
    const finalW = mapping.width > AUTO
      ? (parseFloat(String(row[mapping.width]).replace(',', '.')) || parsedDims.w)
      : parsedDims.w;
    const finalH = mapping.height > AUTO
      ? (parseFloat(String(row[mapping.height]).replace(',', '.')) || parsedDims.h)
      : parsedDims.h;
    const finalG = mapping.grams > AUTO
      ? (parseFloat(String(row[mapping.grams]).replace(',', '.')) || parsedGsm)
      : parsedGsm;

    // Email: from mapped column or global
    const rowEmail = mapping.email > AUTO
      ? String(row[mapping.email] ?? '').trim()
      : '';

    // Auto group from name if global is default
    let finalGroup = globals.group;
    if (globals.group === 'Γενικά' || !globals.group) {
      const words = cleanName.split(/\s+/);
      if (words.length > 0) finalGroup = words[0].toUpperCase();
    }

    // Sort LS/SS — bigger = LS (width), smaller = SS (height)
    let mW = finalW || 0;
    let mH = finalH || 0;
    if (mW < mH) { const tmp = mW; mW = mH; mH = tmp; }

    results.push({
      name: cleanName || nameRaw,
      groupName: finalGroup || 'Γενικά',
      subtype: stickyCategory,
      supplier: globals.supplier || '',
      supplierEmail: rowEmail || globals.email || '',
      width: mW,
      height: mH,
      thickness: finalG || 0,
      costPerUnit: finalCost,
      grain: 'long',
      markup: 30,
    });
  }

  return results;
}

/**
 * Parse standard template XLS rows (fixed column names).
 * Expected columns: Name, Width, Height, Grams, Cost, Group, Supplier, Supplier Email, Grain, Markup
 */
export function parseStandardRows(
  rows: Record<string, unknown>[],
): ParsedRow[] {
  const results: ParsedRow[] = [];

  for (const row of rows) {
    const name = String(row['Name'] ?? '').trim();
    if (!name) continue;

    let w = parseFloat(String(row['Width'] ?? 0)) || 0;
    let h = parseFloat(String(row['Height'] ?? 0)) || 0;
    if (w < h) { const tmp = w; w = h; h = tmp; }

    results.push({
      name,
      groupName: String(row['Group'] ?? 'Γενικά').trim(),
      subtype: String(row['Category'] ?? '').trim(),
      supplier: String(row['Supplier'] ?? '').trim(),
      supplierEmail: String(row['Supplier Email'] ?? '').trim(),
      width: w,
      height: h,
      thickness: parseFloat(String(row['Grams'] ?? 0)) || 0,
      costPerUnit: parseFloat(String(row['Cost'] ?? 0)) || 0,
      grain: String(row['Grain'] ?? 'long').trim() || 'long',
      markup: parseFloat(String(row['Markup'] ?? 30)) || 30,
    });
  }

  return results;
}
