/**
 * Match unmatched B- quotes to companies via Contact email
 * Run: npx tsx scripts/match-by-email.ts
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

async function main() {
  // Load firestore data for email lookup
  const fsQuotes = JSON.parse(readFileSync(join(__dirname, '..', '..', 'presscal', 'export-quotes.json'), 'utf8'));
  const fsMap = new Map<string, any>();
  for (const q of fsQuotes) {
    if (q.number) fsMap.set(`B-${q.number}`, q);
  }

  // Get unmatched quotes
  const unmatched = await prisma.quote.findMany({
    where: { number: { startsWith: 'B-' }, companyId: null },
    select: { id: true, number: true },
  });
  console.log(`Unmatched quotes: ${unmatched.length}`);

  // Build contact email → companyId map
  const companyContacts = await prisma.companyContact.findMany({
    select: { companyId: true, contact: { select: { email: true } } },
  });
  const emailToCompany = new Map<string, string>();
  for (const cc of companyContacts) {
    if (cc.contact?.email) {
      emailToCompany.set(cc.contact.email.toLowerCase().trim(), cc.companyId);
    }
  }

  // Also add Company.email
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: { id: true, email: true },
  });
  for (const c of companies) {
    if (c.email) emailToCompany.set(c.email.toLowerCase().trim(), c.id);
  }
  console.log(`Email→Company mappings: ${emailToCompany.size}`);

  // Try matching
  let matched = 0;
  let still_unmatched = 0;
  const unmatchedList: string[] = [];

  for (const q of unmatched) {
    const fs = fsMap.get(q.number);
    if (!fs?.customerEmail) { still_unmatched++; unmatchedList.push(`${q.number} | (no email)`); continue; }

    const email = fs.customerEmail.toLowerCase().trim();
    const companyId = emailToCompany.get(email);

    if (companyId) {
      await prisma.quote.update({ where: { id: q.id }, data: { companyId } });
      matched++;
      console.log(`  ✓ ${q.number} → matched via ${email}`);
    } else {
      still_unmatched++;
      unmatchedList.push(`${q.number} | ${fs.customer} | ${email}`);
    }
  }

  console.log(`\n--- Results ---`);
  console.log(`Matched: ${matched}`);
  console.log(`Still unmatched: ${still_unmatched}`);
  if (unmatchedList.length) {
    console.log(`\nStill unmatched:`);
    for (const u of unmatchedList) console.log(`  ${u}`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => { prisma.$disconnect(); pool.end(); });
