'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { CountdownRing } from '@/components/CountdownRing';
import { cn } from '@/lib/cn';
import { SLOT_COUNT, type TargetCriterion, type TargetPicks } from '@/lib/targetMode';

interface TargetBuildSceneProps {
  criterion: TargetCriterion;
  target: number;
  pool: Player[];
  picks: TargetPicks;
  /** Rakip tarafından kullanılmış oyuncu id'leri (havuzdan çıkar). */
  excludeIds: Set<string>;
  /** Havuz karıştırma seed'i — deterministik ama kritere göre SIRALI DEĞİL. */
  shuffleSeed: number;
  /** Geri sayım süresi (sn). */
  seconds: number;
  onPick: (slotIdx: number, playerId: string | null) => void;
  onSubmit: () => void;
  /** Süre doldu → boşlar rastgele tamamlanır + otomatik kapıştırılır. */
  onTimeout: () => void;
}

/** Deterministik karıştırma (mulberry32 + Fisher-Yates). SquadBuildScene ile aynı. */
function shuffled<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed >>> 0;
  const rand = () => {
    s |= 0;
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
 * Hedefe Yaklaş — kadro kurma sahnesi. 5 DÜZ slot (pozisyon kısıtsız) + tek
 * havuz. Havuz RASTGELE sıralı ve metrik değerleri GİZLİ (kör seçim: hedefe
 * sezgiyle yaklaş). Üstte hedef hatırlatma bandı + geri sayım. 5 slot dolunca
 * sticky "Kapıştır".
 */
export function TargetBuildScene({
  criterion,
  target,
  pool,
  picks,
  excludeIds,
  shuffleSeed,
  seconds,
  onPick,
  onSubmit,
  onTimeout,
}: TargetBuildSceneProps) {
  const [search, setSearch] = useState('');

  const playersById = useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of pool) m.set(p.id, p);
    return m;
  }, [pool]);

  // Şu an seçili olan oyuncu id'leri (tekrar seçimi engelle + "seçili" işareti).
  const pickedIds = useMemo(
    () => new Set(picks.filter((v): v is string => v !== null)),
    [picks],
  );

  // Aday havuz: metrik verisi olan + havuz kısıtı + rakipte kullanılmamış +
  // arama. SIRALAMA YOK — deterministik karıştırma (kör seçim).
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = pool
      .filter((p) => criterion.metric(p) !== null)
      .filter((p) => !criterion.poolFilter || criterion.poolFilter(p))
      .filter((p) => !excludeIds.has(p.id))
      .filter((p) => (q ? p.displayName.toLowerCase().includes(q) : true));
    return shuffled(base, shuffleSeed).slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, criterion, excludeIds, search, shuffleSeed]);

  const filledCount = picks.filter((v) => v !== null).length;
  const allFilled = filledCount === SLOT_COUNT;

  // İlk boş slotu hedefler (kart tıklanınca oraya koyar).
  const firstEmpty = picks.findIndex((v) => v === null);

  // Bir kartı seçme/kaldırma: zaten seçiliyse o slottan kaldır; değilse ilk boşa koy.
  const toggle = (playerId: string) => {
    const existingSlot = picks.indexOf(playerId);
    if (existingSlot >= 0) {
      onPick(existingSlot, null);
    } else if (firstEmpty >= 0) {
      onPick(firstEmpty, playerId);
    }
  };

  return (
    <section className="flex flex-col gap-5 pb-24">
      {/* Hedef hatırlatma bandı + geri sayım */}
      <div className="glass-panel sticky top-2 z-30 mx-auto flex w-full max-w-2xl items-center justify-between gap-4 rounded-2xl border border-accent-gold/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎯</span>
          <div className="leading-tight">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">
              Hedef
            </div>
            <div className="text-xl font-black tabular-nums text-accent-goldHi">
              {target}{' '}
              <span className="text-xs font-semibold text-white/55">
                {criterion.title}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/55">
            {filledCount}/{SLOT_COUNT}
          </span>
          <CountdownRing
            seconds={seconds}
            onComplete={onTimeout}
            runKey="target-build"
            size={42}
            stroke={4}
          />
        </div>
      </div>

      <header className="text-center">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          5 futbolcu seç
        </h1>
        <p className="mt-1.5 text-sm text-white/55">
          Değerler gizli — sezgine güven. Toplam{' '}
          <span className="font-semibold text-accent-goldHi">{target}</span>'e en
          yakın olan kazanır.
        </p>
      </header>

      {/* 5 düz slot şeridi */}
      <div className="mx-auto flex w-full max-w-2xl justify-center gap-2 sm:gap-3">
        {picks.map((pid, idx) => {
          const player = pid ? playersById.get(pid) : undefined;
          const active = idx === firstEmpty;
          return (
            <div key={idx} className="flex min-w-0 flex-1 flex-col items-center gap-1" style={{ maxWidth: 96 }}>
              <div
                className={cn(
                  'relative flex aspect-[3/4] w-full items-center justify-center rounded-xl border-2 border-dashed transition',
                  active && !player
                    ? 'border-accent-goldHi bg-accent-gold/10 shadow-glow-gold'
                    : player
                      ? 'border-transparent'
                      : 'border-white/25 bg-white/5',
                )}
              >
                {player ? (
                  <PlayerCard player={player} size="sm" hideBadges className="w-full" />
                ) : (
                  <span className="text-lg font-black text-white/35">{idx + 1}</span>
                )}
              </div>
              {player && (
                <button
                  type="button"
                  onClick={() => onPick(idx, null)}
                  className="text-[10px] font-semibold text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
                >
                  kaldır
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Havuz */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white/80">Oyuncu havuzu</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara…"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-accent-gold/40"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
          {candidates.map((p) => {
            const isSel = pickedIds.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={cn(
                  'relative flex flex-col items-center rounded-lg p-1 transition',
                  isSel && 'bg-accent-gold/15 ring-2 ring-accent-goldHi',
                )}
              >
                {/* Değer GİZLİ — kör seçim. */}
                <PlayerCard player={p} selected={isSel} className="w-full" />
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

      {/* Sticky "Kapıştır" */}
      <AnimatePresence>
        {allFilled && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-5"
          >
            <button
              type="button"
              onClick={onSubmit}
              className="btn-primary animate-cta-pulse motion-reduce:animate-none shadow-glow-gold"
            >
              🎯 Seçimi kilitle & kapıştır
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
