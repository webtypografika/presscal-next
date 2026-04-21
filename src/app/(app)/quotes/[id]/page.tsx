export const dynamic = 'force-dynamic';

import { getQuote } from '../actions';
import { QuoteDetail } from './quote-detail';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [quote, org, materials, companies] = await Promise.all([
    getQuote(id),
    prisma.org.findUnique({
      where: { id: 'default-org' },
      select: {
        apiElorus: true, elorusOrgId: true, elorusOrgSlug: true, courierApiKey: true, courierProvider: true,
        legalName: true, afm: true, doy: true, address: true, city: true, postalCode: true, phone: true, email: true,
      },
    }),
    prisma.material.findMany({ where: { orgId: 'default-org', cat: 'sheet', deletedAt: null }, orderBy: { name: 'asc' } }),
    prisma.company.findMany({
      where: { orgId: 'default-org', deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        companyContacts: {
          where: { isPrimary: true },
          include: { contact: { select: { id: true, name: true, email: true, phone: true, mobile: true } } },
          take: 1,
        },
      },
    }),
  ]);
  if (!quote) redirect('/quotes');
  const elorusConfigured = !!(org?.apiElorus && org.elorusOrgId);
  const courierConfigured = !!(org?.courierApiKey && org.courierProvider);
  return <QuoteDetail quote={quote} customers={companies} elorusConfigured={elorusConfigured} elorusSlug={org?.elorusOrgSlug ?? ''} courierConfigured={courierConfigured} materials={materials} org={org} />;
}
