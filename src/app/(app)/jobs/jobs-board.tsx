'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { Quote, Customer } from '@/generated/prisma/client';
import { updateJobStage, updateJobDetails, saveJobStages } from './actions';

type JobQuote = Quote & { customer: Customer | null };

interface StageConfig { id: string; label: string; icon: string; color: string }

const DEFAULT_STAGES: StageConfig[] = [
  { id: 'files', label: 'Αρχεία', icon: 'fa-folder-open', color: '#60a5fa' },
  { id: 'printing', label: 'Εκτύπωση', icon: 'fa-print', color: '#f58220' },
  { id: 'cutting', label: 'Κοπή', icon: 'fa-cut', color: '#a78bfa' },
  { id: 'finishing', label: 'Φινίρισμα', icon: 'fa-magic', color: '#f472b6' },
  { id: 'delivery', label: 'Παράδοση', icon: 'fa-truck', color: '#4ade80' },
];

type StageId = string;

const PRIORITY_COLORS: Record<string, string> = {
  rush: 'var(--danger)',
  urgent: '#fb923c',
  normal: 'var(--text-muted)',
};

// ─── HELPERS ───
function formatDate(d: Date | string | null | undefined) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' });
}

function isOverdue(d: Date | string | null | undefined) {
  if (!d) return false;
  return new Date(d) < new Date(new Date().toDateString());
}

function stageIndex(stage: string | null, stages: StageConfig[]): number {
  return stages.findIndex(s => s.id === stage);
}

function jobCustomerName(j: JobQuote) {
  const emailSender = typeof j.description === 'string' && j.description.startsWith('Email από:') ? j.description.replace('Email από:', '').trim() : null;
  return (j as any).company?.name ?? (j as any).contact?.name ?? j.customer?.name ?? (j as any).contact?.email ?? (j as any).company?.email ?? j.customer?.email ?? emailSender ?? j.title ?? '—';
}

// ─── TOAST ───
interface ToastData { message: string; type: 'success' | 'error' | 'info'; id: number; }
let tId = 0;

// ─── JOB CARD ───
function JobCard({ job, onDragStart, onDetail }: { job: JobQuote; onDragStart: (e: React.DragEvent, id: string) => void; onDetail: (j: JobQuote) => void }) {
  const raw = job.items;
  const items: any[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? (() => { try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; } })() : [];
  const itemCount = items.length;
  const desc = items.map((i: any) => i.name).filter(Boolean).slice(0, 2).join(', ');
  const overdue = isOverdue(job.deadline);
  const priority = job.jobPriority || 'normal';

  const name = jobCustomerName(job);
  const title = job.title || desc || '';
  const hasInvoice = !!(job as any).elorusInvoiceUrl;
  const hasVoucher = !!(job as any).courierVoucherId;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, job.id)}
      onClick={() => onDetail(job)}
      className="quote-card-hover"
      style={{
        padding: '8px 10px', borderRadius: 8,
        border: `1px solid ${overdue ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
        background: overdue ? 'rgba(239,68,68,0.04)' : 'transparent',
        cursor: 'grab', transition: 'all 0.15s',
        borderLeft: `3px solid ${PRIORITY_COLORS[priority] || 'var(--text-muted)'}`,
        marginBottom: 5,
      }}
      onMouseEnter={e => { if (!overdue) e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
      onMouseLeave={e => { if (!overdue) e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Row 1: quote number + badges + date/actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)', opacity: 0.8 }}>{job.number}</span>
        {priority === 'rush' && <i className="fas fa-bolt" style={{ color: 'var(--danger)', fontSize: '0.6rem' }} />}
        {priority === 'urgent' && <i className="fas fa-exclamation-triangle" style={{ color: '#fb923c', fontSize: '0.55rem' }} />}
        {hasInvoice && (
          <span style={{ fontSize: '0.55rem', padding: '1px 5px', borderRadius: 4, background: 'rgba(74,222,128,0.15)', color: '#4ade80', fontWeight: 700 }}>
            <i className="fas fa-file-invoice-dollar" style={{ fontSize: '0.5rem', marginRight: 2 }} />ΤΙΜ
          </span>
        )}
        {hasVoucher && (
          <span style={{ fontSize: '0.55rem', padding: '1px 5px', borderRadius: 4, background: 'rgba(96,165,250,0.15)', color: '#60a5fa', fontWeight: 700 }}>
            <i className="fas fa-truck" style={{ fontSize: '0.5rem', marginRight: 2 }} />VCH
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span className="card-date" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          {job.deadline ? formatDate(job.deadline) : ''}
        </span>
        <div className="card-actions" style={{ display: 'flex', gap: 2 }}>
          {job.jobFolderPath && (
            <a
              href={`presscal-fh://open-folder?path=${encodeURIComponent(job.jobFolderPath)}&quoteId=${job.id}`}
              onClick={e => e.stopPropagation()}
              title={job.jobFolderPath}
              style={{
                width: 24, height: 20, borderRadius: 4,
                border: 'none', background: 'transparent',
                color: 'var(--teal)', cursor: 'pointer',
                fontSize: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(100,116,139,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <i className="fas fa-folder-open" />
            </a>
          )}
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (!confirm('Ολοκλήρωση εργασίας;\n\nΘα μετακινηθεί στο "_01 Archive/" μέσω PressKit.')) return;
              const result = await updateJobStage(job.id, 'completed');
              if (result?.originalFolderPath) {
                window.location.href = `presscal-fh://archive-quote?folderPath=${encodeURIComponent(result.originalFolderPath)}`;
              }
              window.location.reload();
            }}
            style={{
              width: 24, height: 20, borderRadius: 4,
              border: 'none', background: 'transparent',
              color: '#64748b', cursor: 'pointer',
              fontSize: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#4ade80'; e.currentTarget.style.background = 'rgba(74,222,128,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'transparent'; }}
            title="Ολοκλήρωση"
          >
            <i className="fas fa-check" />
          </button>
        </div>
      </div>
      {/* Row 2: customer */}
      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
      {/* Row 3: title/description + amount */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        {title ? (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
            {title}{itemCount > 2 ? ` +${itemCount - 2}` : ''}
          </div>
        ) : <span style={{ flex: 1 }} />}
        <span style={{ fontSize: '0.85rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {job.grandTotal > 0 ? new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(job.grandTotal) : ''}
        </span>
      </div>
    </div>
  );
}

// ─── DETAIL MODAL ───
function JobDetailModal({ job, stages: STAGES, onClose, onUpdate }: { job: JobQuote; stages: StageConfig[]; onClose: () => void; onUpdate: () => void }) {
  const router = useRouter();
  const [deadline, setDeadline] = useState(job.deadline ? new Date(job.deadline).toISOString().split('T')[0] : '');
  const [priority, setPriority] = useState(job.jobPriority || 'normal');
  const [notes, setNotes] = useState(job.jobNotes || '');
  const [saving, setSaving] = useState(false);

  const rawItems = job.items;
  const items: any[] = Array.isArray(rawItems) ? rawItems : typeof rawItems === 'string' ? (() => { try { const p = JSON.parse(rawItems); return Array.isArray(p) ? p : []; } catch { return []; } })() : [];
  const currentStage = stageIndex(job.jobStage, STAGES);

  async function handleSave() {
    setSaving(true);
    await updateJobDetails(job.id, { deadline: deadline || null, jobPriority: priority, jobNotes: notes });
    setSaving(false);
    onUpdate();
  }

  async function handleStageClick(stageId: string) {
    await updateJobStage(job.id, stageId);
    onUpdate();
  }

  async function handleComplete() {
    if (!confirm('Ολοκλήρωση εργασίας;\n\nΘα μετακινηθεί στο "_01 Archive/" μέσω PressKit.')) return;
    const result = await updateJobStage(job.id, 'completed');
    if (result?.originalFolderPath) {
      window.location.href = `presscal-fh://archive-quote?folderPath=${encodeURIComponent(result.originalFolderPath)}`;
    }
    onUpdate();
    onClose();
  }

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 720, maxHeight: '85vh', overflow: 'auto', background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--glass-border)', padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }} className="custom-scrollbar">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--accent)' }}>{job.number}</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, flex: 1 }}>{jobCustomerName(job)}</span>
          <button onClick={() => router.push(`/quotes/${job.id}`)} style={{
            border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.04)', borderRadius: 8,
            padding: '6px 12px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer',
          }}>
            <i className="fas fa-file-invoice" style={{ marginRight: 4 }} /> Προσφορά
          </button>
          {job.jobFolderPath && (
            <a href={`presscal-fh://open-folder?path=${encodeURIComponent(job.jobFolderPath)}&quoteId=${job.id}`} style={{
              border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.04)', borderRadius: 8,
              padding: '6px 12px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--teal)', cursor: 'pointer',
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <i className="fas fa-folder-open" /> Φάκελος
            </a>
          )}
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>&times;</button>
        </div>

        {/* Stage progress + Complete button */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, alignItems: 'flex-start' }}>
          {STAGES.map((s, i) => {
            const isDone = i < currentStage;
            const isActive = i === currentStage;
            return (
              <button key={s.id} onClick={() => handleStageClick(s.id)} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 0',
              }}>
                <div style={{
                  width: '100%', height: 6, borderRadius: 3,
                  background: isDone ? 'var(--success)' : isActive ? s.color : 'rgba(255,255,255,0.06)',
                  transition: 'background 0.3s',
                }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className={`fas ${s.icon}`} style={{
                    fontSize: '0.6rem',
                    color: isDone ? 'var(--success)' : isActive ? s.color : 'var(--text-muted)',
                  }} />
                  <span style={{
                    fontSize: '0.62rem', fontWeight: isActive ? 700 : 500,
                    color: isDone ? 'var(--success)' : isActive ? s.color : 'var(--text-muted)',
                  }}>{s.label}</span>
                </div>
              </button>
            );
          })}
          <button onClick={handleComplete} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
            border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 0', flexShrink: 0,
          }}>
            <div style={{
              width: 28, height: 6, borderRadius: 3,
              background: 'color-mix(in srgb, var(--success) 20%, transparent)',
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="fas fa-check-double" style={{ fontSize: '0.6rem', color: 'var(--success)' }} />
              <span style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--success)' }}>Done</span>
            </div>
          </button>
        </div>

        {/* Items with technical specs */}
        {items.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.05em' }}>ΠΡΟΙΟΝΤΑ</div>
            {items.map((item: any, i: number) => {
              const cd = item.calcData;
              return (
                <div key={i} style={{
                  padding: '12px 14px', marginBottom: 8, borderRadius: 10,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
                }}>
                  {/* Name + qty */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: cd ? 10 : 0 }}>
                    <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 700 }}>{item.name || '—'}</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)' }}>×{item.qty}</span>
                  </div>

                  {cd && (() => {
                    // Compute paper cutting guide
                    const stockW = cd.paperStockW;
                    const stockH = cd.paperStockH;
                    const mW = cd.machineSheetW;
                    const mH = cd.machineSheetH;
                    let cutGuide: string | null = null;
                    if (stockW && stockH && mW && mH) {
                      // Try both orientations
                      const a1 = Math.floor(stockW / mW);
                      const b1 = Math.floor(stockH / mH);
                      const a2 = Math.floor(stockW / mH);
                      const b2 = Math.floor(stockH / mW);
                      const fit1 = a1 * b1;
                      const fit2 = a2 * b2;
                      if (fit1 >= fit2 && fit1 > 0) {
                        cutGuide = `${stockW}→${a1}×${mW}mm · ${stockH}→${b1}×${mH}mm (${fit1} κοψ.)`;
                      } else if (fit2 > 0) {
                        cutGuide = `${stockW}→${a2}×${mH}mm · ${stockH}→${b2}×${mW}mm (${fit2} κοψ.)`;
                      }
                    }
                    // Imposition mode labels
                    const modeLabels: Record<string, string> = {
                      nup: 'N-Up', cutstack: 'Cut & Stack', booklet: 'Booklet',
                      perfectbind: 'Perfect Bind', workturn: 'Work & Turn',
                      gangrun: 'Gang Run', stepmulti: 'Step & Repeat',
                    };
                    const printMethodLabels: Record<string, string> = {
                      sheetwise: 'Sheetwise', turn: 'Work & Turn', tumble: 'Work & Tumble',
                    };
                    // Total plates
                    const frontPlates = (cd.offsetFrontCmyk || 0) + (cd.offsetFrontPms || 0);
                    const backPlates = cd.sides === 2 ? (cd.offsetBackCmyk || 0) + (cd.offsetBackPms || 0) : 0;
                    const totalPlates = frontPlates + backPlates;

                    const InfoRow = ({ label, value, color: c }: { label: string; value: React.ReactNode; color?: string }) => (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: c || 'var(--text)' }}>{value}</span>
                      </div>
                    );

                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {/* Εκτύπωση */}
                        <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.12)' }}>
                          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.06em', marginBottom: 8, textTransform: 'uppercase' }}>Εκτύπωση</div>
                          {cd.machineName && <InfoRow label="Μηχανή" value={cd.machineName} color="var(--accent)" />}
                          <InfoRow label="Όψεις" value={cd.sides === 2 ? '2 (Δύο όψεις)' : '1 (Μονή όψη)'} />
                          {(cd.offsetFrontCmyk != null || cd.colorMode) && (
                            <InfoRow
                              label="Χρώματα"
                              value={cd.colorMode === 'bw' ? 'B/W' : cd.colorMode === 'color' && cd.offsetFrontCmyk != null
                                ? `${cd.offsetFrontCmyk}+${cd.offsetFrontPms || 0} / ${cd.offsetBackCmyk || 0}+${cd.offsetBackPms || 0}`
                                : cd.colorMode || 'color'
                              }
                              color="var(--blue)"
                            />
                          )}
                          {totalPlates > 0 && <InfoRow label="Τσίγκοι" value={`${totalPlates} (${frontPlates}F${backPlates > 0 ? ` + ${backPlates}B` : ''})`} />}
                          {cd.printMethod && <InfoRow label="Μέθοδος" value={printMethodLabels[cd.printMethod] || cd.printMethod} />}
                          {cd.perfecting && <InfoRow label="Perfecting" value="Ναι" color="var(--blue)" />}
                          {cd.offsetOilVarnish && <InfoRow label="Βερνίκι" value="Oil Varnish" />}
                          {cd.impositionMode && (
                            <InfoRow label="Τρόπος" value={modeLabels[cd.impositionMode] || cd.impositionMode} color="var(--violet)" />
                          )}
                          {cd.machineSheets > 0 && (
                            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(59,130,246,0.1)' }}>
                              <InfoRow label="Τυπ. φύλλα" value={cd.machineSheets} color="var(--blue)" />
                            </div>
                          )}
                        </div>

                        {/* Χαρτί & Μοντάζ */}
                        <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.12)' }}>
                          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.06em', marginBottom: 8, textTransform: 'uppercase' }}>Χαρτί & Μοντάζ</div>
                          {cd.paperName && (
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <i className="fas fa-scroll" style={{ fontSize: '0.5rem', color: 'var(--teal)' }} />{cd.paperName}
                            </div>
                          )}
                          {cd.width && cd.height && <InfoRow label="Τελικό" value={`${cd.width}×${cd.height}mm`} />}
                          {mW && mH && <InfoRow label="Φύλλο μοντάζ" value={`${mW}×${mH}mm`} />}
                          {cd.ups && <InfoRow label="Ups" value={`${cd.ups}-up${cd.cols && cd.rows ? ` (${cd.cols}×${cd.rows})` : ''}`} color="var(--violet)" />}
                          {stockW && stockH && <InfoRow label="Χαρτί αποθήκης" value={`${stockW}×${stockH}mm`} />}
                          {cd.sheets > 0 && (
                            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(20,184,166,0.1)' }}>
                              <InfoRow label="Φύλλα αποθήκης" value={cd.sheets} color="var(--teal)" />
                            </div>
                          )}
                          {cutGuide && (
                            <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: 6, background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.15)' }}>
                              <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#facc15', letterSpacing: '0.04em', marginBottom: 3 }}>
                                <i className="fas fa-cut" style={{ fontSize: '0.5rem', marginRight: 3 }} />ΟΔΗΓΟΣ ΚΟΠΗΣ
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text)', fontWeight: 500 }}>{cutGuide}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {item.linkedFile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '5px 8px', borderRadius: 6, background: 'rgba(245,130,32,0.06)' }}>
                      <i className="fas fa-paperclip" style={{ fontSize: '0.55rem', color: '#f58220' }} />
                      <span style={{ fontSize: '0.72rem', color: '#f58220', fontWeight: 600 }}>{item.linkedFile.name}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Προθεσμία</label>
            <input
              type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.04)',
                color: 'var(--text)', fontSize: '0.82rem', fontFamily: 'inherit',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Προτεραιότητα</label>
            <select
              value={priority} onChange={e => setPriority(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.04)',
                color: 'var(--text)', fontSize: '0.82rem', fontFamily: 'inherit',
              }}
            >
              <option value="normal">Κανονική</option>
              <option value="urgent">Επείγον</option>
              <option value="rush">Rush</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Σημειώσεις Εργασίας</label>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            rows={3}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8,
              border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.04)',
              color: 'var(--text)', fontSize: '0.82rem', fontFamily: 'inherit', resize: 'vertical',
            }}
          />
        </div>

        {/* Totals */}
        <div style={{ display: 'flex', gap: 20, padding: '12px 0', borderTop: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)' }}>Σύνολο</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>
              {new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(job.grandTotal)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)' }}>Κόστος</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-dim)' }}>
              {new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(job.totalCost)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)' }}>Κέρδος</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--success)' }}>
              {new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(job.totalProfit)}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {(job as any).elorusInvoiceUrl ? (
            <a href={(job as any).elorusInvoiceUrl} target="_blank" rel="noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '7px 14px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600,
              background: 'color-mix(in srgb, var(--success) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)',
              color: 'var(--success)', textDecoration: 'none',
            }}>
              <i className="fas fa-check" style={{ fontSize: '0.55rem' }} /> Τιμολόγιο
            </a>
          ) : (
            <button onClick={() => router.push(`/quotes/${job.id}`)} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '7px 14px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600,
              background: 'color-mix(in srgb, #818cf8 12%, transparent)',
              border: '1px solid color-mix(in srgb, #818cf8 25%, transparent)',
              color: '#a5b4fc', cursor: 'pointer',
            }}>
              <i className="fas fa-file-invoice-dollar" style={{ fontSize: '0.55rem' }} /> Τιμολόγηση
            </button>
          )}
          {(job as any).courierVoucherId ? (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '7px 14px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600,
              background: 'color-mix(in srgb, #10b981 12%, transparent)',
              border: '1px solid color-mix(in srgb, #10b981 25%, transparent)',
              color: '#10b981',
            }}>
              <i className="fas fa-truck" style={{ fontSize: '0.55rem' }} /> {(job as any).courierVoucherId}
            </span>
          ) : (
            <button onClick={() => router.push(`/quotes/${job.id}`)} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '7px 14px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600,
              background: 'color-mix(in srgb, #10b981 12%, transparent)',
              border: '1px solid color-mix(in srgb, #10b981 25%, transparent)',
              color: '#10b981', cursor: 'pointer',
            }}>
              <i className="fas fa-truck" style={{ fontSize: '0.55rem' }} /> Voucher
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={handleSave} disabled={saving} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: '#fff', fontSize: '0.82rem', fontWeight: 700,
            cursor: 'pointer', opacity: saving ? 0.6 : 1,
          }}>
            {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── MAIN BOARD ───
interface Props { jobs: JobQuote[]; customers: Customer[]; stages?: StageConfig[]; }

export function JobsBoard({ jobs: initialJobs, stages: initialStages }: Props) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [STAGES, setSTAGES] = useState<StageConfig[]>(initialStages?.length ? initialStages : DEFAULT_STAGES);

  const [detailJob, setDetailJob] = useState<JobQuote | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [editingStages, setEditingStages] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [dragStageIdx, setDragStageIdx] = useState<number | null>(null);

  function toast(message: string, type: ToastData['type'] = 'success') {
    const id = ++tId;
    setToasts(p => [...p, { message, type, id }]);
  }

  // ─── DRAG & DROP ───
  function handleDragStart(e: React.DragEvent, id: string) {
    dragIdRef.current = id;
    setDragId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  }

  async function handleDrop(e: React.DragEvent, stageId: string) {
    e.preventDefault();
    const droppedId = dragIdRef.current || e.dataTransfer.getData('text/plain');
    if (!droppedId) return;
    const job = jobs.find(j => j.id === droppedId);
    if (!job) return;

    // Optimistic update
    setJobs(prev => prev.map(j => j.id === droppedId ? { ...j, jobStage: stageId, jobStageUpdatedAt: new Date() } as any : j));
    dragIdRef.current = null;
    setDragId(null);

    try {
      await updateJobStage(droppedId, stageId);
      const stageLabel = STAGES.find(s => s.id === stageId)?.label || stageId;
      toast(`${job.number} → ${stageLabel}`);
    } catch {
      // Revert
      setJobs(prev => prev.map(j => j.id === droppedId ? job : j));
      toast('Σφάλμα ενημέρωσης', 'error');
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleRefresh() {
    router.refresh();
    // Also refresh local state after a tick
    setTimeout(() => window.location.reload(), 300);
  }

  // Jobs without a stage (newly approved, not yet assigned)
  const unassigned = jobs.filter(j => !j.jobStage || !STAGES.find(s => s.id === j.jobStage));
  const completed = jobs.filter(j => j.status === 'completed');

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800, flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fas fa-tasks" style={{ color: 'var(--accent)', fontSize: '1.1rem' }} />
          Εργασίες
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '2px 10px', borderRadius: 12 }}>
            {jobs.length}
          </span>
        </h1>

        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 2 }}>
          <button onClick={() => setView('board')} style={{
            padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: '0.72rem', fontWeight: 600,
            background: view === 'board' ? 'var(--accent)' : 'transparent',
            color: view === 'board' ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer',
          }}>
            <i className="fas fa-columns" style={{ marginRight: 4 }} /> Board
          </button>
          <button onClick={() => setView('list')} style={{
            padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: '0.72rem', fontWeight: 600,
            background: view === 'list' ? 'var(--accent)' : 'transparent',
            color: view === 'list' ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer',
          }}>
            <i className="fas fa-list" style={{ marginRight: 4 }} /> List
          </button>
        </div>

        <button onClick={() => setShowCompleted(v => !v)} style={{
            padding: '6px 12px', borderRadius: 8, border: '1px solid var(--glass-border)',
            background: showCompleted ? 'rgba(74,222,128,0.1)' : 'transparent',
            color: showCompleted ? '#4ade80' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
          }}>
          <i className="fas fa-archive" style={{ marginRight: 4 }} />
          Ολοκληρωμένες
          {completed.length > 0 && <span style={{ marginLeft: 4, fontSize: '0.6rem', opacity: 0.7 }}>({completed.length})</span>}
        </button>

        <button onClick={() => setEditingStages(!editingStages)} title="Ρύθμιση σταδίων"
          style={{
            padding: '6px 12px', borderRadius: 8, border: '1px solid var(--glass-border)',
            background: editingStages ? 'rgba(255,255,255,0.06)' : 'transparent',
            color: editingStages ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem',
          }}>
          <i className="fas fa-cog" />
        </button>
      </div>

      {/* Stage editor */}
      {editingStages && (
        <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: 10 }}>ΡΥΘΜΙΣΗ ΣΤΑΔΙΩΝ</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {STAGES.map((stage, idx) => (
              <div
                key={stage.id}
                draggable
                onDragStart={() => setDragStageIdx(idx)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (dragStageIdx === null || dragStageIdx === idx) return;
                  const arr = [...STAGES];
                  const [moved] = arr.splice(dragStageIdx, 1);
                  arr.splice(idx, 0, moved);
                  setSTAGES(arr);
                  setDragStageIdx(null);
                  saveJobStages(arr);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
                  cursor: 'grab', userSelect: 'none',
                }}
              >
                <i className="fas fa-grip-vertical" style={{ color: '#374151', fontSize: '0.6rem' }} />
                <i className={`fas ${stage.icon}`} style={{ color: stage.color, fontSize: '0.7rem' }} />
                <input
                  value={stage.label}
                  onChange={e => {
                    const arr = [...STAGES];
                    arr[idx] = { ...arr[idx], label: e.target.value };
                    setSTAGES(arr);
                  }}
                  onBlur={() => saveJobStages(STAGES)}
                  style={{
                    background: 'transparent', border: 'none', outline: 'none',
                    color: stage.color, fontSize: '0.78rem', fontWeight: 700,
                    fontFamily: 'inherit', width: 90,
                  }}
                />
                <input
                  type="color" value={stage.color}
                  onChange={e => {
                    const arr = [...STAGES];
                    arr[idx] = { ...arr[idx], color: e.target.value };
                    setSTAGES(arr);
                    saveJobStages(arr.map((s, i) => i === idx ? { ...s, color: e.target.value } : s));
                  }}
                  style={{ width: 20, height: 20, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                  title="Χρώμα"
                />
                {STAGES.length > 2 && (
                  <button onClick={() => {
                    const arr = STAGES.filter((_, i) => i !== idx);
                    setSTAGES(arr);
                    saveJobStages(arr);
                  }}
                    style={{ border: 'none', background: 'transparent', color: '#374151', cursor: 'pointer', fontSize: '0.6rem', padding: 2 }}>
                    <i className="fas fa-times" />
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => {
              const id = `stage_${Date.now()}`;
              const arr = [...STAGES, { id, label: 'Νέο', icon: 'fa-circle', color: '#94a3b8' }];
              setSTAGES(arr);
              saveJobStages(arr);
            }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8,
                border: '1px dashed var(--glass-border)', background: 'transparent',
                color: 'var(--teal)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
              }}>
              <i className="fas fa-plus" style={{ fontSize: '0.55rem' }} />Προσθήκη
            </button>
          </div>
          <div style={{ fontSize: '0.65rem', color: '#475569' }}>
            <i className="fas fa-grip-vertical" style={{ marginRight: 4 }} />Σύρετε για αναδιάταξη · κλικ στο όνομα για μετονομασία · κλικ στο χρώμα για αλλαγή
          </div>
        </div>
      )}

      {/* Unassigned bar */}
      {unassigned.length > 0 && (
        <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 10, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#60a5fa', marginBottom: 8 }}>
            <i className="fas fa-inbox" style={{ marginRight: 6 }} /> Νέες εγκεκριμένες — σύρετε σε στάδιο
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {unassigned.map(j => (
              <div key={j.id} draggable onDragStart={(e) => handleDragStart(e, j.id)} style={{
                padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.03)', cursor: 'grab', fontSize: '0.78rem', fontWeight: 600,
              }}>
                <span style={{ color: 'var(--accent)', marginRight: 6 }}>{j.number}</span>
                {jobCustomerName(j)}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'board' ? (
        /* ═══ BOARD VIEW ═══ */
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STAGES.length}, minmax(0, 1fr))`, gap: 10, minHeight: 400 }}>
          {STAGES.map(stage => {
            const stageJobs = jobs.filter(j => j.jobStage === stage.id && j.status !== 'completed');
            return (
              <div
                key={stage.id}
                onDrop={e => handleDrop(e, stage.id)}
                onDragOver={handleDragOver}
                style={{
                  borderRadius: 12, padding: 10,
                  background: dragId ? 'rgba(255,255,255,0.02)' : 'transparent',
                  border: '1px solid var(--border)',
                  transition: 'background 0.2s',
                  display: 'flex', flexDirection: 'column',
                  minWidth: 0, overflow: 'hidden',
                }}
              >
                {/* Column header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '0 4px' }}>
                  <i className={`fas ${stage.icon}`} style={{ color: stage.color, fontSize: '0.72rem' }} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: stage.color }}>{stage.label}</span>
                  <span style={{
                    fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)',
                    background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 8, marginLeft: 'auto',
                  }}>{stageJobs.length}</span>
                </div>

                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  {stageJobs.map(j => (
                    <JobCard key={j.id} job={j} onDragStart={handleDragStart} onDetail={setDetailJob} />
                  ))}
                  {stageJobs.length === 0 && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.72rem', opacity: 0.5 }}>
                      Σύρετε εδώ
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ═══ LIST VIEW ═══ */
        <div className="panel" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>Αριθμός</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>Πελάτης</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>Στάδιο</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>Προθεσμία</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>Σύνολο</th>
              </tr>
            </thead>
            <tbody>
              {jobs.filter(j => j.status !== 'completed').map(j => {
                const stage = STAGES.find(s => s.id === j.jobStage);
                const overdue = isOverdue(j.deadline);
                return (
                  <tr key={j.id} onClick={() => setDetailJob(j)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--accent)' }}>{j.number}</td>
                    <td style={{ padding: '10px 12px' }}>{jobCustomerName(j)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {stage ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 600, color: stage.color }}>
                          <i className={`fas ${stage.icon}`} style={{ fontSize: '0.6rem' }} /> {stage.label}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Αρχικό</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', color: overdue ? 'var(--danger)' : 'var(--text-muted)', fontWeight: overdue ? 700 : 400 }}>
                      {formatDate(j.deadline) || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(j.grandTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Completed jobs */}
      {showCompleted && completed.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <i className="fas fa-check-circle" style={{ color: '#4ade80', fontSize: '0.85rem' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4ade80' }}>Ολοκληρωμένες</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 8 }}>{completed.length}</span>
          </div>
          <div className="panel" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>Αριθμός</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>Πελάτης</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>Ολοκλήρωση</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>Σύνολο</th>
                </tr>
              </thead>
              <tbody>
                {completed.map(j => (
                  <tr key={j.id} onClick={() => setDetailJob(j)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', opacity: 0.7, transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#4ade80' }}>{j.number}</td>
                    <td style={{ padding: '10px 12px' }}>{jobCustomerName(j)}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{formatDate(j.completedAt) || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(j.grandTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailJob && (
        <JobDetailModal
          job={detailJob}
          stages={STAGES}
          onClose={() => setDetailJob(null)}
          onUpdate={() => {
            setDetailJob(null);
            handleRefresh();
          }}
        />
      )}

      {/* Toasts */}
      {toasts.length > 0 && createPortal(
        <div style={{ position: 'fixed', bottom: 80, right: 20, zIndex: 300, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 20px', borderRadius: 10,
              background: 'rgb(20,30,55)', border: `1px solid ${t.type === 'error' ? 'var(--danger)' : 'var(--success)'}`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)', animation: 'fadeIn 0.3s ease', minWidth: 220,
            }}>
              <i className={`fas ${t.type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}`} style={{ color: t.type === 'error' ? 'var(--danger)' : 'var(--success)', fontSize: '0.92rem' }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{t.message}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
