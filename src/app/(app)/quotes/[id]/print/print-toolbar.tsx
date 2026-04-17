'use client';

export function PrintToolbar({ quoteNumber }: { quoteNumber: string }) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: '#1e293b', padding: '10px 20px',
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
    }} className="no-print">
      <button
        onClick={() => history.back()}
        style={{
          padding: '8px 20px', borderRadius: 6, border: '1px solid #475569',
          background: 'transparent', color: '#94a3b8', fontSize: 13,
          fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        ← Πίσω
      </button>
      <button
        onClick={() => window.print()}
        style={{
          padding: '8px 20px', borderRadius: 6, border: 'none',
          background: '#f58220', color: '#fff', fontSize: 13,
          fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        Εκτύπωση / PDF
      </button>
      <span style={{ color: '#cbd5e1', fontSize: 13, marginLeft: 'auto' }}>
        Προσφορά {quoteNumber}
      </span>
    </div>
  );
}
