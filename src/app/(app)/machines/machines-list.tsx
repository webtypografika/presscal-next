'use client';

import { useState } from 'react';
import { Printer, Factory, PenTool, Plus, Trash2, Edit3, ChevronRight } from 'lucide-react';
import type { Machine } from '@/generated/prisma/client';
import { deleteMachine } from './actions';
import { MachineForm } from './machine-form';

const CAT_CONFIG = {
  digital: { label: 'Ψηφιακό', icon: Printer, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  offset: { label: 'Offset', icon: Factory, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/30' },
  plotter: { label: 'Plotter', icon: PenTool, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/30' },
} as const;

type CatKey = keyof typeof CAT_CONFIG;

interface Props {
  machines: Machine[];
}

export function MachinesList({ machines }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CatKey | 'all'>('all');

  const filtered = filter === 'all' ? machines : machines.filter((m) => m.cat === filter);
  const counts = {
    all: machines.length,
    digital: machines.filter((m) => m.cat === 'digital').length,
    offset: machines.filter((m) => m.cat === 'offset').length,
    plotter: machines.filter((m) => m.cat === 'plotter').length,
  };

  const editMachine = editId ? machines.find((m) => m.id === editId) : null;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-blue-500/30 bg-blue-500/10">
            <Printer className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Μηχανήματα</h1>
            <p className="text-sm text-muted">{machines.length} μηχανές</p>
          </div>
        </div>
        <button
          onClick={() => { setEditId(null); setShowForm(true); }}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white shadow-[0_4px_16px_rgba(245,130,32,0.3)] transition-all hover:shadow-[0_6px_24px_rgba(245,130,32,0.4)]"
        >
          <Plus className="h-4 w-4" /> Νέο Μηχάνημα
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'digital', 'offset', 'plotter'] as const).map((cat) => {
          const isActive = filter === cat;
          const label = cat === 'all' ? 'Όλα' : CAT_CONFIG[cat].label;
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                isActive
                  ? 'bg-[rgba(245,130,32,0.12)] text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[rgba(245,130,32,0.06)]'
              }`}
            >
              {label} <span className="ml-1 text-xs opacity-60">{counts[cat]}</span>
            </button>
          );
        })}
      </div>

      {/* Machine cards */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-surface)] p-12 text-center">
          <Printer className="mx-auto h-12 w-12 text-[var(--text-muted)] opacity-30" />
          <p className="mt-4 text-[var(--text-muted)]">Δεν υπάρχουν μηχανές</p>
          <button
            onClick={() => { setEditId(null); setShowForm(true); }}
            className="mt-4 text-sm font-semibold text-[var(--accent)]"
          >
            + Προσθέστε την πρώτη σας μηχανή
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((machine) => {
            const conf = CAT_CONFIG[(machine.cat as CatKey)] ?? CAT_CONFIG.digital;
            const Icon = conf.icon;
            const specs = (machine.specs ?? {}) as Record<string, string | number | boolean | null>;

            return (
              <div
                key={machine.id}
                className="group relative cursor-pointer rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-surface)] p-5 transition-all hover:border-[var(--border-hover)] hover:bg-[var(--bg-elevated)] hover:shadow-[0_8px_40px_rgba(0,0,0,0.3)]"
                onClick={() => { setEditId(machine.id); setShowForm(true); }}
              >
                {/* Shine sweep */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
                  <div className="h-full w-full translate-x-[-100%] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent transition-transform duration-600 group-hover:translate-x-[130%]" />
                </div>

                <div className="flex items-start gap-4">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 ${conf.border} ${conf.bg}`}>
                    <Icon className={`h-5 w-5 ${conf.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[0.95rem] font-bold">{machine.name}</h3>
                    <p className="text-xs text-[var(--text-muted)]">
                      {conf.label}
                      {machine.maxSS && machine.maxLS ? ` · ${machine.maxSS}×${machine.maxLS}mm` : ''}
                    </p>
                    {specs.cost_mode && (
                      <p className="mt-1 text-xs text-[var(--text-dim)]">
                        {specs.cost_mode === 'simple_in' ? 'Simple (In)' : specs.cost_mode === 'simple_out' ? 'Simple (Out)' : 'Precision'}
                        {specs.click_a4_color ? ` · A4 color €${specs.click_a4_color}` : ''}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                </div>

                {/* Actions */}
                <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditId(machine.id); setShowForm(true); }}
                    className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--accent)]"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm(`Διαγραφή ${machine.name};`)) {
                        await deleteMachine(machine.id);
                      }
                    }}
                    className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <MachineForm
          machine={editMachine ?? undefined}
          onClose={() => { setShowForm(false); setEditId(null); }}
        />
      )}
    </>
  );
}
