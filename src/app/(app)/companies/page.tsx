export const dynamic = 'force-dynamic';

import { getCompanies } from './actions';
import { CompaniesList } from './companies-list';
import { prisma } from '@/lib/db';

export default async function CompaniesPage() {
  const [{ companies, total, hasMore }, org] = await Promise.all([
    getCompanies({ take: 50 }),
    prisma.org.findUnique({
      where: { id: 'default-org' },
      select: { apiElorus: true, elorusOrgId: true },
    }),
  ]);
  const hasElorus = !!(org?.apiElorus && org.elorusOrgId);
  return <CompaniesList initialCompanies={companies as any} initialTotal={total} initialHasMore={hasMore} hasElorus={hasElorus} />;
}
