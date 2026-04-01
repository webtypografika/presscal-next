/**
 * Migration script: Customer → Company + Contact
 *
 * For each Customer:
 * 1. Create a Company (using company name or person name)
 * 2. Create a Contact (the person)
 * 3. Link them via CompanyContact (isPrimary = true)
 * 4. Update Quote.companyId from Quote.customerId
 * 5. Update FileLink.companyId from FileLink.customerId
 *
 * Run: npx tsx scripts/migrate-customers.ts
 */

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new (PrismaClient as any)({ adapter }) as InstanceType<typeof PrismaClient>;

async function main() {
  const customers = await prisma.customer.findMany();
  console.log(`Found ${customers.length} customers to migrate`);

  let migrated = 0;
  const customerToCompany = new Map<string, string>(); // old customerId → new companyId

  for (const cust of customers) {
    // Create Company
    const company = await prisma.company.create({
      data: {
        orgId: cust.orgId,
        name: cust.company || cust.name, // Use company name if exists, otherwise person name
        afm: cust.afm,
        doy: cust.doy,
        address: cust.address,
        city: cust.city,
        zip: cust.zip,
        phone: cust.phone,
        email: cust.email,
        notes: cust.notes,
        tags: cust.tags,
        folderPath: cust.folderPath,
        elorusContactId: cust.elorusContactId,
        deletedAt: cust.deletedAt,
        createdAt: cust.createdAt,
        updatedAt: cust.updatedAt,
      },
    });

    // Create Contact (the person)
    const contact = await prisma.contact.create({
      data: {
        orgId: cust.orgId,
        name: cust.name,
        email: cust.email,
        phone: cust.phone,
        mobile: cust.mobile,
        notes: '',
        role: cust.company ? 'employee' : 'contact',
        deletedAt: cust.deletedAt,
        createdAt: cust.createdAt,
        updatedAt: cust.updatedAt,
      },
    });

    // Link them
    await prisma.companyContact.create({
      data: {
        companyId: company.id,
        contactId: contact.id,
        role: cust.company ? 'employee' : 'owner',
        isPrimary: true,
      },
    });

    customerToCompany.set(cust.id, company.id);
    migrated++;
    if (migrated % 100 === 0) console.log(`  migrated ${migrated}/${customers.length}`);
  }

  console.log(`Created ${migrated} companies + contacts`);

  // Update Quotes
  const quotes = await prisma.quote.findMany({ where: { customerId: { not: null } } });
  let qUpdated = 0;
  for (const q of quotes) {
    const companyId = customerToCompany.get(q.customerId!);
    if (companyId) {
      await prisma.quote.update({ where: { id: q.id }, data: { companyId } });
      qUpdated++;
    }
  }
  console.log(`Updated ${qUpdated} quotes`);

  // Update FileLinks
  const fileLinks = await prisma.fileLink.findMany({ where: { customerId: { not: null } } });
  let fUpdated = 0;
  for (const fl of fileLinks) {
    const companyId = customerToCompany.get(fl.customerId!);
    if (companyId) {
      await prisma.fileLink.update({ where: { id: fl.id }, data: { companyId } });
      fUpdated++;
    }
  }
  console.log(`Updated ${fUpdated} file links`);

  console.log('Migration complete!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
