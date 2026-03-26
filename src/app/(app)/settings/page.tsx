import { getOrg } from './actions';
import { SettingsShell } from './settings-shell';

export default async function SettingsPage() {
  const org = await getOrg();
  if (!org) return <p>Org not found</p>;
  return <SettingsShell org={org} />;
}
