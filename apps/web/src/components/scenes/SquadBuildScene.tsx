'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { cn } from '@/lib/cn';
import {
  type Formation,
  type SquadAssignment,
  type SquadCriterion,
} from '@/lib/squadMode';

interface SquadBuildSceneProps {
  formation: Formation;
  criterion: SquadCriterion;
  pool: Player[];
  assignment: SquadAssignment;
  /** Rakip tarafından zaten kullanılmış oyuncu id'leri (havuzdan çıkar). */
  excludeIds: Set<string>;
  /** Havuz karıştırma seed'i — deterministik ama kritere göre SIRALI DEĞİL. */
  shuffleSeed: number;
  onAssign: (slotId: string, playerId: string | null) => void;
  onSubmit: () => void;
}

/** Deterministik karıştırma (Fisher-Yates + mulberry32). Seed + index'e bağlı. */
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
 * Kadro kurma sahnesi — formasyon slotları (üstte saha) + altta seçili slota
 * göre havuz. Havuz RASTGELE sıralı ve değerler GİZLİ (yarışma mantığı: en iyiyi
 * kendin keşfet). Kadro dolunca sticky "Kapıştır" butonu belirir.
 */
export function SquadBuildScene({
  formation,
  criterion,
  pool,
  assignment,
  excludeIds,
  shuffleSeed,
  onAssign,
  onSubmit,
}: SquadBuildSceneProps) {
  const [activeSlot, setActiveSlot] = useState<string>(formation.slots[0].id);
  const [search, setSearch] = useState('');

  const playersById = useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of pool) m.set(p.id, p);
    return m;
  }, [pool]);

  const activeSlotDef = formation.slots.find((s) => s.id === activeSlot)!;

  const usedHere = new Set(
    Object.values(assignment).filter((v): v is string => v !== null),
  );

  // Bu slota atanabilecek oyuncular: doğru pozisyon + kriter verisi olan +
  // havuz kısıtı + başka slota atanmamış + rakipte kullanılmamış.
  // SIRALAMA YOK — deterministik karıştırma (slot'a göre seed kaydırılır).
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = pool
      .filter((p) => p.position === activeSlotDef.position)
      .filter((p) => criterion.metric(p) !== null)
      .filter((p) => !criterion.poolFilter || criterion.poolFilter(p))
      .filter((p) => !excludeIds.has(p.id))
      .filter((p) => !usedHere.has(p.id) || assignment[activeSlot] === p.id)
      .filter((p) => (q ? p.displayName.toLowerCase().includes(q) : true));
    // Slot id'sini seed'e kat ki her mevki farklı karışsın.
    const slotSeed = shuffleSeed + activeSlotDef.id.length * 2654435761;
    return shuffled(base, slotSeed).slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, activeSlot, activeSlotDef, criterion, excludeIds, search, assignment, shuffleSeed]);

  const filledCount = formation.slots.filter((s) => assignment[s.id]).length;
  const allFilled = filledCount === formation.slots.length;

  return (
    <section className="flex flex-col gap-5 pb-24">
      <header className="text-center">
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
          {criterion.title}
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Her mevkiye bir oyuncu seç. Toplam{' '}
          <span className="font-semibold text-accent-goldHi">
            {criterion.unit}
          </span>{' '}
          karşılaştırılır — en iyileri sen bul.
        </p>
      </header>

      {/* Saha — formasyon slotları (büyük) */}
      <div className="glass-panel relative mx-auto w-full max-w-2xl rounded-2xl border border-emerald-500/20 bg-emerald-950/30 p-5 sm:p-7">
        <div className="mb-3 flex items-center justify-between">
          <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/55">
            {filledCount}/{formation.slots.length} mevki
          </span>
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            Formasyon {formation.name}
          </span>
        </div>
        <SlotGrid
          formation={formation}
          assignment={assignment}
          playersById={playersById}
          activeSlot={activeSlot}
          onPick={setActiveSlot}
          onClear={(slotId) => onAssign(slotId, null)}
        />
      </div>

      {/* Aktif slot havuzu */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white/80">
            {activeSlotDef.label} seç
          </h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara…"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-accent-gold/40"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
          {candidates.map((p) => {
            const isSel = assignment[activeSlot] === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onAssign(activeSlot, isSel ? null : p.id)}
                className={cn(
                  'relative flex flex-col items-center rounded-lg p-1 transition',
                  isSel && 'bg-accent-gold/15 ring-2 ring-accent-goldHi',
                )}
              >
                {/* Değer GİZLİ — yarışma mantığı (oyuncu kendi seçimini yapar). */}
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

      {/* Sticky "Kapıştır" — kadro dolunca ekranın altında belirir (madde 5). */}
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
              ⚔️ Kadroyu kilitle & kapıştır
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Saha üzerindeki slot ızgarası — FOR üstte, KL altta (sahaya benzer). */
function SlotGrid({
  formation,
  assignment,
  playersById,
  activeSlot,
  onPick,
  onClear,
}: {
  formation: Formation;
  assignment: SquadAssignment;
  playersById: Map<string, Player>;
  activeSlot: string;
  onPick: (slotId: string) => void;
  onClear: (slotId: string) => void;
}) {
  const order: Array<Player['position']> = ['FWD', 'MID', 'DEF', 'GK'];
  const rows = order
    .map((pos) => formation.slots.filter((s) => s.position === pos))
    .filter((r) => r.length > 0);

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {rows.map((row, i) => (
        <div key={i} className="flex justify-center gap-2 sm:gap-3">
          {row.map((slot) => {
            const pid = assignment[slot.id];
            const player = pid ? playersById.get(pid) : undefined;
            const active = activeSlot === slot.id;
            return (
              // Esnek genişlik: 4 DEF yan yana tek sahada sığsın (max ~96px).
              <div key={slot.id} className="flex min-w-0 flex-1 flex-col items-center gap-1" style={{ maxWidth: 96 }}>
                <button
                  type="button"
                  onClick={() => onPick(slot.id)}
                  className={cn(
                    'relative flex aspect-[3/4] w-full items-center justify-center rounded-xl border-2 border-dashed transition',
                    active
                      ? 'border-accent-goldHi bg-accent-gold/10 shadow-glow-gold'
                      : 'border-white/25 bg-white/5 hover:border-white/40',
                  )}
                >
                  {player ? (
                    <PlayerCard player={player} size="sm" hideBadges className="w-full" />
                  ) : (
                    <span className="text-xs font-bold text-white/55 sm:text-sm">
                      {slot.label}
                    </span>
                  )}
                </button>
                {player && (
                  <button
                    type="button"
                    onClick={() => onClear(slot.id)}
                    className="text-[10px] font-semibold text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
                  >
                    kaldır
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
