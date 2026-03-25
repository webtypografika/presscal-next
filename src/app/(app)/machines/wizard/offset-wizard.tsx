'use client';

import { useState } from 'react';
import { OFFSET_STEPS, OFFSET_DEFAULTS } from './offset-steps';
import { WizardShell } from './wizard-shell';
import { renderOffsetStep } from './offset-renderer';
import { createMachine, updateMachine } from '../actions';
import type { Machine } from '@/generated/prisma/client';

interface Props {
  machine?: Machine;
  onClose: () => void;
}

export function OffsetWizard({ machine, onClose }: Props) {
  const existingSpecs = (machine?.specs ?? {}) as Record<string, unknown>;
  const [data, setData] = useState<Record<string, unknown>>({
    ...OFFSET_DEFAULTS,
    ...existingSpecs,
    name: machine?.name ?? '',
    notes: machine?.notes ?? '',
    off_max_ss: machine?.maxSS ?? OFFSET_DEFAULTS.off_max_ss,
    off_max_ls: machine?.maxLS ?? OFFSET_DEFAULTS.off_max_ls,
    off_min_ss: machine?.minSS ?? OFFSET_DEFAULTS.off_min_ss,
    off_min_ls: machine?.minLS ?? OFFSET_DEFAULTS.off_min_ls,
  });

  function handleChange(field: string, value: unknown) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    const { name, notes, off_max_ss, off_max_ls, off_min_ss, off_min_ls, off_gripper, off_side_margin, off_margin_tail, ...specs } = data;

    const payload = {
      name: (name as string) || 'Untitled Offset',
      cat: 'offset',
      notes: (notes as string) ?? '',
      maxSS: (off_max_ss as number) ?? undefined,
      maxLS: (off_max_ls as number) ?? undefined,
      minSS: (off_min_ss as number) ?? undefined,
      minLS: (off_min_ls as number) ?? undefined,
      marginTop: (off_gripper as number) ?? undefined,
      marginBottom: (off_margin_tail as number) ?? undefined,
      marginLeft: (off_side_margin as number) ?? undefined,
      marginRight: (off_side_margin as number) ?? undefined,
      specs: { ...specs, off_gripper, off_side_margin, off_margin_tail },
    };

    if (machine) {
      await updateMachine(machine.id, payload);
    } else {
      await createMachine(payload);
    }
    onClose();
  }

  return (
    <WizardShell
      title={machine ? `Επεξεργασία: ${machine.name}` : 'Νέα Offset Μηχανή'}
      steps={OFFSET_STEPS}
      data={data}
      onChange={handleChange}
      onSave={handleSave}
      onClose={onClose}
      renderStep={renderOffsetStep}
    />
  );
}
