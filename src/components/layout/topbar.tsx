'use client';

import { Moon, Sun, Bell, Search, Menu } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';

export function Topbar() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-14 items-center justify-between border-b border-topbar-border bg-topbar-bg px-4'
      )}
    >
      {/* Left: mobile menu + search */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="lg:hidden text-muted hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="text"
            placeholder="Αναζήτηση... (Ctrl+K)"
            className="h-9 w-64 rounded-lg border border-card-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-sidebar-hover hover:text-foreground transition-colors"
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>

        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-sidebar-hover hover:text-foreground transition-colors"
          title="Ειδοποιήσεις"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" />
        </button>

        {/* User avatar placeholder */}
        <div className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white text-xs font-bold">
          U
        </div>
      </div>
    </header>
  );
}
