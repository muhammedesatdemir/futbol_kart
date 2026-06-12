'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { Confetti } from '@/components/Confetti';
import { SquaresGrid } from './SquaresGrid';
import {
  type SquaresGrid as GridData,
  type SquaresSide,
  type SquaresWinner,
} from '@/lib/squaresMode';

interface SquaresResultSceneProps {
  grid: GridData;
  scores: { P1: number; P2: number };
  winner: SquaresWinner;
  p1Name?: string;
  p2Name?: string;
  onRematch: () => void;
}

const SIDE = {
  P1: { text: 'text-side-red', bar: 'bg-side-red', border: 'border-side-red/60' },
  P2: { text: 'text-side-blue', bar: 'bg-side-blue', border: 'border-side-blue/60' },
} as const;

/**
 * "Kareleri Kap" sonuç — kazanan duyurusu + nihai matris (hangi kareyi kim
 * kaptı, renkli) + kapatılan kare skorları. Beraberlikte tie.
 */
export function SquaresResultScene({
  grid,
  scores,
  winner,
  p1Name = 'Sen',
  p2Name = 'Bot',
  onRematch,
}: SquaresResultSceneProps) {
  const winnerName =
    winner === 'tie' ? null : winner === 'P1' ? p1Name : p2Name;
  const total = scores.P1 + scores.P2;
  const p1Pct = total > 0 ? (scores.P1 / total) * 100 : 50;

  return (
    <section className="flex flex-col items-center gap-6 py-4 text-center">
      <Confetti side={winner} fireKey={`squares-${winner}`} />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        className="flex flex-col items-center gap-1"
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">
          {winner === 'tie' ? 'Berabere' : 'Kazanan'}
        </span>
        <h1
          className={cn(
            'text-3xl font-black tracking-tight sm:text-4xl',
            winner === 'tie' ? 'text-white/80' : SIDE[winner as SquaresSide].text,
          )}
        >
          {winner === 'tie' ? 'Eşitlik!' : `${winnerName} 🏆`}
        </h1>
      </motion.div>

      {/* Skor barı — kapatılan kare oranı. */}
      <div className="flex w-full max-w-md flex-col gap-2">
        <div className="flex items-center justify-between text-sm font-bold">
          <span className={SIDE.P1.text}>
            {p1Name} · {scores.P1}
          </span>
          <span className={SIDE.P2.text}>
            {scores.P2} · {p2Name}
          </span>
        </div>
        <div className="flex h-4 overflow-hidden rounded-full border border-white/10 bg-white/5">
          <motion.div
            className={SIDE.P1.bar}
            initial={{ width: '50%' }}
            animate={{ width: `${p1Pct}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
          <div className={cn('flex-1', SIDE.P2.bar)} />
        </div>
      </div>

      {/* Nihai matris — hangi kareyi kim kaptı. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="w-full"
      >
        <SquaresGrid grid={grid} compact />
      </motion.div>

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
