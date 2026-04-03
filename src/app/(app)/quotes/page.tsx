export const dynamic = 'force-dynamic';

import { getQuotes } from './actions';
import { QuotesList } from './quotes-list';
import { prisma } from '@/lib/db';

export default async function QuotesPage() {
  const [quotes, org] = await Promise.all([
    getQuotes(),
    prisma.org.findUnique({
      where: { id: 'default-org' },
      select: { apiElorus: true, elorusOrgId: true },
    }),
  ]);
  const hasElorus = !!(org?.apiElorus && org.elorusOrgId);
  return <QuotesList quotes={quotes} customers={[]} hasElorus={hasElorus} />;
}
