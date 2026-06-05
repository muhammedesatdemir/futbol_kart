'use client';

import { motion } from 'framer-motion';
import type { GamePhase } from '@futbol-kart/game-engine';
import { PlayIcon, TrophyIcon } from '@/components/icons';

interface PhaseTransitionSceneProps {
  phase: GamePhase;
  handSize: number;
  rounds: number;
  onContinue: () => void;
}

const PHASE_COPY: Record<GamePhase, { title: string; body: string; chip: string }> = {
  main: {
    chip: 'Ana maç',
    title: 'Maç başlıyor',
    body: 'Eline 8 kart, önünde 7 tur var. İyi şanslar.',
  },
  extra: {
    chip: 'Uzatma',
    title: 'Beraberlik bozulamadı',
    body:
      'Şimdi uzatmaya geçiyoruz. İki oyuncu da yeniden 4’er kart seçecek, 3 turda kazanan belirlenecek.',
  },
  sudden: {
    chip: 'Penaltı atışı',
    title: 'Hâlâ eşit',
    body:
      'Tek kart, tek soru. Doğru oyuncuyu seçen kazanır.',
  },
};

export function PhaseTransitionScene({
  phase,
  handSize,
  rounds,
  onContinue,
}: PhaseTransitionSceneProps) {
  const copy = PHASE_COPY[phase];
  return (
    <section className="glass-panel-strong mt-8 flex flex-col items-center gap-6 p-10 text-center">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-gold/20 text-accent-goldHi ring-1 ring-accent-gold/40"
      >
        <TrophyIcon size={32} />
      </motion.div>

      <div className="rounded-full bg-accent-gold/20 px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent-goldHi">
        {copy.chip}
      </div>

      <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
        {copy.title}
      </h2>

      <p className="max-w-md text-white/70">{copy.body}</p>

      <div className="flex gap-3 text-xs text-white/55">
        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
          {handSize} kart
        </span>
        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
          {rounds} tur
        </span>
      </div>

      <button type="button" onClick={onContinue} className="btn-primary">
        <PlayIcon size={14} />
        Devam et
      </button>
    </section>
  );
}
