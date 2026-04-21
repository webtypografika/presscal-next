/**
 * Strip country prefixes (EL, GR) and whitespace from VAT/AFM numbers.
 * "EL067372637" → "067372637", "GR 999645238" → "999645238"
 */
export function normalizeAfm(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/^(EL|GR)\s*/i, '').replace(/\s/g, '');
}
