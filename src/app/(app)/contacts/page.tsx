export const dynamic = 'force-dynamic';

import { getCompanies, getContactsWithCompanies } from '../companies/actions';
import { ContactsPage } from './contacts-page';
import { prisma } from '@/lib/db';

export default async function ContactsPageServer() {
  const [companiesResult, contactsResult, org, allCompanies, allContacts] = await Promise.all([
    getCompanies({ take: 50 }),
    getContactsWithCompanies({ take: 50 }),
    prisma.org.findUnique({
      where: { id: 'default-org' },
      select: { apiElorus: true, elorusOrgId: true },
    }),
    prisma.company.findMany({
      where: { orgId: 'default-org', deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.contact.findMany({
      where: { orgId: 'default-org', deletedAt: null },
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  const hasElorus = !!(org?.apiElorus && org.elorusOrgId);

  return (
    <ContactsPage
      initialCompanies={companiesResult.companies as any}
      initialCompaniesTotal={companiesResult.total}
      initialCompaniesHasMore={companiesResult.hasMore}
      initialContacts={contactsResult.contacts as any}
      initialContactsTotal={contactsResult.total}
      initialContactsHasMore={contactsResult.hasMore}
      hasElorus={hasElorus}
      allCompanies={allCompanies}
      allContacts={allContacts}
    />
  );
}
