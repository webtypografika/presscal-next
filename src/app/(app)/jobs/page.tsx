import { getJobs } from './actions';
import { getCustomers } from '../quotes/actions';
import { JobsBoard } from './jobs-board';

export default async function JobsPage() {
  const [jobs, customers] = await Promise.all([getJobs(), getCustomers()]);
  return <JobsBoard jobs={jobs as any} customers={customers as any} />;
}
