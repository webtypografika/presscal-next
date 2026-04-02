import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import 'dotenv/config';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new (PrismaClient as any)({ adapter }) as InstanceType<typeof PrismaClient>;
async function main() {
  const q = await prisma.quote.findFirst({
    where: { number: 'QT-2026-0018' },
    select: { id: true, number: true, companyId: true, customerId: true, title: true },
  });
  console.log('Quote:', JSON.stringify(q, null, 2));

  if (q?.companyId) {
    const company = await prisma.company.findUnique({ where: { id: q.companyId }, select: { id: true, name: true, email: true } });
    console.log('Company:', JSON.stringify(company, null, 2));
  }
  if (q?.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: q.customerId }, select: { id: true, name: true, email: true, company: true } });
    console.log('Customer:', JSON.stringify(customer, null, 2));
  }
  if (!q?.companyId && !q?.customerId) {
    console.log('No company or customer linked!');
  }
}
main().finally(() => { prisma.$disconnect(); pool.end(); });
