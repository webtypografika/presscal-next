'use client';

import Link from 'next/link';
import { Package, Printer, Scissors, Box } from 'lucide-react';

const DOCK_ITEMS = [
  { href: '/inventory', icon: Package, label: 'Αποθήκη', color: 'var(--teal)' },
  { href: '/machines', icon: Printer, label: 'Μηχανές', color: 'var(--blue)' },
  { href: '/postpress', icon: Scissors, label: 'Μεταεκτύπωση', color: 'var(--violet)' },
  { href: '/products', icon: Box, label: 'Προϊόντα', color: 'var(--text-muted)' },
];

export function Dock() {
  return (
    <nav
      className="fixed bottom-3.5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[rgba(15,23,42,0.82)] px-3 py-2 shadow-[0_24px_64px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)_inset]"
      style={{ backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)' }}
    >
      {DOCK_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="group relative flex h-[42px] w-[42px] items-center justify-center rounded-full border-2 transition-all"
            style={{
              borderColor: `color-mix(in srgb, ${item.color} 25%, transparent)`,
              background: `color-mix(in srgb, ${item.color} 8%, transparent)`,
              color: item.color,
            }}
            title={item.label}
          >
            <Icon className="h-[15px] w-[15px]" />
            <span className="pointer-events-none absolute -bottom-[14px] whitespace-nowrap text-[0.48rem] font-semibold text-[var(--text-dim)] opacity-0 transition-opacity group-hover:opacity-100">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
