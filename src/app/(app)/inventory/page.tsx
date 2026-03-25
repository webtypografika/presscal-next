export const dynamic = 'force-dynamic';

import { getMaterials, getConsumables } from './actions';
import { InventoryList } from './inventory-list';

export default async function InventoryPage() {
  const [materials, consumables] = await Promise.all([getMaterials(), getConsumables()]);
  return <InventoryList materials={materials} consumables={consumables} />;
}
