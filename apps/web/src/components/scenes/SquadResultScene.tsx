'use client';

import { motion } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { cn } from '@/lib/cn';
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
  const p1 = scoreSquad(p1Assignment, formation, criterion, playersById);
  const p2 = scoreSquad(p2Assignment, formation, criterion, playersById);

  const heading =
    winner === 'tie'
      ? 'Berabere!'
      : `${winner === 'P1' ? p1Name : p2Name} kazandı!`;

  return (
    <section className="flex flex-col gap-6">
      <header className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-white/45">
          {criterion.title}
        </p>
        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-1 text-4xl font-black tracking-tight text-accent-goldHi sm:text-5xl"
        >
          {heading}
        </motion.h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <SquadColumn
          name={p1Name}
          total={p1.total}
          unit={criterion.unit}
          win={winner === 'P1'}
          formation={formation}
          assignment={p1Assignment}
          playersById={playersById}
        />
        <SquadColumn
          name={p2Name}
          total={p2.total}
          unit={criterion.unit}
          win={winner === 'P2'}
          formation={formation}
          assignment={p2Assignment}
          playersById={playersById}
        />
      </div>

      <button type="button" onClick={onRematch} className="btn-primary mx-auto">
        Yeniden oyna
      </button>
    </section>
  );
}

function SquadColumn({
  name,
  total,
  unit,
  win,
  formation,
  assignment,
  playersById,
}: {
  name: string;
  total: number;
  unit: string;
  win: boolean;
  formation: Formation;
  assignment: SquadAssignment;
  playersById: Map<string, Player>;
}) {
  return (
    <div
      className={cn(
        'glass-panel flex flex-col gap-3 rounded-2xl p-4',
        win && 'ring-2 ring-accent-goldHi',
      )}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold">{name}</h3>
        <div className="text-2xl font-black tabular-nums text-accent-goldHi">
          {total}
          <span className="ml-1 text-xs font-semibold text-white/50">{unit}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {formation.slots.map((slot) => {
          const pid = assignment[slot.id];
          const player = pid ? playersById.get(pid) : undefined;
          return (
            <div key={slot.id} className="flex flex-col items-center gap-0.5">
              {player ? (
                <PlayerCard player={player} size="sm" className="w-full" />
              ) : (
                <div className="flex h-20 w-full items-center justify-center rounded-lg bg-white/5 text-xs text-white/40">
                  {slot.label}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
