/**
 * Global number input/display helpers for Greek locale.
 * - Input: accepts both comma and dot as decimal separator
 * - Display: formats with dot as thousands separator, comma as decimal
 */

/**
 * Parse a user-entered value into a clean number string for storage.
 * Handles: "1.500,50" → "1500.50", "0,5" → "0.5", "1500.5" → "1500.5"
 */
export function parseNumericInput(value: string): string {
  if (!value) return value;
  let s = value.trim();

  // If has both dots and comma, determine which is decimal:
  // "1.500,50" → comma is decimal (European)
  // "1,500.50" → dot is decimal (US)
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');

  if (lastDot >= 0 && lastComma >= 0) {
    if (lastComma > lastDot) {
      // European: 1.500,50 → remove dots, replace comma with dot
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // US: 1,500.50 → remove commas
      s = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    // Only comma: could be "0,5" (decimal) or "1,000" (thousands)
    // If digits after comma are exactly 3 and no other commas → thousands
    const afterComma = s.substring(lastComma + 1);
    const beforeComma = s.substring(0, lastComma);
    if (afterComma.length === 3 && /^\d+$/.test(afterComma) && /^\d+$/.test(beforeComma) && parseFloat(beforeComma) > 0) {
      // Ambiguous: could be 1,000 (thousands) or 1,000 (decimal)
      // In Greek context, comma is usually decimal — but for integers > 999, it's thousands
      // Heuristic: if result would be > 999 treating comma as decimal, treat as thousands
      // Actually safer: treat comma as decimal always (user intent for "0,5" is 0.5)
      s = s.replace(',', '.');
    } else {
      s = s.replace(',', '.');
    }
  }
  // Dot-only: already correct format

  return s;
}

/**
 * Format a number for display in Greek locale (1.000,50)
 */
export function formatNumber(value: number | string | null | undefined, decimals?: number): string {
  if (value == null || value === '') return '';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '';

  return num.toLocaleString('el-GR', {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 10,
  });
}

/**
 * Format currency
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '';
  return value.toLocaleString('el-GR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Attach to an input's onChange to auto-fix comma → dot for numeric fields.
 * Returns the cleaned value string.
 */
export function cleanNumericValue(rawValue: string): string {
  // Replace comma with dot in real-time as user types
  return rawValue.replace(/,/g, '.');
}
