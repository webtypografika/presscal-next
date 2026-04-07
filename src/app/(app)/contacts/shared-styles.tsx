import type { CSSProperties } from 'react';

export const inp: CSSProperties = {
  width: '100%', padding: '6px 10px', borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)',
  color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 500, fontFamily: 'inherit', outline: 'none',
  transition: 'border-color 0.2s, background 0.2s',
};

export const inpFocus: CSSProperties = {
  ...inp,
  borderColor: 'color-mix(in srgb, var(--blue) 40%, transparent)',
  background: 'rgba(255,255,255,0.06)',
};

export const lbl: CSSProperties = {
  fontSize: '0.6rem', fontWeight: 600, color: '#64748b',
  letterSpacing: '0.06em', textTransform: 'uppercase' as const,
  marginBottom: 2, display: 'block',
};

export function SectionTitle({ text, color = 'var(--blue)' }: { text: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{ width: 3, height: 12, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '0.62rem', fontWeight: 700, color, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{text}</span>
    </div>
  );
}
