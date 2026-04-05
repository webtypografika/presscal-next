export const dynamic = 'force-dynamic';

import { getCustomers } from './actions';
import { CustomersList } from './customers-list';
import { prisma } from '@/lib/db';

export default async function CustomersPage() {
  const [customers, org] = await Promise.all([
    getCustomers(),
    prisma.org.findUnique({
      where: { id: 'default-org' },
      select: { apiElorus: true, elorusOrgId: true },
    }),
  ]);
  const hasElorus = !!(org?.apiElorus && org.elorusOrgId);
  return <CustomersList customers={customers} hasElorus={hasElorus} />;
}
