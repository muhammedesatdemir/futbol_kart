'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { cn } from '@/lib/cn';
import { Confetti } from '@/components/Confetti';
import { useSfx } from '@/lib/useSfx';
import type { QuizSide, QuizWinner } from '@/lib/quizMode';

const SIDE = {
  P1: { text: 'text-side-red', bar: 'bg-side-red', dot: 'bg-side-red' },
  P2: { text: 'text-side-blue', bar: 'bg-side-blue', dot: 'bg-side-blue' },
} as const;

/** Bir turun final dökümü. */
export interface QuizRoundSummary {
  metricLabel: string;
  metricUnit: string;
  choiceIds: string[];
  values: number[];
  correctIndex: number;
  p1Indexes: number[] | null;
  p2Indexes: number[] | null;
  p1Correct: boolean;
  p2Correct: boolean;
}

interface QuizResultSceneProps {
  rounds: QuizRoundSummary[];
  p1Score: number;
  p2Score: number;
  winner: QuizWinner;
  p1Name?: string;
  p2Name?: string;
  playersById: Map<string, Player>;
  onRematch: () => void;
}

/**
 * "4'lü Kıyas" final — kazanan + skor barı + tur-tur döküm (her turun metriği,
 * doğru cevap, iki tarafın seçimi). 7 tur, en çok puan kazanır (berabere = berabere).
 */
export function QuizResultScene({
  rounds,
  p1Score,
  p2Score,
  winner,
  p1Name = 'Sen',
  p2Name = 'Rakip',
  playersById,
  onRematch,
}: QuizResultSceneProps) {
  const playSfx = useSfx();
  const total = p1Score + p2Score;
  const p1Pct = total > 0 ? (p1Score / total) * 100 : 50;
  const winnerName = winner === 'tie' ? null : winner === 'P1' ? p1Name : p2Name;
  const nameOf = (id: string | undefined) =>
    id ? playersById.get(id)?.displayName ?? id : '—';

  useEffect(() => {
    if (winner === 'tie') return;
    const t = setTimeout(() => playSfx('final'), 300);
    return () => clearTimeout(t);
  }, [winner, playSfx]);

  return (
    <section className="flex flex-col items-center gap-6 py-4 text-center">
      <Confetti side={winner} fireKey={`quiz-${winner}`} />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        className="flex flex-col items-center gap-1"
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">
          {winner === 'tie' ? 'Berabere' : 'Kazanan'}
        </span>
        <h1 className={cn('text-3xl font-black tracking-tight sm:text-4xl', winner === 'tie' ? 'text-white/80' : SIDE[winner as QuizSide].text)}>
          {winner === 'tie' ? 'Eşitlik!' : `${winnerName} 🏆`}
        </h1>
      </motion.div>

      {/* Skor barı */}
      <div className="flex w-full max-w-md flex-col gap-2">
        <div className="flex items-center justify-between text-sm font-bold">
          <span className={SIDE.P1.text}>{p1Name} · {p1Score}</span>
          <span className={SIDE.P2.text}>{p2Score} · {p2Name}</span>
        </div>
        <div className="flex h-4 overflow-hidden rounded-full border border-white/10 bg-white/5">
          <motion.div className={SIDE.P1.bar} initial={{ width: '50%' }} animate={{ width: `${p1Pct}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
          <div className={cn('flex-1', SIDE.P2.bar)} />
        </div>
      </div>

      {/* Tur-tur döküm */}
      <div className="flex w-full max-w-2xl flex-col gap-2">
        {rounds.map((r, i) => {
          const correctId = r.choiceIds[r.correctIndex];
          return (
            <div key={i} className="glass-panel flex flex-col gap-2 rounded-2xl border border-white/10 p-3 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white/70">{r.metricLabel}</span>
                <span className="text-[10px] uppercase tracking-wider text-white/35">Tur {i + 1}</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-accent-gold/10 px-2.5 py-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent-goldHi">👑 En çok</span>
                <span className="truncate text-sm font-bold">{nameOf(correctId)}</span>
                <span className="ml-auto shrink-0 text-xs font-black tabular-nums text-accent-goldHi">
                  {r.values[r.correctIndex] ?? 0} {r.metricUnit}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <PickRow name={p1Name} side="P1" indexes={r.p1Indexes} correct={r.p1Correct} choiceIds={r.choiceIds} nameOf={nameOf} />
                <PickRow name={p2Name} side="P2" indexes={r.p2Indexes} correct={r.p2Correct} choiceIds={r.choiceIds} nameOf={nameOf} />
              </div>
            </div>
          );
        })}
      </div>

      <motion.button
        type="button"
        onClick={onRematch}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="btn-primary px-8 py-3 text-base"
      >
        Tekrar oyna
      </motion.button>
    </section>
  );
}

function PickRow({
  name,
  side,
  indexes,
  correct,
  choiceIds,
  nameOf,
}: {
  name: string;
  side: QuizSide;
  indexes: number[] | null;
  correct: boolean;
  choiceIds: string[];
  nameOf: (id: string | undefined) => string;
}) {
  const passed = !indexes || indexes[0] === -1;
  const picks = (indexes ?? []).filter((i) => i >= 0).map((i) => nameOf(choiceIds[i]));
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
      <div className="flex min-w-0 flex-col">
        <span className={cn('text-[10px] font-bold uppercase tracking-wider', SIDE[side].text)}>{name}</span>
        <span className="truncate text-sm font-semibold">{passed ? '— (pas)' : picks.join(' / ')}</span>
      </div>
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-xs font-black',
          correct ? 'bg-accent-gold/20 text-accent-goldHi ring-1 ring-accent-goldHi/40' : 'bg-white/5 text-white/40',
        )}
      >
        {correct ? '+1' : '+0'}
      </span>
    </div>
  );
}
