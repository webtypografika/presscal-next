'use client';

import Link from 'next/link';

const DOCK_ITEMS = [
  { href: '/inventory', icon: 'fa-boxes-stacked', label: 'Αποθήκη', color: 'var(--teal)' },
  { href: '/machines', icon: 'fa-print', label: 'Μηχανές', color: 'var(--blue)' },
  { href: '/postpress', icon: 'fa-scissors', label: 'Μεταεκτύπωση', color: 'var(--violet)' },
  { href: '/products', icon: 'fa-cube', label: 'Προϊόντα', color: 'var(--text-muted)' },
];

export function Dock() {
  return (
    <nav style={{
      position: 'fixed', bottom: 14, left: '50%', transform: 'translateX(-50%)',
      zIndex: 100, display: 'flex', alignItems: 'center', gap: 4,
      background: 'rgba(15,23,42,0.82)',
      border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20,
      padding: '8px 12px', boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
    }}>
      {DOCK_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          title={item.label}
          className="dock-orb"
          style={{
            width: 42, height: 42, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.85rem', position: 'relative',
            border: `2px solid color-mix(in srgb, ${item.color} 25%, transparent)`,
            background: `color-mix(in srgb, ${item.color} 8%, transparent)`,
            color: item.color,
            transition: 'all 350ms cubic-bezier(0.34,1.56,0.64,1)',
            textDecoration: 'none',
          }}
        >
          <i className={`fas ${item.icon}`} />
          <span style={{
            fontSize: '0.48rem', fontWeight: 600, opacity: 0,
            transition: 'opacity 0.2s', letterSpacing: '0.02em',
            position: 'absolute', bottom: -14, whiteSpace: 'nowrap',
            color: 'var(--text-dim)', pointerEvents: 'none',
          }}>{item.label}</span>
        </Link>
      ))}

      <style>{`
        .dock-orb:hover {
          border-color: color-mix(in srgb, currentColor 55%, transparent) !important;
          background: color-mix(in srgb, currentColor 15%, transparent) !important;
          box-shadow: 0 0 16px color-mix(in srgb, currentColor 20%, transparent);
        }
        .dock-orb:hover span { opacity: 1 !important; }
      `}</style>
    </nav>
  );
}
