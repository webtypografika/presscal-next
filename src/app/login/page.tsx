'use client';

import { signIn } from 'next-auth/react';

export default function LoginPage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0f172a',
      backgroundImage: 'radial-gradient(ellipse 80% 50% at 20% 80%, rgba(29,47,110,0.4), transparent), radial-gradient(ellipse 60% 40% at 80% 20%, rgba(59,130,246,0.15), transparent)',
    }}>
      <div style={{
        width: 400, padding: 40, borderRadius: 20,
        background: 'rgba(15,23,42,0.75)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
        textAlign: 'center',
      }}>
        {/* Logo */}
        <img src="/logo-presscal.png" alt="PressCal" style={{ height: 56, marginBottom: 24 }} />

        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f1f5f9', marginBottom: 8 }}>
          Καλώς ήρθατε
        </h1>
        <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: 32 }}>
          Συνδεθείτε για να συνεχίσετε στο PressCal Pro
        </p>

        {/* Google Sign In */}
        <button
          onClick={() => signIn('google', { callbackUrl: '/' })}
          style={{
            width: '100%', padding: '14px 24px', borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)',
            color: '#f1f5f9', fontSize: '0.95rem', fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 12,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Σύνδεση με Google
        </button>

        <p style={{ fontSize: '0.7rem', color: '#475569', marginTop: 24 }}>
          Powered by <span style={{ color: '#f58220', fontWeight: 700 }}>PressCal Pro</span>
        </p>
      </div>
    </div>
  );
}
