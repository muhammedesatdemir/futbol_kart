'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { CountdownRing } from '@/components/CountdownRing';
import { cn } from '@/lib/cn';
import {
  type Formation,
  type SquadAssignment,
  type SquadCriterion,
  type DraftSide,
  type Suggestion,
  candidatesForSlot,
  draftedIds,
} from '@/lib/squadMode';

interface SquadDraftSceneProps {
  formation: Formation;
  criterion: SquadCriterion;
  pool: Player[];
  p1Name: string;
  p2Name: string;
  p1Assignment: SquadAssignment;
  p2Assignment: SquadAssignment;
  /** Sıradaki taraf (snake order). */
  activeSide: DraftSide;
  /** Adım indeksi — süre sayacını her seçimde sıfırlamak için. */
  stepIndex: number;
  /** Süre (sn). */
  seconds: number;
  /** Aktif tarafın joker hakkı kaldı mı? */
  jokerAvailable: boolean;
  /** Joker önerisi gösteriliyorsa (kabul/iptal bekliyor). */
  suggestion: Suggestion | null;
  onSelect: (slotId: string, playerId: string) => void;
  onTimeout: () => void;
  onUseJoker: () => void;
  onAcceptSuggestion: () => void;
  onDismissSuggestion: () => void;
}

/** Deterministik karıştırma (havuzu rastgele sırada göster — sıralı ipucu verme). */
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

export function SquadDraftScene({
  formation,
  criterion,
  pool,
  p1Name,
  p2Name,
  p1Assignment,
  p2Assignment,
  activeSide,
  stepIndex,
  seconds,
  jokerAvailable,
  suggestion,
  onSelect,
  onTimeout,
  onUseJoker,
  onAcceptSuggestion,
  onDismissSuggestion,
}: SquadDraftSceneProps) {
  const playersById = useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of pool) m.set(p.id, p);
    return m;
  }, [pool]);

  const activeAssignment = activeSide === 'P1' ? p1Assignment : p2Assignment;
  const activeName = activeSide === 'P1' ? p1Name : p2Name;
  const sideColor = activeSide === 'P1' ? 'text-side-red' : 'text-side-blue';

  // Aktif tarafın seçtiği boş slot (varsayılan: ilk boş).
  const firstEmpty =
    formation.slots.find((s) => activeAssignment[s.id] === null)?.id ?? null;
  const [pickedSlot, setPickedSlot] = useState<string | null>(firstEmpty);
  // stepIndex değişince (sıra değişti) seçili slotu sıfırla.
  const slotKey = `${activeSide}-${stepIndex}`;
  const [lastKey, setLastKey] = useState(slotKey);
  if (lastKey !== slotKey) {
    setLastKey(slotKey);
    setPickedSlot(firstEmpty);
  }
  const [search, setSearch] = useState('');

  const activeSlotDef =
    formation.slots.find((s) => s.id === pickedSlot) ?? null;

  const excluded = useMemo(
    () => draftedIds(p1Assignment, p2Assignment),
    [p1Assignment, p2Assignment],
  );

  // Havuz: bu slot için uygun + kullanılmamış. RASTGELE sırada (gizli değer).
  const candidates = useMemo(() => {
    if (!activeSlotDef) return [];
    const base = candidatesForSlot(activeSlotDef, criterion, pool, excluded);
    const q = search.trim().toLowerCase();
    const filtered = q
      ? base.filter((p) => p.displayName.toLowerCase().includes(q))
      : base;
    return shuffled(filtered, stepIndex * 7919 + activeSlotDef.id.length).slice(0, 50);
  }, [activeSlotDef, criterion, pool, excluded, search, stepIndex]);

  return (
    <section className="flex flex-col gap-4 pb-10">
      {/* Sıra + süre üst bandı */}
      <header className="flex flex-col items-center gap-2 text-center">
        <span className="rounded-full border border-accent-gold/40 bg-accent-gold/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-goldHi">
          {criterion.title}
        </span>
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            Sıra: <span className={sideColor}>{activeName}</span>
          </h1>
          <CountdownRing
            seconds={seconds}
            runKey={slotKey}
            onComplete={onTimeout}
            size={48}
            stroke={4}
            color="#60a5fa"
            urgentColor="#ef4444"
          />
        </div>
        <p className="text-xs text-white/55">
          Bir mevki seç, oyuncunu koy. Rakibin seçtiği oyuncu kapanır.
        </p>
      </header>

      {/* İki kadro yan yana — açık */}
      <div className="grid gap-3 sm:grid-cols-2">
        <DraftField
          name={p1Name}
          side="P1"
          active={activeSide === 'P1'}
          formation={formation}
          assignment={p1Assignment}
          playersById={playersById}
          pickedSlot={activeSide === 'P1' ? pickedSlot : null}
          suggestionSlot={activeSide === 'P1' ? suggestion?.slotId ?? null : null}
          onPickSlot={activeSide === 'P1' ? setPickedSlot : undefined}
        />
        <DraftField
          name={p2Name}
          side="P2"
          active={activeSide === 'P2'}
          formation={formation}
          assignment={p2Assignment}
          playersById={playersById}
          pickedSlot={activeSide === 'P2' ? pickedSlot : null}
          suggestionSlot={activeSide === 'P2' ? suggestion?.slotId ?? null : null}
          onPickSlot={activeSide === 'P2' ? setPickedSlot : undefined}
        />
      </div>

      {/* Joker barı */}
      <div className="flex items-center justify-center">
        <JokerButton
          available={jokerAvailable}
          onClick={onUseJoker}
        />
      </div>

      {/* Aktif slot havuzu */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white/80">
            {activeSlotDef ? `${activeSlotDef.label} için oyuncu seç` : 'Mevki seç'}
          </h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara…"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-accent-gold/40"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-2.5">
          {candidates.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pickedSlot && onSelect(pickedSlot, p.id)}
              disabled={!pickedSlot}
              className="rounded-lg p-1 transition hover:-translate-y-1 disabled:opacity-40"
            >
              <PlayerCard player={p} className="w-full" />
            </button>
          ))}
          {candidates.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-white/45">
              {pickedSlot ? 'Uygun oyuncu yok.' : 'Önce bir mevki seç.'}
            </p>
          )}
        </div>
      </div>

      {/* Joker önerisi overlay */}
      <AnimatePresence>
        {suggestion && (
          <SuggestionOverlay
            player={playersById.get(suggestion.playerId)}
            slotLabel={
              formation.slots.find((s) => s.id === suggestion.slotId)?.label ?? ''
            }
            value={suggestion.value}
            unit={criterion.unit}
            onAccept={onAcceptSuggestion}
            onDismiss={onDismissSuggestion}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

/** Bir tarafın saha kadrosu — açık, aktifse vurgulu, slotlar tıklanabilir. */
function DraftField({
  name,
  side,
  active,
  formation,
  assignment,
  playersById,
  pickedSlot,
  suggestionSlot,
  onPickSlot,
}: {
  name: string;
  side: DraftSide;
  active: boolean;
  formation: Formation;
  assignment: SquadAssignment;
  playersById: Map<string, Player>;
  pickedSlot: string | null;
  suggestionSlot: string | null;
  onPickSlot?: (slotId: string) => void;
}) {
  const order: Array<Player['position']> = ['FWD', 'MID', 'DEF', 'GK'];
  const rows = order
    .map((pos) => formation.slots.filter((s) => s.position === pos))
    .filter((r) => r.length > 0);
  const accent = side === 'P1' ? 'ring-side-red/60' : 'ring-side-blue/60';
  const filled = formation.slots.filter((s) => assignment[s.id]).length;

  return (
    <div
      className={cn(
        'glass-panel rounded-2xl border border-emerald-500/15 bg-emerald-950/25 p-3',
        active && `ring-2 ${accent}`,
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={cn('text-sm font-bold', side === 'P1' ? 'text-side-red' : 'text-side-blue')}>
          {name}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-white/45">
          {filled}/{formation.slots.length}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex justify-center gap-1.5">
            {row.map((slot) => {
              const pid = assignment[slot.id];
              const player = pid ? playersById.get(pid) : undefined;
              const isPicked = pickedSlot === slot.id;
              const isSuggested = suggestionSlot === slot.id;
              const clickable = active && !player && onPickSlot;
              return (
                <button
                  key={slot.id}
                  type="button"
                  disabled={!clickable}
                  onClick={clickable ? () => onPickSlot!(slot.id) : undefined}
                  className={cn(
                    'flex aspect-[3/4] flex-1 items-center justify-center rounded-lg border-2 transition',
                    'min-w-0',
                    player
                      ? 'border-transparent'
                      : isSuggested
                        ? 'border-accent-goldHi bg-accent-gold/20 shadow-glow-gold'
                        : isPicked
                          ? 'border-accent-goldHi bg-accent-gold/10'
                          : clickable
                            ? 'border-dashed border-white/30 hover:border-white/50'
                            : 'border-dashed border-white/10',
                  )}
                  style={{ maxWidth: 54 }}
                >
                  {player ? (
                    <PlayerCard player={player} size="sm" className="w-full" />
                  ) : (
                    <span className="text-[10px] font-bold text-white/45">
                      {slot.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Öneri jokeri butonu. */
function JokerButton({
  available,
  onClick,
}: {
  available: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      disabled={!available}
      onClick={onClick}
      whileHover={available ? { scale: 1.04 } : undefined}
      whileTap={available ? { scale: 0.97 } : undefined}
      className={cn(
        'relative inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition',
        available
          ? 'border-accent-gold/50 bg-accent-gold/15 text-accent-goldHi hover:bg-accent-gold/25'
          : 'cursor-not-allowed border-white/10 bg-white/5 text-white/35',
      )}
    >
      {available && (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent-goldHi text-[10px] font-black text-black">
          1
        </span>
      )}
      💡 {available ? 'Öneri Jokeri' : 'Joker kullanıldı'}
    </motion.button>
  );
}

/**
 * Öneri overlay — joker basınca: önerilen oyuncu kartı büyük, istatistiğiyle,
 * "Kabul et / Vazgeç" ile. Animasyonlu (spring giriş + altın aura).
 */
function SuggestionOverlay({
  player,
  slotLabel,
  value,
  unit,
  onAccept,
  onDismiss,
}: {
  player: Player | undefined;
  slotLabel: string;
  value: number;
  unit: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <motion.div
        initial={{ scale: 0.8, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-panel-strong relative flex max-w-sm flex-col items-center gap-3 rounded-2xl p-6 text-center"
      >
        {/* Altın aura pulse */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{ boxShadow: '0 0 60px rgba(255,215,107,0.4)' }}
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <div className="inline-flex items-center gap-1.5 rounded-full bg-accent-gold/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-accent-goldHi ring-1 ring-accent-gold/40">
          💡 Joker önerisi — {slotLabel}
        </div>
        {player && (
          <motion.div
            initial={{ rotateY: 90 }}
            animate={{ rotateY: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="w-32"
          >
            <PlayerCard player={player} size="reveal" className="w-full" />
          </motion.div>
        )}
        <div className="text-lg font-black">
          {player?.displayName ?? '—'}
        </div>
        <div className="rounded-lg bg-black/40 px-4 py-2 text-2xl font-black tabular-nums text-accent-goldHi">
          {value}
          <span className="ml-1 text-sm font-semibold text-white/60">{unit}</span>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <button type="button" onClick={onDismiss} className="btn-ghost">
            Vazgeç
          </button>
          <button type="button" onClick={onAccept} className="btn-primary">
            ✓ Kadroya kat
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
