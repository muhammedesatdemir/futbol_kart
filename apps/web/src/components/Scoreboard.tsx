'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface ScoreboardProps {
  p1Name: string;
  p2Name: string;
  p1Score: number;
  p2Score: number;
  round: number;
  totalRounds: number;
}

/**
 * TV broadcast altyazı estetiği:
 *   [ kırmızı blok  isim  skor ] [ orta: LIVE + tur ] [ mavi blok  skor  isim ]
 * Üstte ince altın trim, altta ince altın trim.
 */
export function Scoreboard({
  p1Name,
  p2Name,
  p1Score,
  p2Score,
  round,
  totalRounds,
}: ScoreboardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-md border border-white/10 bg-black/70 shadow-card backdrop-blur"
    >
      {/* Üst altın trim */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-accent-goldHi to-transparent" />

      <div className="flex items-stretch">
        <SidePanel name={p1Name} score={p1Score} side="left" />
        <MiddlePanel round={round} totalRounds={totalRounds} />
        <SidePanel name={p2Name} score={p2Score} side="right" />
      </div>

      {/* Alt altın trim */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-accent-goldHi to-transparent" />
    </motion.div>
  );
}

function SidePanel({
  name,
  score,
  side,
}: {
  name: string;
  score: number;
  side: 'left' | 'right';
}) {
  const isLeft = side === 'left';
  return (
    <div
      className={cn(
        'relative flex flex-1 items-stretch text-white',
        isLeft ? 'flex-row' : 'flex-row-reverse',
      )}
    >
      {/* Yan renk bandı — keskin köşeli */}
      <div
        className={cn(
          'flex w-2 sm:w-3',
          isLeft ? 'bg-side-red' : 'bg-side-blue',
        )}
      />

      {/* İçerik */}
      <div
        className={cn(
          'flex flex-1 items-center gap-3 px-3 py-2.5 sm:px-5 sm:py-3',
          isLeft
            ? 'bg-gradient-to-r from-side-red/30 via-side-red/10 to-transparent'
            : 'bg-gradient-to-l from-side-blue/30 via-side-blue/10 to-transparent',
        )}
      >
        <div
          className={cn(
            'flex flex-1 flex-col min-w-0',
            !isLeft && 'items-end text-right',
          )}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
            {isLeft ? 'Ev sahibi' : 'Konuk'}
          </span>
          <span className="truncate text-sm font-bold uppercase tracking-wide text-white">
            {name}
          </span>
        </div>
        <span className="text-3xl font-black tabular-nums tracking-tight sm:text-4xl">
          {score}
        </span>
      </div>
    </div>
  );
}

function MiddlePanel({
  round,
  totalRounds,
}: {
  round: number;
  totalRounds: number;
}) {
  return (
    <div className="flex min-w-[88px] flex-col items-center justify-center gap-1 border-x border-white/10 bg-black/60 px-3 py-2.5 sm:min-w-[120px] sm:py-3">
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 animate-pulse-soft rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
        <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-red-400">
          Canlı
        </span>
      </div>
      <div className="flex items-baseline gap-1 font-black tabular-nums tracking-tight">
        <span className="text-[10px] uppercase tracking-[0.22em] text-white/55">
          Tur
        </span>
        <span className="text-xl text-accent-goldHi sm:text-2xl">{round}</span>
        <span className="text-xs text-white/40">/{totalRounds}</span>
      </div>
    </div>
  );
}
