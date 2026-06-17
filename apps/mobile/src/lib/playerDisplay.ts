import type { Position } from '@futbol-kart/shared-types';

/**
 * Oyuncu kartı görsel yardımcıları (mobil). Web karşılığı: playerDisplay.ts
 * Fark: Tailwind class'ları yerine ham hex/RN renkleri (RN'de class yok).
 */

const POSITION_LABEL_TR: Record<Position, string> = {
  GK: 'KL',
  DEF: 'SAV',
  MID: 'ORT',
  FWD: 'FOR',
};

export function positionShort(p: Position): string {
  return POSITION_LABEL_TR[p];
}

export interface PositionTheme {
  /** Üst gradient renkleri (3 durak). */
  gradient: [string, string, string];
  hex: string;
  hexDark: string;
  hexLight: string;
  /** Rozet zemini. */
  badgeBg: string;
  badgeText: string;
}

// Pozisyon kimlik renkleri — web POSITION_THEME ile aynı semantik/hex'ler.
const POSITION_THEME: Record<Position, PositionTheme> = {
  GK: {
    gradient: ['#ddd6fe', '#a78bfa', '#6d28d9'],
    hex: '#7c3aed',
    hexDark: '#4c1d95',
    hexLight: '#c4b5fd',
    badgeBg: 'rgba(46,16,101,0.55)',
    badgeText: '#ede9fe',
  },
  DEF: {
    gradient: ['#bae6fd', '#0ea5e9', '#1e40af'],
    hex: '#0284c7',
    hexDark: '#1e3a8a',
    hexLight: '#bae6fd',
    badgeBg: 'rgba(23,37,84,0.55)',
    badgeText: '#e0f2fe',
  },
  MID: {
    gradient: ['#fef3c7', '#fbbf24', '#b45309'],
    hex: '#f59e0b',
    hexDark: '#92400e',
    hexLight: '#fde68a',
    badgeBg: 'rgba(69,26,3,0.55)',
    badgeText: '#fef3c7',
  },
  FWD: {
    gradient: ['#fecdd3', '#f43f5e', '#991b1b'],
    hex: '#e11d48',
    hexDark: '#881337',
    hexLight: '#fda4af',
    badgeBg: 'rgba(76,5,25,0.55)',
    badgeText: '#ffe4e6',
  },
};

export function positionTheme(p: Position): PositionTheme {
  return POSITION_THEME[p];
}

export function countryFlag(code?: string): string {
  if (!code || code.length !== 2) return '';
  const upper = code.toUpperCase();
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
