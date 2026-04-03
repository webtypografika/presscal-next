'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { exportImpositionPDF } from '@/lib/calc/pdf-export';
import type { ExportOptions } from '@/lib/calc/pdf-export';

interface PlateSupplier {
  name: string;
  email: string;
}

interface Props {
  platesFront: number;
  platesBack: number;
  machineMaxLS: number;
  machineMaxSS: number;
  machineName: string;
  jobDescription: string;
  exportOptions: ExportOptions;
  onClose: () => void;
  onSent: () => void;
}

export default function PlateOrderModal({
  platesFront, platesBack, machineMaxLS, machineMaxSS,
  machineName, jobDescription, exportOptions, onClose, onSent,
}: Props) {
  const [suppliers, setSuppliers] = useState<PlateSupplier[]>([]);
  const [supplierName, setSupplierName] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [attachPdf, setAttachPdf] = useState(true);
  const [delivery, setDelivery] = useState<'pickup' | 'deliver'>('pickup');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const plateSize = `${Math.round(machineMaxSS)}×${Math.round(machineMaxLS)}mm`;
  const totalPlates = platesFront + platesBack;

  // Load plate suppliers from consumables
  useEffect(() => {
    fetch('/api/consumables?conType=plate').then(r => r.ok ? r.json() : []).then((items: any[]) => {
      const unique = new Map<string, string>();
      for (const c of items) {
        if (c.supplier && c.supplierEmail) unique.set(c.supplier, c.supplierEmail);
      }
      const list = Array.from(unique, ([name, email]) => ({ name, email }));
      setSuppliers(list);
      if (list.length === 1) { setSupplierName(list[0].name); setSupplierEmail(list[0].email); }
    }).catch(() => {});
  }, []);

  async function send() {
    if (!supplierEmail) { setError('Εισάγετε email τσιγκογράφου'); return; }
    setSending(true); setError('');
    try {
      let pdfBase64: string | undefined;
      let pdfFileName: string | undefined;

      if (attachPdf) {
        const pdfBytes = await exportImpositionPDF(exportOptions);
        pdfBase64 = Buffer.from(pdfBytes as Uint8Array).toString('base64');
        pdfFileName = (exportOptions.sourceFileName || 'imposition').replace(/\.pdf$/i, '') + '_plates.pdf';
      }

      const colors = ['Cyan', 'Magenta', 'Yellow', 'Black'];
      const items = [];
      if (platesFront > 0) {
        for (let i = 0; i < platesFront; i++) {
          items.push({ name: `Front ${colors[i] || `Spot ${i + 1}`}`, plateSize, qty: 1, color: colors[i] || `PMS ${i + 1}` });
        }
      }
      if (platesBack > 0) {
        for (let i = 0; i < platesBack; i++) {
          items.push({ name: `Back ${colors[i] || `Spot ${i + 1}`}`, plateSize, qty: 1, color: colors[i] || `PMS ${i + 1}` });
        }
      }

      const res = await fetch('/api/plate-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderType: 'platemaker_service',
          supplierName: supplierName || supplierEmail,
          supplierEmail,
          items,
          jobDescription,
          delivery,
          notes,
          pdfBase64,
          pdfFileName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Σφάλμα αποστολής');
      onSent();
    } catch (e) { setError((e as Error).message); }
    finally { setSending(false); }
  }

  const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: '0.88rem', width: '100%', outline: 'none', fontFamily: 'inherit' };
  const lbl: React.CSSProperties = { fontSize: '0.68rem', fontWeight: 600, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 4 };

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      background: 'rgba(0,0,0,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 460, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'color-mix(in srgb, var(--amber) 12%, transparent)',
            border: '2px solid color-mix(in srgb, var(--amber) 30%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--amber)', fontSize: '1rem',
          }}>
            <i className="fas fa-layer-group" />
          </div>
          <div>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Παραγγελία Τσίγκων</h2>
            <p style={{ fontSize: '0.72rem', color: '#64748b', margin: 0 }}>{machineName} · {plateSize}</p>
          </div>
        </div>

        {/* Plate summary */}
        <div style={{
          display: 'flex', gap: 10, marginBottom: 16, padding: '12px 14px', borderRadius: 10,
          background: 'color-mix(in srgb, var(--amber) 6%, transparent)',
          border: '1px solid color-mix(in srgb, var(--amber) 18%, transparent)',
        }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: 2 }}>ΜΠΡΟΣΤΑ</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--amber)' }}>{platesFront}</div>
          </div>
          {platesBack > 0 && (<>
            <div style={{ width: 1, background: 'var(--glass-border)' }} />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: 2 }}>ΠΙΣΩ</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--amber)' }}>{platesBack}</div>
            </div>
          </>)}
          <div style={{ width: 1, background: 'var(--glass-border)' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: 2 }}>ΣΥΝΟΛΟ</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text)' }}>{totalPlates}</div>
          </div>
        </div>

        {/* Supplier */}
        <label style={lbl}>Τσιγκογράφος</label>
        {suppliers.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {suppliers.map(s => (
              <button key={s.name} onClick={() => { setSupplierName(s.name); setSupplierEmail(s.email); }} style={{
                padding: '6px 14px', borderRadius: 7, border: '1.5px solid',
                borderColor: supplierName === s.name ? 'var(--amber)' : 'var(--glass-border)',
                background: supplierName === s.name ? 'color-mix(in srgb, var(--amber) 10%, transparent)' : 'transparent',
                color: supplierName === s.name ? 'var(--amber)' : '#94a3b8',
                fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}>
                {s.name}
              </button>
            ))}
          </div>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="Επωνυμία" style={inp} />
          <input value={supplierEmail} onChange={e => setSupplierEmail(e.target.value)} placeholder="email@platemaker.gr" style={inp} />
        </div>

        {/* Delivery */}
        <label style={lbl}>Παράδοση</label>
        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 2, marginBottom: 14, width: 'fit-content' }}>
          {([['pickup', 'Παραλαβή'], ['deliver', 'Αποστολή']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setDelivery(v)} style={{
              padding: '6px 16px', borderRadius: 6, border: 'none', fontSize: '0.78rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              color: delivery === v ? 'var(--accent)' : '#64748b',
              background: delivery === v ? 'rgba(245,130,32,0.12)' : 'transparent',
              transition: 'all 0.2s',
            }}>{l}</button>
          ))}
        </div>

        {/* Attach PDF toggle */}
        <button onClick={() => setAttachPdf(!attachPdf)} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 8,
          border: `1.5px solid ${attachPdf ? 'var(--teal)' : 'var(--glass-border)'}`,
          background: attachPdf ? 'color-mix(in srgb, var(--teal) 8%, transparent)' : 'transparent',
          color: attachPdf ? 'var(--teal)' : '#64748b',
          fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          marginBottom: 14, transition: 'all 0.2s',
        }}>
          <i className={`fas ${attachPdf ? 'fa-check-circle' : 'fa-circle'}`} style={{ fontSize: '0.7rem' }} />
          Επισύναψη imposition PDF
        </button>

        {/* Notes */}
        <label style={lbl}>Σημειώσεις</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Προαιρετικές σημειώσεις..." rows={2}
          style={{ ...inp, resize: 'vertical', marginBottom: 16 }} />

        {/* Error */}
        {error && (
          <div style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 12, background: 'color-mix(in srgb, #ef4444 10%, transparent)', border: '1px solid color-mix(in srgb, #ef4444 25%, transparent)', color: '#fca5a5', fontSize: '0.78rem' }}>
            <i className="fas fa-exclamation-triangle" style={{ marginRight: 6 }} />{error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{
            padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-muted)', fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit',
          }}>Ακύρωση</button>
          <button onClick={send} disabled={sending || !supplierEmail} style={{
            padding: '9px 22px', borderRadius: 8, border: 'none',
            background: 'var(--amber)', color: '#fff', fontSize: '0.88rem', fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            opacity: sending || !supplierEmail ? 0.5 : 1,
            boxShadow: '0 4px 16px rgba(245,158,11,0.3)',
          }}>
            {sending ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />Αποστολή...</> : <><i className="fas fa-paper-plane" style={{ marginRight: 6 }} />Αποστολή</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
