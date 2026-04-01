import { getJobs, getJobStages } from './actions';
import { JobsBoard } from './jobs-board';

export default async function JobsPage() {
  const [jobs, stages] = await Promise.all([getJobs(), getJobStages()]);
  return <JobsBoard jobs={jobs as any} customers={[]} stages={stages} />;
}
