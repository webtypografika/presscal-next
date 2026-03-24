'use client';

import { Moon, Bell, User } from 'lucide-react';

export function Topbar() {
  return (
    <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-3">
      {/* Logo */}
      <div className="flex items-center">
        <img src="/logo-presscal.png" alt="PressCal" className="h-16" />
      </div>

      {/* Right: icons */}
      <div className="flex items-center gap-2">
        <button className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]">
          <Moon className="h-[18px] w-[18px]" />
        </button>
        <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]">
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-1.5 top-1.5 h-[6px] w-[6px] rounded-full bg-[var(--danger)]" />
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]">
          <User className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}
