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

// NOTE: This file is imported by BOTH client and server code (e.g. quotes-list.tsx
// uses fuzzyMatch on the client). DB-backed fuzzy search lives in `search-server.ts`
// to avoid bundling pg/prisma into the browser.
