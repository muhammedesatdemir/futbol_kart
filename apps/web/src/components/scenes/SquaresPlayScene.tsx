'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { CountdownRing } from '@/components/CountdownRing';
import { cn } from '@/lib/cn';
import { normalize } from '@/lib/playerFilters';
import { SquaresGrid } from './SquaresGrid';
import {
  type SquaresGrid as GridData,
  type SquaresSide,
} from '@/lib/squaresMode';

/** P1 = kırmızı, P2 = mavi (ListPlayScene SIDE ile aynı). */
const SIDE = {
  P1: {
    text: 'text-side-red',
    border: 'border-side-red/70',
    glow: 'shadow-[0_0_22px_rgba(239,68,68,0.45)]',
    heart: 'text-side-red',
  },
  P2: {
    text: 'text-side-blue',
    border: 'border-side-blue/70',
    glow: 'shadow-[0_0_22px_rgba(59,130,246,0.45)]',
    heart: 'text-side-blue',
  },
} as const;

interface SquaresPlaySceneProps {
  grid: GridData;
  pool: Player[];
  /** Geri sayım süresi (sn). */
  seconds: number;
  /** Geri sayım anahtarı (her tahmin/sıra sıfırlanır). */
  timerKey: string | number;
  /** Bir futbolcu tahmin et (id). */
  onGuess: (playerId: string) => void;
  onTimeout: () => void;
  hotseat?: boolean;
  activeSide: SquaresSide;
  /** Taraf canları. */
  lives: { P1: number; P2: number };
  /** Taraf skorları (kapatılan kare sayısı) — başlıkta gösterilir. */
  scores: { P1: number; P2: number };
  p1Name?: string;
  p2Name?: string;
  /** Yanlış tahmin damgası (artarsa shake + "uygun grup yok"). */
  missTick?: number;
  /** Son kapanan hücreler (grid animasyonu). */
  highlightCells?: number[];
  highlightSide?: SquaresSide | null;
  /** ONLINE (opsiyonel): sunucu-otoriteli bitiş anı (epoch ms). */
  deadlineMs?: number | null;
  /** ONLINE (opsiyonel): sıra bu istemcide değil → tahmin kilitli. */
  locked?: boolean;
  /** ONLINE (opsiyonel): kilitliyken bilgi. */
  waitingLabel?: string | null;
  /** ONLINE (opsiyonel): sayacı gizle (result-hold). */
  hideTimer?: boolean;
}

/**
 * "Kareleri Kap" oyun sahnesi. Üstte 5×5 matris (durum), altta havuz + arama;
 * bir futbolcuya tıkla = tahmin. Sistem bitişik en büyük grubu kapatır (doğru),
 * ya da "uygun grup yok" (yanlış → can −1). Dinamik sıra/can/süre paneli
 * ListPlayScene deseniyle yan tarafta.
 */
export function SquaresPlayScene({
  grid,
  pool,
  seconds,
  timerKey,
  onGuess,
  onTimeout,
  hotseat = false,
  activeSide,
  lives,
  scores,
  p1Name = 'Sen',
  p2Name = 'Bot',
  missTick = 0,
  highlightCells = [],
  highlightSide = null,
  deadlineMs = null,
  locked = false,
  waitingLabel = null,
  hideTimer = false,
}: SquaresPlaySceneProps) {
  const [search, setSearch] = useState('');

  // ONLINE kilit geri bildirimi (ListPlayScene deseni).
  const [denyActive, setDenyActive] = useState(false);
  const [denyShake, setDenyShake] = useState(0);
  const denyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerDeny = () => {
    setDenyActive(true);
    setDenyShake((n) => n + 1);
    if (denyTimerRef.current) clearTimeout(denyTimerRef.current);
    denyTimerRef.current = setTimeout(() => setDenyActive(false), 2500);
  };
  useEffect(() => {
    if (!locked && denyActive) setDenyActive(false);
    return () => {
      if (denyTimerRef.current) clearTimeout(denyTimerRef.current);
    };
  }, [locked, denyActive]);

  // Matristeki kulüp id'leri — havuzu, matriste oynamış oyunculara önceliklendir
  // (ama hepsini göster: kullanıcı istediğini arayabilsin).
  const gridClubIds = useMemo(
    () => new Set(grid.cells.map((c) => c.clubId)),
    [grid.cells],
  );

  const candidates = useMemo(() => {
    const q = normalize(search);
    const filtered = pool.filter((p) =>
      q ? normalize(p.displayName).includes(q) : true,
    );
    // Aranınca: eşleşenler. Aranmadan: matriste en çok kulübü olanları öne al
    // (oynanabilir adaylar) → boş aramada anlamlı vitrin.
    if (!q) {
      const scored = filtered
        .map((p) => ({
          p,
          hits: p.clubs.reduce(
            (n, s) => n + (gridClubIds.has(s.clubId) ? 1 : 0),
            0,
          ),
        }))
        .filter((x) => x.hits > 0)
        .sort((a, b) => b.hits - a.hits);
      return scored.slice(0, 48).map((x) => x.p);
    }
    return filtered.slice(0, 48);
  }, [pool, search, gridClubIds]);

  const activeName = activeSide === 'P1' ? p1Name : p2Name;
  const sideCls = SIDE[activeSide];
  const activeLives = lives[activeSide];

  return (
    <section className="flex flex-col gap-4 pb-10">
      {/* DİNAMİK sıra/süre/can paneli — aktif taraf P1 ise solda, P2 ise sağda. */}
      <div
        className={cn(
          'pointer-events-none fixed top-1/4 z-40 flex flex-col items-center gap-3',
          activeSide === 'P1' ? 'left-4 sm:left-8' : 'right-4 sm:right-8',
        )}
      >
        <motion.div
          key={activeSide}
          initial={{ opacity: 0, x: activeSide === 'P1' ? -28 : 28, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className={cn(
            'glass-panel-strong pointer-events-auto flex flex-col items-center gap-2 rounded-3xl border-2 px-4 py-4',
            sideCls.border,
            sideCls.glow,
          )}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">
            Sıra
          </span>
          <span className={cn('text-xl font-black leading-none', sideCls.text)}>
            {activeName}
          </span>
          {hideTimer ? (
            <div
              className="flex items-center justify-center rounded-full border-2 border-white/10 text-white/30"
              style={{ width: 68, height: 68 }}
            >
              <span className="text-2xl">⏸</span>
            </div>
          ) : (
            <CountdownRing
              seconds={seconds}
              deadlineMs={deadlineMs}
              runKey={timerKey}
              onComplete={onTimeout}
              size={68}
              stroke={6}
              color={activeSide === 'P1' ? '#ef4444' : '#3b82f6'}
              urgentColor="#ef4444"
            />
          )}
          <Hearts side={activeSide} count={activeLives} />

          {locked && waitingLabel && (
            <motion.div
              key={denyShake}
              animate={denyActive ? { x: [0, -6, 6, -4, 4, -2, 2, 0] } : {}}
              transition={{ duration: 0.45 }}
              className={cn(
                'mt-1 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors duration-300',
                denyActive
                  ? 'border-side-red/70 bg-side-red/20 text-side-red shadow-[0_0_18px_-2px_rgba(220,38,38,0.7)]'
                  : 'border-accent-gold/40 bg-accent-gold/10 text-accent-goldHi',
              )}
            >
              <span aria-hidden>{denyActive ? '🚫' : '⏳'}</span>
              {denyActive ? 'Sıra sende değil!' : waitingLabel}
            </motion.div>
          )}
        </motion.div>

        {/* Yanlış tahmin notu (offline) */}
        <AnimatePresence>
          {missTick > 0 && <MissNote key={missTick} side={activeSide} />}
        </AnimatePresence>
      </div>

      {/* Skor şeridi — iki tarafın kapattığı kare sayısı. */}
      <header className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-4">
          <ScorePill name={p1Name} score={scores.P1} side="P1" active={activeSide === 'P1'} />
          <span className="text-xs font-bold text-white/40">vs</span>
          <ScorePill name={p2Name} score={scores.P2} side="P2" active={activeSide === 'P2'} />
        </div>
        <p className="text-xs text-white/55">
          Bir futbolcu seç — bitişik kulüplerinden en büyük grup{' '}
          <span className="font-semibold text-accent-goldHi">sana kapanır</span>.
        </p>
      </header>

      {/* Matris */}
      <motion.div
        key={`miss-${missTick}`}
        animate={missTick > 0 ? { x: [0, -8, 8, -5, 5, 0] } : {}}
        transition={{ duration: 0.4 }}
      >
        <SquaresGrid
          grid={grid}
          highlightCells={highlightCells}
          highlightSide={highlightSide}
        />
      </motion.div>

      {/* Havuz — futbolcu seç. */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white/80">Futbolcunu seç</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara: futbolcu adı…"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-accent-gold/40"
          />
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-5 lg:gap-5">
          {candidates.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                if (locked) {
                  triggerDeny();
                  return;
                }
                onGuess(p.id);
              }}
              className={cn(
                'rounded-lg transition hover:-translate-y-1',
                locked && 'cursor-not-allowed opacity-60 hover:translate-y-0',
              )}
            >
              <PlayerCard player={p} className="w-full" />
            </button>
          ))}
          {candidates.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-white/45">
              {search
                ? 'Bu aramaya uygun futbolcu yok.'
                : 'Matristeki kulüplerde oynamış futbolcu bulunamadı — arama yap.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Skor hapı — taraf adı + kapatılan kare sayısı. */
function ScorePill({
  name,
  score,
  side,
  active,
}: {
  name: string;
  score: number;
  side: SquaresSide;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-2xl border px-4 py-2 transition',
        active ? cn(SIDE[side].border, 'bg-white/5') : 'border-white/10',
      )}
    >
      <span className={cn('text-xs font-bold', SIDE[side].text)}>{name}</span>
      <span className="text-2xl font-black tabular-nums">{score}</span>
      <span className="text-[9px] uppercase tracking-wider text-white/40">kare</span>
    </div>
  );
}

/** Can göstergesi (ListPlayScene Hearts'ın sadeleştirilmiş hali — 3 kalp). */
function Hearts({ side, count }: { side: SquaresSide; count: number }) {
  const max = 3;
  const prevCount = useRef(count);
  const [breakingIdx, setBreakingIdx] = useState<number | null>(null);
  useEffect(() => {
    if (count < prevCount.current) {
      setBreakingIdx(count);
      const t = setTimeout(() => setBreakingIdx(null), 700);
      return () => clearTimeout(t);
    }
    prevCount.current = count;
  }, [count]);
  useEffect(() => {
    prevCount.current = count;
  }, [count]);

  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < count;
        const breaking = breakingIdx === i;
        if (breaking) {
          return (
            <span key={i} className="relative inline-block text-2xl leading-none">
              <span className="text-white/15">🤍</span>
              <motion.span
                initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                animate={{ x: -10, y: 14, rotate: -45, opacity: 0 }}
                transition={{ duration: 0.6, ease: 'easeIn' }}
                className={cn('absolute inset-0 overflow-hidden', SIDE[side].heart)}
                style={{ clipPath: 'inset(0 50% 0 0)' }}
              >
                ❤
              </motion.span>
              <motion.span
                initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                animate={{ x: 10, y: 14, rotate: 45, opacity: 0 }}
                transition={{ duration: 0.6, ease: 'easeIn' }}
                className={cn('absolute inset-0 overflow-hidden', SIDE[side].heart)}
                style={{ clipPath: 'inset(0 0 0 50%)' }}
              >
                ❤
              </motion.span>
            </span>
          );
        }
        return (
          <motion.span
            key={i}
            initial={false}
            animate={filled ? { scale: 1, opacity: 1 } : { scale: 0.85, opacity: 0.4 }}
            transition={{ duration: 0.3 }}
            className={cn('text-2xl leading-none', filled ? SIDE[side].heart : 'text-white/15')}
          >
            {filled ? '❤' : '🤍'}
          </motion.span>
        );
      })}
    </div>
  );
}

/** "Uygun grup yok! −1 can" — yanlış tahminde. */
function MissNote({ side }: { side: SquaresSide }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <motion.div
      initial={{ opacity: 0, x: side === 'P1' ? -24 : 24, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: side === 'P1' ? -24 : 24, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className="glass-panel-strong flex flex-col items-center gap-0.5 rounded-2xl border-2 border-side-red/50 px-4 py-3 text-center shadow-[0_0_22px_rgba(239,68,68,0.4)]"
    >
      <span className="text-2xl">❌</span>
      <span className="text-xs font-black uppercase tracking-wider text-white/85">
        Uygun grup yok!
      </span>
      <span className="text-sm font-black text-side-red">−1 can</span>
    </motion.div>
  );
}
