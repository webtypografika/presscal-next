export const dynamic = 'force-dynamic';

import { getQuotes } from './actions';
import { QuotesList } from './quotes-list';

export default async function QuotesPage() {
  const quotes = await getQuotes();
  return <QuotesList quotes={quotes} customers={[]} />;
}
