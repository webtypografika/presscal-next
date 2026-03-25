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
  const visibleSteps = steps.filter(s => !(s.id === 'extra_colors' && !data.has_special_colors));

  const canAdvance = step.canAdvance ? step.canAdvance(data) : true;

  function next() {
    if (isLast) {
      onSave();
    } else if (canAdvance) {
      // Skip extra_colors step if no special colors
      let nextIdx = stepIdx + 1;
      if (steps[nextIdx]?.id === 'extra_colors' && !data.has_special_colors) {
        nextIdx++;
      }
      setStepIdx(Math.min(nextIdx, steps.length - 1));
    }
  }

  function back() {
    let prevIdx = stepIdx - 1;
    // Skip extra_colors going back too
    if (steps[prevIdx]?.id === 'extra_colors' && !data.has_special_colors) {
      prevIdx--;
    }
    setStepIdx(Math.max(prevIdx, 0));
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm">
      <div
        className="flex w-[800px] h-[85vh] flex-col overflow-hidden rounded-2xl border border-[var(--glass-border)] shadow-[0_32px_80px_rgba(0,0,0,0.5)]"
        style={{ background: 'rgb(20, 30, 55)' }}
      >
        {/* Header: title + close */}
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          <h2 className="text-sm font-semibold text-[var(--text-muted)]">{title}</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 px-6">
          {visibleSteps.map((s) => {
            const realIdx = steps.indexOf(s);
            return (
              <div
                key={s.id}
                className="h-1 flex-1 rounded-full transition-all"
                style={{
                  background: realIdx < stepIdx ? 'var(--success)' : realIdx === stepIdx ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                }}
              />
            );
          })}
        </div>

        {/* Step info */}
        <div className="px-6 pt-4 pb-4 border-b border-[var(--border)]">
          <p className="text-[0.7rem] font-bold text-[var(--accent)] uppercase tracking-wider">Βήμα {visibleSteps.indexOf(step) + 1} / {visibleSteps.length}</p>
          <h3 className="text-xl font-bold mt-1">{step.title}</h3>
          {step.subtitle && <p className="text-sm text-[var(--text-dim)] mt-0.5">{step.subtitle}</p>}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
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
