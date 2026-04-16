// Server-only fuzzy search using Postgres pg_trgm + unaccent.
// Uses the `searchKey` column (auto-maintained by triggers) + GIN trigram index.
// Handles: accents, case, greeklish, typos, substring matches.
//
// This file is intentionally separate from `search.ts` so that client components
// importing the pure-JS helpers (normalize / fuzzyMatch) don't pull Prisma/pg
// into the browser bundle.

import { prisma } from '@/lib/db';
import { normalize, normalizeGreeklish } from '@/lib/search';

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
