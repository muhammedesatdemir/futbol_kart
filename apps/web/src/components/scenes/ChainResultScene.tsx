'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { cn } from '@/lib/cn';
import { Confetti } from '@/components/Confetti';
import { useSfx } from '@/lib/useSfx';
import {
  sideScore,
  type ChainClub,
  type ChainPick,
  type ChainSide,
  type ChainWinner,
} from '@/lib/chainMode';

interface ChainResultSceneProps {
  clubs: ChainClub[];
  p1Picks: ChainPick[];
  p2Picks: ChainPick[];
  winner: ChainWinner;
  p1Name?: string;
  p2Name?: string;
  playersById: Map<string, Player>;
  onRematch: () => void;
}

const SIDE = {
  P1: { text: 'text-side-red', bar: 'bg-side-red', border: 'border-side-red/60' },
  P2: { text: 'text-side-blue', bar: 'bg-side-blue', border: 'border-side-blue/60' },
} as const;

/**
 * "Zincir Kur" sonuç — kazanan + skor barı + her tarafın 5 pick dökümü
 * (futbolcu + kaç puan + hangi kulüpler).
 */
export function ChainResultScene({
  clubs,
  p1Picks,
  p2Picks,
  winner,
  p1Name = 'Sen',
  p2Name = 'Bot',
  playersById,
  onRematch,
}: ChainResultSceneProps) {
  const playSfx = useSfx();
  const p1Score = sideScore(p1Picks);
  const p2Score = sideScore(p2Picks);
  const total = p1Score + p2Score;
  const p1Pct = total > 0 ? (p1Score / total) * 100 : 50;
  const winnerName = winner === 'tie' ? null : winner === 'P1' ? p1Name : p2Name;
  const clubName = (id: string) => clubs.find((c) => c.id === id)?.name ?? id;

  useEffect(() => {
    if (winner === 'tie') return;
    const t = setTimeout(() => playSfx('final'), 300);
    return () => clearTimeout(t);
  }, [winner, playSfx]);

  return (
    <section className="flex flex-col items-center gap-6 py-4 text-center">
      <Confetti side={winner} fireKey={`chain-${winner}`} />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        className="flex flex-col items-center gap-1"
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">
          {winner === 'tie' ? 'Berabere' : 'Kazanan'}
        </span>
        <h1 className={cn('text-3xl font-black tracking-tight sm:text-4xl', winner === 'tie' ? 'text-white/80' : SIDE[winner as ChainSide].text)}>
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

      {/* İki taraf pick dökümü */}
      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        <PickColumn name={p1Name} picks={p1Picks} side="P1" playersById={playersById} clubName={clubName} />
        <PickColumn name={p2Name} picks={p2Picks} side="P2" playersById={playersById} clubName={clubName} />
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

function PickColumn({
  name,
  picks,
  side,
  playersById,
  clubName,
}: {
  name: string;
  picks: ChainPick[];
  side: ChainSide;
  playersById: Map<string, Player>;
  clubName: (id: string) => string;
}) {
  return (
    <div className={cn('glass-panel flex flex-col gap-2 rounded-2xl border p-3 text-left', SIDE[side].border)}>
      <h3 className={cn('text-sm font-black', SIDE[side].text)}>{name}</h3>
      {picks.map((pk, i) => {
        const player = playersById.get(pk.playerId);
        return (
          <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
            <span className="truncate text-sm font-semibold">{player?.displayName ?? pk.playerId}</span>
            <span className="shrink-0 rounded-full bg-accent-gold/20 px-2 py-0.5 text-xs font-black text-accent-goldHi ring-1 ring-accent-goldHi/40">
              +{pk.matchedClubIds.length}
            </span>
          </div>
        );
      })}
      {picks.length === 0 && <p className="px-2 py-3 text-xs text-white/40">Pick yok.</p>}
    </div>
  );
}
