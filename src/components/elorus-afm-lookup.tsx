'use client';

import { useState } from 'react';

export interface ElorusLookupResult {
  name: string;
  afm: string;
  doy: string;
  address: string;
  city: string;
  zip: string;
  email: string;
  elorusContactId?: string;
  activities?: string;
}

interface Props {
  /** Current AFM value from the form (pre-fills the lookup input) */
  currentAfm?: string;
  /** Current field values — used to show what will change */
  currentValues?: Partial<Record<keyof ElorusLookupResult, string>>;
  /** Called when user clicks "Εφαρμο��ή" with the looked-up data */
  onApply: (data: ElorusLookupResult) => void;
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function ElorusAfmLookup({ currentAfm, currentValues, onApply, toast }: Props) {
  const [open, setOpen] = useState(false);
  const [afm, setAfm] = useState(currentAfm || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  async function lookup() {
    const clean = afm.replace(/\s/g, '');
    if (!/^\d{9}$/.test(clean)) { setError('Το ΑΦΜ πρέπει να είναι 9 ψηφία'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/elorus/lookup-afm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ afm: clean }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Σφάλμα αναζήτησης'); return; }
      setResult(data);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  function apply() {
    if (!result) return;
    onApply({
      name: result.onomasia || result.commer_title || '',
      afm: afm.replace(/\s/g, ''),
      doy: result.doy_descr || '',
      address: result.postal_address || '',
      city: result.postal_area_description || '',
      zip: result.postal_zip_code || '',
      email: result.email || '',
      elorusContactId: result.elorusContactId || undefined,
      activities: result.firm_act_descr || undefined,
    });
    toast('Τα στοιχεία ενημερώθηκαν από TaxisNet');
    setOpen(false);
    setResult(null);
  }

  // Fields that will be filled / changed
  const changes: { label: string; key: keyof ElorusLookupResult; from: string; to: string }[] = [];
  if (result) {
    const pairs: [string, keyof ElorusLookupResult, string][] = [
      ['ΑΦΜ', 'afm', afm.replace(/\s/g, '')],
      ['ΔΟΥ', 'doy', result.doy_descr || ''],
      ['Διεύθυνση', 'address', result.postal_address || ''],
      ['Πόλη', 'city', result.postal_area_description || ''],
      ['ΤΚ', 'zip', result.postal_zip_code || ''],
    ];
    for (const [label, key, to] of pairs) {
      const from = currentValues?.[key] || '';
      if (to && to !== from) {
        changes.push({ label, key, from, to });
      }
    }
  }

  const inp: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '9px 12px', color: 'var(--text)',
    fontSize: '0.92rem', width: '100%', outline: 'none', fontFamily: 'inherit',
  };

  const hasAfm = !!(currentAfm && currentAfm.trim());

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: hasAfm ? '6px 14px' : '8px 14px', borderRadius: 8,
          border: `1px solid color-mix(in srgb, var(--teal) ${hasAfm ? '15%' : '30%'}, transparent)`,
          background: hasAfm ? 'color-mix(in srgb, var(--teal) 3%, transparent)' : 'color-mix(in srgb, var(--teal) 6%, transparent)',
          color: hasAfm ? 'color-mix(in srgb, var(--teal) 70%, #64748b)' : 'var(--teal)',
          fontSize: hasAfm ? '0.72rem' : '0.78rem', fontWeight: hasAfm ? 500 : 600,
          cursor: 'pointer', fontFamily: 'inherit', width: '100%',
          justifyContent: 'center', transition: 'all 0.2s',
        }}
      >
        {hasAfm ? (
          <>
            <i className="fas fa-check-circle" style={{ fontSize: '0.65rem', color: 'var(--teal)' }} />
            Φορολογικά ενημερωμένα
            <span style={{ opacity: 0.5, marginLeft: 4, fontSize: '0.65rem' }}>· Ανανέωση</span>
          </>
        ) : (
          <>
            <i className="fas fa-search" style={{ fontSize: '0.65rem' }} />
            Αναζήτηση ΑΦΜ στο TaxisNet
          </>
        )}
      </button>
    );
  }

  return (
    <div style={{
      padding: '14px', borderRadius: 10,
      background: 'color-mix(in srgb, var(--teal) 4%, transparent)',
      border: '1px solid color-mix(in srgb, var(--teal) 20%, transparent)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          <i className="fas fa-search" style={{ marginRight: 6, fontSize: '0.6rem' }} />Αναζήτηση ΑΦΜ
        </span>
        <button onClick={() => { setOpen(false); setResult(null); setError(''); }} style={{
          border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.75rem',
        }}><i className="fas fa-times" /></button>
      </div>

      {/* AFM input + lookup button */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input
          value={afm} onChange={e => setAfm(e.target.value.replace(/\D/g, '').slice(0, 9))}
          placeholder="ΑΦΜ (9 ψηφία)"
          onKeyDown={e => { if (e.key === 'Enter') lookup(); }}
          style={{ ...inp, flex: 1, fontFamily: "'DM Mono', monospace", fontSize: '1rem', letterSpacing: '0.1em' }}
        />
        <button onClick={lookup} disabled={loading || afm.length !== 9} style={{
          padding: '0 16px', borderRadius: 8, border: 'none',
          background: afm.length === 9 ? 'var(--teal)' : 'rgba(255,255,255,0.06)',
          color: afm.length === 9 ? '#fff' : '#475569',
          fontSize: '0.82rem', fontWeight: 700, cursor: afm.length === 9 ? 'pointer' : 'default',
          opacity: loading ? 0.6 : 1, transition: 'all 0.2s', fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}>
          {loading ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-search" style={{ marginRight: 6 }} />TaxisNet</>}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '8px 10px', borderRadius: 6, marginBottom: 10, background: 'color-mix(in srgb, #ef4444 10%, transparent)', border: '1px solid color-mix(in srgb, #ef4444 25%, transparent)', color: '#fca5a5', fontSize: '0.78rem' }}>
          <i className="fas fa-exclamation-triangle" style={{ marginRight: 6 }} />{error}
        </div>
      )}

      {/* Result + changes preview */}
      {result && (
        <>
          <div style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 10, background: 'color-mix(in srgb, var(--teal) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--teal) 20%, transparent)' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--teal)', marginBottom: 4 }}>
              {result.onomasia || result.commer_title || '(κενή επωνυμία)'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {result.doy_descr && <span><i className="fas fa-building" style={{ marginRight: 4 }} />{result.doy_descr}</span>}
              {result.postal_address && <span><i className="fas fa-map-marker-alt" style={{ marginRight: 4 }} />{result.postal_address}</span>}
              {result.postal_area_description && <span>{result.postal_area_description} {result.postal_zip_code}</span>}
            </div>
            {result.elorusContactId && (
              <div style={{ marginTop: 6, fontSize: '0.68rem', color: 'var(--teal)' }}>
                <i className="fas fa-check-circle" style={{ marginRight: 4 }} />Βρέθηκε στο Elorus
              </div>
            )}
          </div>

          {/* Changes preview */}
          {changes.length > 0 ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Αλλαγές που θα εφαρμοστούν
              </div>
              {changes.map(ch => (
                <div key={ch.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: '0.78rem' }}>
                  <span style={{ color: '#64748b', width: 72, flexShrink: 0, fontWeight: 600 }}>{ch.label}</span>
                  {ch.from ? (
                    <>
                      <span style={{ color: '#f87171', textDecoration: 'line-through' }}>{ch.from}</span>
                      <i className="fas fa-arrow-right" style={{ fontSize: '0.5rem', color: '#475569' }} />
                    </>
                  ) : (
                    <span style={{ color: '#475569', fontStyle: 'italic' }}>(κενό)</span>
                  )}
                  {ch.from && <span style={{ fontSize: '0.5rem', color: '#475569', margin: '0 2px' }} />}
                  <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{ch.to}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '8px 0', fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic' }}>
              Δεν υπάρχουν νέα στοιχεία προς ενημέρωση
            </div>
          )}

          {/* Apply button */}
          <button onClick={apply} disabled={changes.length === 0} style={{
            width: '100%', padding: '9px 0', borderRadius: 8, border: 'none',
            background: changes.length > 0 ? 'var(--teal)' : 'rgba(255,255,255,0.06)',
            color: changes.length > 0 ? '#fff' : '#475569',
            fontSize: '0.82rem', fontWeight: 700, cursor: changes.length > 0 ? 'pointer' : 'default',
            fontFamily: 'inherit', transition: 'all 0.2s',
          }}>
            <i className="fas fa-check" style={{ marginRight: 6 }} />
            {changes.length > 0 ? `Εφαρμογή ${changes.length} αλλαγών` : 'Χωρίς αλλαγές'}
          </button>
        </>
      )}
    </div>
  );
}
