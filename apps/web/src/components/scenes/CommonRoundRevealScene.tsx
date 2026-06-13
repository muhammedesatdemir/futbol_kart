'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { cn } from '@/lib/cn';
import { useSfx } from '@/lib/useSfx';
import { CommonPairHeader } from './CommonPairHeader';
import type { CommonRoundPair, CommonSide } from '@/lib/commonMode';

const SIDE = {
  P1: { text: 'text-side-red', border: 'border-side-red/60', glow: 'shadow-[0_0_22px_rgba(239,68,68,0.4)]' },
  P2: { text: 'text-side-blue', border: 'border-side-blue/60', glow: 'shadow-[0_0_22px_rgba(59,130,246,0.4)]' },
} as const;

/** Bir tarafın bu turdaki açılmış sonucu. */
export interface RevealSelection {
  playerId: string | null;
  correct: boolean;
  points: number;
}

interface CommonRoundRevealSceneProps {
  pair: CommonRoundPair;
  roundNo: number;
  totalRounds: number;
  p1: RevealSelection;
  p2: RevealSelection;
  p1Name?: string;
  p2Name?: string;
  /** Güncel toplam skorlar (bu tur dahil). */
  p1Score: number;
  p2Score: number;
  playersById: Map<string, Player>;
  autoMs?: number;
  onDone: () => void;
}

/**
 * "Ortak Bul" TUR SONUCU — iki seçim + nadirlik PUANLARI BİRLİKTE açılır. Modun
 * en tatlı anı: "ben bariz olanı buldum (+1), rakip gizliyi bilmiş (+3)". Doğru
 * seçim yeşil + puan rozeti; yanlış/pas kırmızı "0".
 */
export function CommonRoundRevealScene({
  pair,
  roundNo,
  totalRounds,
  p1,
  p2,
  p1Name = 'Sen',
  p2Name = 'Rakip',
  p1Score,
  p2Score,
  playersById,
  autoMs,
  onDone,
}: CommonRoundRevealSceneProps) {
  const playSfx = useSfx();

  useEffect(() => {
    // Sonuç sesi — en az biri doğruysa "win", ikisi de yanlışsa "heartbreak".
    const t = setTimeout(() => playSfx(p1.correct || p2.correct ? 'win' : 'heartbreak'), 250);
    return () => clearTimeout(t);
  }, [p1.correct, p2.correct, playSfx]);

  useEffect(() => {
    if (!autoMs) return;
    const t = setTimeout(onDone, autoMs);
    return () => clearTimeout(t);
  }, [autoMs, onDone]);

  return (
    <section className="flex flex-col items-center gap-5 py-4 text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-accent-gold/30 bg-accent-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-goldHi">
        Tur {roundNo}/{totalRounds} sonucu
      </span>

      <CommonPairHeader pair={pair} compact />

      <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        <RevealCard sel={p1} name={p1Name} side="P1" playersById={playersById} delay={0} />
        <RevealCard sel={p2} name={p2Name} side="P2" playersById={playersById} delay={0.12} />
      </div>

      {/* Güncel skor */}
      <div className="flex items-center gap-3 text-sm font-bold">
        <span className={SIDE.P1.text}>{p1Name} · {p1Score}</span>
        <span className="text-white/40">—</span>
        <span className={SIDE.P2.text}>{p2Score} · {p2Name}</span>
      </div>

      {autoMs ? (
        <p className="text-xs text-white/45">
          {roundNo >= totalRounds ? 'Sonuçlara geçiliyor…' : 'Sonraki tur birazdan…'}
        </p>
      ) : (
        <motion.button
          type="button"
          onClick={onDone}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="btn-primary px-8 py-3 text-base"
        >
          {roundNo >= totalRounds ? 'Sonucu gör →' : 'Sonraki tur →'}
        </motion.button>
      )}
    </section>
  );
}

function RevealCard({
  sel,
  name,
  side,
  playersById,
  delay,
}: {
  sel: RevealSelection;
  name: string;
  side: CommonSide;
  playersById: Map<string, Player>;
  delay: number;
}) {
  const player = sel.playerId ? playersById.get(sel.playerId) : null;
  const passed = !sel.playerId || sel.playerId === '__pass' || sel.playerId === '__hidden';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 240, damping: 20 }}
      className={cn(
        'glass-panel flex flex-col items-center gap-3 rounded-2xl border p-4',
        sel.correct ? cn(SIDE[side].border, SIDE[side].glow) : 'border-white/12',
      )}
    >
      <span className={cn('text-sm font-black', SIDE[side].text)}>{name}</span>

      {player ? (
        <PlayerCard player={player} className="w-32" />
      ) : (
        <div className="flex h-40 w-32 items-center justify-center rounded-xl border border-dashed border-white/15 text-3xl text-white/30">
          {passed ? '⏱' : '—'}
        </div>
      )}

      {sel.correct ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-gold/20 px-3 py-1 text-sm font-black text-accent-goldHi ring-1 ring-accent-goldHi/40">
          ✓ Doğru ortak · +{sel.points}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-side-red/15 px-3 py-1 text-sm font-bold text-side-red">
          {passed ? 'Seçim yok' : 'Ortak değil'} · 0
        </span>
      )}
    </motion.div>
  );
}
