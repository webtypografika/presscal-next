export const dynamic = 'force-dynamic';

import { getMaterials, getConsumables } from './actions';
import { getOrg } from '../settings/actions';
import { InventoryList } from './inventory-list';
import { prisma } from '@/lib/db';

const ORG_ID = 'default-org';

export default async function InventoryPage() {
  const [materials, consumables, org, catalogProducts] = await Promise.all([
    getMaterials(),
    getConsumables(),
    getOrg(),
    prisma.product.findMany({
      where: { orgId: ORG_ID, productType: 'catalog', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const elorusConnected = !!(org?.apiElorus && org?.elorusOrgId);
  const elorusTaxes = (org?.elorusTaxes as { id: string; title: string; percentage: string }[]) || [];

  return (
    <InventoryList
      materials={materials}
      consumables={consumables}
      org={org}
      catalogProducts={catalogProducts}
      elorusConnected={elorusConnected}
      elorusTaxes={elorusTaxes}
    />
  );
}
