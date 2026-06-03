'use client';

import { useMemo, useState } from 'react';
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
  /** Açılmış sıra → o sırayı kim açtı (renk için). Bota karşı hep 'P1'. */
  filledBy: Map<number, ListSide>;
  /** rank → playerId (açık sıraların oyuncusu). */
  filledPlayer: Map<number, string>;
  /** Geri sayım süresi (sn). */
  seconds: number;
  /** Geri sayım anahtarı (hot-seat'te her tur sıfırlanır). */
  timerKey: string | number;
  onGuess: (playerId: string) => void;
  onTimeout: () => void;
  // -------- Hot-seat (opsiyonel) --------
  hotseat?: boolean;
  activeSide?: ListSide;
  p1Name?: string;
  p2Name?: string;
  /** "Listede yok" geri bildirimi için son yanlış tahmin damgası (artarsa shake). */
  missTick?: number;
}

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
 * kartıyla açık, boşlar gizli "?"). Altta havuz grid + arama; karta tıkla =
 * tahmin. Doğru → ilgili sıra flip ile açılır; yanlış → "listede yok" uyarısı.
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
  activeSide = 'P1',
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

  // Zaten doğru tahmin edilmiş oyuncular havuzdan çıkmaz ama tekrar seçilince
  // "zaten açık" olur; görsel olarak işaretlemek için set tut.
  const guessedIds = useMemo(
    () => new Set(filledPlayer.values()),
    [filledPlayer],
  );

  // Havuz: kritere uygun (metrik > 0) + arama. RASTGELE sıra. Liste-dışı oyuncular
  // da havuzda (yanlış tahmin mümkün) — kör hatırlama oyunu.
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = pool
      .filter((p) => criterion.metric(p) !== null)
      .filter((p) => !criterion.poolFilter || criterion.poolFilter(p))
      .filter((p) => (q ? p.displayName.toLowerCase().includes(q) : true));
    return shuffled(base, 7919).slice(0, 48);
  }, [pool, criterion, search]);

  const activeName = activeSide === 'P1' ? p1Name : p2Name;
  const sideColor = activeSide === 'P1' ? 'text-side-red' : 'text-side-blue';
  const filledCount = filledPlayer.size;

  return (
    <section className="flex flex-col gap-4 pb-10">
      {/* Üst bant: başlık + (hot-seat) sıra + süre */}
      <header className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-gold/40 bg-accent-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-accent-goldHi">
          🏆 {criterion.title}
        </span>
        <div className="flex items-center gap-4">
          {hotseat ? (
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              Sıra: <span className={sideColor}>{activeName}</span>
            </h1>
          ) : (
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              {filledCount}/{list.length} bulundu
            </h1>
          )}
          <CountdownRing
            seconds={seconds}
            runKey={timerKey}
            onComplete={onTimeout}
            size={48}
            stroke={4}
            color={hotseat ? '#60a5fa' : '#f0c14b'}
            urgentColor="#ef4444"
          />
        </div>
        <p className="text-xs text-white/55">
          Havuzdan tahmin et — listedeyse sırasına oturur.{' '}
          <span className="font-semibold text-accent-goldHi">Alt sıralar daha değerli.</span>
        </p>
      </header>

      {/* Liste — 10 sıra (1→10). Dolu sıralar açık, boşlar gizli. */}
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
                  open
                    ? owner === 'P2'
                      ? 'border-side-blue/40 bg-side-blue/10'
                      : 'border-accent-gold/40 bg-accent-gold/10'
                    : 'border-white/10 bg-white/5',
                )}
              >
                {/* Sıra no + puan */}
                <div className="flex w-10 shrink-0 flex-col items-center">
                  <span className="text-lg font-black tabular-nums text-white/80">
                    {entry.rank}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-accent-goldHi/70">
                    {pointsForRank(entry.rank)}p
                  </span>
                </div>

                {/* Oyuncu (açıksa) veya gizli */}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {open && player ? (
                    <motion.div
                      initial={{ rotateY: 90, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="flex min-w-0 items-center gap-3"
                    >
                      <div className="w-10 shrink-0">
                        <PlayerCard player={player} size="squad" hideBadges className="w-full" />
                      </div>
                      <span className="truncate text-sm font-bold">{player.displayName}</span>
                    </motion.div>
                  ) : (
                    <span className="text-sm font-semibold text-white/30">？ ？ ？</span>
                  )}
                </div>

                {/* Değer (açıksa) */}
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

      {/* Havuz */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white/80">Tahminini seç</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara…"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-accent-gold/40"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-2.5">
          {candidates.map((p) => {
            const already = guessedIds.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onGuess(p.id)}
                disabled={already}
                className={cn(
                  'rounded-lg p-1 transition hover:-translate-y-1',
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

      {/* "Listede yok" geri bildirimi */}
      <AnimatePresence>
        {missTick > 0 && <MissToast key={missTick} />}
      </AnimatePresence>
    </section>
  );
}

/** Yanlış tahmin toast'ı — kısa süre görünür. */
function MissToast() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.25 }}
      className="glass-panel-strong fixed left-1/2 top-24 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white/85"
    >
      <span className="text-lg">❌</span> Bu listede yok!
    </motion.div>
  );
}
