'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { NewGameButton } from '@/components/NewGameButton';
import { SoccerBallIcon } from '@/components/icons';

/**
 * Tam ekran hero:
 *   - Arkada hero.jpg, hafif Ken Burns (8s'de scale 1.06 → 1.0)
 *   - Üzerinde dark overlay (%55) + alt gradient (saha yeşiline geçiş)
 *   - Ortada başlık + alt yazı + CTA
 *   - Altta yukarı süzülen altın parçacıklar
 *   - En altta scroll-down chevron animasyonu
 *
 * Görsel public/hero/hero.jpg konumunda olmalı. Yoksa overlay/gradient
 * yine güzel görünür (gradient fallback).
 */
export function HomeHero() {
  const t = useTranslations('home');

  return (
    <section className="relative h-[100svh] min-h-[640px] w-full overflow-hidden">
      {/* === Arka plan görseli + Ken Burns === */}
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 1.06 }}
        animate={{ scale: 1.0 }}
        transition={{ duration: 8, ease: 'easeOut' }}
      >
        <div
          className="absolute inset-0 bg-zinc-950 bg-cover bg-center"
          style={{ backgroundImage: "url('/hero/hero.webp')" }}
          aria-hidden
        />
      </motion.div>

      {/* === Overlay katmanları === */}
      {/* Dark wash */}
      <div className="absolute inset-0 bg-black/55" aria-hidden />

      {/* Vinyet — kenarlarda koyu, ortada açık */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 45%, transparent 0%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.7) 100%)',
        }}
        aria-hidden
      />

      {/* Alt fade — saha temasına geçiş */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/2"
        style={{
          background:
            'linear-gradient(to bottom, transparent 0%, rgba(6,26,14,0.6) 60%, #061a0e 100%)',
        }}
        aria-hidden
      />

      {/* === Altın parçacıklar === */}
      <ParticleField />

      {/* === İçerik === */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="inline-flex items-center gap-2 rounded-full border border-accent-gold/40 bg-black/50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-goldHi backdrop-blur"
        >
          <SoccerBallIcon size={14} />
          {t('kicker')}
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 14, letterSpacing: '0.05em' }}
          animate={{ opacity: 1, y: 0, letterSpacing: '-0.02em' }}
          transition={{ duration: 0.9, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-3xl text-balance text-5xl font-black leading-[1.02] tracking-tight sm:text-7xl lg:text-8xl"
        >
          <span
            className="bg-clip-text text-transparent drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]"
            style={{
              backgroundImage:
                'linear-gradient(180deg, #ffffff 0%, #ffe8a8 55%, #f0c14b 100%)',
            }}
          >
            {t('title')}
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.0 }}
          className="mt-5 max-w-xl text-base text-white/80 drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] sm:text-lg"
        >
          {t('tagline')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.3 }}
          className="mt-9"
        >
          <NewGameButton label={t('playCta')} />
        </motion.div>
      </div>

      {/* === Scroll chevron === */}
      <ScrollHint />
    </section>
  );
}

function ParticleField() {
  // Sabit konumlu 14 partikül — random yerine deterministic ki SSR mismatch yok.
  const particles = [
    { left: 8, delay: 0, size: 4, dur: 9 },
    { left: 14, delay: 2.5, size: 3, dur: 11 },
    { left: 22, delay: 5, size: 5, dur: 8 },
    { left: 30, delay: 1, size: 3, dur: 12 },
    { left: 38, delay: 7, size: 4, dur: 10 },
    { left: 46, delay: 3, size: 3, dur: 9 },
    { left: 54, delay: 6, size: 5, dur: 11 },
    { left: 62, delay: 0.5, size: 3, dur: 10 },
    { left: 70, delay: 4.5, size: 4, dur: 8 },
    { left: 78, delay: 2, size: 3, dur: 11 },
    { left: 86, delay: 5.5, size: 5, dur: 9 },
    { left: 92, delay: 1.5, size: 4, dur: 12 },
    { left: 18, delay: 6.5, size: 3, dur: 10 },
    { left: 76, delay: 3.5, size: 4, dur: 10 },
  ];
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden"
      aria-hidden
    >
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-full bg-accent-goldHi/70 blur-[1px]"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animation: `hero-particle ${p.dur}s linear ${p.delay}s infinite`,
            boxShadow: '0 0 8px rgba(255,215,107,0.65)',
          }}
        />
      ))}
    </div>
  );
}

function ScrollHint() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, delay: 1.8 }}
      className="absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-1.5 motion-reduce:hidden"
      aria-hidden
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
        Aşağı kaydır
      </span>
      <motion.svg
        width="20"
        height="12"
        viewBox="0 0 20 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-accent-goldHi/80"
        animate={{ y: [0, 4, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <polyline points="2,2 10,10 18,2" />
      </motion.svg>
    </motion.div>
  );
}
