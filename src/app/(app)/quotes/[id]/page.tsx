export const dynamic = 'force-dynamic';

import { getQuote } from '../actions';
import { getCustomers } from '../actions';
import { QuoteDetail } from './quote-detail';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [quote, customers, org] = await Promise.all([
    getQuote(id),
    getCustomers(),
    prisma.org.findUnique({ where: { id: 'default-org' }, select: { apiElorus: true, elorusOrgId: true, elorusOrgSlug: true } }),
  ]);
  if (!quote) redirect('/quotes');
  const elorusConfigured = !!(org?.apiElorus && org.elorusOrgId);
  return <QuoteDetail quote={quote} customers={customers} elorusConfigured={elorusConfigured} elorusSlug={org?.elorusOrgSlug ?? ''} />;
}
