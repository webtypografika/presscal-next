import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ORG_ID = 'default-org';

// ONE-TIME: Migrate legacy Customers → Company + Contact
// GET /api/migrate-customers — delete this file after running
export async function GET() {
  try {
    const allCustomers = await prisma.customer.findMany({
      where: { orgId: ORG_ID, deletedAt: null },
    });

    let migrated = 0;
    let skipped = 0;

    for (const cust of allCustomers) {
      // Check if a company with same name or AFM already exists
      const existing = await prisma.company.findFirst({
        where: {
          orgId: ORG_ID, deletedAt: null,
          OR: [
            ...(cust.afm ? [{ afm: cust.afm }] : []),
            { name: { equals: cust.name, mode: 'insensitive' as const } },
          ],
        },
      });

      if (existing) {
        // Already has a matching company — just link quotes
        await prisma.quote.updateMany({
          where: { customerId: cust.id, companyId: null },
          data: { companyId: existing.id },
        });
        skipped++;
        continue;
      }

      // Create new Company
      const company = await prisma.company.create({
        data: {
          orgId: ORG_ID,
          name: cust.name,
          email: cust.email,
          phone: cust.phone,
          afm: cust.afm,
          doy: cust.doy,
          address: cust.address,
          city: cust.city,
          zip: cust.zip,
          folderPath: (cust as any).folderPath || null,
        },
      });

      // Create Contact from customer name
      const contact = await prisma.contact.create({
        data: {
          orgId: ORG_ID,
          name: cust.name,
          email: cust.email,
          phone: cust.phone,
        },
      });

      // Link Contact to Company
      await prisma.companyContact.create({
        data: { companyId: company.id, contactId: contact.id, isPrimary: true },
      });

      // Update quotes that reference this customer to also reference the company
      await prisma.quote.updateMany({
        where: { customerId: cust.id, companyId: null },
        data: { companyId: company.id, contactId: contact.id },
      });

      migrated++;
    }

    return NextResponse.json({ total: allCustomers.length, migrated, skipped });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, stack: (e as Error).stack }, { status: 500 });
  }
}
