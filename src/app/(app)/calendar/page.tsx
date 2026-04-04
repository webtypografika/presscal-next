export const dynamic = 'force-dynamic';

import { getEvents } from './actions';
import { CalendarView } from './calendar-view';

export default async function CalendarPage() {
  // Fetch current month events by default
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const events = await getEvents(start.toISOString(), end.toISOString());

  return <CalendarView initialEvents={events} initialYear={now.getFullYear()} initialMonth={now.getMonth()} />;
}
