'use client';

import { useState, useRef } from 'react';

export interface CompanyFormData {
  name: string;
  email: string;
  phone: string;
  afm: string;
  doy: string;
  address: string;
  city: string;
  zip: string;
  folderPath: string;
  contactName: string;
  contactEmail: string;
  elorusContactId?: string;
}

const EMPTY: CompanyFormData = { name: '', email: '', phone: '', afm: '', doy: '', address: '', city: '', zip: '', folderPath: '', contactName: '', contactEmail: '' };

interface Props {
  hasElorus?: boolean;
  onSave: (data: CompanyFormData) => Promise<void>;
  onCancel: () => void;
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  initialData?: Partial<CompanyFormData>;
  /** Hide the contact (name+email) section */
  hideContact?: boolean;
  /** Custom style for the wrapper */
  style?: React.CSSProperties;
}

export function NewCompanyForm({ hasElorus, onSave, onCancel, toast, initialData, hideContact, style }: Props) {
  const [tab, setTab] = useState<'afm' | 'manual'>(hasElorus ? 'afm' : 'manual');
  const [f, _setF] = useState<CompanyFormData>(() => ({ ...EMPTY, ...initialData }));
  const setF = (patch: Partial<CompanyFormData>) => _setF(prev => ({ ...prev, ...patch }));
  const [saving, setSaving] = useState(false);

  // AFM lookup
  const [afmSearch, setAfmSearch] = useState('');
  const [afmLoading, setAfmLoading] = useState(false);
  const [afmResult, setAfmResult] = useState<any>(null);
  const [afmError, setAfmError] = useState('');
  const afmRef = useRef<HTMLInputElement>(null);

  const inp: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '9px 12px', color: 'var(--text)',
    fontSize: '0.92rem', width: '100%', outline: 'none', fontFamily: 'inherit',
  };
  const lbl: React.CSSProperties = {
    fontSize: '0.68rem', fontWeight: 600, color: '#64748b',
    letterSpacing: '0.04em', textTransform: 'uppercase',
    display: 'block', marginBottom: 4,
  };

  async function lookupAfm() {
    const afm = afmSearch.replace(/\s/g, '');
    if (!/^\d{9}$/.test(afm)) { setAfmError('Το ΑΦΜ πρέπει να είναι 9 ψηφία'); return; }
    setAfmLoading(true); setAfmError(''); setAfmResult(null);
    try {
      const res = await fetch('/api/elorus/lookup-afm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ afm }),
      });
      const data = await res.json();
      if (!res.ok) { setAfmError(data.error || 'Σφάλμα αναζήτησης'); return; }
      setAfmResult(data);
      setF({
        name: data.onomasia || data.commer_title || '',
        afm,
        doy: data.doy_descr || '',
        address: data.postal_address || '',
        city: data.postal_area_description || '',
        zip: data.postal_zip_code || '',
        email: data.email || '',
        phone: '',
        contactName: '',
        contactEmail: '',
        elorusContactId: data.elorusContactId || undefined,
      });
    } catch (e) { setAfmError((e as Error).message); }
    finally { setAfmLoading(false); }
  }

  async function handleSave() {
    if (!f.name.trim()) { toast('Εισάγετε όνομα εταιρείας', 'error'); return; }
    setSaving(true);
    try {
      await onSave({
        ...f,
        elorusContactId: afmResult?.elorusContactId || undefined,
      });
    } catch (e) {
      toast('Σφάλμα: ' + (e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      padding: '14px 14px 12px', borderRadius: 10,
      background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)',
      ...style,
    }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 2, marginBottom: 14, width: 'fit-content' }}>
        {hasElorus && (
          <button onClick={() => setTab('afm')} style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            color: tab === 'afm' ? 'var(--teal)' : '#64748b',
            background: tab === 'afm' ? 'color-mix(in srgb, var(--teal) 15%, transparent)' : 'transparent',
            transition: 'all 0.2s',
          }}>
            <i className="fas fa-search" style={{ marginRight: 6, fontSize: '0.65rem' }} />Αναζήτηση ΑΦΜ
          </button>
        )}
        <button onClick={() => setTab('manual')} style={{
          padding: '6px 16px', borderRadius: 6, border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          color: tab === 'manual' ? 'var(--blue)' : '#64748b',
          background: tab === 'manual' ? 'color-mix(in srgb, var(--blue) 15%, transparent)' : 'transparent',
          transition: 'all 0.2s',
        }}>
          <i className="fas fa-pen" style={{ marginRight: 6, fontSize: '0.65rem' }} />Χειροκίνητα
        </button>
      </div>

      {/* AFM Lookup tab */}
      {tab === 'afm' && hasElorus && (<>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input
            ref={afmRef}
            value={afmSearch} onChange={e => setAfmSearch(e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="ΑΦΜ (9 ψηφία)"
            onKeyDown={e => { if (e.key === 'Enter') lookupAfm(); }}
            style={{ ...inp, flex: 1, fontFamily: "'DM Mono', monospace", fontSize: '1rem', letterSpacing: '0.1em' }}
          />
          <button onClick={lookupAfm} disabled={afmLoading || afmSearch.length !== 9} style={{
            padding: '0 16px', borderRadius: 8, border: 'none',
            background: afmSearch.length === 9 ? 'var(--teal)' : 'rgba(255,255,255,0.06)',
            color: afmSearch.length === 9 ? '#fff' : '#475569',
            fontSize: '0.82rem', fontWeight: 700, cursor: afmSearch.length === 9 ? 'pointer' : 'default',
            opacity: afmLoading ? 0.6 : 1, transition: 'all 0.2s', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>
            {afmLoading ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-search" style={{ marginRight: 6 }} />TaxisNet</>}
          </button>
        </div>
        {afmError && (
          <div style={{ padding: '8px 10px', borderRadius: 6, marginBottom: 10, background: 'color-mix(in srgb, #ef4444 10%, transparent)', border: '1px solid color-mix(in srgb, #ef4444 25%, transparent)', color: '#fca5a5', fontSize: '0.78rem' }}>
            <i className="fas fa-exclamation-triangle" style={{ marginRight: 6 }} />{afmError}
          </div>
        )}
        {afmResult && (
          <div style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 10, background: 'color-mix(in srgb, var(--teal) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--teal) 20%, transparent)' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--teal)', marginBottom: 4 }}>{afmResult.onomasia || afmResult.commer_title || '(κενή επωνυμία)'}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {afmResult.doy_descr && <span><i className="fas fa-building" style={{ marginRight: 4 }} />{afmResult.doy_descr}</span>}
              {afmResult.postal_address && <span><i className="fas fa-map-marker-alt" style={{ marginRight: 4 }} />{afmResult.postal_address}</span>}
              {afmResult.postal_area_description && <span>{afmResult.postal_area_description} {afmResult.postal_zip_code}</span>}
            </div>
            {afmResult.elorusContactId && (
              <div style={{ marginTop: 6, fontSize: '0.68rem', color: 'var(--teal)' }}>
                <i className="fas fa-check-circle" style={{ marginRight: 4 }} />Συνδέθηκε με Elorus
              </div>
            )}
          </div>
        )}
      </>)}

      {/* Form fields — shown after AFM result or in manual mode */}
      {(tab === 'manual' || afmResult) && (<>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label style={lbl}>Επωνυμία *</label>
            <input value={f.name} onChange={e => setF({ name: e.target.value })} placeholder="Επωνυμία εταιρείας" style={inp} />
          </div>
          <div>
            <label style={lbl}>ΑΦΜ</label>
            <input value={f.afm} onChange={e => setF({ afm: e.target.value.replace(/\D/g, '').slice(0, 9) })} placeholder="000000000" style={{ ...inp, fontFamily: "'DM Mono', monospace" }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label style={lbl}>Email</label>
            <input value={f.email} onChange={e => setF({ email: e.target.value })} placeholder="info@company.gr" style={inp} />
          </div>
          <div>
            <label style={lbl}>Τηλέφωνο</label>
            <input value={f.phone} onChange={e => setF({ phone: e.target.value })} placeholder="210..." style={inp} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label style={lbl}>ΔΟΥ</label>
            <input value={f.doy} onChange={e => setF({ doy: e.target.value })} placeholder="ΔΟΥ" style={inp} />
          </div>
          <div>
            <label style={lbl}>Διεύθυνση</label>
            <input value={f.address} onChange={e => setF({ address: e.target.value })} placeholder="Οδός αριθμός" style={inp} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label style={lbl}>Πόλη</label>
            <input value={f.city} onChange={e => setF({ city: e.target.value })} placeholder="Πόλη" style={inp} />
          </div>
          <div>
            <label style={lbl}>ΤΚ</label>
            <input value={f.zip} onChange={e => setF({ zip: e.target.value })} placeholder="00000" style={inp} />
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={lbl}><i className="fas fa-folder" style={{ marginRight: 4, fontSize: '0.6rem' }} />Φάκελος Πελάτη</label>
          <input
            value={f.folderPath}
            onChange={e => setF({ folderPath: e.target.value })}
            placeholder="π.χ. D:\Πελάτες\Παπαδόπουλος"
            style={{ ...inp, fontFamily: "'DM Mono', monospace", fontSize: '0.82rem' }}
          />
        </div>
        {/* Primary contact (optional) */}
        {!hideContact && (<>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, marginBottom: 6 }}>
            <div style={{ height: 1, flex: 1, background: 'var(--glass-border)' }} />
            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#475569', letterSpacing: '0.05em' }}>ΕΠΑΦΗ (ΠΡΟΑΙΡΕΤΙΚΑ)</span>
            <div style={{ height: 1, flex: 1, background: 'var(--glass-border)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={lbl}>Όνομα επαφής</label>
              <input value={f.contactName} onChange={e => setF({ contactName: e.target.value })} placeholder="Γιάννης Παπ." style={inp} />
            </div>
            <div>
              <label style={lbl}>Email επαφής</label>
              <input value={f.contactEmail} onChange={e => setF({ contactEmail: e.target.value })} placeholder="contact@..." style={inp} />
            </div>
          </div>
        </>)}

        {/* Save / Cancel */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onCancel} style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
          }}>Ακύρωση</button>
          <button onClick={handleSave} disabled={saving || !f.name.trim()} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            opacity: saving || !f.name.trim() ? 0.5 : 1,
          }}>
            {saving ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />Δημιουργία...</> : <><i className="fas fa-check" style={{ marginRight: 6 }} />Δημιουργία</>}
          </button>
        </div>
      </>)}
    </div>
  );
}
