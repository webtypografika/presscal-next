export const dynamic = 'force-dynamic';

import { getQuote } from '../actions';
import { getCustomers } from '../actions';
import { QuoteDetail } from './quote-detail';
import { redirect } from 'next/navigation';

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [quote, customers] = await Promise.all([getQuote(id), getCustomers()]);
  if (!quote) redirect('/quotes');
  return <QuoteDetail quote={quote} customers={customers} />;
}
