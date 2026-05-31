'use client';

import type { Position } from '@futbol-kart/shared-types';
import { cn } from '@/lib/cn';
import { positionTheme } from '@/lib/playerDisplay';

interface PlayerFilterChipsProps {
  position: Position | null;
  onPositionChange: (position: Position | null) => void;
  countryCode: string | null;
  onCountryChange: (code: string | null) => void;
  countries: Array<{ code: string; name: string }>;
  era: 'active' | 'modern' | 'legend' | null;
  onEraChange: (era: 'active' | 'modern' | 'legend' | null) => void;
}

const POSITIONS: Array<{ key: Position | null; label: string }> = [
  { key: null, label: 'Hepsi' },
  { key: 'FWD', label: 'Forvet' },
  { key: 'MID', label: 'Orta saha' },
  { key: 'DEF', label: 'Defans' },
  { key: 'GK', label: 'Kaleci' },
];

const ERAS: Array<{ key: 'active' | 'modern' | 'legend' | null; label: string; icon: string }> = [
  { key: null, label: 'Tüm dönem', icon: '◯' },
  { key: 'active', label: 'Aktif', icon: '●' },
  { key: 'modern', label: 'Modern', icon: '◆' },
  { key: 'legend', label: 'Efsane', icon: '★' },
];

export function PlayerFilterChips({
  position,
  onPositionChange,
  countryCode,
  onCountryChange,
  countries,
  era,
  onEraChange,
}: PlayerFilterChipsProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* Pozisyon — renkli toggle group */}
      <div className="flex flex-wrap items-center gap-1.5">
        {POSITIONS.map((p) => {
          const active = p.key === position;
          const theme = p.key ? positionTheme(p.key) : null;
          return (
            <button
              key={p.key ?? 'all'}
              type="button"
              onClick={() => onPositionChange(active ? null : p.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider',
                'border transition',
                active
                  ? 'border-white/30 bg-white/15 text-white shadow-inner'
                  : 'border-white/8 bg-black/30 text-white/60 hover:border-white/15 hover:text-white',
              )}
              style={
                active && theme
                  ? {
                      borderColor: `${theme.hexLight}66`,
                      boxShadow: `inset 0 0 0 1px ${theme.hexLight}22`,
                    }
                  : undefined
              }
            >
              {theme && active && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: theme.hexLight }}
                />
              )}
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Çağ + Ülke yan yana */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Çağ chip'leri */}
        {ERAS.map((e) => {
          const active = e.key === era;
          return (
            <button
              key={e.key ?? 'all-era'}
              type="button"
              onClick={() => onEraChange(active ? null : e.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider',
                'border transition',
                active
                  ? 'border-accent-gold/40 bg-accent-gold/15 text-accent-goldHi'
                  : 'border-white/8 bg-black/30 text-white/55 hover:border-white/15 hover:text-white',
              )}
            >
              <span className="text-[10px]">{e.icon}</span>
              {e.label}
            </button>
          );
        })}

        {/* Ülke dropdown */}
        <div className="relative">
          <select
            value={countryCode ?? ''}
            onChange={(e) => onCountryChange(e.target.value || null)}
            className={cn(
              'appearance-none rounded-full border px-3 py-1.5 pr-8 text-xs font-bold uppercase tracking-wider',
              'transition cursor-pointer',
              countryCode
                ? 'border-white/30 bg-white/15 text-white'
                : 'border-white/8 bg-black/30 text-white/55 hover:border-white/15',
            )}
          >
            <option value="" className="bg-zinc-900">Tüm ülkeler</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code} className="bg-zinc-900">
                {c.name}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/55">▾</span>
        </div>
      </div>
    </div>
  );
}
