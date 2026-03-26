import { prisma } from '@/lib/db';
import ProductsList from './products-list';

export const dynamic = 'force-dynamic';

const ORG_ID = 'default-org';

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    where: { orgId: ORG_ID, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  return <ProductsList initialProducts={products} />;
}
