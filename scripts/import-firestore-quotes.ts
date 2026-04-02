/**
 * Import Firestore quotes into Neon PostgreSQL
 *
 * Reads: ../presscal/export-quotes.json
 * Matches customers to existing Companies by name/email
 * Creates quotes with simplified items (name, qty, price)
 * Generates NEW quote numbers (doesn't preserve old ones)
 *
 * Run: npx tsx scripts/import-firestore-quotes.ts
 */

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new (PrismaClient as any)({ adapter }) as InstanceType<typeof PrismaClient>;

interface FirestoreItem {
  name: string;
  description: string;
  qty: number;
  unitPrice: number;
  finalPrice: number;
  type: string;
}

interface FirestoreQuote {
  id: string;
  number: string;
  customer: string;
  customerEmail: string;
  customerCompany: string;
  customerId: string;
  title: string;
  description: string;
  notes: string;
  items: FirestoreItem[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  grandTotal: number;
  status: string;
  date: string;
  createdAt: string;
}

// Map Firestore status → new schema status
function mapStatus(s: string): string {
  const map: Record<string, string> = {
    'new': 'draft',
    'draft': 'draft',
    'sent': 'sent',
    'approved': 'approved',
    'rejected': 'rejected',
    'completed': 'completed',
  };
  return map[s] || 'draft';
}

function parseDate(d: string): Date {
  if (!d) return new Date();
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function main() {
  // Load exported quotes
  const quotesPath = join(__dirname, '..', '..', 'presscal', 'export-quotes.json');
  const quotes: FirestoreQuote[] = JSON.parse(readFileSync(quotesPath, 'utf8'));
  console.log(`Loaded ${quotes.length} quotes from export`);

  // Only import quotes that have items
  const withItems = quotes.filter(q => q.items.length > 0);
  console.log(`Quotes with items: ${withItems.length}`);

  // Get the org (assuming single-tenant)
  const org = await prisma.org.findFirst();
  if (!org) { console.error('No org found! Create one first.'); process.exit(1); }
  console.log(`Org: ${org.name} (${org.id})`);

  // Load all companies for matching
  const companies = await prisma.company.findMany({
    where: { orgId: org.id, deletedAt: null },
    select: { id: true, name: true, email: true },
  });
  console.log(`Companies in DB: ${companies.length}`);

  // Build lookup maps (lowercase for fuzzy match)
  const companyByEmail = new Map<string, string>();
  const companyByName = new Map<string, string>();
  for (const c of companies) {
    if (c.email) companyByEmail.set(c.email.toLowerCase().trim(), c.id);
    companyByName.set(c.name.toLowerCase().trim(), c.id);
  }

  // Keep original number with "B-" prefix to avoid conflicts
  // e.g. QT-2026-0023 → B-QT-2026-0023

  // Check for already-imported quotes by B- number
  const existingQuotes = await prisma.quote.findMany({
    where: { orgId: org.id },
    select: { number: true },
  });
  const existingNumbers = new Set(existingQuotes.map((q: any) => q.number));
  console.log(`Existing quotes in DB: ${existingNumbers.size}`);

  let created = 0;
  let matched = 0;
  let unmatched = 0;
  let skipped = 0;

  for (const q of withItems) {
    // Skip if already imported (B- number exists)
    const number = q.number ? `B-${q.number}` : `B-QT-${parseDate(q.date).getFullYear()}-${q.id}`;
    if (existingNumbers.has(number)) { skipped++; continue; }

    // Match company by email first, then by customer name
    let companyId: string | null = null;
    if (q.customerEmail) {
      companyId = companyByEmail.get(q.customerEmail.toLowerCase().trim()) || null;
    }
    if (!companyId && q.customer) {
      companyId = companyByName.get(q.customer.toLowerCase().trim()) || null;
    }
    if (!companyId && q.customerCompany) {
      companyId = companyByName.get(q.customerCompany.toLowerCase().trim()) || null;
    }

    if (companyId) matched++;
    else unmatched++;

    // Build simplified items
    const items = q.items.map((item, idx) => ({
      id: `qi_imp_${idx}`,
      type: item.type || 'manual',
      name: item.name,
      description: item.description,
      qty: item.qty,
      unitPrice: item.unitPrice,
      finalPrice: item.finalPrice,
      notes: '',
      status: 'costed',
    }));

    await prisma.quote.create({
      data: {
        orgId: org.id,
        number,
        status: mapStatus(q.status),
        companyId,
        title: q.title || `Imported: ${q.number}`,
        description: q.description || '',
        notes: `firestore:${q.id}`,  // track origin for dedup
        items: JSON.stringify(items),
        subtotal: q.subtotal || 0,
        vatRate: q.vatRate || 24,
        vatAmount: q.vatAmount || 0,
        grandTotal: q.grandTotal || 0,
        totalCost: 0,
        totalProfit: 0,
        date: parseDate(q.date),
        createdAt: parseDate(q.createdAt),
      },
    });
    created++;
  }

  console.log('\n--- Import Complete ---');
  console.log(`Created: ${created} quotes`);
  console.log(`Company matched: ${matched}`);
  console.log(`No company match: ${unmatched}`);
  console.log(`Skipped (already exists): ${skipped}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => { prisma.$disconnect(); pool.end(); });
