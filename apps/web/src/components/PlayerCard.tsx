'use client';

import { useRef, useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { cn } from '@/lib/cn';
import {
  countryFlag,
  initialsOf,
  positionShort,
  positionTheme,
} from '@/lib/playerDisplay';
import { SoccerBallIcon } from './icons';

interface PlayerCardProps {
  player?: Player;
  faceDown?: boolean;
  index?: number;
  side?: 'red' | 'blue';
  selected?: boolean;
  className?: string;
}

export const cardEnter: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 220, damping: 22 },
  },
};

const FALLBACK_NUMBER = '?';

function CardFront({ player, selected }: { player: Player; selected?: boolean }) {
  const theme = positionTheme(player.position);
  const flag = countryFlag(player.nationalityCode);
  const number = player.jerseyNumbers[0] ?? FALLBACK_NUMBER;

  return (
    <div
      className={cn(
        'group/card relative h-full w-full overflow-hidden rounded-xl',
        'shadow-card',
        selected && 'ring-2 ring-accent-goldHi',
      )}
      style={
        selected
          ? { boxShadow: `${theme.glow}, 0 0 22px rgba(255,215,107,0.6)` }
          : undefined
      }
    >
      {/* === ALT YARI: koyu base === */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 to-zinc-950" />

      {/* === ÜST YARI: pozisyon gradient === */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-[62%] bg-gradient-to-b',
          theme.gradient,
        )}
      />

      {/* Üst-orta parıltı (kart ışığı) */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 50% 8%, rgba(255,255,255,0.85), transparent 55%)',
        }}
      />

      {/* Holo conic gradient — collectible hissi */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.16] mix-blend-color-dodge"
        style={{
          backgroundImage:
            'conic-gradient(from 210deg at 50% 50%, rgba(255,80,120,0.6), rgba(255,200,80,0.6), rgba(120,255,160,0.6), rgba(80,180,255,0.6), rgba(220,120,255,0.6), rgba(255,80,120,0.6))',
        }}
      />

      {/* Shine band — hover'da geçer */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className={cn(
            'absolute inset-y-0 w-[35%] -translate-x-full -skew-x-12',
            'bg-gradient-to-r from-transparent via-white/55 to-transparent',
            'mix-blend-screen opacity-0',
            'transition-all duration-700 ease-out',
            'group-hover/card:translate-x-[260%] group-hover/card:opacity-100',
          )}
        />
      </div>

      {/* İç çerçeve — koyu altın */}
      <div
        className="pointer-events-none absolute inset-[3px] rounded-[10px] border"
        style={{ borderColor: `${theme.hexDark}80` }}
      />

      {/* === ÜST: numara rozeti (sol) + bayrak (sağ) === */}
      <div className="relative flex items-start justify-between px-2 pt-2">
        <span
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-lg text-sm font-black tabular-nums',
            theme.badge,
          )}
        >
          {number}
        </span>
        <span
          className={cn(
            'flex h-7 min-w-[28px] items-center justify-center rounded-lg px-1.5 text-base leading-none',
            theme.badge,
          )}
          aria-label={player.nationality}
          title={player.nationality}
        >
          {flag || player.nationalityCode}
        </span>
      </div>

      {/* === ORTA: oyuncu görsel alanı (foto slot / monogram fallback) === */}
      <div className="relative mx-auto mt-1 flex h-[42%] w-[78%] items-center justify-center">
        {player.imageUrl ? (
          <PlayerPhoto src={player.imageUrl} alt={player.displayName} />
        ) : (
          <PlayerMonogram name={player.displayName} theme={theme} />
        )}
      </div>

      {/* === ALT: ad + pozisyon === */}
      <div className="relative mt-auto flex flex-col items-center px-2 pb-2 pt-1">
        {/* Ayırıcı çubuk */}
        <div
          className="mb-1 h-px w-[60%]"
          style={{
            background: `linear-gradient(to right, transparent, ${theme.hexLight}aa, transparent)`,
          }}
        />
        <div
          className="line-clamp-2 text-center text-[11px] font-extrabold uppercase leading-tight tracking-wider text-white"
          title={player.name}
        >
          {player.displayName}
        </div>
        <div
          className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em]"
          style={{ color: theme.hexLight }}
        >
          {positionShort(player.position)}
        </div>
      </div>
    </div>
  );
}

function PlayerPhoto({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-full">
      <div className="absolute inset-0 rounded-full bg-white/20 blur-md" />
      <img
        src={src}
        alt={alt}
        className="relative h-full w-full rounded-full object-cover"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

function PlayerMonogram({
  name,
  theme,
}: {
  name: string;
  theme: ReturnType<typeof positionTheme>;
}) {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div
        className="absolute inset-0 rounded-full opacity-40 blur-md"
        style={{
          background: `radial-gradient(circle, ${theme.hexLight}, transparent 70%)`,
        }}
      />
      <div
        className="relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-b from-white/95 to-white/70 text-2xl font-black shadow-inner sm:text-3xl"
        style={{ color: theme.hexDark }}
      >
        {initialsOf(name)}
      </div>
    </div>
  );
}

function CardBack({ index, side = 'red' }: { index?: number; side?: 'red' | 'blue' }) {
  const palette =
    side === 'red'
      ? {
          base: 'from-side-red to-side-redDark border-red-950',
          ring: 'border-red-200/15',
          number: 'text-red-100',
        }
      : {
          base: 'from-side-blue to-side-blueDark border-blue-950',
          ring: 'border-blue-100/15',
          number: 'text-blue-100',
        };

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden rounded-xl border bg-gradient-to-br shadow-card',
        palette.base,
      )}
    >
      <div className={cn('absolute inset-1 rounded-lg border', palette.ring)} />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 10px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 10px)',
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
        <SoccerBallIcon size={44} className={cn('drop-shadow', palette.number)} />
        {typeof index === 'number' && (
          <div className={cn('text-2xl font-black drop-shadow', palette.number)}>
            {index + 1}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Mouse pozisyonuna göre hafif 3D tilt.
 * Sadece pointer:fine (mouse) cihazlarda etkin — touch'ta yan etki yok.
 */
function useTilt(active: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!active || e.pointerType !== 'mouse') return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width; // 0..1
    const y = (e.clientY - r.top) / r.height; // 0..1
    const max = 8; // derece
    setTilt({ rx: (0.5 - y) * max, ry: (x - 0.5) * max });
  };

  const onLeave = () => setTilt({ rx: 0, ry: 0 });

  return { ref, tilt, onMove, onLeave };
}

export function PlayerCard({
  player,
  faceDown = false,
  index,
  side = 'red',
  selected,
  className,
}: PlayerCardProps) {
  const showFront = !faceDown && player;
  const { ref, tilt, onMove, onLeave } = useTilt(!!showFront);

  return (
    <motion.div
      ref={ref}
      variants={cardEnter}
      whileHover={{ y: -6, scale: 1.02 }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={cn(
        'group relative aspect-[2/3] w-28 cursor-pointer select-none sm:w-32',
        className,
      )}
      style={{
        perspective: 900,
      }}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{
          rotateY: showFront ? tilt.ry : 180,
          rotateX: showFront ? tilt.rx : 0,
        }}
        transition={{
          rotateY: showFront
            ? { type: 'spring', stiffness: 220, damping: 18 }
            : { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
          rotateX: { type: 'spring', stiffness: 220, damping: 18 },
        }}
      >
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
          {player ? (
            <CardFront player={player} selected={selected} />
          ) : (
            <CardBack index={index} side={side} />
          )}
        </div>
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <CardBack index={index} side={side} />
        </div>
      </motion.div>
    </motion.div>
  );
}
