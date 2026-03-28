'use client';

import { useState, useEffect } from 'react';
import { DIGITAL_STEPS, DIGITAL_DEFAULTS } from './digital-steps';
import { WizardShell } from './wizard-shell';
import { renderDigitalStep } from './digital-renderer';
import { createMachine, updateMachine } from '../actions';
import { syncConsumables } from './sync-consumables';
import type { Machine } from '@/generated/prisma/client';

interface Props {
  machine?: Machine;
  onClose: () => void;
}

export function DigitalWizard({ machine, onClose }: Props) {
  const existingSpecs = (machine?.specs ?? {}) as Record<string, unknown>;
  const [data, setData] = useState<Record<string, unknown>>({
    ...DIGITAL_DEFAULTS,
    ...existingSpecs,
    name: machine?.name ?? '',
    notes: machine?.notes ?? '',
    max_sheet_ss: machine?.maxSS ?? DIGITAL_DEFAULTS.max_sheet_ss,
    max_sheet_ls: machine?.maxLS ?? DIGITAL_DEFAULTS.max_sheet_ls,
    min_sheet_ss: machine?.minSS ?? DIGITAL_DEFAULTS.min_sheet_ss,
    min_sheet_ls: machine?.minLS ?? DIGITAL_DEFAULTS.min_sheet_ls,
    margin_top: machine?.marginTop ?? DIGITAL_DEFAULTS.margin_top,
    margin_bottom: machine?.marginBottom ?? DIGITAL_DEFAULTS.margin_bottom,
    margin_left: machine?.marginLeft ?? DIGITAL_DEFAULTS.margin_left,
    margin_right: machine?.marginRight ?? DIGITAL_DEFAULTS.margin_right,
  });

  // Sync linked consumable prices from warehouse on load
  useEffect(() => {
    if (machine?.id) syncConsumables(machine.id, setData);
  }, [machine?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(field: string, value: unknown) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    const { name, notes, max_sheet_ss, max_sheet_ls, min_sheet_ss, min_sheet_ls, margin_top, margin_bottom, margin_left, margin_right, ...specs } = data;

    const payload = {
      name: (name as string) || 'Untitled Digital',
      cat: 'digital',
      notes: (notes as string) ?? '',
      maxSS: (max_sheet_ss as number) ?? undefined,
      maxLS: (max_sheet_ls as number) ?? undefined,
      minSS: (min_sheet_ss as number) ?? undefined,
      minLS: (min_sheet_ls as number) ?? undefined,
      marginTop: (margin_top as number) ?? undefined,
      marginBottom: (margin_bottom as number) ?? undefined,
      marginLeft: (margin_left as number) ?? undefined,
      marginRight: (margin_right as number) ?? undefined,
      specs,
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
      title={machine ? `Επεξεργασία: ${machine.name}` : 'Νέα Ψηφιακή Μηχανή'}
      steps={DIGITAL_STEPS}
      data={data}
      onChange={handleChange}
      onSave={handleSave}
      onClose={onClose}
      renderStep={renderDigitalStep}
    />
  );
}
