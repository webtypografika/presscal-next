import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new (PrismaClient as any)({ adapter }) as InstanceType<typeof PrismaClient>;

async function main() {
  const companies = await prisma.company.count();
  const contacts = await prisma.contact.count();
  const links = await prisma.companyContact.count();
  const quotesWithCompany = await prisma.quote.count({ where: { companyId: { not: null } } });
  console.log(`Companies: ${companies}`);
  console.log(`Contacts: ${contacts}`);
  console.log(`Links (CompanyContact): ${links}`);
  console.log(`Quotes with companyId: ${quotesWithCompany}`);
}
main().finally(() => { prisma.$disconnect(); pool.end(); });
