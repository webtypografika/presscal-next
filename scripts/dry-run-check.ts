import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { readFileSync } from 'fs';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new (PrismaClient as any)({ adapter }) as InstanceType<typeof PrismaClient>;

async function check() {
  const quotes = JSON.parse(readFileSync('../presscal/export-quotes.json', 'utf8'));
  const withItems = quotes.filter((q: any) => q.items.length > 0);

  const org = await prisma.org.findFirst();
  if (!org) { console.error('No org found'); return; }
  const companies = await prisma.company.findMany({
    where: { orgId: org.id, deletedAt: null },
    select: { id: true, name: true, email: true },
  });

  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of companies) {
    if (c.email) byEmail.set(c.email.toLowerCase().trim(), c.id);
    byName.set(c.name.toLowerCase().trim(), c.id);
  }

  let matched = 0, unmatched = 0;
  const unmatchedList: string[] = [];
  for (const q of withItems) {
    let found = false;
    if (q.customerEmail && byEmail.has(q.customerEmail.toLowerCase().trim())) found = true;
    if (!found && q.customer && byName.has(q.customer.toLowerCase().trim())) found = true;
    if (!found && q.customerCompany && byName.has(q.customerCompany.toLowerCase().trim())) found = true;
    if (found) matched++;
    else { unmatched++; unmatchedList.push(q.customer || q.customerEmail || '(empty)'); }
  }

  console.log(`Quotes with items: ${withItems.length}`);
  console.log(`Company matched: ${matched}`);
  console.log(`Unmatched: ${unmatched}`);
  if (unmatchedList.length) console.log(`Unmatched customers: ${unmatchedList.join(', ')}`);
}

check()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => { prisma.$disconnect(); pool.end(); });
