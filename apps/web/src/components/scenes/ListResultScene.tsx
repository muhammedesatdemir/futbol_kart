'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { CountUp } from '@/components/CountUp';
import { Confetti } from '@/components/Confetti';
import { cn } from '@/lib/cn';
import { useSfx } from '@/lib/useSfx';
import {
  type ListCriterion,
  type ListEntry,
  type ListSide,
  type ListWinner,
  pointsForRank,
} from '@/lib/listMode';

interface ListResultSceneProps {
  criterion: ListCriterion;
  list: ListEntry[];
  /** rank → o sırayı açan taraf. */
  filledBy: Map<number, ListSide>;
  p1Score: number;
  p2Score: number;
  p1Name: string;
  p2Name: string;
  winner: ListWinner;
  playersById: Map<string, Player>;
  onRematch: () => void;
}

/**
 * Liste Doldur — sonuç ekranı. Tam liste (1→10) sıralı açılır; her sıra, onu
 * KİM açtıysa o tarafın rengiyle (kimse açmadıysa "kaçırıldı" gri) gösterilir.
 * Üstte iki tarafın skoru (count-up), kazanan + konfeti + fanfar.
 * Mod 2 reveal mekaniğinin liste-satırı uyarlaması.
 */
export function ListResultScene({
  criterion,
  list,
  filledBy,
  p1Score,
  p2Score,
  p1Name,
  p2Name,
  winner,
  playersById,
  onRematch,
}: ListResultSceneProps) {
  const playSfx = useSfx();

  // Sıralı açılım: 1→10, her satır flip + ses.
  const [revealed, setRevealed] = useState(0);
  const done = revealed >= list.length;

  useEffect(() => {
    if (done) return;
    const t = setTimeout(
      () => {
        setRevealed((r) => r + 1);
        playSfx('flip');
      },
      revealed === 0 ? 500 : 650,
    );
    return () => clearTimeout(t);
  }, [revealed, done, playSfx]);

  useEffect(() => {
    if (!done) return;
    if (winner !== 'tie') {
      const t = setTimeout(() => playSfx('final'), 250);
      return () => clearTimeout(t);
    }
  }, [done, winner, playSfx]);

  const winnerName = winner === 'tie' ? 'Berabere' : winner === 'P1' ? p1Name : p2Name;
  const confettiSide = winner === 'tie' ? 'tie' : winner;

  // Skor count-up: açılım ilerledikçe kısmi skor.
  const partial = useMemo(() => {
    let s1 = 0;
    let s2 = 0;
    for (const entry of list.slice(0, revealed)) {
      const owner = filledBy.get(entry.rank);
      if (owner === 'P1') s1 += pointsForRank(entry.rank);
      else if (owner === 'P2') s2 += pointsForRank(entry.rank);
    }
    return { s1, s2 };
  }, [list, revealed, filledBy]);

  return (
    <section className="flex flex-col items-center gap-5 pb-10">
      {done && (
        <Confetti side={confettiSide} fireKey={`list-${winner}-${p1Score}-${p2Score}`} />
      )}

      <header className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-white/45">
          🏆 {criterion.title}
        </p>
        <AnimatePresence mode="wait">
          {done ? (
            <motion.h1
              key="winner"
              initial={{ opacity: 0, scale: 0.85, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 16 }}
              className={cn(
                'mt-1 text-4xl font-black tracking-tight sm:text-5xl',
                winner === 'tie'
                  ? 'text-white'
                  : 'text-accent-goldHi drop-shadow-[0_0_30px_rgba(255,213,74,0.5)]',
              )}
            >
              {winner === 'tie' ? 'Berabere!' : `${winnerName} kazandı!`}
            </motion.h1>
          ) : (
            <motion.h1
              key="revealing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-1 text-3xl font-black tracking-tight text-white/70 sm:text-4xl"
            >
              Liste açılıyor…
            </motion.h1>
          )}
        </AnimatePresence>
      </header>

      {/* Skor bandı */}
      <div className="flex w-full max-w-2xl items-center justify-between gap-4">
        <ScoreChip name={p1Name} score={done ? p1Score : partial.s1} side="P1" win={done && winner === 'P1'} />
        <span className="text-xs font-bold uppercase tracking-wider text-white/40">puan</span>
        <ScoreChip name={p2Name} score={done ? p2Score : partial.s2} side="P2" win={done && winner === 'P2'} align="right" />
      </div>

      {/* Tam liste — kim açtıysa o renk, kimse açmadıysa gri "kaçırıldı". */}
      <div className="glass-panel mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-black/30 p-3 sm:p-4">
        <div className="flex flex-col gap-1.5">
          {list.map((entry, i) => {
            const player = playersById.get(entry.playerId);
            const owner = filledBy.get(entry.rank);
            const open = revealed > i;
            return (
              <div
                key={entry.rank}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-2.5 py-1.5 transition',
                  !open
                    ? 'border-white/5 bg-white/5 opacity-40'
                    : owner === 'P1'
                      ? 'border-side-red/60 bg-side-red/20'
                      : owner === 'P2'
                        ? 'border-side-blue/60 bg-side-blue/20'
                        : 'border-amber-500/40 bg-amber-500/10', // kimse bilemedi
                )}
              >
                <div className="flex w-10 shrink-0 flex-col items-center">
                  <span className="text-lg font-black tabular-nums text-white/80">
                    {entry.rank}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-accent-goldHi/70">
                    {pointsForRank(entry.rank)}p
                  </span>
                </div>
                <AnimatePresence mode="wait">
                  {open ? (
                    <motion.div
                      key="open"
                      initial={{ rotateY: 90, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <div className="w-9 shrink-0">
                        {player && (
                          <PlayerCard player={player} size="squad" hideBadges hideName className="w-full" />
                        )}
                      </div>
                      <span className="truncate text-sm font-bold">
                        {player?.displayName ?? '—'}
                      </span>
                      {/* Kim açtı / kaçırıldı rozeti */}
                      <span
                        className={cn(
                          'ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                          owner === 'P1'
                            ? 'bg-side-red/25 text-side-red'
                            : owner === 'P2'
                              ? 'bg-side-blue/25 text-side-blue'
                              : 'bg-amber-500/20 text-amber-400',
                        )}
                      >
                        {owner ? (owner === 'P1' ? p1Name : p2Name) : 'kimse bilemedi'}
                      </span>
                      <span className="shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-xs font-black tabular-nums text-white/70">
                        {entry.value}
                      </span>
                    </motion.div>
                  ) : (
                    <div className="flex-1 text-sm font-semibold text-white/30">？</div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {done && (
          <motion.button
            type="button"
            onClick={onRematch}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="btn-primary"
          >
            Yeniden oyna
          </motion.button>
        )}
      </AnimatePresence>
    </section>
  );
}

function ScoreChip({
  name,
  score,
  side,
  win,
  align = 'left',
}: {
  name: string;
  score: number;
  side: ListSide;
  win: boolean;
  align?: 'left' | 'right';
}) {
  return (
    <div
      className={cn(
        'flex flex-1 flex-col gap-0.5',
        align === 'right' ? 'items-end text-right' : 'items-start',
        win && 'drop-shadow-[0_0_20px_rgba(255,213,74,0.4)]',
      )}
    >
      <span className={cn('text-sm font-bold', side === 'P1' ? 'text-side-red' : 'text-side-blue')}>
        {name}
      </span>
      <span className="text-3xl font-black tabular-nums text-accent-goldHi sm:text-4xl">
        <CountUp target={score} durationMs={500} />
      </span>
    </div>
  );
}
