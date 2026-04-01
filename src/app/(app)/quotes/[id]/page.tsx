export const dynamic = 'force-dynamic';

import { getQuote } from '../actions';
import { QuoteDetail } from './quote-detail';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [quote, org, materials] = await Promise.all([
    getQuote(id),
    prisma.org.findUnique({
      where: { id: 'default-org' },
      select: {
        apiElorus: true, elorusOrgId: true, elorusOrgSlug: true,
        legalName: true, afm: true, doy: true, address: true, city: true, postalCode: true, phone: true, email: true,
      },
    }),
    prisma.material.findMany({ where: { orgId: 'default-org', cat: 'sheet', deletedAt: null }, orderBy: { name: 'asc' } }),
  ]);
  if (!quote) redirect('/quotes');
  const elorusConfigured = !!(org?.apiElorus && org.elorusOrgId);
  return <QuoteDetail quote={quote} customers={[]} elorusConfigured={elorusConfigured} elorusSlug={org?.elorusOrgSlug ?? ''} materials={materials} org={org} />;
}
