import type { Position } from '@futbol-kart/shared-types';

const POSITION_LABEL_TR: Record<Position, string> = {
  GK: 'KL',
  DEF: 'SAV',
  MID: 'ORT',
  FWD: 'FOR',
};

const POSITION_LABEL_FULL_TR: Record<Position, string> = {
  GK: 'Kaleci',
  DEF: 'Savunma',
  MID: 'Orta saha',
  FWD: 'Forvet',
};

export function positionShort(p: Position): string {
  return POSITION_LABEL_TR[p];
}

export function positionFull(p: Position): string {
  return POSITION_LABEL_FULL_TR[p];
}

/**
 * Pozisyona göre kart kimlik teması.
 * Renk semantiği:
 *   GK (mor)  → ayrıcalıklı, eldivenli/kahraman
 *   DEF (mavi) → sağlam, soğukkanlı
 *   MID (sarı) → yaratıcı, sıcak
 *   FWD (kırmızı) → saldırgan, hızlı
 */
export interface PositionTheme {
  /** Kart üst gradient (Tailwind class) */
  gradient: string;
  /** Hex ana renk — gradient/glow override için */
  hex: string;
  /** Daha koyu hex — kenarlık */
  hexDark: string;
  /** Açık hex — parıltı */
  hexLight: string;
  /** Rozet bg + text (Tailwind) */
  badge: string;
  /** Glow box-shadow değeri */
  glow: string;
  /** Bayrak rozeti bg */
  flagBg: string;
}

const POSITION_THEME: Record<Position, PositionTheme> = {
  GK: {
    gradient: 'from-violet-200 via-violet-400 to-violet-700',
    hex: '#7c3aed',
    hexDark: '#4c1d95',
    hexLight: '#c4b5fd',
    badge: 'bg-violet-950/40 text-violet-100 ring-1 ring-violet-300/40',
    glow: '0 0 28px rgba(124,58,237,0.55), 0 4px 18px rgba(0,0,0,0.4)',
    flagBg: 'bg-violet-950/40',
  },
  DEF: {
    gradient: 'from-sky-200 via-sky-500 to-blue-800',
    hex: '#0284c7',
    hexDark: '#1e3a8a',
    hexLight: '#bae6fd',
    badge: 'bg-blue-950/40 text-sky-100 ring-1 ring-sky-300/40',
    glow: '0 0 28px rgba(2,132,199,0.55), 0 4px 18px rgba(0,0,0,0.4)',
    flagBg: 'bg-blue-950/40',
  },
  MID: {
    gradient: 'from-amber-100 via-amber-400 to-amber-700',
    hex: '#f59e0b',
    hexDark: '#92400e',
    hexLight: '#fde68a',
    badge: 'bg-amber-950/40 text-amber-100 ring-1 ring-amber-300/40',
    glow: '0 0 28px rgba(245,158,11,0.55), 0 4px 18px rgba(0,0,0,0.4)',
    flagBg: 'bg-amber-950/40',
  },
  FWD: {
    gradient: 'from-rose-200 via-rose-500 to-red-800',
    hex: '#e11d48',
    hexDark: '#881337',
    hexLight: '#fda4af',
    badge: 'bg-rose-950/40 text-rose-100 ring-1 ring-rose-300/40',
    glow: '0 0 28px rgba(225,29,72,0.55), 0 4px 18px rgba(0,0,0,0.4)',
    flagBg: 'bg-rose-950/40',
  },
};

export function positionTheme(p: Position): PositionTheme {
  return POSITION_THEME[p];
}

/** Geriye uyumluluk için — eski API */
export function positionTint(p: Position): string {
  return POSITION_THEME[p].gradient;
}

export function countryFlag(code?: string): string {
  if (!code || code.length !== 2) return '';
  const upper = code.toUpperCase();
  // İki harfli ülke kodunu regional indicator emojiye çevirir (TR -> 🇹🇷)
  const A = 0x1f1e6;
  const codePoints = [...upper].map((c) => A + (c.charCodeAt(0) - 65));
  try {
    return String.fromCodePoint(...codePoints);
  } catch {
    return '';
  }
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
