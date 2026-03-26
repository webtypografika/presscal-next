export const dynamic = 'force-dynamic';

import { getQuotes, getCustomers } from './actions';
import { QuotesList } from './quotes-list';

export default async function QuotesPage() {
  const [quotes, customers] = await Promise.all([getQuotes(), getCustomers()]);
  return <QuotesList quotes={quotes} customers={customers} />;
}
