'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { type SquadCriterion } from '@/lib/squadMode';

/**
 * Kriter id ön-eki → emoji (görsel ipucu). Üretilen kriterler `sq_{alan}_{yön}`
 * formatında olduğu için alan-anahtarına göre eşleştirilir; bilinmeyen → ⚽.
 */
const EMOJI_BY_KEY: Record<string, string> = {
  tallest: '📏', shortest: '📐', oldest: '🧓', youngest: '👶', lowest: '🔢',
  goals: '⚽', assists: '🅰️', apps: '🏟️', caps: '🌍', natgoals: '🎯',
  seasongoals: '🔥', career: '⏳', value: '💰', height: '📏',
  uclapps: '⭐', uclgoals: '🌟', leaguegoals: '🥅', leagueapps: '📋',
  wcapps: '🏆', trophies: '🏆', leaguetitles: '🥇', awards: '🏅',
};

function emojiFor(id: string): string {
  // id: "sq_<alan>_<yön>[_<filtre>]" veya eski "sq_tallest"
  const parts = id.replace(/^sq_/, '').split('_');
  return EMOJI_BY_KEY[parts[0]!] ?? '⚽';
}

interface SquadCriterionSelectSceneProps {
  /** Gösterilecek kriterler (page bir alt-küme verir; tümü değil). */
  criteria: SquadCriterion[];
  onPick: (criterionId: string) => void;
  /** "Rastgele" seçimi: kataloğdan rastgele bir kriter ver. */
  onRandom: () => void;
}

export function SquadCriterionSelectScene({
  criteria,
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
        {criteria.map((c, i) => (
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
        {emojiFor(criterion.id)}
      </span>
      <span className="text-sm font-bold leading-snug">{criterion.title}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
        {criterion.direction === 'max' ? 'En çok' : 'En az'} · {criterion.unit}
      </span>
    </motion.button>
  );
}
