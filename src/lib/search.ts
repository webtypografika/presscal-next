/**
 * Normalize text for forgiving search:
 * - lowercase
 * - strip Greek accents (ά→α, έ→ε, ή→η, ί→ι, ό→ο, ύ→υ, ώ→ω)
 * - strip Latin accents (é→e, ü→u, etc.)
 * - greeklish→greek mapping (optional)
 */

const ACCENT_MAP: Record<string, string> = {
  'ά': 'α', 'έ': 'ε', 'ή': 'η', 'ί': 'ι', 'ό': 'ο', 'ύ': 'υ', 'ώ': 'ω',
  'ΐ': 'ι', 'ΰ': 'υ', 'ϊ': 'ι', 'ϋ': 'υ',
  'Ά': 'α', 'Έ': 'ε', 'Ή': 'η', 'Ί': 'ι', 'Ό': 'ο', 'Ύ': 'υ', 'Ώ': 'ω',
};

const GREEKLISH_MAP: Record<string, string> = {
  'a': 'α', 'b': 'β', 'g': 'γ', 'd': 'δ', 'e': 'ε', 'z': 'ζ',
  'h': 'η', 'i': 'ι', 'k': 'κ', 'l': 'λ', 'm': 'μ', 'n': 'ν',
  'x': 'ξ', 'o': 'ο', 'p': 'π', 'r': 'ρ', 's': 'σ', 't': 'τ',
  'u': 'υ', 'f': 'φ', 'w': 'ω', 'v': 'β', 'c': 'κ', 'j': 'ι', 'y': 'υ',
};

// Common digraphs
const GREEKLISH_DIGRAPHS: [string, string][] = [
  ['th', 'θ'], ['ph', 'φ'], ['ch', 'χ'], ['ps', 'ψ'],
  ['ks', 'ξ'], ['mp', 'μπ'], ['nt', 'ντ'], ['gk', 'γκ'],
  ['ou', 'ου'], ['ei', 'ει'], ['oi', 'οι'], ['ai', 'αι'],
  ['ee', 'η'], ['oo', 'ου'],
];

export function normalize(text: string): string {
  if (!text) return '';
  let s = text.toLowerCase();
  // Replace accented chars
  s = s.replace(/[άέήίόύώΐΰϊϋΆΈΉΊΌΎΏ]/g, ch => ACCENT_MAP[ch] || ch);
  // Strip remaining diacritics (Latin accents)
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return s;
}

export function normalizeGreeklish(text: string): string {
  if (!text) return '';
  let s = text.toLowerCase();
  // Strip accents first
  s = s.replace(/[άέήίόύώΐΰϊϋΆΈΉΊΌΎΏ]/g, ch => ACCENT_MAP[ch] || ch);
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Apply digraphs first (longer matches)
  for (const [from, to] of GREEKLISH_DIGRAPHS) {
    s = s.split(from).join(to);
  }
  // Then single char mapping
  s = s.replace(/[a-z]/g, ch => GREEKLISH_MAP[ch] || ch);
  return s;
}

/**
 * Check if `haystack` contains `needle` with accent-insensitive + greeklish matching.
 * Tries: exact normalized match, then greeklish conversion of needle.
 */
export function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  if (!haystack) return false;
  const h = normalize(haystack);
  const n = normalize(needle);
  if (h.includes(n)) return true;
  // Try greeklish: convert Latin needle to Greek
  const nGreek = normalizeGreeklish(needle);
  if (h.includes(nGreek)) return true;
  return false;
}

// ─── DB-backed fuzzy search (Postgres pg_trgm + unaccent) ───
// Uses the `searchKey` column (auto-maintained by triggers) + GIN trigram index.
// Handles: accents, case, greeklish, typos, substring matches.

import { prisma } from '@/lib/db';

type SearchModel = 'Company' | 'Contact' | 'Quote';

/**
 * Returns matching row IDs ordered by fuzzy score (best match first).
 *
 * Strategy (per query variant):
 *   1. ILIKE '%q%' — exact substring match (uses GIN trgm index)
 *   2. word_similarity(q, searchKey) > 0.5 — fuzzy match within a word (catches typos,
 *      missing letters, accents). word_similarity is much better than plain similarity()
 *      because it ignores the "noise" of other words in searchKey.
 *
 * Two variants are tried: the accent-stripped original + greeklish→greek conversion.
 */
const WORD_SIM_THRESHOLD = 0.5;

export async function fuzzySearchIds(
  model: SearchModel,
  orgId: string,
  query: string,
  limit = 20,
): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];

  const vNorm = normalize(q);
  const vGreek = normalizeGreeklish(q);
  const variants = Array.from(new Set([vNorm, vGreek].filter(Boolean)));
  if (variants.length === 0) return [];

  // Placeholders: $1 = orgId, $2..$N = variants
  const ph = variants.map((_, i) => `$${i + 2}`);
  const whereParts = ph.flatMap(p => [
    `"searchKey" ILIKE '%' || ${p} || '%'`,
    `word_similarity(${p}, "searchKey") > ${WORD_SIM_THRESHOLD}`,
  ]).join(' OR ');
  const scoreExpr = `GREATEST(${ph.map(p => `word_similarity(${p}, "searchKey")`).join(', ')}, 0)`;

  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id, ${scoreExpr} AS _score
     FROM "${model}"
     WHERE "orgId" = $1
       AND "deletedAt" IS NULL
       AND (${whereParts})
     ORDER BY _score DESC, "searchKey" ASC
     LIMIT ${Math.max(1, Math.min(limit, 100))}`,
    orgId,
    ...variants,
  );
  return rows.map(r => r.id);
}

/**
 * Preserves fuzzySearchIds ordering when re-fetching rows with Prisma includes.
 * Usage:
 *   const ids = await fuzzySearchIds('Company', ORG_ID, q);
 *   const rows = await prisma.company.findMany({ where: { id: { in: ids } }, include: {...} });
 *   return orderByIds(rows, ids);
 */
export function orderByIds<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map(r => [r.id, r]));
  return ids.map(id => byId.get(id)).filter((x): x is T => !!x);
}
