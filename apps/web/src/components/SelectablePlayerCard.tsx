'use client';

import { motion } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { cn } from '@/lib/cn';
import { PlayerCard } from './PlayerCard';

interface SelectablePlayerCardProps {
  player: Player;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

export function SelectablePlayerCard({
  player,
  selected,
  disabled,
  onToggle,
}: SelectablePlayerCardProps) {
  return (
    <motion.button
      type="button"
      onClick={disabled ? undefined : onToggle}
      whileHover={disabled ? undefined : { y: -4 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={cn(
        'relative flex flex-col items-center gap-1 rounded-xl p-1 transition',
        selected && 'bg-accent-gold/15 ring-2 ring-accent-goldHi',
        disabled && 'opacity-40',
      )}
      aria-pressed={selected}
      aria-disabled={disabled}
    >
      <PlayerCard player={player} selected={selected} className="w-24 sm:w-28" />
      {selected && (
        <span className="absolute -top-1 -right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-accent-goldHi text-xs font-black text-zinc-900 shadow">
          ✓
        </span>
      )}
    </motion.button>
  );
}
