export const dynamic = 'force-dynamic';

import { getMaterials, getConsumables } from './actions';
import { getOrg } from '../settings/actions';
import { InventoryList } from './inventory-list';

export default async function InventoryPage() {
  const [materials, consumables, org] = await Promise.all([getMaterials(), getConsumables(), getOrg()]);
  return <InventoryList materials={materials} consumables={consumables} org={org} />;
}
