'use client';

import { useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';
import { useUIStore } from '@/stores/ui-store';

export function Providers({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // ─── GLOBAL: comma → dot for ALL numeric inputs ───
  useEffect(() => {
    // Intercept comma in numeric inputs and replace with dot
    function handleBeforeInput(e: InputEvent) {
      const el = e.target as HTMLInputElement;
      if (!el || el.tagName !== 'INPUT') return;
      if (el.type !== 'number' && el.inputMode !== 'decimal') return;

      if (e.data === ',') {
        e.preventDefault();
        // Insert dot instead — use execCommand for proper cursor position
        document.execCommand('insertText', false, '.');
      }
    }

    // Also handle keydown for keyboards where comma doesn't fire beforeinput
    function handleKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLInputElement;
      if (!el || el.tagName !== 'INPUT') return;
      if (el.type !== 'number' && el.inputMode !== 'decimal') return;

      if (e.key === ',' || e.key === 'Decimal') {
        e.preventDefault();
        document.execCommand('insertText', false, '.');
      }
    }

    document.addEventListener('beforeinput', handleBeforeInput as EventListener, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('beforeinput', handleBeforeInput as EventListener, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  return <SessionProvider refetchInterval={0} refetchOnWindowFocus={false}>{children}</SessionProvider>;
}
