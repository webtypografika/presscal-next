import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import 'dotenv/config';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new (PrismaClient as any)({ adapter }) as InstanceType<typeof PrismaClient>;
async function main() {
  // Find quotes without companyId
  const orphans = await prisma.quote.findMany({
    where: { companyId: null, customerId: { not: null } },
    select: { id: true, number: true, customerId: true },
  });
  console.log(`Quotes with customerId but no companyId: ${orphans.length}`);
  for (const q of orphans.slice(0, 5)) console.log(`  ${q.number} customerId=${q.customerId}`);
}
main().finally(() => { prisma.$disconnect(); pool.end(); });
