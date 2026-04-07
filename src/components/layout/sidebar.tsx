'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Calculator,
  FileText,
  Mail,
  Printer,
  Warehouse,
  Users,
  Package,
  Scissors,
  Settings,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CalendarDays,
} from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/', icon: LayoutDashboard, labelEl: 'Dashboard', labelEn: 'Dashboard' },
  { href: '/calculator', icon: Calculator, labelEl: 'Κοστολόγηση', labelEn: 'Calculator' },
  { href: '/email', icon: Mail, labelEl: 'Emails', labelEn: 'Emails' },
  { href: '/quotes', icon: FileText, labelEl: 'Προσφορές', labelEn: 'Quotes' },
  { href: '/jobs', icon: ClipboardList, labelEl: 'Εργασίες', labelEn: 'Jobs' },
  { href: '/calendar', icon: CalendarDays, labelEl: 'Ημερολόγιο', labelEn: 'Calendar' },
  { href: '/contacts', icon: Users, labelEl: 'Επαφές', labelEn: 'Contacts' },
  { href: '/machines', icon: Printer, labelEl: 'Μηχανήματα', labelEn: 'Machines' },
  { href: '/inventory', icon: Warehouse, labelEl: 'Αποθήκη', labelEn: 'Inventory' },
  { href: '/products', icon: Package, labelEl: 'Προϊόντα', labelEn: 'Products' },
  { href: '/postpress', icon: Scissors, labelEl: 'Μεταφορές', labelEn: 'Postpress' },
  { href: '/settings', icon: Settings, labelEl: 'Ρυθμίσεις', labelEn: 'Settings' },
];

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'sidebar-transition fixed inset-y-0 left-0 z-30 flex flex-col',
        'border-r border-sidebar-border bg-sidebar-bg',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white font-bold text-sm">
          P
        </div>
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight text-foreground">
            Press<span className="text-accent">Cal</span>
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-active text-sidebar-active-text'
                  : 'text-muted hover:bg-sidebar-hover hover:text-foreground'
              )}
              title={collapsed ? item.labelEl : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.labelEl}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="flex h-10 items-center justify-center border-t border-sidebar-border text-muted hover:text-foreground transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>
    </aside>
  );
}
