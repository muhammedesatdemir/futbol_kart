'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { cn } from '@/lib/cn';
import { Confetti } from '@/components/Confetti';
import { useSfx } from '@/lib/useSfx';
import type { CommonRoundPair, CommonSide, CommonWinner } from '@/lib/commonMode';

const SIDE = {
  P1: { text: 'text-side-red', bar: 'bg-side-red' },
  P2: { text: 'text-side-blue', bar: 'bg-side-blue' },
} as const;

/** Bir turun final dökümü (çift + iki seçim sonucu). */
export interface CommonRoundSummary {
  pair: CommonRoundPair;
  p1: { playerId: string | null; correct: boolean; points: number };
  p2: { playerId: string | null; correct: boolean; points: number };
}

interface CommonResultSceneProps {
  rounds: CommonRoundSummary[];
  p1Score: number;
  p2Score: number;
  winner: CommonWinner;
  p1Name?: string;
  p2Name?: string;
  playersById: Map<string, Player>;
  onRematch: () => void;
}

/**
 * "Ortak Bul" final — kazanan + skor barı + tur-tur döküm (her çiftin iki tarafça
 * seçilen ortağı + puanı). "Gizliyi kim bildi" geriye dönük görünür.
 */
export function CommonResultScene({
  rounds,
  p1Score,
  p2Score,
  winner,
  p1Name = 'Sen',
  p2Name = 'Rakip',
  playersById,
  onRematch,
}: CommonResultSceneProps) {
  const playSfx = useSfx();
  const total = p1Score + p2Score;
  const p1Pct = total > 0 ? (p1Score / total) * 100 : 50;
  const winnerName = winner === 'tie' ? null : winner === 'P1' ? p1Name : p2Name;
  const nameOf = (id: string | null) =>
    id && id !== '__pass' && id !== '__hidden'
      ? playersById.get(id)?.displayName ?? id
      : '—';

  useEffect(() => {
    if (winner === 'tie') return;
    const t = setTimeout(() => playSfx('final'), 300);
    return () => clearTimeout(t);
  }, [winner, playSfx]);

  return (
    <section className="flex flex-col items-center gap-6 py-4 text-center">
      <Confetti side={winner} fireKey={`common-${winner}`} />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        className="flex flex-col items-center gap-1"
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">
          {winner === 'tie' ? 'Berabere' : 'Kazanan'}
        </span>
        <h1 className={cn('text-3xl font-black tracking-tight sm:text-4xl', winner === 'tie' ? 'text-white/80' : SIDE[winner as CommonSide].text)}>
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
        {rounds.map((r, i) => (
          <div key={i} className="glass-panel flex flex-col gap-2 rounded-2xl border border-white/10 p-3 text-left">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white/70">
                {r.pair.aName} <span className="text-white/35">×</span> {r.pair.bName}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-white/35">Tur {i + 1}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ResultRow name={p1Name} side="P1" pick={r.p1} nameOf={nameOf} />
              <ResultRow name={p2Name} side="P2" pick={r.p2} nameOf={nameOf} />
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

function ResultRow({
  name,
  side,
  pick,
  nameOf,
}: {
  name: string;
  side: CommonSide;
  pick: { playerId: string | null; correct: boolean; points: number };
  nameOf: (id: string | null) => string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
      <div className="flex min-w-0 flex-col">
        <span className={cn('text-[10px] font-bold uppercase tracking-wider', SIDE[side].text)}>{name}</span>
        <span className="truncate text-sm font-semibold">{nameOf(pick.playerId)}</span>
      </div>
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-xs font-black',
          pick.correct
            ? 'bg-accent-gold/20 text-accent-goldHi ring-1 ring-accent-goldHi/40'
            : 'bg-white/5 text-white/40',
        )}
      >
        +{pick.points}
      </span>
    </div>
  );
}
