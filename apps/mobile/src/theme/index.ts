/**
 * DerbyGoal mobil tasarım token'ları.
 *
 * Web `apps/web/tailwind.config.ts`'deki değerlerin birebir karşılığı — tek
 * görsel dil iki platformda aynı kalsın. RN'de Tailwind yok; bu yüzden token'lar
 * düz obje olarak verilir, StyleSheet'lerde tüketilir.
 */

export const colors = {
  pitch: {
    DEFAULT: '#1f6b3a',
    dark: '#0a2614',
    deep: '#061a0e',
    light: '#2f8a4d',
    neon: '#5fe07a',
  },
  accent: {
    gold: '#f0c14b',
    goldHi: '#ffd76b',
  },
  side: {
    red: '#c8323d',
    redDark: '#7a1d24',
    blue: '#2c5fd6',
    blueDark: '#1a3a87',
  },
  text: {
    primary: '#f7f7f7',
    muted: 'rgba(255,255,255,0.6)',
    faint: 'rgba(255,255,255,0.4)',
  },
  surface: {
    glass: 'rgba(255,255,255,0.05)',
    glassStrong: 'rgba(0,0,0,0.4)',
    border: 'rgba(255,255,255,0.1)',
  },
} as const;

/**
 * Gölge/glow değerleri. RN gölgeleri web'den farklı çalışır (iOS: shadow*,
 * Android: elevation). Web'in glow estetiğini RN'e taşıyan hazır objeler.
 */
export const shadows = {
  glowGold: {
    shadowColor: colors.accent.gold,
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  glowNeon: {
    shadowColor: colors.pitch.neon,
    shadowOpacity: 0.45,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const;

/**
 * Animasyon easing/süreleri. Web her yerde cubic-bezier(0.22,1,0.36,1) ("kinetik
 * ease-out") + 200-700ms kullanıyor. RN Reanimated için aynı değerler.
 */
export const motion = {
  // Web'in imza easing'i: cubic-bezier(0.22, 1, 0.36, 1)
  easeOutBezier: [0.22, 1, 0.36, 1] as const,
  duration: {
    fast: 200,
    base: 320,
    slow: 600,
    bg: 700, // sahne arka planı cross-fade
  },
  // Spring — native "his"in kalbi; butonlar/kartlar bununla canlanır.
  spring: {
    snappy: { damping: 18, stiffness: 260, mass: 0.8 },
    soft: { damping: 22, stiffness: 160, mass: 1 },
  },
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const theme = { colors, shadows, motion, radius, spacing } as const;
export type Theme = typeof theme;
