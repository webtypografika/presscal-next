'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', icon: 'fa-th-large', label: 'Dashboard' },
  { href: '/calculator', icon: 'fa-calculator', label: 'Κοστολόγηση' },
  { href: '/customers', icon: 'fa-users', label: 'Πελάτες' },
  { href: '/quotes', icon: 'fa-file-invoice', label: 'Προσφορές' },
  { href: '/email', icon: 'fa-envelope', label: 'Emails' },
  { href: '/jobs', icon: 'fa-tasks', label: 'Εργασίες' },
  { href: '/calendar', icon: 'fa-calendar-alt', label: 'Ημερολόγιο' },
  { href: '/folders', icon: 'fa-folder-open', label: 'Folders' },
];

export function NavTabs() {
  const pathname = usePathname();

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 46, background: 'rgba(10,18,36,0.85)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '0 12px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3 }}>
        {TABS.map((tab) => {
          const isActive = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                padding: '7px 16px',
                borderRadius: 8,
                fontSize: '1rem',
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
              <i className={`fas ${tab.icon}`} style={{ fontSize: '0.85rem' }} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
