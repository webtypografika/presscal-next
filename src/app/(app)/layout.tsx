'use client';

import { Topbar } from '@/components/layout/topbar';
import { NavTabs } from '@/components/layout/nav-tabs';
import { Dock } from '@/components/layout/dock';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-[1] flex min-h-screen flex-col">
      <Topbar />
      <NavTabs />
      <main style={{ width: '100%', position: 'relative', zIndex: 1, padding: '0 40px 120px', maxWidth: 1280, margin: '0 auto', animation: 'fadeIn 0.5s ease both' }}>
        {children}
      </main>
      <Dock />
    </div>
  );
}
