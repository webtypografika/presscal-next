'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import type { WizardStep } from './digital-steps';

interface Props {
  steps: WizardStep[];
  data: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
  onSave: () => void;
  onClose: () => void;
  renderStep: (stepId: string, data: Record<string, unknown>, onChange: (field: string, value: unknown) => void) => React.ReactNode;
  title: string;
}

export function WizardShell({ steps, data, onChange, onSave, onClose, renderStep, title }: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === steps.length - 1;

  const canAdvance = step.canAdvance ? step.canAdvance(data) : true;

  function next() {
    if (isLast) {
      onSave();
    } else if (canAdvance) {
      // Skip extra_colors step if stations < 5
      let nextIdx = stepIdx + 1;
      if (steps[nextIdx]?.id === 'extra_colors' && (data.color_stations as number) < 5) {
        nextIdx++;
      }
      setStepIdx(Math.min(nextIdx, steps.length - 1));
    }
  }

  function back() {
    let prevIdx = stepIdx - 1;
    // Skip extra_colors going back too
    if (steps[prevIdx]?.id === 'extra_colors' && (data.color_stations as number) < 5) {
      prevIdx--;
    }
    setStepIdx(Math.max(prevIdx, 0));
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm">
      <div
        className="flex w-[800px] max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-[var(--glass-border)] shadow-[0_32px_80px_rgba(0,0,0,0.5)]"
        style={{ background: 'rgb(20, 30, 55)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Βήμα {stepIdx + 1} / {steps.length} — {step.title}
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 px-6 pt-3">
          {steps.map((s, i) => (
            <div
              key={s.id}
              className="h-1 flex-1 rounded-full transition-all"
              style={{
                background: i < stepIdx ? 'var(--success)' : i === stepIdx ? 'var(--accent)' : 'var(--border)',
              }}
            />
          ))}
        </div>

        {/* Step title */}
        <div className="px-6 pt-4 pb-2">
          <h3 className="text-xl font-bold">{step.title}</h3>
          {step.subtitle && <p className="text-sm text-[var(--text-dim)]">{step.subtitle}</p>}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 custom-scrollbar">
          {renderStep(step.id, data, onChange)}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4">
          <button
            onClick={isFirst ? onClose : back}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <ChevronLeft className="h-4 w-4" />
            {isFirst ? 'Ακύρωση' : 'Πίσω'}
          </button>

          <button
            onClick={next}
            disabled={!canAdvance}
            className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_16px_rgba(245,130,32,0.3)] transition-all hover:shadow-[0_6px_24px_rgba(245,130,32,0.4)] disabled:opacity-40"
          >
            {isLast ? (
              <>
                <Check className="h-4 w-4" /> Αποθήκευση
              </>
            ) : (
              <>
                Επόμενο <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
