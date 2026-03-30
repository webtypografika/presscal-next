export const dynamic = 'force-dynamic';

import { getPostpressMachines } from './actions';
import { PostpressList } from './postpress-list';

export default async function PostpressPage() {
  const machines = await getPostpressMachines();

  return <PostpressList machines={machines} />;
}
