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

/** Clean cost string → number.
 *  Handles both EU format (1.003,50 = 1003.50) and US format (1,003.50).
 *  Key heuristic: if both . and , exist, the LAST one is the decimal separator.
 *  If only . exists with 3 digits after it and no decimal context → thousands separator.
 */
function parseCost(raw: string): number {
  let clean = raw.replace(/[€$a-zA-Zα-ωΑ-Ω\s]/g, '').trim();
  if (!clean) return 0;

  const hasComma = clean.includes(',');
  const hasDot = clean.includes('.');

  if (hasComma && hasDot) {
    // Both present — last one is the decimal separator
    const lastComma = clean.lastIndexOf(',');
    const lastDot = clean.lastIndexOf('.');
    if (lastComma > lastDot) {
      // EU: 1.003,50 → remove dots, comma→dot
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      // US: 1,003.50 → remove commas
      clean = clean.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Only comma — check if it's decimal or thousands
    const parts = clean.split(',');
    if (parts.length === 2 && parts[1].length === 3 && !parts[1].includes('.')) {
      // 1,003 → likely thousands (1003), not 1.003
      // But for paper prices this is almost always decimal (€1,003 = €1.003)
      // Heuristic: if value > 100 after treating as thousands, treat comma as decimal
      const asThousands = parseFloat(clean.replace(',', ''));
      const asDecimal = parseFloat(clean.replace(',', '.'));
      // Paper sheets rarely cost > €50, so if thousands interpretation gives > 50, use decimal
      clean = asThousands > 50 ? clean.replace(',', '.') : clean.replace(',', '');
    } else {
      // 0,85 or 12,5 → decimal
      clean = clean.replace(',', '.');
    }
  } else if (hasDot) {
    // Only dot — check if it's thousands separator
    const parts = clean.split('.');
    if (parts.length === 2 && parts[1].length === 3) {
      // 1.003 → could be thousands (1003) or decimal (1.003)
      const asDecimal = parseFloat(clean);
      // Same heuristic: paper prices < €50 are normal
      if (asDecimal > 50) {
        // Likely thousands: 1.003 = 1003 but that's too expensive for paper
        // So treat dot as decimal: 1.003 = €1.003
        // keep as is
      }
      // Actually 1.003 as-is parses correctly to 1.003 in JS
    }
    // Default: dot is decimal, parseFloat handles it
  }

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

    let finalCost = parseCost(costRaw);
    // Sanity: Greek Excel locale uses . as thousands separator.
    // xlsx reads "1.003" as number 1003. Paper never costs > €50/sheet.
    // If cost > 50, it's likely inflated by ×1000 (one dot) or ×1000000 (two dots).
    if (finalCost > 50) finalCost = finalCost / 1000;
    if (finalCost > 50) finalCost = finalCost / 1000;

    // Extract gsm + dims from name text
    const parsedGsm = extractGsm(nameRaw);
    const parsedDims = extractDims(nameRaw);

    // Clean the name: remove dims & units but KEEP gsm (e.g. "Velvet 130gr")
    let cleanName = nameRaw
      .replace(/(\d+[,.]?\d*)\s*[xX*Χχ×]\s*(\d+[,.]?\d*)/, '')
      .replace(/(cm|mm)/gi, '')
      .replace(/"/g, '')
      .trim();
    // If gsm was parsed but not in the name text, append it
    if (parsedGsm > 0 && !cleanName.match(/\d+\s*(gr|g|gsm)/i)) {
      cleanName = `${cleanName} ${parsedGsm}gr`.trim();
    }
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

    // If grams came from a separate column and aren't in the name yet, append
    if (finalG > 0 && !cleanName.match(/\d+\s*(gr|g|gsm)/i)) {
      cleanName = `${cleanName} ${finalG}gr`.trim();
    }

    // Email: from mapped column or global
    const rowEmail = mapping.email > AUTO
      ? String(row[mapping.email] ?? '').trim()
      : '';

    // Sort LS/SS — bigger = LS (width), smaller = SS (height)
    let mW = finalW || 0;
    let mH = finalH || 0;
    if (mW < mH) { const tmp = mW; mW = mH; mH = tmp; }

    results.push({
      name: cleanName || nameRaw,
      groupName: '',
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
