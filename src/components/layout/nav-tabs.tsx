'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', icon: 'fa-th-large', label: 'Dashboard' },
  { href: '/calculator', icon: 'fa-calculator', label: 'Κοστολογηση' },
  { href: '/email', icon: 'fa-envelope', label: 'Emails' },
  { href: '/quotes', icon: 'fa-file-invoice', label: 'Προσφορες' },
  { href: '/jobs', icon: 'fa-tasks', label: 'Εργασιες' },
  { href: '/office', icon: 'fa-briefcase', label: 'Γραφειο' },
  { href: '/calendar', icon: 'fa-calendar-alt', label: 'Ημερολογιο' },
  { href: '/companies', icon: 'fa-address-book', label: 'Επαφες' },
];

const DOCK_ITEMS = [
  { href: '/inventory', icon: 'fa-boxes-stacked', label: 'Αποθηκη', color: 'var(--teal)' },
  { href: '/machines', icon: 'fa-print', label: 'Μηχανες', color: 'var(--blue)' },
  { href: '/postpress', icon: 'fa-scissors', label: 'Μεταεκτυπωση', color: 'var(--violet)' },
  { href: '/products', icon: 'fa-cube', label: 'Προϊοντα', color: 'var(--text-muted)' },
];

export function NavTabs() {
  const pathname = usePathname();

  return (
    <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', height: 46, background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '0 12px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', marginBottom: 16 }}>
      {/* Main tabs — left */}
      <div style={{ display: 'flex', gap: 2, borderRadius: 10, padding: 3 }}>
        {TABS.map((tab) => {
          const isActive = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                padding: '7px 16px',
                borderRadius: 8,
                fontSize: '0.82rem',
                fontWeight: 600,
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                background: isActive ? 'rgba(245,130,32,0.12)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap' as const,
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--accent)';
                  e.currentTarget.style.background = 'rgba(245,130,32,0.08)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <i className={`fas ${tab.icon}`} style={{ fontSize: '0.7rem' }} />
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      {/* Dock items — right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {DOCK_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className="dock-nav-orb"
              style={{
                width: 34, height: 34, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.78rem',
                border: `2px solid ${isActive ? `color-mix(in srgb, ${item.color} 55%, transparent)` : `color-mix(in srgb, ${item.color} 25%, transparent)`}`,
                background: isActive ? `color-mix(in srgb, ${item.color} 15%, transparent)` : `color-mix(in srgb, ${item.color} 8%, transparent)`,
                color: item.color,
                transition: 'all 300ms cubic-bezier(0.34,1.56,0.64,1)',
                textDecoration: 'none',
              }}
            >
              <i className={`fas ${item.icon}`} />
            </Link>
          );
        })}
      </div>

      <style>{`
        .dock-nav-orb:hover {
          border-color: color-mix(in srgb, currentColor 55%, transparent) !important;
          background: color-mix(in srgb, currentColor 15%, transparent) !important;
          box-shadow: 0 0 12px color-mix(in srgb, currentColor 20%, transparent);
          transform: scale(1.1);
        }
      `}</style>
    </div>
  );
}
