'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
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
  onAssign: (slotId: string, playerId: string | null) => void;
  onSubmit: () => void;
}

/**
 * Kadro kurma sahnesi — formasyon slotları (üstte saha) + altta seçili slota
 * göre filtrelenmiş oyuncu havuzu. Bir slota tıklayıp havuzdan oyuncu seçilir.
 */
export function SquadBuildScene({
  formation,
  criterion,
  pool,
  assignment,
  excludeIds,
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

  // Bu slota atanabilecek oyuncular: doğru pozisyon + kriter verisi olan +
  // başka slota atanmamış + rakipte kullanılmamış. Kritere göre sıralı.
  const usedHere = new Set(
    Object.values(assignment).filter((v): v is string => v !== null),
  );
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pool
      .filter((p) => p.position === activeSlotDef.position)
      .filter((p) => criterion.metric(p) !== null)
      .filter((p) => !excludeIds.has(p.id))
      .filter((p) => !usedHere.has(p.id) || assignment[activeSlot] === p.id)
      .filter((p) => (q ? p.displayName.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        const va = criterion.metric(a)!;
        const vb = criterion.metric(b)!;
        return criterion.direction === 'max' ? vb - va : va - vb;
      })
      .slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, activeSlot, activeSlotDef.position, criterion, excludeIds, search, assignment]);

  const filledCount = formation.slots.filter((s) => assignment[s.id]).length;
  const allFilled = filledCount === formation.slots.length;

  const runningTotal = formation.slots.reduce((sum, s) => {
    const pid = assignment[s.id];
    const p = pid ? playersById.get(pid) : undefined;
    return sum + (p ? criterion.metric(p) ?? 0 : 0);
  }, 0);

  return (
    <section className="flex flex-col gap-5">
      <header className="text-center">
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
          {criterion.title}
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Her mevkiye bir oyuncu seç. Toplam{' '}
          <span className="font-semibold text-accent-goldHi">
            {criterion.unit}
          </span>{' '}
          karşılaştırılır.
        </p>
      </header>

      {/* Saha — formasyon slotları */}
      <div className="glass-panel relative mx-auto w-full max-w-md rounded-2xl border border-emerald-500/20 bg-emerald-950/30 p-4">
        <div className="absolute right-4 top-3 text-right">
          <div className="text-[10px] uppercase tracking-wider text-white/45">
            Toplam
          </div>
          <div className="text-2xl font-black tabular-nums text-accent-goldHi">
            {runningTotal}
            <span className="ml-1 text-xs font-semibold text-white/50">
              {criterion.unit}
            </span>
          </div>
        </div>
        <SlotGrid
          formation={formation}
          assignment={assignment}
          playersById={playersById}
          criterion={criterion}
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
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {candidates.map((p) => {
            const isSel = assignment[activeSlot] === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onAssign(activeSlot, isSel ? null : p.id)}
                className={cn(
                  'relative flex flex-col items-center gap-1 rounded-lg p-1 transition',
                  isSel && 'bg-accent-gold/15 ring-2 ring-accent-goldHi',
                )}
              >
                <PlayerCard player={p} selected={isSel} className="w-full" />
                <span className="text-[11px] font-bold tabular-nums text-accent-goldHi">
                  {criterion.metric(p)} {criterion.unit}
                </span>
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

      <button
        type="button"
        disabled={!allFilled}
        onClick={onSubmit}
        className={cn('btn-primary mx-auto mt-2', !allFilled && 'opacity-40')}
      >
        {allFilled
          ? 'Kadroyu kilitle'
          : `Kadroyu tamamla (${filledCount}/${formation.slots.length})`}
      </button>
    </section>
  );
}

/** Saha üzerindeki slot ızgarası — KL altta, FOR üstte (sahaya benzer). */
function SlotGrid({
  formation,
  assignment,
  playersById,
  criterion,
  activeSlot,
  onPick,
  onClear,
}: {
  formation: Formation;
  assignment: SquadAssignment;
  playersById: Map<string, Player>;
  criterion: SquadCriterion;
  activeSlot: string;
  onPick: (slotId: string) => void;
  onClear: (slotId: string) => void;
}) {
  // Pozisyona göre satırlara böl (FOR → ORT → DEF → KL, sahaya benzer dizilim).
  const order: Array<Player['position']> = ['FWD', 'MID', 'DEF', 'GK'];
  const rows = order
    .map((pos) => formation.slots.filter((s) => s.position === pos))
    .filter((r) => r.length > 0);

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, i) => (
        <div key={i} className="flex justify-center gap-3">
          {row.map((slot) => {
            const pid = assignment[slot.id];
            const player = pid ? playersById.get(pid) : undefined;
            const active = activeSlot === slot.id;
            return (
              <div key={slot.id} className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => onPick(slot.id)}
                  className={cn(
                    'relative flex h-24 w-16 items-center justify-center rounded-lg border-2 border-dashed transition sm:h-28 sm:w-20',
                    active
                      ? 'border-accent-goldHi bg-accent-gold/10'
                      : 'border-white/25 bg-white/5 hover:border-white/40',
                  )}
                >
                  {player ? (
                    <PlayerCard player={player} size="sm" className="w-full" />
                  ) : (
                    <span className="text-xs font-bold text-white/55">
                      {slot.label}
                    </span>
                  )}
                </button>
                {player && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => onClear(slot.id)}
                    className="text-[10px] font-semibold text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
                  >
                    {criterion.metric(player) ?? '—'} {criterion.unit} · kaldır
                  </motion.button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
