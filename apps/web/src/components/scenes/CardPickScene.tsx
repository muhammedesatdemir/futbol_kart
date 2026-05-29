'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import type { Player, PlayerSide } from '@futbol-kart/shared-types';
import { SelectablePlayerCard } from '@/components/SelectablePlayerCard';
import { PlayIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { HAND_SIZE as DEFAULT_HAND_SIZE } from '@/lib/gameConstants';

interface CardPickSceneProps {
  side: PlayerSide;
  players: Player[];
  excludedCards?: string[];
  onSubmit: (cards: string[]) => void;
  ctaLabel: string;
  /** Varsayılan: gameConstants.handSize. Uzatma turlarında farklı. */
  handSize?: number;
  /** Sahnenin başlığında geçecek oyuncu adı. Boşsa fallback metin. */
  playerName?: string;
}

export function CardPickScene({
  side,
  players,
  excludedCards = [],
  onSubmit,
  ctaLabel,
  handSize = DEFAULT_HAND_SIZE,
  playerName,
}: CardPickSceneProps) {
  const t = useTranslations('pick');
  const [picked, setPicked] = useState<string[]>([]);

  const available = useMemo(
    () => players.filter((p) => !excludedCards.includes(p.id)),
    [players, excludedCards],
  );

  const toggle = (id: string) => {
    if (picked.includes(id)) {
      setPicked(picked.filter((c) => c !== id));
      return;
    }
    if (picked.length >= handSize) return;
    setPicked([...picked, id]);
  };

  const randomFill = () => {
    const pool = available.filter((p) => !picked.includes(p.id));
    const remaining = handSize - picked.length;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setPicked([...picked, ...shuffled.slice(0, remaining).map((p) => p.id)]);
  };

  const clear = () => setPicked([]);
  const canConfirm = picked.length === handSize;
  const fallbackHeading = side === 'P1' ? t('p1Heading') : t('p2Heading');
  const heading = playerName
    ? `${playerName} — elini hazırla`
    : fallbackHeading;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            {heading}
          </h1>
          <p className="mt-1 text-sm text-white/65">
            {t('subtitle', { count: handSize })}
          </p>
        </div>
        <span
          className={cn(
            'rounded-full px-3 py-1 text-sm font-bold',
            canConfirm
              ? 'bg-accent-gold/20 text-accent-goldHi ring-1 ring-accent-gold/40'
              : 'bg-white/5 text-white/70',
          )}
        >
          {t('selectedOf', { n: picked.length, total: handSize })}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={randomFill}
          disabled={canConfirm}
          className="btn-ghost disabled:opacity-40"
        >
          {t('randomFill')}
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={picked.length === 0}
          className="btn-ghost disabled:opacity-40"
        >
          {t('clear')}
        </button>
        <button
          type="button"
          onClick={() => onSubmit(picked)}
          disabled={!canConfirm}
          className="btn-primary disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-glow-gold"
        >
          <PlayIcon size={14} />
          {ctaLabel}
        </button>
      </div>

      {/* Kart havuzu — saha çerçeveli bölge */}
      <div
        className={cn(
          'relative rounded-2xl border border-white/10 bg-black/30 p-3 sm:p-4',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_60px_rgba(0,0,0,0.4)]',
          'before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl',
          'before:bg-[repeating-linear-gradient(180deg,transparent_0_60px,rgba(255,255,255,0.025)_60px_61px)]',
        )}
      >
        <div className="relative grid grid-cols-3 gap-3 sm:grid-cols-5 sm:gap-4 lg:grid-cols-7">
          {available.map((p) => (
            <SelectablePlayerCard
              key={p.id}
              player={p}
              selected={picked.includes(p.id)}
              disabled={!picked.includes(p.id) && picked.length >= handSize}
              onToggle={() => toggle(p.id)}
            />
          ))}
        </div>
      </div>

      {/* Floating "Maçı başlat" — seçim tamamlandığında sağ-altta sabit, dikkat çeker */}
      <AnimatePresence>
        {canConfirm && (
          <motion.button
            type="button"
            onClick={() => onSubmit(picked)}
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            className={cn(
              'fixed z-40',
              'bottom-5 left-1/2 -translate-x-1/2 sm:bottom-8 sm:left-auto sm:right-8 sm:translate-x-0',
              'inline-flex items-center gap-2 rounded-full',
              'bg-gradient-to-b from-accent-goldHi to-accent-gold',
              'px-7 py-3 text-sm font-bold uppercase tracking-wider text-zinc-900',
              'shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6),0_0_28px_rgba(240,193,75,0.55)]',
              'transition hover:-translate-y-0.5 hover:shadow-[0_14px_38px_-10px_rgba(0,0,0,0.7),0_0_42px_rgba(255,215,107,0.75)]',
              'sm:translate-x-0 sm:hover:-translate-y-0.5',
            )}
            aria-label={ctaLabel}
          >
            <PlayIcon size={16} />
            {ctaLabel}
          </motion.button>
        )}
      </AnimatePresence>
    </section>
  );
}
