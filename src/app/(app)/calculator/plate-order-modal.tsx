'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { exportImpositionPDF, buildExportFilename } from '@/lib/calc/pdf-export';
import type { ExportOptions } from '@/lib/calc/pdf-export';

const FIREBASE_SEND = 'https://us-central1-presscal.cloudfunctions.net/claudeMachineSpecs/sendQuote';

interface PlateSupplier { name: string; email: string }

interface Props {
  platesFront: number;
  platesBack: number;
  paperW: number;
  paperH: number;
  machineName: string;
  jobDescription: string;
  exportOptions: ExportOptions;
  onClose: () => void;
  onSent: () => void;
}

export default function PlateOrderModal({
  platesFront, platesBack, paperW, paperH,
  machineName, jobDescription, exportOptions, onClose, onSent,
}: Props) {
  const [suppliers, setSuppliers] = useState<PlateSupplier[]>([]);
  const [supplierName, setSupplierName] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [delivery, setDelivery] = useState<'pickup' | 'deliver'>('pickup');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState('');
  const [error, setError] = useState('');

  const plateSize = `${Math.round(paperW)}×${Math.round(paperH)}mm`;
  const totalPlates = platesFront + platesBack;
  const pdfFileName = buildExportFilename(exportOptions, '_plates');

  useEffect(() => {
    fetch('/api/consumables?conType=plate').then(r => r.ok ? r.json() : []).then((items: any[]) => {
      const unique = new Map<string, string>();
      for (const c of items) if (c.supplier && c.supplierEmail) unique.set(c.supplier, c.supplierEmail);
      const list = Array.from(unique, ([name, email]) => ({ name, email }));
      setSuppliers(list);
      if (list.length === 1) { setSupplierName(list[0].name); setSupplierEmail(list[0].email); }
    }).catch(() => {});
  }, []);

  function buildEmailHtml() {
    const deliveryText = delivery === 'pickup' ? 'Θα παραλάβουμε εμείς.' : 'Παρακαλούμε αποστείλατε.';
    const backText = platesBack > 0 ? ` + ${platesBack} πίσω` : '';

    return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:500px">
  <h2 style="color:#1e293b;font-size:18px;margin:0 0 16px">Εκτύπωση Τσίγκων</h2>
  <div style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin-bottom:16px">
    <div style="font-size:28px;font-weight:800;color:#f58220;margin-bottom:4px">${totalPlates} τσίγκοι</div>
    <div style="font-size:14px;color:#475569">${platesFront} μπροστά${backText} · ${plateSize}</div>
  </div>
  <p style="font-size:14px;color:#1e293b;font-weight:600;margin:0 0 8px">${deliveryText}</p>
  ${notes ? `<p style="font-size:13px;color:#78350f;background:#fffbeb;padding:10px 14px;border-radius:6px;border:1px solid #fde68a;margin:8px 0">${notes}</p>` : ''}
  <p style="font-size:12px;color:#94a3b8;margin-top:16px">Το αρχείο μοντάζ είναι συνημμένο.</p>
</div>`;
  }

  async function handleSend() {
    if (!supplierEmail) { setError('Εισάγετε email τσιγκογράφου'); return; }
    setSending(true); setError(''); setSendStatus('Δημιουργία PDF...');

    try {
      // Step 1: Generate PDF client-side
      const pdfBytes = await exportImpositionPDF(exportOptions);
      const bytes = new Uint8Array(pdfBytes as unknown as ArrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const pdfBase64 = btoa(binary);

      // Step 2: Send via Firebase Cloud Function (no Vercel limit)
      setSendStatus('Αποστολή email...');
      const subject = `Τσίγκοι ${totalPlates}x ${plateSize} — ${pdfFileName}`;
      const res = await fetch(FIREBASE_SEND, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: supplierEmail,
          subject,
          quoteHtml: buildEmailHtml(),
          attachments: [{
            filename: pdfFileName,
            content: pdfBase64,
            contentType: 'application/pdf',
          }],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Email αποτυχία: ${text.slice(0, 150)}`);
      }

      // Step 3: Record order in our DB (small payload, no PDF)
      setSendStatus('Καταγραφή...');
      const items = [
        { name: 'Μπροστά', plateSize, qty: platesFront },
        ...(platesBack > 0 ? [{ name: 'Πίσω', plateSize, qty: platesBack }] : []),
      ];

      await fetch('/api/plate-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderType: 'platemaker_service',
          supplierName: supplierName || supplierEmail,
          supplierEmail,
          items,
          jobDescription,
          notes,
          pdfFileName,
        }),
      }).catch(() => {});

      onSent();
      onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setSending(false); setSendStatus(''); }
  }

  const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: '0.88rem', width: '100%', outline: 'none', fontFamily: 'inherit' };
  const lbl: React.CSSProperties = { fontSize: '0.68rem', fontWeight: 600, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 4 };

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 440, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
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
        {suppliers.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {suppliers.map(s => (
              <button key={s.name} onClick={() => { setSupplierName(s.name); setSupplierEmail(s.email); }} style={{
                padding: '6px 14px', borderRadius: 7, border: '1.5px solid',
                borderColor: supplierName === s.name ? 'var(--amber)' : 'var(--glass-border)',
                background: supplierName === s.name ? 'color-mix(in srgb, var(--amber) 10%, transparent)' : 'transparent',
                color: supplierName === s.name ? 'var(--amber)' : '#94a3b8',
                fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}>{s.name}</button>
            ))}
          </div>
        )}
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
            }}>{l}</button>
          ))}
        </div>

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

        {/* Sending status */}
        {sending && sendStatus && (
          <div style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 12, background: 'color-mix(in srgb, var(--blue) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--blue) 20%, transparent)', color: 'var(--blue)', fontSize: '0.78rem' }}>
            <i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />{sendStatus}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={sending} style={{
            padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-muted)', fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit',
          }}>Ακύρωση</button>
          <button onClick={handleSend} disabled={sending || !supplierEmail} style={{
            padding: '9px 22px', borderRadius: 8, border: 'none',
            background: 'var(--amber)', color: '#fff', fontSize: '0.88rem', fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            opacity: sending || !supplierEmail ? 0.5 : 1,
            boxShadow: '0 4px 16px rgba(245,158,11,0.3)',
          }}>
            <i className="fas fa-paper-plane" style={{ marginRight: 6 }} />
            {sending ? 'Αποστολή...' : 'Αποστολή'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
