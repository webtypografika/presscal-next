'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Machine } from '@/generated/prisma/client';
import { deleteMachine } from './actions';
import { DigitalWizard } from './wizard/digital-wizard';
import { MachineServicePanel } from './wizard/service-panel';

const CAT_META: Record<string, { label: string; icon: string; color: string }> = {
  digital: { label: 'Ψηφιακό', icon: 'fa-print', color: 'var(--blue)' },
  offset:  { label: 'Offset',  icon: 'fa-industry', color: 'var(--violet)' },
  plotter: { label: 'Plotter', icon: 'fa-pen-ruler', color: 'var(--teal)' },
};

interface Props { machines: Machine[] }

export function MachinesList({ machines }: Props) {
  const [showWizard, setShowWizard] = useState<'digital' | 'offset' | 'plotter' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const filtered = filter === 'all' ? machines : machines.filter(m => m.cat === filter);
  const counts: Record<string, number> = {
    all: machines.length,
    digital: machines.filter(m => m.cat === 'digital').length,
    offset: machines.filter(m => m.cat === 'offset').length,
    plotter: machines.filter(m => m.cat === 'plotter').length,
  };

  const editMachine = editId ? machines.find(m => m.id === editId) : null;

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 46, height: 46, borderRadius: '50%',
            border: '2px solid color-mix(in srgb, var(--blue) 35%, transparent)',
            background: 'color-mix(in srgb, var(--blue) 10%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', color: 'var(--blue)',
          }}>
            <i className="fas fa-print" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Μηχανήματα</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{machines.length} μηχανές</p>
          </div>
        </div>
        <button
          onClick={() => { setEditId(null); setShowCatPicker(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--accent)', color: '#fff',
            padding: '10px 20px', borderRadius: 10, border: 'none',
            fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(245,130,32,0.3)',
            transition: 'box-shadow 0.2s',
          }}
        >
          <i className="fas fa-plus" /> Νέο Μηχάνημα
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3, marginBottom: 20, width: 'fit-content' }}>
        {(['all', 'digital', 'offset', 'plotter'] as const).map(cat => {
          const isActive = filter === cat;
          const label = cat === 'all' ? 'Όλα' : CAT_META[cat].label;
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              style={{
                padding: '7px 16px', borderRadius: 8, border: 'none',
                fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                background: isActive ? 'rgba(245,130,32,0.12)' : 'transparent',
                transition: 'all 0.2s ease',
              }}
            >
              {label} <span style={{ marginLeft: 4, fontSize: '0.7rem', opacity: 0.6 }}>{counts[cat]}</span>
            </button>
          );
        })}
      </div>

      {/* Machine cards */}
      {filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <i className="fas fa-print" style={{ fontSize: '2.5rem', color: 'var(--text-muted)', opacity: 0.2 }} />
          <p style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Δεν υπάρχουν μηχανές</p>
          <button
            onClick={() => { setEditId(null); setShowCatPicker(true); }}
            style={{ marginTop: 16, fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            + Προσθέστε την πρώτη σας μηχανή
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {filtered.map(machine => {
            const meta = CAT_META[machine.cat] ?? CAT_META.digital;
            const specs = (machine.specs ?? {}) as Record<string, string | number | boolean | null>;

            return (
              <div
                key={machine.id}
                className="card"
                style={{
                  '--card-accent': meta.color,
                  cursor: 'pointer',
                } as React.CSSProperties}
                onClick={() => { setEditId(machine.id); setShowWizard(machine.cat as 'digital' | 'offset' | 'plotter'); }}
              >
                <div className="card-glow" />
                {/* Orb icon */}
                <div style={{
                  width: 46, height: 46, borderRadius: '50%',
                  border: `2px solid color-mix(in srgb, ${meta.color} 35%, transparent)`,
                  background: `color-mix(in srgb, ${meta.color} 10%, transparent)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.1rem', color: meta.color, marginBottom: 16,
                  transition: 'all 400ms var(--spring)',
                }}>
                  <i className={`fas ${meta.icon}`} />
                </div>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 4 }}>{machine.name}</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {meta.label}
                  {machine.maxSS && machine.maxLS ? ` · ${machine.maxSS}×${machine.maxLS}mm` : ''}
                </p>
                {specs.cost_mode && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 4 }}>
                    {specs.cost_mode === 'simple_in' ? 'Simple (In)' : specs.cost_mode === 'simple_out' ? 'Simple (Out)' : 'Precision'}
                    {specs.click_a4_color ? ` · A4 color €${specs.click_a4_color}` : ''}
                  </p>
                )}

                {/* Actions */}
                <div className="card-actions" style={{ position: 'absolute', right: 12, top: 12, display: 'flex', gap: 4, opacity: 0, transition: 'opacity 0.2s' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditId(machine.id); setShowWizard(machine.cat as 'digital' | 'offset' | 'plotter'); }}
                    title="Ρυθμίσεις"
                    style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', transition: 'color 0.2s' }}
                  >
                    <i className="fas fa-cog" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setServiceId(machine.id); }}
                    title="Συντήρηση & Τεχνικοί"
                    style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', transition: 'color 0.2s' }}
                  >
                    <i className="fas fa-wrench" />
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm(`Διαγραφή ${machine.name};`)) {
                        await deleteMachine(machine.id);
                      }
                    }}
                    title="Διαγραφή"
                    style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', transition: 'color 0.2s' }}
                  >
                    <i className="fas fa-trash" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Category picker modal */}
      {showCatPicker && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          onClick={() => setShowCatPicker(false)}
        >
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, width: 500, borderRadius: 'var(--radius)', border: '1px solid var(--glass-border)', background: 'rgb(20, 30, 55)', padding: 32, boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ gridColumn: '1 / -1', fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>Τύπος Μηχανής</h2>
            {(['digital', 'offset', 'plotter'] as const).map(cat => {
              const m = CAT_META[cat];
              return (
                <button
                  key={cat}
                  onClick={() => { setShowCatPicker(false); setShowWizard(cat); }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                    borderRadius: 'var(--radius-sm)', border: '2px solid var(--glass-border)',
                    background: 'transparent', padding: 24, cursor: 'pointer',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                >
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    border: `2px solid color-mix(in srgb, ${m.color} 35%, transparent)`,
                    background: `color-mix(in srgb, ${m.color} 10%, transparent)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.3rem', color: m.color,
                  }}>
                    <i className={`fas ${m.icon}`} />
                  </div>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}

      {/* Digital Wizard */}
      {showWizard === 'digital' && (
        <DigitalWizard
          machine={editMachine ?? undefined}
          onClose={() => { setShowWizard(null); setEditId(null); }}
        />
      )}

      {/* Offset / Plotter — TODO */}
      {showWizard === 'offset' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
          <div className="panel" style={{ padding: 32, textAlign: 'center' }}>
            <p style={{ fontSize: '1.1rem', fontWeight: 700 }}>Offset Wizard — Coming Soon</p>
            <button onClick={() => setShowWizard(null)} style={{ marginTop: 16, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Κλείσιμο</button>
          </div>
        </div>
      )}
      {showWizard === 'plotter' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
          <div className="panel" style={{ padding: 32, textAlign: 'center' }}>
            <p style={{ fontSize: '1.1rem', fontWeight: 700 }}>Plotter Setup — Coming Soon</p>
            <button onClick={() => setShowWizard(null)} style={{ marginTop: 16, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Κλείσιμο</button>
          </div>
        </div>
      )}

      {/* Service Panel */}
      {serviceId && (
        <MachineServicePanel
          machine={machines.find(m => m.id === serviceId)!}
          onClose={() => setServiceId(null)}
        />
      )}

      <style>{`
        .card { position: relative; overflow: hidden; }
        .card::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent);
          transform: translateX(-100%);
          transition: transform 0.6s ease;
          pointer-events: none;
        }
        .card:hover::before { transform: translateX(130%); }
        .card::after {
          content: '';
          position: absolute; top: 0; left: 24px; right: 24px; height: 2px;
          background: var(--card-accent, var(--accent));
          opacity: 0; transition: opacity 0.3s ease;
          pointer-events: none;
        }
        .card:hover::after { opacity: 1; }
        .card:hover {
          box-shadow: 0 8px 40px rgba(0,0,0,0.3);
          border-color: var(--border-hover);
          background: var(--bg-elevated);
        }
        .card-glow {
          position: absolute; inset: -1px; border-radius: var(--radius);
          background: radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--card-accent, var(--accent)) 12%, transparent), transparent 70%);
          opacity: 0; transition: opacity 0.4s ease; pointer-events: none;
        }
        .card:hover .card-glow { opacity: 1; }
        .card:hover .card-actions { opacity: 1 !important; }
        .card-actions button:hover { color: var(--accent) !important; background: rgba(255,255,255,0.05) !important; }
      `}</style>
    </>
  );
}
