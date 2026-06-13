'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { Confetti } from '@/components/Confetti';
import { useSfx } from '@/lib/useSfx';
import type { CareerSide, CareerWinner } from '@/lib/careerMode';
import type { CareerRoundSummary } from '@/lib/server/careerMatchEngine';

const SIDE = {
  P1: { text: 'text-side-red', bar: 'bg-side-red' },
  P2: { text: 'text-side-blue', bar: 'bg-side-blue' },
} as const;

interface CareerResultSceneProps {
  summaries: CareerRoundSummary[];
  p1Score: number;
  p2Score: number;
  winner: CareerWinner;
  p1Name?: string;
  p2Name?: string;
  onRematch: () => void;
}

/**
 * "Kariyer Yolu" final — kazanan + skor barı + tur-tur döküm (her kariyerin
 * cevabı + kim kaçıncı ipucuda bildi + puan).
 */
export function CareerResultScene({
  summaries,
  p1Score,
  p2Score,
  winner,
  p1Name = 'Sen',
  p2Name = 'Rakip',
  onRematch,
}: CareerResultSceneProps) {
  const playSfx = useSfx();
  const total = p1Score + p2Score;
  const p1Pct = total > 0 ? (p1Score / total) * 100 : 50;
  const winnerName = winner === 'tie' ? null : winner === 'P1' ? p1Name : p2Name;

  useEffect(() => {
    if (winner === 'tie') return;
    const t = setTimeout(() => playSfx('final'), 300);
    return () => clearTimeout(t);
  }, [winner, playSfx]);

  return (
    <section className="flex flex-col items-center gap-6 py-4 text-center">
      <Confetti side={winner} fireKey={`career-${winner}`} />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        className="flex flex-col items-center gap-1"
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">
          {winner === 'tie' ? 'Berabere' : 'Kazanan'}
        </span>
        <h1 className={cn('text-3xl font-black tracking-tight sm:text-4xl', winner === 'tie' ? 'text-white/80' : SIDE[winner as CareerSide].text)}>
          {winner === 'tie' ? 'Eşitlik!' : `${winnerName} 🏆`}
        </h1>
      </motion.div>

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
        {summaries.map((r, i) => (
          <div key={i} className="glass-panel flex items-center justify-between gap-3 rounded-2xl border border-white/10 p-3 text-left">
            <div className="flex min-w-0 flex-col">
              <span className="text-[10px] uppercase tracking-wider text-white/35">Tur {i + 1}</span>
              <span className="truncate text-sm font-bold text-white/90">{r.answerName}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ResultChip side="P1" res={r.p1} />
              <ResultChip side="P2" res={r.p2} />
            </div>
          </div>
        ))}
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

function ResultChip({ side, res }: { side: CareerSide; res: { tier: number; correct: boolean; points: number } }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-black',
        res.correct
          ? side === 'P1'
            ? 'bg-side-red/20 text-side-red ring-1 ring-side-red/40'
            : 'bg-side-blue/20 text-side-blue ring-1 ring-side-blue/40'
          : 'bg-white/5 text-white/35',
      )}
      title={res.correct ? `${res.tier + 1}. ipucuda bildi` : 'bilemedi'}
    >
      +{res.points}
    </span>
  );
}
