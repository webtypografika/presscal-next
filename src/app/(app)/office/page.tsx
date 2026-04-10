import { getProjects, getCompaniesForPicker, getContactsForPicker } from './actions';
import OfficeShell from './office-shell';

export const dynamic = 'force-dynamic';

export default async function OfficePage() {
  const [projects, companies, contacts] = await Promise.all([
    getProjects(),
    getCompaniesForPicker(),
    getContactsForPicker(),
  ]);
  return <OfficeShell initialProjects={projects} companies={companies} contacts={contacts} />;
}
