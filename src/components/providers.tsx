'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/stores/ui-store';

export function Providers({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return <>{children}</>;
}
