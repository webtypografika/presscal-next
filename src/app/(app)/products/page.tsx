import { prisma } from '@/lib/db';
import ProductsList from './products-list';

export const dynamic = 'force-dynamic';

const ORG_ID = 'default-org';

export default async function ProductsPage() {
  const [products, catalogProducts, org] = await Promise.all([
    prisma.product.findMany({
      where: { orgId: ORG_ID, productType: 'calculator', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.product.findMany({
      where: { orgId: ORG_ID, productType: 'catalog', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.org.findUnique({
      where: { id: ORG_ID },
      select: { apiElorus: true, elorusOrgId: true, elorusTaxes: true },
    }),
  ]);

  const elorusConnected = !!(org?.apiElorus && org?.elorusOrgId);
  const taxes = (org?.elorusTaxes as { id: string; title: string; percentage: string }[]) || [];

  return (
    <ProductsList
      initialProducts={products}
      initialCatalog={catalogProducts}
      elorusConnected={elorusConnected}
      elorusTaxes={taxes}
    />
  );
}
