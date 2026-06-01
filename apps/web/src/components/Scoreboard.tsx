'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface ScoreboardProps {
  p1Name: string;
  p2Name: string;
  p1Score: number;
  p2Score: number;
  round: number;
  totalRounds: number;
  /** Önde olan taraf — paneli "nefes aldırır" (momentum). Eşitse null. */
  leadingSide?: 'P1' | 'P2' | null;
  /** Güncel galibiyet serisini yapan taraf. */
  streakSide?: 'P1' | 'P2' | null;
  /** Üst üste galibiyet sayısı (2+ ise rozet gösterilir). */
  streakCount?: number;
}

/**
 * TV broadcast altyazı estetiği:
 *   [ kırmızı blok  isim  skor ] [ orta: LIVE + tur ] [ mavi blok  skor  isim ]
 * Üstte ince altın trim, altta ince altın trim.
 *
 * Momentum katmanı:
 *   - Önde olan tarafın paneli hafif "nefes alır" (subtle scale pulse + glow)
 *   - 2+ üst üste kazanan tarafta skorun yanında 🔥 ×N rozeti, 3+ → "ATEŞTE"
 *   - Skor değişiminde sayı punch-scale yapar (gol hissi)
 */
export function Scoreboard({
  p1Name,
  p2Name,
  p1Score,
  p2Score,
  round,
  totalRounds,
  leadingSide = null,
  streakSide = null,
  streakCount = 0,
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
        <SidePanel
          name={p1Name}
          score={p1Score}
          side="left"
          leading={leadingSide === 'P1'}
          streak={streakSide === 'P1' ? streakCount : 0}
        />
        <MiddlePanel round={round} totalRounds={totalRounds} />
        <SidePanel
          name={p2Name}
          score={p2Score}
          side="right"
          leading={leadingSide === 'P2'}
          streak={streakSide === 'P2' ? streakCount : 0}
        />
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
  leading,
  streak,
}: {
  name: string;
  score: number;
  side: 'left' | 'right';
  leading: boolean;
  streak: number;
}) {
  const isLeft = side === 'left';
  const sideColor = isLeft ? 'rgba(200,50,61,0.55)' : 'rgba(44,95,214,0.55)';

  return (
    <motion.div
      // Önde olan taraf hafifçe nefes alır — momentum hissi (transform-only).
      animate={
        leading
          ? { scale: [1, 1.012, 1] }
          : { scale: 1 }
      }
      transition={
        leading
          ? { duration: 3, ease: 'easeInOut', repeat: Infinity }
          : { duration: 0.3 }
      }
      className={cn(
        'relative flex flex-1 items-stretch text-white',
        isLeft ? 'flex-row' : 'flex-row-reverse',
      )}
    >
      {/* Önde olan tarafın arkasında düşük yoğunluklu enerji parıltısı */}
      <AnimatePresence>
        {leading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="pointer-events-none absolute inset-0"
            aria-hidden
            style={{
              background: isLeft
                ? `radial-gradient(ellipse 70% 120% at 0% 50%, ${sideColor}, transparent 70%)`
                : `radial-gradient(ellipse 70% 120% at 100% 50%, ${sideColor}, transparent 70%)`,
            }}
          />
        )}
      </AnimatePresence>

      {/* Yan renk bandı — keskin köşeli */}
      <div
        className={cn(
          'relative flex w-2 sm:w-3',
          isLeft ? 'bg-side-red' : 'bg-side-blue',
        )}
      />

      {/* İçerik */}
      <div
        className={cn(
          'relative flex flex-1 items-center gap-3 px-3 py-2.5 sm:px-5 sm:py-3',
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
          <div
            className={cn(
              'flex items-center gap-1.5',
              !isLeft && 'flex-row-reverse',
            )}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
              {isLeft ? 'Ev sahibi' : 'Konuk'}
            </span>
            <StreakBadge streak={streak} />
          </div>
          <span className="truncate text-sm font-bold uppercase tracking-wide text-white">
            {name}
          </span>
        </div>
        <ScoreNumber score={score} />
      </div>
    </motion.div>
  );
}

/**
 * Skor sayısı — değer arttığında punch-scale + kısa altın renk flush (gol hissi).
 * İlk mount'ta animasyon yok (0→0 sıçraması olmasın).
 */
function ScoreNumber({ score }: { score: number }) {
  const prev = useRef(score);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    if (score > prev.current) {
      setBump((b) => b + 1);
    }
    prev.current = score;
  }, [score]);

  return (
    <motion.span
      key={bump}
      initial={bump === 0 ? false : { scale: 1.32, color: '#ffd76b' }}
      animate={{ scale: 1, color: '#ffffff' }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="text-3xl font-black tabular-nums tracking-tight sm:text-4xl"
    >
      {score}
    </motion.span>
  );
}

/** Üst üste 2+ galibiyette 🔥 ×N; 3+ ise "ATEŞTE". */
function StreakBadge({ streak }: { streak: number }) {
  if (streak < 2) return null;
  const hot = streak >= 3;
  return (
    <AnimatePresence>
      <motion.span
        key={streak}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 16 }}
        className={cn(
          'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider',
          hot
            ? 'bg-orange-500/25 text-orange-300 ring-1 ring-orange-400/40'
            : 'bg-accent-gold/20 text-accent-goldHi ring-1 ring-accent-gold/40',
        )}
      >
        <span aria-hidden>🔥</span>
        {hot ? 'Ateşte' : `×${streak}`}
      </motion.span>
    </AnimatePresence>
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
