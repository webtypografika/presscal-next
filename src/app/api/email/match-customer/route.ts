import { prisma } from '@/lib/db';
import { NextRequest } from 'next/server';

const ORG_ID = 'default-org';

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email');
  if (!email) return Response.json({ customer: null, company: null, contact: null });

  // 1. Search Contact.email
  const contact = await prisma.contact.findFirst({
    where: {
      orgId: ORG_ID,
      deletedAt: null,
      email: { equals: email, mode: 'insensitive' },
    },
    include: {
      companyContacts: {
        include: {
          company: {
            include: {
              quotes: {
                where: { deletedAt: null },
                select: { id: true, number: true, status: true, grandTotal: true },
                orderBy: { createdAt: 'desc' },
                take: 5,
              },
            },
          },
        },
      },
    },
  });

  if (contact) {
    const companies = contact.companyContacts.map(cc => cc.company);
    const needsDisambiguation = companies.length > 1;

    // Backward compat: return "customer" shape from primary company
    const primaryCompany = companies[0];
    const customer = primaryCompany ? {
      id: primaryCompany.id,
      name: primaryCompany.name,
      company: primaryCompany.name,
      email: contact.email,
      phone: contact.phone,
      quotes: primaryCompany.quotes,
    } : null;

    return Response.json({
      customer,
      contact: { id: contact.id, name: contact.name, email: contact.email, role: contact.role },
      companies,
      needsDisambiguation,
    });
  }

  // 2. Fallback: search Company.email
  const company = await prisma.company.findFirst({
    where: {
      orgId: ORG_ID,
      deletedAt: null,
      email: { equals: email, mode: 'insensitive' },
    },
    include: {
      companyContacts: {
        where: { isPrimary: true },
        include: { contact: true },
        take: 1,
      },
      quotes: {
        where: { deletedAt: null },
        select: { id: true, number: true, status: true, grandTotal: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  if (company) {
    const primaryContact = company.companyContacts[0]?.contact;
    return Response.json({
      customer: {
        id: company.id,
        name: company.name,
        company: company.name,
        email: company.email,
        phone: company.phone,
        quotes: company.quotes,
      },
      contact: primaryContact ? { id: primaryContact.id, name: primaryContact.name, email: primaryContact.email, role: primaryContact.role } : null,
      companies: [company],
      needsDisambiguation: false,
    });
  }

  // 3. Try old Customer table (backward compat during migration)
  const oldCustomer = await prisma.customer.findFirst({
    where: {
      orgId: ORG_ID,
      deletedAt: null,
      email: { equals: email, mode: 'insensitive' },
    },
    select: {
      id: true, name: true, company: true, email: true, phone: true,
      quotes: {
        where: { deletedAt: null },
        select: { id: true, number: true, status: true, grandTotal: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  return Response.json({
    customer: oldCustomer,
    contact: null,
    companies: [],
    needsDisambiguation: false,
  });
}
