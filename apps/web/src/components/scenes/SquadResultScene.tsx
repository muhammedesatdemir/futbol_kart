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
  type Formation,
  type SquadAssignment,
  type SquadCriterion,
  type SquadWinner,
  scoreSquad,
} from '@/lib/squadMode';

interface SquadResultSceneProps {
  formation: Formation;
  criterion: SquadCriterion;
  p1Assignment: SquadAssignment;
  p2Assignment: SquadAssignment;
  p1Name: string;
  p2Name: string;
  winner: SquadWinner;
  playersById: Map<string, Player>;
  onRematch: () => void;
}

/** Reveal sırası: slotlar FOR→KL (sahaya benzer dikey). */
const REVEAL_ORDER: Array<Player['position']> = ['FWD', 'MID', 'DEF', 'GK'];

/**
 * Sonuç ekranı — iki kadro saha düzeninde yan yana, oyuncular SIRAYLA açılır
 * (her ikisi de aynı anda: P1 sol, P2 sağ), toplamlar açılan oyuncuların
 * değeriyle artar. Son oyuncudan sonra kazanan + konfeti + fanfar (VS mantığı).
 */
export function SquadResultScene({
  formation,
  criterion,
  p1Assignment,
  p2Assignment,
  p1Name,
  p2Name,
  winner,
  playersById,
  onRematch,
}: SquadResultSceneProps) {
  const playSfx = useSfx();

  // Reveal sırasına göre slot dizisi.
  const orderedSlots = useMemo(() => {
    const out: typeof formation.slots = [];
    for (const pos of REVEAL_ORDER) {
      for (const s of formation.slots) if (s.position === pos) out.push(s);
    }
    return out;
  }, [formation.slots]);

  const p1Score = scoreSquad(p1Assignment, formation, criterion, playersById);
  const p2Score = scoreSquad(p2Assignment, formation, criterion, playersById);

  // Kaç oyuncu açıldı (0..slots). Her adımda iki tarafın o slotu birden açılır.
  const [revealed, setRevealed] = useState(0);
  const done = revealed >= orderedSlots.length;

  // Sıralı açılım: bir slot çifti aç + flip sesi. 1.6× yavaşlatıldı
  // (aralık 850→1350ms) — daha dramatik, 11 oyuncuyla toplam ~15sn.
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => {
      setRevealed((r) => r + 1);
      playSfx('flip');
    }, revealed === 0 ? 700 : 1350);
    return () => clearTimeout(t);
  }, [revealed, done, playSfx]);

  // Açılan slotlara kadar olan kısmi toplam (count-up hedefi).
  const partial = (score: typeof p1Score, upto: number) =>
    orderedSlots.slice(0, upto).reduce((sum, slot) => {
      const cell = score.perSlot.find((c) => c.slotId === slot.id);
      return sum + (cell?.value ?? 0);
    }, 0);

  const p1Partial = partial(p1Score, revealed);
  const p2Partial = partial(p2Score, revealed);

  // Final fanfarı + konfeti: tüm oyuncular açılınca, beraberlik değilse.
  useEffect(() => {
    if (!done) return;
    if (winner !== 'tie') {
      const t = setTimeout(() => playSfx('final'), 250);
      return () => clearTimeout(t);
    }
  }, [done, winner, playSfx]);

  const winnerName =
    winner === 'tie' ? 'Berabere' : winner === 'P1' ? p1Name : p2Name;
  const confettiSide = winner === 'tie' ? 'tie' : winner;

  return (
    <section className="flex flex-col items-center gap-6 pb-10">
      {done && (
        <Confetti side={confettiSide} fireKey={`squad-${winner}-${p1Score.total}-${p2Score.total}`} />
      )}

      {/* Başlık — açılım bitince kazanan, öncesinde kriter + "açılıyor". */}
      <header className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-white/45">
          {criterion.title}
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
                winner === 'tie' ? 'text-white' : 'text-accent-goldHi drop-shadow-[0_0_30px_rgba(255,213,74,0.5)]',
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

      {/* İki saha yan yana */}
      <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-2">
        <SquadField
          name={p1Name}
          total={p1Partial}
          finalTotal={p1Score.total}
          done={done}
          unit={criterion.unit}
          win={done && winner === 'P1'}
          formation={formation}
          criterion={criterion}
          orderedSlots={orderedSlots}
          assignment={p1Assignment}
          playersById={playersById}
          revealed={revealed}
          align="left"
        />
        <SquadField
          name={p2Name}
          total={p2Partial}
          finalTotal={p2Score.total}
          done={done}
          unit={criterion.unit}
          win={done && winner === 'P2'}
          formation={formation}
          criterion={criterion}
          orderedSlots={orderedSlots}
          assignment={p2Assignment}
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

function SquadField({
  name,
  total,
  finalTotal,
  done,
  unit,
  win,
  formation,
  criterion,
  orderedSlots,
  assignment,
  playersById,
  revealed,
  align,
}: {
  name: string;
  total: number;
  finalTotal: number;
  done: boolean;
  unit: string;
  win: boolean;
  formation: Formation;
  criterion: SquadCriterion;
  orderedSlots: Formation['slots'];
  assignment: SquadAssignment;
  playersById: Map<string, Player>;
  revealed: number;
  align: 'left' | 'right';
}) {
  // Reveal index map: slotId → açılım sırası (0-based).
  const revealIndex = new Map(orderedSlots.map((s, i) => [s.id, i]));
  const rows = REVEAL_ORDER.map((pos) =>
    formation.slots.filter((s) => s.position === pos),
  ).filter((r) => r.length > 0);

  return (
    <motion.div
      className={cn(
        'glass-panel relative flex flex-col gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-950/25 p-4',
        win && 'ring-2 ring-accent-goldHi shadow-glow-gold',
      )}
      animate={win ? { scale: [1, 1.02, 1] } : {}}
      transition={{ duration: 0.5 }}
    >
      <div className={cn('flex items-baseline justify-between', align === 'right' && 'flex-row-reverse')}>
        <h3 className="text-base font-bold">{name}</h3>
        <div className="text-2xl font-black tabular-nums text-accent-goldHi">
          {done ? (
            <CountUp target={finalTotal} durationMs={600} />
          ) : (
            total
          )}
          <span className="ml-1 text-xs font-semibold text-white/50">{unit}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:gap-2.5">
        {rows.map((row, i) => (
          <div key={i} className="flex justify-center gap-1.5">
            {row.map((slot) => {
              const pid = assignment[slot.id];
              const player = pid ? playersById.get(pid) : undefined;
              const idx = revealIndex.get(slot.id) ?? 99;
              const isOpen = revealed > idx;
              // Bu oyuncunun bu kriterdeki katkısı (eksik veri → 0).
              const value = player ? criterion.metric(player) ?? 0 : 0;
              return (
                // Esnek genişlik: 4 DEF yan yana iki sahada sığsın. Büyütüldü
                // (~58→72px) + rozetler gizli (yüz okunsun, ekrana sığsın).
                <div key={slot.id} className="flex min-w-0 flex-1 flex-col items-center gap-1" style={{ maxWidth: 72 }}>
                  <AnimatePresence mode="wait">
                    {isOpen && player ? (
                      <motion.div
                        key="open"
                        initial={{ rotateY: 90, opacity: 0 }}
                        animate={{ rotateY: 0, opacity: 1 }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                        className="flex w-full flex-col items-center gap-1"
                      >
                        <PlayerCard player={player} size="squad" hideBadges className="w-full" />
                        {/* Oyuncunun bu kriterdeki istatistik katkısı (toplam ayrı, üstte). */}
                        <span className="rounded-full bg-accent-gold/20 px-1.5 py-0.5 text-[10px] font-black tabular-nums leading-none text-accent-goldHi ring-1 ring-accent-goldHi/40">
                          {value}
                        </span>
                      </motion.div>
                    ) : (
                      <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[10px] text-white/40">
                        {slot.label}
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
