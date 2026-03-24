'use client';

import { useEffect, useState } from 'react';
import { Moon, Bell, User, Droplets, Wind } from 'lucide-react';

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

interface DayForecast {
  day: string;
  icon: string;
  temp: number;
  hum: number;
}

export function Topbar() {
  const now = new Date();
  const dayName = DAYS_GR[now.getDay()];
  const date = now.getDate();
  const month = MONTHS_GR[now.getMonth()];
  const year = now.getFullYear();

  const [weather, setWeather] = useState<{
    temp: number; icon: string; humidity: number; wind: number;
    forecast: DayForecast[];
  } | null>(null);

  useEffect(() => {
    // Thessaloniki coordinates
    const lat = 40.6401;
    const lon = 22.9444;
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,relative_humidity_2m_max&timezone=Europe/Athens&forecast_days=7`)
      .then((r) => r.json())
      .then((data) => {
        const c = data.current;
        const d = data.daily;
        const forecast: DayForecast[] = [];
        for (let i = 1; i < Math.min(7, d.time.length); i++) {
          const fDate = new Date(d.time[i]);
          forecast.push({
            day: DAYS_GR[fDate.getDay()],
            icon: wmoIcon(d.weather_code[i]),
            temp: Math.round(d.temperature_2m_max[i]),
            hum: d.relative_humidity_2m_max[i],
          });
        }
        setWeather({
          temp: Math.round(c.temperature_2m),
          icon: wmoIcon(c.weather_code),
          humidity: c.relative_humidity_2m,
          wind: Math.round(c.wind_speed_10m),
          forecast,
        });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-3">
      {/* Logo */}
      <div className="flex items-center">
        <img src="/logo-presscal.png" alt="PressCal" className="h-16" />
      </div>

      {/* Center: Date + Weather + Forecast */}
      <div className="flex items-center gap-[6px]">
        {/* Date box */}
        <div className="flex items-baseline gap-[6px] rounded-[10px] border border-[var(--glass-border)] bg-[rgba(255,255,255,0.04)] px-[14px] py-[6px]">
          <span className="text-[0.78rem] font-semibold text-[var(--text-muted)]">{dayName}</span>
          <span className="text-[1.3rem] font-extrabold text-[var(--accent)]">{date}</span>
          <span className="text-[0.88rem] text-[var(--text-dim)]">{month} {year}</span>
        </div>

        {/* Today weather */}
        {weather && (
          <div className="flex items-center gap-[8px] rounded-[10px] border border-[var(--glass-border)] bg-[rgba(255,255,255,0.04)] px-[14px] py-[6px]">
            <span className="text-[1.2rem]">{weather.icon}</span>
            <span className="text-[0.85rem] font-bold text-[var(--text-dim)]">{weather.temp}°C</span>
            <span className="flex items-center gap-1 text-[0.72rem] text-[var(--text-muted)]">
              <Droplets className="h-3 w-3 text-[var(--blue)]" /> {weather.humidity}%
            </span>
          </div>
        )}

        {/* Forecast */}
        {weather && weather.forecast.length > 0 && (
          <div className="flex items-center gap-[8px] rounded-[10px] border border-[var(--glass-border)] bg-[rgba(255,255,255,0.04)] px-[14px] py-[6px]">
            {weather.forecast.map((f) => (
              <div key={f.day} className="flex flex-col items-center gap-[1px]">
                <span className="text-[0.58rem] font-bold uppercase text-[var(--text-muted)]">{f.day}</span>
                <span className="text-[0.9rem]">{f.icon}</span>
                <span className="text-[0.72rem] font-bold text-[var(--text-dim)]">{f.temp}°</span>
                <span className="text-[0.52rem] text-[var(--text-muted)]">
                  <Droplets className="mr-0.5 inline h-2 w-2 text-[var(--blue)]" />{f.hum}%
                </span>
              </div>
            ))}
          </div>
        )}
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
