'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UnreadItem } from './page';

export function UnreadCard({ items }: { items: UnreadItem[] }) {
  const [visible, setVisible] = useState(items);
  const router = useRouter();

  async function dismiss(gmailId: string) {
    setVisible(prev => prev.filter(m => m.id !== gmailId));
    await fetch('/api/email/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gmailId }),
    });
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fas fa-envelope" style={{ color: 'var(--accent)', fontSize: '0.95rem' }} /> Αδιάβαστα
          {visible.length > 0 && <span style={{ background: 'var(--danger)', color: '#fff', fontSize: '0.58rem', fontWeight: 700, padding: '1px 7px', borderRadius: 10 }}>{visible.length}</span>}
        </h2>
        <button style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Όλα →</button>
      </div>

      {visible.length === 0 && (
        <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Κανένα αδιάβαστο</div>
      )}
      {visible.map(m => (
        <div key={m.id} onClick={() => router.push(`/email?msg=${m.id}`)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)', marginBottom: 6, cursor: 'pointer', transition: 'background 0.2s', borderLeft: '3px solid var(--accent)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginTop: 6, flexShrink: 0 }} />
          <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: 'color-mix(in srgb, var(--blue) 15%, transparent)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.58rem', fontWeight: 700 }}>{m.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{m.sender}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.time}</span>
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 500, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.subject}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.preview}</div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); dismiss(m.id); }}
            title="Απόκρυψη"
            style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid transparent', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', marginTop: 2, transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'transparent'; }}
          >
            <i className="fas fa-xmark" />
          </button>
        </div>
      ))}
    </div>
  );
}
