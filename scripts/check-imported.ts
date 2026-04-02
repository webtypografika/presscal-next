import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import 'dotenv/config';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new (PrismaClient as any)({ adapter }) as InstanceType<typeof PrismaClient>;

async function main() {
  const quotes = await prisma.quote.findMany({
    where: { number: { startsWith: 'B-' } },
    select: { number: true, status: true, companyId: true, items: true, title: true, grandTotal: true },
    orderBy: { number: 'asc' },
  });

  let withCompany = 0;
  let withItems = 0;
  let emptyItems = 0;
  let totalItems = 0;

  for (const q of quotes) {
    const items = Array.isArray(q.items) ? q.items : (typeof q.items === 'string' ? JSON.parse(q.items) : []);
    if (q.companyId) withCompany++;
    if (items.length > 0) { withItems++; totalItems += items.length; }
    else emptyItems++;
  }

  console.log(`B- quotes total: ${quotes.length}`);
  console.log(`With company: ${withCompany}`);
  console.log(`Without company: ${quotes.length - withCompany}`);
  console.log(`With items: ${withItems}`);
  console.log(`Empty items: ${emptyItems}`);
  console.log(`Total line items: ${totalItems}`);

  // Show 5 samples
  console.log('\n--- Samples ---');
  for (const q of quotes.slice(0, 5)) {
    const items = Array.isArray(q.items) ? q.items : (typeof q.items === 'string' ? JSON.parse(q.items) : []);
    const itemNames = items.map((i: any) => `${i.name} (${i.qty}x €${i.unitPrice})`).join(', ');
    console.log(`${q.number} | ${q.status} | company:${q.companyId ? 'YES' : 'NO'} | €${q.grandTotal} | ${itemNames || '(no items)'}`);
  }
}
main().finally(() => { prisma.$disconnect(); pool.end(); });
