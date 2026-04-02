import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import 'dotenv/config';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new (PrismaClient as any)({ adapter }) as InstanceType<typeof PrismaClient>;

async function main() {
  const q = await prisma.quote.findFirst({
    where: { number: 'B-QT-2026-0023' },
  });
  console.log(JSON.stringify(q, null, 2));
}
main().finally(() => { prisma.$disconnect(); pool.end(); });
