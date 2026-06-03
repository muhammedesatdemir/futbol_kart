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
  type TargetCriterion,
  type TargetPicks,
  type TargetWinner,
  scoreTarget,
  targetDistance,
} from '@/lib/targetMode';

interface TargetResultSceneProps {
  criterion: TargetCriterion;
  target: number;
  p1Picks: TargetPicks;
  p2Picks: TargetPicks;
  p1Name: string;
  p2Name: string;
  winner: TargetWinner;
  playersById: Map<string, Player>;
  onRematch: () => void;
}

/**
 * Hedefe Yaklaş — sonuç ekranı. Ortada büyük HEDEF, iki yanda taraflar; her
 * tarafın 5 kartı SIRAYLA açılır (flip + ses), toplam count-up ile dolar.
 * Açılım bitince her tarafın hedefe UZAKLIĞI rozetle gösterilir, kazanan
 * (daha yakın) altın ring + konfeti + fanfar.
 */
export function TargetResultScene({
  criterion,
  target,
  p1Picks,
  p2Picks,
  p1Name,
  p2Name,
  winner,
  playersById,
  onRematch,
}: TargetResultSceneProps) {
  const playSfx = useSfx();

  const p1Score = useMemo(
    () => scoreTarget(p1Picks, criterion, playersById),
    [p1Picks, criterion, playersById],
  );
  const p2Score = useMemo(
    () => scoreTarget(p2Picks, criterion, playersById),
    [p2Picks, criterion, playersById],
  );

  // Kaç kart açıldı (0..5). Her adımda iki tarafın o slotu birden açılır.
  const [revealed, setRevealed] = useState(0);
  const done = revealed >= p1Picks.length;

  // Sıralı açılım + flip sesi (Squad sonucu ile aynı tempo).
  useEffect(() => {
    if (done) return;
    const t = setTimeout(
      () => {
        setRevealed((r) => r + 1);
        playSfx('flip');
      },
      revealed === 0 ? 700 : 1100,
    );
    return () => clearTimeout(t);
  }, [revealed, done, playSfx]);

  const partial = (score: typeof p1Score, upto: number) =>
    score.perPick.slice(0, upto).reduce((sum, c) => sum + c.value, 0);

  const p1Partial = partial(p1Score, revealed);
  const p2Partial = partial(p2Score, revealed);

  // Fanfar + konfeti: açılım bitince, berabere değilse.
  useEffect(() => {
    if (!done) return;
    if (winner !== 'tie') {
      const t = setTimeout(() => playSfx('final'), 250);
      return () => clearTimeout(t);
    }
  }, [done, winner, playSfx]);

  const winnerName = winner === 'tie' ? 'Berabere' : winner === 'P1' ? p1Name : p2Name;
  const confettiSide = winner === 'tie' ? 'tie' : winner;

  const d1 = targetDistance(p1Score.total, target);
  const d2 = targetDistance(p2Score.total, target);

  return (
    <section className="flex flex-col items-center gap-6 pb-10">
      {done && (
        <Confetti
          side={confettiSide}
          fireKey={`target-${winner}-${p1Score.total}-${p2Score.total}`}
        />
      )}

      <header className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-white/45">
          🎯 {criterion.title} · Hedef {target}
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
              Kadrolar açılıyor…
            </motion.h1>
          )}
        </AnimatePresence>
      </header>

      {/* 3 bölge: sol toplam | ortada hedef | sağ toplam */}
      <div className="grid w-full max-w-4xl grid-cols-[1fr_auto_1fr] items-start gap-3 sm:gap-5">
        <TargetSide
          name={p1Name}
          total={done ? p1Score.total : p1Partial}
          finalTotal={p1Score.total}
          distance={d1}
          done={done}
          unit={criterion.unit}
          win={done && winner === 'P1'}
          picks={p1Picks}
          playersById={playersById}
          revealed={revealed}
          align="left"
        />

        {/* Ortadaki hedef sütunu */}
        <div className="flex flex-col items-center gap-1 self-center px-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
            Hedef
          </span>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-accent-gold/50 bg-gradient-to-b from-zinc-900 to-black text-3xl font-black tabular-nums text-accent-goldHi shadow-[0_0_25px_rgba(255,213,74,0.35)] sm:h-20 sm:w-20 sm:text-4xl">
            {target}
          </div>
          <span className="mt-0.5 text-[10px] font-semibold text-white/40">
            {criterion.unit}
          </span>
        </div>

        <TargetSide
          name={p2Name}
          total={done ? p2Score.total : p2Partial}
          finalTotal={p2Score.total}
          distance={d2}
          done={done}
          unit={criterion.unit}
          win={done && winner === 'P2'}
          picks={p2Picks}
          playersById={playersById}
          revealed={revealed}
          align="right"
        />
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

function TargetSide({
  name,
  total,
  finalTotal,
  distance,
  done,
  unit,
  win,
  picks,
  playersById,
  revealed,
  align,
}: {
  name: string;
  total: number;
  finalTotal: number;
  distance: number;
  done: boolean;
  unit: string;
  win: boolean;
  picks: TargetPicks;
  playersById: Map<string, Player>;
  revealed: number;
  align: 'left' | 'right';
}) {
  return (
    <motion.div
      className={cn(
        'glass-panel relative flex flex-col gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-950/25 p-3 sm:p-4',
        win && 'ring-2 ring-accent-goldHi shadow-glow-gold',
      )}
      animate={win ? { scale: [1, 1.02, 1] } : {}}
      transition={{ duration: 0.5 }}
    >
      <div className={cn('flex items-baseline justify-between gap-2', align === 'right' && 'flex-row-reverse')}>
        <h3 className="truncate text-sm font-bold sm:text-base">{name}</h3>
        <div className="text-2xl font-black tabular-nums text-accent-goldHi">
          {done ? <CountUp target={finalTotal} durationMs={600} /> : total}
          <span className="ml-1 text-xs font-semibold text-white/50">{unit}</span>
        </div>
      </div>

      {/* Hedefe uzaklık rozeti — açılım bitince. */}
      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 240, damping: 18 }}
            className={cn(
              'self-center whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider',
              win
                ? 'bg-accent-gold/20 text-accent-goldHi ring-1 ring-accent-goldHi/50'
                : 'bg-white/8 text-white/60',
            )}
          >
            {distance === 0 ? 'Tam isabet! 🎯' : `${distance} uzak`}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5 kart tek satır (sığması için min genişlik kıs). */}
      <div className="flex justify-center gap-1 sm:gap-1.5">
        {picks.map((pid, idx) => {
          const player = pid ? playersById.get(pid) : undefined;
          const isOpen = revealed > idx;
          return (
            <div
              key={idx}
              className="flex min-w-0 flex-1 flex-col items-center"
              style={{ maxWidth: 64 }}
            >
              <AnimatePresence mode="wait">
                {isOpen && player ? (
                  <motion.div
                    key="open"
                    initial={{ rotateY: 90, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full"
                  >
                    <PlayerCard player={player} size="squad" hideBadges className="w-full" />
                  </motion.div>
                ) : (
                  <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[10px] text-white/40">
                    {idx + 1}
                  </div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
