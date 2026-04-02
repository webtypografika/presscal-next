import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import 'dotenv/config';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new (PrismaClient as any)({ adapter }) as InstanceType<typeof PrismaClient>;
async function main() {
  const qs = await prisma.quote.findMany({ select: { number: true }, orderBy: { number: 'asc' } });
  for (const q of qs) console.log(q.number);
  console.log(`Total: ${qs.length}`);
}
main().finally(() => { prisma.$disconnect(); pool.end(); });
