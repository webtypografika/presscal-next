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
  // Load firestore export to get customer names for unmatched quotes
  const fsQuotes = JSON.parse(readFileSync(join(__dirname, '..', '..', 'presscal', 'export-quotes.json'), 'utf8'));
  const fsMap = new Map<string, any>();
  for (const q of fsQuotes) {
    if (q.number) fsMap.set(`B-${q.number}`, q);
  }

  const quotes = await prisma.quote.findMany({
    where: { number: { startsWith: 'B-' }, companyId: null },
    select: { number: true, status: true, grandTotal: true, title: true },
    orderBy: { number: 'asc' },
  });

  console.log(`Unmatched B- quotes (no company): ${quotes.length}\n`);
  console.log('Number | Status | Total | Customer (from Firestore) | Email');
  console.log('-------|--------|-------|---------------------------|------');
  for (const q of quotes) {
    const fs = fsMap.get(q.number);
    const customer = fs?.customer || '(unknown)';
    const email = fs?.customerEmail || '';
    console.log(`${q.number} | ${q.status} | €${q.grandTotal} | ${customer} | ${email}`);
  }
}
main().finally(() => { prisma.$disconnect(); pool.end(); });
