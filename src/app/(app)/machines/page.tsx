import { getMachines } from './actions';
import { MachinesList } from './machines-list';

export default async function MachinesPage() {
  const machines = await getMachines();

  return (
    <div className="max-w-[1280px] mx-auto space-y-6">
      <MachinesList machines={machines} />
    </div>
  );
}
