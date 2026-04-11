import { getProjects, getAllItems, getCompaniesForPicker, getContactsForPicker } from './actions';
import OfficeShell from './office-shell';

export const dynamic = 'force-dynamic';

export default async function OfficePage() {
  const [projects, allItems, companies, contacts] = await Promise.all([
    getProjects(),
    getAllItems(),
    getCompaniesForPicker(),
    getContactsForPicker(),
  ]);
  return <OfficeShell initialProjects={projects} initialItems={allItems as any} companies={companies} contacts={contacts} />;
}
