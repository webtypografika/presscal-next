export const dynamic = 'force-dynamic';

import { getCustomers } from './actions';
import { CustomersList } from './customers-list';

export default async function CustomersPage() {
  const customers = await getCustomers();
  return <CustomersList customers={customers} />;
}
