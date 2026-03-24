import { getMachines } from './actions';
import { MachinesList } from './machines-list';

export default async function MachinesPage() {
  const machines = await getMachines();

  return <MachinesList machines={machines} />;
}
