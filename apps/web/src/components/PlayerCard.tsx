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
import { portraitFraming } from '@/lib/playerImageOverrides';
import { SoccerBallIcon } from './icons';

interface PlayerCardProps {
  player?: Player;
  faceDown?: boolean;
  index?: number;
  side?: 'red' | 'blue';
  selected?: boolean;
  className?: string;
  /**
   * Boyut. 'default' responsive büyür (w-36→w-44). 'sm'/'md' TÜM breakpoint'lerde
   * sabit kalır (bonus slotları, dar alanlar — taşma olmaz). md ≈ sm'nin 1.4 katı.
   * 'reveal' default'tan az daha küçük (VS ekranı dikey alana sığsın).
   */
  size?: 'default' | 'sm' | 'md' | 'reveal';
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
        'group/card relative flex h-full w-full flex-col overflow-hidden rounded-xl',
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

      {/* Üst-orta parıltı (kart ışığı) — foto üstünde, z-10 */}
      <div
        className="pointer-events-none absolute inset-0 z-10 opacity-40 mix-blend-overlay"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 50% 8%, rgba(255,255,255,0.85), transparent 55%)',
        }}
      />

      {/* Holo conic gradient — collectible hissi, foto üstüne mix-blend */}
      <div
        className="pointer-events-none absolute inset-0 z-10 opacity-[0.18] mix-blend-color-dodge"
        style={{
          backgroundImage:
            'conic-gradient(from 210deg at 50% 50%, rgba(255,80,120,0.6), rgba(255,200,80,0.6), rgba(120,255,160,0.6), rgba(80,180,255,0.6), rgba(220,120,255,0.6), rgba(255,80,120,0.6))',
        }}
      />

      {/* Shine band — hover'da geçer, en üstte z-20 */}
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
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

      {/* İç çerçeve — koyu altın, en üstte */}
      <div
        className="pointer-events-none absolute inset-[3px] z-20 rounded-[10px] border"
        style={{ borderColor: `${theme.hexDark}80` }}
      />

      {/* === MEDIA AREA: oyuncu portresi — kart yüksekliğinin ~%70'i (mobilde %74) === */}
      <div className="relative z-0 h-[74%] w-full shrink-0 overflow-hidden rounded-t-[inherit] sm:h-[70%]">
        {player.imageUrl ? (
          <PlayerPhoto
            src={player.imageUrl}
            alt={player.displayName}
            playerId={player.id}
            slug={player.slug}
          />
        ) : (
          <PlayerMonogram name={player.displayName} theme={theme} />
        )}

        {/* Portrenin altına doğru karartma — alt metin okunabilirliği için */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
          style={{
            background: `linear-gradient(to bottom, transparent, ${theme.hexDark}cc)`,
          }}
        />
      </div>

      {/* Numara rozeti — kart genelinde z-30, foto + tüm overlay üstünde */}
      <span
        className={cn(
          'absolute left-2 top-2 z-30',
          'flex h-7 w-7 items-center justify-center rounded-lg text-sm font-black tabular-nums',
          'shadow-[0_2px_8px_rgba(0,0,0,0.5)]',
          theme.badge,
        )}
      >
        {number}
      </span>

      {/* Bayrak rozeti — z-30 */}
      <span
        className={cn(
          'absolute right-2 top-2 z-30',
          'flex h-7 min-w-[28px] items-center justify-center rounded-lg px-1.5 text-base leading-none',
          'shadow-[0_2px_8px_rgba(0,0,0,0.5)]',
          theme.badge,
        )}
        aria-label={player.nationality}
        title={player.nationality}
      >
        {flag || player.nationalityCode}
      </span>

      {/* === INFO AREA: ad + pozisyon — sabit alan, media'dan bağımsız === */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-2 pb-2 pt-1.5">
        {/* Ayırıcı çubuk */}
        <div
          className="mb-1 h-px w-[55%]"
          style={{
            background: `linear-gradient(to right, transparent, ${theme.hexLight}aa, transparent)`,
          }}
        />
        <div
          className="line-clamp-1 text-center text-[12px] font-black uppercase leading-tight tracking-wide text-white sm:text-[13px]"
          title={player.name}
        >
          {player.displayName}
        </div>
        <div
          className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{ color: theme.hexLight }}
        >
          {positionShort(player.position)}
        </div>
      </div>
    </div>
  );
}

function PlayerPhoto({
  src,
  alt,
  playerId,
  slug,
}: {
  src: string;
  alt: string;
  playerId: string;
  slug?: string;
}) {
  const framing = portraitFraming(playerId, slug);
  // Hover'da hafif ek zoom: base scale + 0.04 (örn. 1.08 -> 1.12).
  // Scale CSS değişkeniyle sürülür ki inline transform hover class'ı ezmesin.
  const hoverScale = framing.scale + 0.04;
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Arka plan blur (foto yüklenirken zarif fallback) */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent blur-md" />
      <img
        src={src}
        alt={alt}
        className={cn(
          // Görsel SADECE media area'ya göre scale edilir — cover + center top.
          'relative h-full w-full object-cover',
          'origin-top scale-[var(--img-scale)]',
          // Hover'da hafif cinematic zoom — hissedilir ama göze batmaz
          'transition-transform duration-500 ease-out',
          'group-hover/card:scale-[var(--img-scale-hover)]',
        )}
        style={
          {
            objectPosition: framing.objectPosition,
            '--img-scale': framing.scale,
            '--img-scale-hover': hoverScale,
          } as React.CSSProperties
        }
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
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 opacity-40 blur-md"
        style={{
          background: `radial-gradient(circle at 50% 35%, ${theme.hexLight}, transparent 70%)`,
        }}
      />
      <div
        className="relative flex h-full w-full items-center justify-center bg-gradient-to-b from-white/95 to-white/70 text-4xl font-black shadow-inner sm:text-5xl"
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
  size = 'default',
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
        // Daha büyük kart — %30 boy artışı; foto agresif crop ile yüzler daha okunaklı
        'group relative aspect-[2/3] cursor-pointer select-none',
        // sabit boyutlar tüm breakpoint'lerde aynı (taşma yok); default responsive büyür.
        size === 'sm'
          ? 'w-20'
          : size === 'md'
            ? 'w-28'
            : size === 'reveal'
              ? 'w-32 sm:w-36' // default'tan az daha küçük (VS ekranı sığsın)
              : 'w-36 sm:w-40 md:w-44',
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
