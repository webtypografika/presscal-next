'use client';

import { Topbar } from '@/components/layout/topbar';
import { NavTabs } from '@/components/layout/nav-tabs';
import { Dock } from '@/components/layout/dock';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-[1] flex min-h-screen flex-col">
      <Topbar />
      <NavTabs />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 pb-24 pt-4">
        {children}
      </main>
      <Dock />
    </div>
  );
}
