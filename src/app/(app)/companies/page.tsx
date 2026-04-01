export const dynamic = 'force-dynamic';

import { getCompanies } from './actions';
import { CompaniesList } from './companies-list';

export default async function CompaniesPage() {
  const { companies, total, hasMore } = await getCompanies({ take: 50 });
  return <CompaniesList initialCompanies={companies as any} initialTotal={total} initialHasMore={hasMore} />;
}
