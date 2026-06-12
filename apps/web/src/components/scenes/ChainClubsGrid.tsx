'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import type { ChainClub } from '@/lib/chainMode';

interface ChainClubsGridProps {
  clubs: ChainClub[];
  /**
   * Kulüp id → o kulübü "tutan" tarafların işaretleri. Bir kulübü hem P1 hem P2
   * tutmuş olabilir (ikisi de o kulüpte oynamış futbolcu girmiş) → iki nokta.
   * Boşsa hiç işaret. Sadece görsel ipucu (puan zaten skorda).
   */
  hitsByClub?: Record<string, ChainSideMark[]>;
  /** Son girilen pick'in tuttuğu kulüpler — pop animasyonu. */
  highlightClubIds?: string[];
  highlightSide?: 'P1' | 'P2' | null;
  compact?: boolean;
}

type ChainSideMark = 'P1' | 'P2';

const SIDE_DOT = {
  P1: 'bg-side-red',
  P2: 'bg-side-blue',
} as const;

/**
 * "Zincir Kur" kulüp ızgarası — 4 ÜST + 3 ALT (alttaki 3, üstteki 4'ün merkezine
 * hizalı, piramit benzeri). Bitişiklik YOK (sadece gösterim). Her kulübün altında
 * onu tutan tarafların noktaları (P1 kırmızı / P2 mavi).
 *
 * Düzen: 4 sütunlu grid; alt 3 kulüp ortalı (col-span hilesiyle merkezlenir).
 */
export function ChainClubsGrid({
  clubs,
  hitsByClub = {},
  highlightClubIds = [],
  highlightSide = null,
  compact = false,
}: ChainClubsGridProps) {
  const top = clubs.slice(0, 4);
  const bottom = clubs.slice(4, 7);
  const hi = new Set(highlightClubIds);

  return (
    <div className={cn('mx-auto flex w-full flex-col gap-2 sm:gap-3', compact ? 'max-w-lg' : 'max-w-2xl')}>
      {/* Üst sıra — 4 kulüp */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {top.map((c) => (
          <ClubCell
            key={c.id}
            club={c}
            marks={hitsByClub[c.id] ?? []}
            isNew={hi.has(c.id)}
            highlightSide={highlightSide}
            compact={compact}
          />
        ))}
      </div>
      {/* Alt sıra — 3 kulüp, üstteki 4'ün merkezine hizalı.
          8 sütunlu grid: her kart 2 kolon, 1'den başlayıp ortalanır → toplam 6
          kolon orta 6'ya oturur (1 boş + 6 dolu + 1 boş). */}
      <div className="grid grid-cols-8 gap-2 sm:gap-3">
        <div className="col-span-1" />
        {bottom.map((c) => (
          <div key={c.id} className="col-span-2">
            <ClubCell
              club={c}
              marks={hitsByClub[c.id] ?? []}
              isNew={hi.has(c.id)}
              highlightSide={highlightSide}
              compact={compact}
            />
          </div>
        ))}
        <div className="col-span-1" />
      </div>
    </div>
  );
}

function ClubCell({
  club,
  marks,
  isNew,
  highlightSide,
  compact,
}: {
  club: ChainClub;
  marks: ChainSideMark[];
  isNew: boolean;
  highlightSide: 'P1' | 'P2' | null;
  compact: boolean;
}) {
  const glow =
    isNew && highlightSide
      ? highlightSide === 'P1'
        ? 'shadow-[0_0_18px_rgba(239,68,68,0.5)] border-side-red/60'
        : 'shadow-[0_0_18px_rgba(59,130,246,0.5)] border-side-blue/60'
      : 'border-white/12';
  return (
    <motion.div
      initial={false}
      animate={isNew ? { scale: [1, 1.1, 1] } : { scale: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'relative flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border bg-white/5 p-1 text-center transition',
        glow,
      )}
    >
      {club.crestUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={club.crestUrl}
          alt={club.name}
          loading="lazy"
          className={cn('object-contain', compact ? 'h-9 w-9 sm:h-10 sm:w-10' : 'h-11 w-11 sm:h-14 sm:w-14')}
        />
      ) : (
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-sm font-black text-white/70">
          {club.name.slice(0, 2)}
        </span>
      )}
      <span className={cn('line-clamp-1 w-full px-0.5 font-semibold leading-tight text-white/75', compact ? 'text-[9px]' : 'text-[10px] sm:text-xs')}>
        {club.name}
      </span>
      {/* Tutan taraf noktaları (puan ipucu) */}
      {marks.length > 0 && (
        <div className="absolute right-1 top-1 flex gap-0.5">
          {marks.map((m, i) => (
            <span key={i} className={cn('h-2 w-2 rounded-full ring-1 ring-black/40', SIDE_DOT[m])} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
