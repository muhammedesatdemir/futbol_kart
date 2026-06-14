'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { cn } from '@/lib/cn';
import type { QuizSide } from '@/lib/quizMode';

const SIDE = {
  P1: { text: 'text-side-red', dot: 'bg-side-red', border: 'border-side-red/70' },
  P2: { text: 'text-side-blue', dot: 'bg-side-blue', border: 'border-side-blue/70' },
} as const;

interface QuizRoundRevealSceneProps {
  choices: Player[];
  /** Her oyuncunun metrikteki değeri (choices ile aynı sıra). */
  values: number[];
  correctIndex: number;
  metricLabel: string;
  metricUnit: string;
  roundNo: number;
  totalRounds: number;
  /** Bir tarafın bu turdaki seçimi (index'ler) — null/boş = pas. */
  p1Indexes: number[] | null;
  p2Indexes: number[] | null;
  p1Correct: boolean;
  p2Correct: boolean;
  p1Name?: string;
  p2Name?: string;
  p1Score: number;
  p2Score: number;
  autoMs?: number;
  onDone: () => void;
}

/**
 * "4'lü Kıyas" tur sonucu — 4 kartın GERÇEK değerleri açılır, doğru cevap (en
 * yüksek) altın çerçeveyle parlar, her tarafın seçtiği kart(lar) renkli noktayla
 * işaretlenir + "+1/0" rozeti. autoMs → otomatik ilerler (online/bot).
 */
export function QuizRoundRevealScene({
  choices,
  values,
  correctIndex,
  metricLabel,
  metricUnit,
  roundNo,
  totalRounds,
  p1Indexes,
  p2Indexes,
  p1Correct,
  p2Correct,
  p1Name = 'Sen',
  p2Name = 'Rakip',
  p1Score,
  p2Score,
  autoMs,
  onDone,
}: QuizRoundRevealSceneProps) {
  useEffect(() => {
    if (!autoMs) return;
    const t = setTimeout(onDone, autoMs);
    return () => clearTimeout(t);
  }, [autoMs, onDone]);

  const p1Set = new Set(p1Indexes ?? []);
  const p2Set = new Set(p2Indexes ?? []);

  return (
    <section className="flex flex-col items-center gap-5 py-4 text-center">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-1">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-gold/30 bg-accent-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-goldHi">
          Tur {roundNo}/{totalRounds} sonucu
        </span>
        <h2 className="text-lg font-black sm:text-xl">
          En çok <span className="text-accent-goldHi">{metricLabel.toLocaleLowerCase('tr-TR')}</span>
        </h2>
      </motion.div>

      {/* 4 kart + değer + işaretler */}
      <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {choices.map((p, idx) => {
          const isCorrect = idx === correctIndex;
          const byP1 = p1Set.has(idx);
          const byP2 = p2Set.has(idx);
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 * idx, type: 'spring', stiffness: 220, damping: 20 }}
              className={cn(
                'relative flex flex-col gap-2 rounded-xl p-1',
                isCorrect && 'ring-4 ring-accent-goldHi/70',
              )}
            >
              <div className="relative">
                <PlayerCard player={p} className="w-full" hideBadges />
                {isCorrect && (
                  <span className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-accent-gold px-2 py-0.5 text-[10px] font-black text-slate-900 shadow" aria-hidden>
                    👑 EN ÇOK
                  </span>
                )}
                {/* Seçim noktaları (kim seçti) */}
                <div className="absolute -bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1">
                  {byP1 && <span className={cn('h-4 w-4 rounded-full ring-2 ring-slate-900', SIDE.P1.dot)} title={p1Name} aria-hidden />}
                  {byP2 && <span className={cn('h-4 w-4 rounded-full ring-2 ring-slate-900', SIDE.P2.dot)} title={p2Name} aria-hidden />}
                </div>
              </div>
              <span className={cn('text-sm font-black tabular-nums', isCorrect ? 'text-accent-goldHi' : 'text-white/70')}>
                {values[idx] ?? 0} {metricUnit}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* İki tarafın sonucu + skor */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <ResultPill name={p1Name} side="P1" correct={p1Correct} passed={!p1Indexes || p1Indexes[0] === -1} score={p1Score} />
        <ResultPill name={p2Name} side="P2" correct={p2Correct} passed={!p2Indexes || p2Indexes[0] === -1} score={p2Score} />
      </div>

      {!autoMs && (
        <motion.button type="button" onClick={onDone} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="btn-primary px-8 py-2.5">
          Devam →
        </motion.button>
      )}
    </section>
  );
}

function ResultPill({
  name,
  side,
  correct,
  passed,
  score,
}: {
  name: string;
  side: QuizSide;
  correct: boolean;
  passed: boolean;
  score: number;
}) {
  return (
    <div className={cn('flex items-center gap-2 rounded-2xl border px-3 py-1.5', SIDE[side].border)}>
      <span className={cn('h-2.5 w-2.5 rounded-full', SIDE[side].dot)} aria-hidden />
      <span className={cn('text-sm font-bold', SIDE[side].text)}>{name}</span>
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-xs font-black',
          correct ? 'bg-accent-gold/20 text-accent-goldHi ring-1 ring-accent-goldHi/40' : 'bg-white/5 text-white/40',
        )}
      >
        {passed ? 'pas' : correct ? '✓ +1' : '✗ +0'}
      </span>
      <span className="text-base font-black tabular-nums text-white/80">· {score}</span>
    </div>
  );
}
