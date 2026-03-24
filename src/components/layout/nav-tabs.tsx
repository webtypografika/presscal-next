'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid, Calculator, Users, FileText,
  Mail, ListChecks, Calendar, FolderOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/', icon: LayoutGrid, label: 'Dashboard' },
  { href: '/calculator', icon: Calculator, label: 'Κοστολόγηση' },
  { href: '/customers', icon: Users, label: 'Πελάτες' },
  { href: '/quotes', icon: FileText, label: 'Προσφορές' },
  { href: '/email', icon: Mail, label: 'Emails' },
  { href: '/jobs', icon: ListChecks, label: 'Εργασίες' },
  { href: '/calendar', icon: Calendar, label: 'Ημερολόγιο' },
  { href: '/folders', icon: FolderOpen, label: 'Folders' },
];

export function NavTabs() {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex max-w-[1400px] items-center justify-center">
      <nav
        className="flex items-center gap-[2px] rounded-[14px] border border-[var(--glass-border)] bg-[rgba(10,18,36,0.85)] px-3 shadow-[0_4px_20px_rgba(0,0,0,0.2)]"
        style={{ backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
      >
        {TABS.map((tab) => {
          const isActive =
            tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex items-center gap-[6px] whitespace-nowrap rounded-lg px-4 py-[7px] text-[1rem] font-semibold transition-all',
                isActive
                  ? 'bg-[rgba(245,130,32,0.12)] text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:bg-[rgba(245,130,32,0.08)] hover:text-[var(--accent)]'
              )}
            >
              <Icon className="h-[14px] w-[14px]" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
