'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';

const DAYS_GR = ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'];
const MONTHS_GR = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιούν', 'Ιούλ', 'Αύγ', 'Σεπ', 'Οκτ', 'Νοέ', 'Δεκ'];

function wmoIcon(code: number) {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '🌨️';
  if (code <= 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌤️';
}

interface ForecastDay { day: string; icon: string; temp: number; hum: number; }

export function Topbar() {
  const now = new Date();
  const [weather, setWeather] = useState<{
    temp: number; icon: string; humidity: number;
    forecast: ForecastDay[];
  } | null>(null);

  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=40.64&longitude=22.94&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,relative_humidity_2m_max&timezone=Europe/Athens&forecast_days=7')
      .then(r => r.json())
      .then(data => {
        const c = data.current;
        const d = data.daily;
        const forecast: ForecastDay[] = [];
        for (let i = 1; i < Math.min(7, d.time.length); i++) {
          const fd = new Date(d.time[i]);
          forecast.push({ day: DAYS_GR[fd.getDay()], icon: wmoIcon(d.weather_code[i]), temp: Math.round(d.temperature_2m_max[i]), hum: d.relative_humidity_2m_max[i] });
        }
        setWeather({ temp: Math.round(c.temperature_2m), icon: wmoIcon(c.weather_code), humidity: c.relative_humidity_2m, forecast });
      }).catch(() => {});
  }, []);

  return (
    <div style={{ width: '100%', maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 80, padding: '0 18px', marginBottom: 8 }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <img src="/logo-presscal.png" alt="PressCal" style={{ height: 64 }} />
      </div>

      {/* Center: Date + Weather + Forecast — exact D-hybrid styles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Date box */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: '6px 14px', display: 'flex', alignItems: 'baseline', gap: 6, fontSize: '0.88rem', color: 'var(--text-dim)' }}>
          <span style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-muted)' }}>{DAYS_GR[now.getDay()]}</span>
          <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent)' }}>{now.getDate()}</span>
          <span>{MONTHS_GR[now.getMonth()]} {now.getFullYear()}</span>
        </div>

        {/* Today weather */}
        {weather && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-dim)' }}>
            <span style={{ fontSize: '1.2rem' }}>{weather.icon}</span>
            <span style={{ fontWeight: 700 }}>{weather.temp}°C</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}><i className="fas fa-droplet" style={{ fontSize: '0.6rem', color: 'var(--blue)' }} /> {weather.humidity}%</span>
          </div>
        )}

        {/* Forecast */}
        {weather && weather.forecast.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: '6px 14px', display: 'flex', gap: 8 }}>
            {weather.forecast.map(f => (
              <div key={f.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>{f.day}</span>
                <span style={{ fontSize: '0.9rem' }}>{f.icon}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)' }}>{f.temp}°</span>
                <span style={{ fontSize: '0.52rem', color: 'var(--text-muted)' }}><i className="fas fa-droplet" style={{ fontSize: '0.45rem', color: 'var(--blue)' }} /> {f.hum}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: icons — exact D-hybrid styles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button className="h-btn" style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'color 0.2s' }}><i className="fas fa-moon" /></button>
        <button className="h-btn" style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', position: 'relative' as const, transition: 'color 0.2s' }}>
          <i className="fas fa-bell" />
          <span style={{ position: 'absolute' as const, top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)' }} />
        </button>
        <Link href="/settings" className="h-btn" style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'color 0.2s', textDecoration: 'none' }} title="Ρυθμίσεις"><i className="fas fa-cog" /></Link>
        <UserMenu />
      </div>
    </div>
  );
}

function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} className="h-btn" style={{
        width: 36, height: 36, borderRadius: 8, border: 'none',
        background: open ? 'rgba(255,255,255,0.08)' : 'transparent',
        color: 'var(--text-muted)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1rem', transition: 'color 0.2s',
      }} title="Λογαριασμός">
        {session?.user?.image ? (
          <img src={session.user.image} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />
        ) : (
          <i className="fas fa-user" />
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 42, right: 0, width: 220, zIndex: 100,
          background: 'rgb(20,30,55)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: 8, boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        }}>
          {session?.user && (
            <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 4 }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>{session.user.name}</p>
              <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{session.user.email}</p>
            </div>
          )}
          <Link href="/settings" onClick={() => setOpen(false)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem', color: 'var(--text-dim)',
            textDecoration: 'none', transition: 'background 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <i className="fas fa-cog" style={{ fontSize: '0.7rem', width: 16 }} /> Ρυθμίσεις
          </Link>
          <button onClick={() => signOut({ callbackUrl: '/login' })} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem', color: 'var(--danger)',
            border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <i className="fas fa-sign-out-alt" style={{ fontSize: '0.7rem', width: 16 }} /> Αποσύνδεση
          </button>
        </div>
      )}
    </div>
  );
}
