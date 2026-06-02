'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { SQUAD_CRITERIA, type SquadCriterion } from '@/lib/squadMode';

/** Kriter id → emoji (görsel ipucu). Bilinmeyen id için ⚽ fallback. */
const EMOJI: Record<string, string> = {
  sq_tallest: '📏',
  sq_shortest: '📐',
  sq_oldest: '🧓',
  sq_youngest: '👶',
  sq_top_scorer: '⚽',
  sq_top_assist: '🅰️',
  sq_most_apps: '🏟️',
  sq_most_caps: '🌍',
  sq_most_valuable: '💰',
  sq_most_experienced: '⏳',
  sq_most_trophies: '🏆',
  sq_most_ucl: '⭐',
  sq_most_league_goals: '🥅',
  sq_lowest_jersey: '🔢',
};

interface SquadCriterionSelectSceneProps {
  onPick: (criterionId: string) => void;
  /** "Rastgele" seçimi: kataloğdan rastgele bir kriter ver. */
  onRandom: () => void;
}

export function SquadCriterionSelectScene({
  onPick,
  onRandom,
}: SquadCriterionSelectSceneProps) {
  return (
    <section className="flex flex-col gap-6">
      <header className="text-center">
        <span className="inline-block rounded-full border border-accent-gold/40 bg-accent-gold/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-goldHi">
          Kadro Kur
        </span>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
          Hangi kadroyu kuracaksın?
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Bir kriter seç — formasyonu doldur, bota karşı kapış.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SQUAD_CRITERIA.map((c, i) => (
          <CriterionCard key={c.id} criterion={c} delay={i * 0.025} onClick={() => onPick(c.id)} />
        ))}
      </div>

      <button type="button" onClick={onRandom} className="btn-ghost mx-auto">
        🎲 Rastgele kriter
      </button>
    </section>
  );
}

function CriterionCard({
  criterion,
  delay,
  onClick,
}: {
  criterion: SquadCriterion;
  delay: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'glass-panel flex flex-col items-start gap-2 p-4 text-left transition',
        'hover:border-accent-gold/40 hover:bg-white/10',
      )}
    >
      <span className="text-2xl leading-none" aria-hidden>
        {EMOJI[criterion.id] ?? '⚽'}
      </span>
      <span className="text-sm font-bold leading-snug">{criterion.title}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
        {criterion.direction === 'max' ? 'En çok' : 'En az'} · {criterion.unit}
      </span>
    </motion.button>
  );
}
