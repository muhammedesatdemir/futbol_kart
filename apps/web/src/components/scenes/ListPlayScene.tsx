'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { CountdownRing } from '@/components/CountdownRing';
import { cn } from '@/lib/cn';
import {
  type ListCriterion,
  type ListEntry,
  type ListSide,
  pointsForRank,
} from '@/lib/listMode';

interface ListPlaySceneProps {
  criterion: ListCriterion;
  list: ListEntry[];
  pool: Player[];
  /** Açılmış sıra → o sırayı kim açtı (renk için). */
  filledBy: Map<number, ListSide>;
  /** rank → playerId (açık sıraların oyuncusu). */
  filledPlayer: Map<number, string>;
  /** Geri sayım süresi (sn). */
  seconds: number;
  /** Geri sayım anahtarı (her tahmin/sıra sıfırlanır). */
  timerKey: string | number;
  onGuess: (playerId: string) => void;
  onTimeout: () => void;
  hotseat?: boolean;
  activeSide: ListSide;
  /** Taraf canları (3'ten azalır). */
  lives: { P1: number; P2: number };
  p1Name?: string;
  p2Name?: string;
  /** Yanlış tahmin damgası (artarsa shake + "listede yok"). */
  missTick?: number;
}

/** P1 = kırmızı, P2 = mavi (belirgin taraf renkleri). */
const SIDE = {
  P1: {
    text: 'text-side-red',
    ring: 'ring-side-red',
    border: 'border-side-red/70',
    bg: 'bg-side-red/20',
    rowBorder: 'border-side-red/60',
    rowBg: 'bg-side-red/20',
    glow: 'shadow-[0_0_22px_rgba(239,68,68,0.45)]',
    heart: 'text-side-red',
  },
  P2: {
    text: 'text-side-blue',
    ring: 'ring-side-blue',
    border: 'border-side-blue/70',
    bg: 'bg-side-blue/20',
    rowBorder: 'border-side-blue/60',
    rowBg: 'bg-side-blue/20',
    glow: 'shadow-[0_0_22px_rgba(59,130,246,0.45)]',
    heart: 'text-side-blue',
  },
} as const;

/** Deterministik karıştırma (havuzu rastgele sırada göster). */
function shuffled<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Liste Doldur — oyun sahnesi. Üstte 10 sıralı liste (dolu sıralar oyuncu
 * kartı + isim, boşlar gizli). Altta havuz grid + arama; karta tıkla = tahmin.
 * Doğru → sıra flip ile açılır; yanlış/pas → can -1 + "listede yok".
 *
 * Sıra/süre/can göstergesi DİNAMİK: aktif taraf P1 ise solda, P2 ise sağda
 * sabit (sticky) gösterilir — oyuncu havuzda aşağı inse de görünür kalır.
 */
export function ListPlayScene({
  criterion,
  list,
  pool,
  filledBy,
  filledPlayer,
  seconds,
  timerKey,
  onGuess,
  onTimeout,
  hotseat = false,
  activeSide,
  lives,
  p1Name = 'Sen',
  p2Name = 'Bot',
  missTick = 0,
}: ListPlaySceneProps) {
  const [search, setSearch] = useState('');

  const playersById = useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of pool) m.set(p.id, p);
    return m;
  }, [pool]);

  const guessedIds = useMemo(() => new Set(filledPlayer.values()), [filledPlayer]);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = pool
      .filter((p) => criterion.metric(p) !== null)
      .filter((p) => !criterion.poolFilter || criterion.poolFilter(p))
      .filter((p) => (q ? p.displayName.toLowerCase().includes(q) : true));
    return shuffled(base, 7919).slice(0, 48);
  }, [pool, criterion, search]);

  const activeName = activeSide === 'P1' ? p1Name : p2Name;
  const sideCls = SIDE[activeSide];
  const activeLives = lives[activeSide];
  const filledCount = filledPlayer.size;

  return (
    <section className="flex flex-col gap-4 pb-10">
      {/* DİNAMİK sıra/süre/can paneli — aktif taraf P1 ise solda, P2 ise sağda;
          sticky → havuzda aşağı kayınca da görünür. Boyut ~2× (madde 1). */}
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
            'glass-panel-strong pointer-events-auto flex flex-col items-center gap-3 rounded-3xl border-2 px-7 py-6',
            sideCls.border,
            sideCls.glow,
          )}
        >
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/55">
            Sıra
          </span>
          <span className={cn('text-3xl font-black leading-none', sideCls.text)}>
            {activeName}
          </span>
          <CountdownRing
            seconds={seconds}
            runKey={timerKey}
            onComplete={onTimeout}
            size={96}
            stroke={8}
            color={activeSide === 'P1' ? '#ef4444' : '#3b82f6'}
            urgentColor="#ef4444"
          />
          {/* Can — kalpler (dinamik, büyük) */}
          <Hearts side={activeSide} count={activeLives} />
        </motion.div>

        {/* "Bu listede yok! −1 can" — tahmin eden tarafın yanında, panelin altında.
            missTick artınca belirir, 3.5sn sonra animasyonla kaybolur (madde 2). */}
        <AnimatePresence>
          {missTick > 0 && <MissNote key={missTick} side={activeSide} />}
        </AnimatePresence>
      </div>

      {/* Üst başlık + bulundu sayısı */}
      <header className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-gold/40 bg-accent-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-accent-goldHi">
          🏆 {criterion.title}
        </span>
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">
          {hotseat ? (
            <>
              Sıra: <span className={sideCls.text}>{activeName}</span>
            </>
          ) : (
            <>{filledCount}/{list.length} bulundu</>
          )}
        </h1>
        <p className="text-xs text-white/55">
          Havuzdan tahmin et — listedeyse sırasına oturur.{' '}
          <span className="font-semibold text-accent-goldHi">Alt sıralar daha değerli.</span>
        </p>
      </header>

      {/* Liste — 10 sıra. Dolu sıralar açık (oyuncu kartı + isim), boşlar gizli. */}
      <motion.div
        key={`miss-${missTick}`}
        animate={missTick > 0 ? { x: [0, -8, 8, -5, 5, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="glass-panel mx-auto w-full max-w-2xl rounded-2xl border border-emerald-500/20 bg-emerald-950/30 p-3 sm:p-4"
      >
        <div className="flex flex-col gap-1.5">
          {list.map((entry) => {
            const owner = filledBy.get(entry.rank);
            const pid = filledPlayer.get(entry.rank);
            const player = pid ? playersById.get(pid) : undefined;
            const open = !!player;
            return (
              <div
                key={entry.rank}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-2.5 py-1.5 transition',
                  open && owner
                    ? cn(SIDE[owner].rowBorder, SIDE[owner].rowBg)
                    : 'border-white/10 bg-white/5',
                )}
              >
                <div className="flex w-10 shrink-0 flex-col items-center">
                  <span className="text-lg font-black tabular-nums text-white/80">
                    {entry.rank}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-accent-goldHi/70">
                    {pointsForRank(entry.rank)}p
                  </span>
                </div>

                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {open && player ? (
                    <motion.div
                      initial={{ rotateY: 90, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="flex min-w-0 items-center gap-3"
                    >
                      {/* Kart — isim YOK (hideBadges + sadece foto). */}
                      <div className="w-9 shrink-0">
                        <PlayerCard player={player} size="squad" hideBadges hideName className="w-full" />
                      </div>
                      <span className="truncate text-sm font-bold">{player.displayName}</span>
                    </motion.div>
                  ) : (
                    <span className="text-sm font-semibold tracking-widest text-white/25">？ ？ ？</span>
                  )}
                </div>

                {open && (
                  <span className="shrink-0 rounded-full bg-accent-gold/20 px-2.5 py-0.5 text-sm font-black tabular-nums text-accent-goldHi ring-1 ring-accent-goldHi/40">
                    {entry.value}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Havuz — kartlar arası boşluk artırıldı (gap-3/4). */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white/80">Tahminini seç</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara…"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-accent-gold/40"
          />
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 sm:gap-4 lg:grid-cols-6">
          {candidates.map((p) => {
            const already = guessedIds.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onGuess(p.id)}
                disabled={already}
                className={cn(
                  'rounded-lg transition hover:-translate-y-1',
                  already && 'pointer-events-none opacity-35',
                )}
              >
                <PlayerCard player={p} className="w-full" />
              </button>
            );
          })}
          {candidates.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-white/45">
              Bu aramaya uygun oyuncu yok.
            </p>
          )}
        </div>
      </div>

    </section>
  );
}

/** Can göstergesi — dolu/boş kalpler (büyük). Azalınca son kalp animasyonla söner. */
function Hearts({ side, count }: { side: ListSide; count: number }) {
  const max = 3;
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < count;
        return (
          <motion.span
            key={i}
            initial={false}
            animate={
              filled
                ? { scale: 1, opacity: 1 }
                : { scale: [1.3, 0.6], opacity: [1, 0.25] }
            }
            transition={{ duration: 0.4 }}
            className={cn('text-2xl leading-none', filled ? SIDE[side].heart : 'text-white/15')}
          >
            {filled ? '❤' : '🤍'}
          </motion.span>
        );
      })}
    </div>
  );
}

/**
 * "Bu listede yok! −1 can" — tahmin eden tarafın panelinin altında belirir,
 * 3.5 sn sonra animasyonla kaybolur (AnimatePresence exit). Tarafa göre kayar.
 */
function MissNote({ side }: { side: ListSide }) {
  const [show, setShow] = useState(true);
  // 3.5 sn sonra kaybol (parent AnimatePresence exit animasyonunu oynatır).
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 3500);
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
        Listede yok!
      </span>
      <span className="text-sm font-black text-side-red">−1 can</span>
    </motion.div>
  );
}
