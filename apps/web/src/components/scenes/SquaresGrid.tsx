'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import type { SquaresGrid as GridData, SquaresSide } from '@/lib/squaresMode';

/** P1 = kırmızı, P2 = mavi (ListPlayScene SIDE ile aynı tema). */
const SIDE = {
  P1: {
    border: 'border-side-red/70',
    bg: 'bg-side-red/25',
    glow: 'shadow-[0_0_18px_rgba(239,68,68,0.5)]',
    text: 'text-side-red',
  },
  P2: {
    border: 'border-side-blue/70',
    bg: 'bg-side-blue/25',
    glow: 'shadow-[0_0_18px_rgba(59,130,246,0.5)]',
    text: 'text-side-blue',
  },
} as const;

interface SquaresGridProps {
  grid: GridData;
  /**
   * Son tahminde yeni kapanan hücre indeksleri — bunlar "pop" animasyonuyla
   * vurgulanır (kapanma anı belli olsun). Boşsa animasyon yok.
   */
  highlightCells?: number[];
  /** Vurgulanan hücrelerin sahibi (animasyon rengi). */
  highlightSide?: SquaresSide | null;
  /** Hücre boyutu — compact (online yan panelli) için biraz küçük. */
  compact?: boolean;
}

/**
 * 5×5 kulüp matrisi. Her hücre bir kulüp (logo + kısa ad). Kapanan kareler
 * sahibinin rengiyle dolu + kapatan oyuncu logosu sönük. Boş kareler nötr.
 *
 * Saf görsel: tıklama YOK (oyuncu kulüp seçmez — futbolcu ismi yazar, sistem
 * bitişik grubu otomatik kapatır). Bu yüzden grid yalnız DURUMU gösterir.
 */
export function SquaresGrid({
  grid,
  highlightCells = [],
  highlightSide = null,
  compact = false,
}: SquaresGridProps) {
  const highlight = new Set(highlightCells);
  return (
    <div
      className={cn(
        'mx-auto grid w-full gap-1.5 sm:gap-2',
        compact ? 'max-w-md' : 'max-w-xl',
      )}
      style={{ gridTemplateColumns: `repeat(${grid.size}, minmax(0, 1fr))` }}
    >
      {grid.cells.map((cell, i) => {
        const owner = cell.capturedBy;
        const isNew = highlight.has(i);
        return (
          <motion.div
            key={i}
            initial={false}
            animate={
              isNew && highlightSide
                ? { scale: [1, 1.12, 1] }
                : { scale: 1 }
            }
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border p-1 text-center transition-colors',
              owner
                ? cn(SIDE[owner].border, SIDE[owner].bg, isNew && SIDE[owner].glow)
                : 'border-white/12 bg-white/5',
            )}
          >
            {/* Kulüp logosu (crestUrl) — yoksa kulüp adının baş harfi fallback. */}
            {cell.crestUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cell.crestUrl}
                alt={cell.clubName}
                loading="lazy"
                className={cn(
                  'object-contain',
                  compact ? 'h-7 w-7 sm:h-8 sm:w-8' : 'h-8 w-8 sm:h-10 sm:w-10',
                  owner && 'opacity-90',
                )}
              />
            ) : (
              <span
                className={cn(
                  'flex items-center justify-center rounded-full bg-white/10 font-black text-white/70',
                  compact ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm',
                )}
              >
                {cell.clubName.slice(0, 2)}
              </span>
            )}
            <span
              className={cn(
                'line-clamp-1 w-full px-0.5 font-semibold leading-tight',
                compact ? 'text-[8px]' : 'text-[9px] sm:text-[10px]',
                owner ? SIDE[owner].text : 'text-white/60',
              )}
            >
              {cell.clubName}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
