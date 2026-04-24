export const dynamic = 'force-dynamic';

import { getQuote } from '../actions';
import { QuoteDetail } from './quote-detail';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [quote, org, materials, companies, catalogProducts] = await Promise.all([
    getQuote(id),
    prisma.org.findUnique({
      where: { id: 'default-org' },
      select: {
        apiElorus: true, elorusOrgId: true, elorusOrgSlug: true, courierProviders: true, courierDefaultId: true,
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
    prisma.product.findMany({
      where: { orgId: 'default-org', productType: 'catalog', deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true, sku: true, sellPrice: true, unit: true, elorusProductId: true },
    }),
  ]);
  if (!quote) redirect('/quotes');
  const elorusConfigured = !!(org?.apiElorus && org.elorusOrgId);
  const courierProviders = Array.isArray(org?.courierProviders) ? org.courierProviders : [];
  const courierConfigured = courierProviders.length > 0 && !!org?.courierDefaultId;
  return <QuoteDetail quote={quote} customers={companies} elorusConfigured={elorusConfigured} elorusSlug={org?.elorusOrgSlug ?? ''} courierConfigured={courierConfigured} materials={materials} org={org} catalogProducts={catalogProducts} />;
}
