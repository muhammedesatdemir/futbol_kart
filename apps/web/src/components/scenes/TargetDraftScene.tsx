'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { CountdownRing } from '@/components/CountdownRing';
import { XrayJokerButton } from '@/components/scenes/TargetXrayOverlay';
import { JokerHelpButton } from '@/components/JokerHelpButton';
import {
  SLOT_COUNT,
  type TargetCriterion,
  type TargetPicks,
  type DraftSide,
  draftedTargetIds,
  firstEmptySlot,
} from '@/lib/targetMode';

interface TargetDraftSceneProps {
  criterion: TargetCriterion;
  target: number;
  pool: Player[];
  p1Name: string;
  p2Name: string;
  p1Picks: TargetPicks;
  p2Picks: TargetPicks;
  /** Sıradaki taraf (snake order). */
  activeSide: DraftSide;
  /** Adım indeksi — süre sayacını her seçimde sıfırlamak için. */
  stepIndex: number;
  /** Süre (sn). */
  seconds: number;
  onSelect: (playerId: string) => void;
  onTimeout: () => void;
  // -------- Röntgen jokeri (aktif tarafın hakkı) --------
  xrayAvailable: boolean;
  xrayArmed: boolean;
  onToggleXray: () => void;
  onXrayPick: (playerId: string) => void;
}

/** Deterministik karıştırma (havuzu rastgele sırada göster — değer ipucu verme). */
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
 * Hedefe Yaklaş — Arkadaşa Karşı snake draft. İki oyuncu SIRAYLA (A,B,B,A,A,…)
 * 1'er kart seçer; seçilen kart kapanır (rakip alamaz). Değerler GİZLİ (kör).
 * Her seçim için geri sayım — dolarsa rastgele uygun oyuncu atanır.
 */
export function TargetDraftScene({
  criterion,
  target,
  pool,
  p1Name,
  p2Name,
  p1Picks,
  p2Picks,
  activeSide,
  stepIndex,
  seconds,
  onSelect,
  onTimeout,
  xrayAvailable,
  xrayArmed,
  onToggleXray,
  onXrayPick,
}: TargetDraftSceneProps) {
  const playersById = useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of pool) m.set(p.id, p);
    return m;
  }, [pool]);

  const activeName = activeSide === 'P1' ? p1Name : p2Name;
  const sideColor = activeSide === 'P1' ? 'text-side-red' : 'text-side-blue';
  const runKey = `${activeSide}-${stepIndex}`;

  const [search, setSearch] = useState('');

  const excluded = useMemo(
    () => draftedTargetIds(p1Picks, p2Picks),
    [p1Picks, p2Picks],
  );

  // Havuz: metrik verisi olan + kullanılmamış + arama. RASTGELE sıra (kör).
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = pool
      .filter((p) => criterion.metric(p) !== null)
      .filter((p) => !criterion.poolFilter || criterion.poolFilter(p))
      .filter((p) => !excluded.has(p.id))
      .filter((p) => (q ? p.displayName.toLowerCase().includes(q) : true));
    return shuffled(base, stepIndex * 7919 + 13).slice(0, 50);
  }, [pool, criterion, excluded, search, stepIndex]);

  return (
    <section className="flex flex-col gap-4 pb-10">
      {/* Sıra + süre üst bandı + hedef hatırlatma */}
      <header className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-gold/40 bg-accent-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-accent-goldHi">
          🎯 Hedef {target} · {criterion.title}
        </span>
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            Sıra: <span className={sideColor}>{activeName}</span>
          </h1>
          <CountdownRing
            seconds={seconds}
            runKey={runKey}
            onComplete={onTimeout}
            size={48}
            stroke={4}
            color="#60a5fa"
            urgentColor="#ef4444"
          />
        </div>
        <p className="text-xs text-white/55">
          Bir oyuncu seç — değeri gizli. Rakibin seçtiği oyuncu kapanır. Toplam{' '}
          <span className="font-semibold text-accent-goldHi">{target}</span>'e en
          yakın olan kazanır.
        </p>
      </header>

      {/* İki kadro yan yana — açık */}
      <div className="grid gap-3 sm:grid-cols-2">
        <DraftField
          name={p1Name}
          side="P1"
          active={activeSide === 'P1'}
          picks={p1Picks}
          playersById={playersById}
        />
        <DraftField
          name={p2Name}
          side="P2"
          active={activeSide === 'P2'}
          picks={p2Picks}
          playersById={playersById}
        />
      </div>

      {/* Joker barı (aktif tarafın röntgen hakkı) — buton + (?) ipucu */}
      <div className="flex items-center justify-center gap-2">
        <XrayJokerButton
          available={xrayAvailable}
          armed={xrayArmed}
          onClick={onToggleXray}
        />
        <JokerHelpButton
          title="Röntgen Jokeri"
          icon={<span className="text-sm">🔍</span>}
          body="Kart seçmeden önce havuzdaki bir oyuncunun o sorudaki gizli değerini açtır. Jokere bas, bir karta dokun: değeri açılır. İstersen kadrona kat, istemezsen vazgeç. Taraf başına maçta 1 kez."
        />
      </div>

      {/* Havuz */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white/80">
            {xrayArmed ? '🔍 Röntgenlemek için bir karta dokun' : 'Oyuncu seç'}
          </h2>
          <SearchInput value={search} onChange={setSearch} />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-2.5">
          {candidates.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => (xrayArmed ? onXrayPick(p.id) : onSelect(p.id))}
              className={cn(
                'rounded-lg p-1 transition hover:-translate-y-1',
                xrayArmed && 'cursor-help hover:bg-side-blue/15 hover:ring-2 hover:ring-side-blue/50',
              )}
            >
              {/* Değer GİZLİ — kör draft. */}
              <PlayerCard player={p} className="w-full" />
            </button>
          ))}
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

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/45">
        🔍
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Oyuncu ara…"
        className={cn(
          'w-40 rounded-lg border bg-white/5 py-1.5 pl-8 pr-3 text-sm outline-none transition sm:w-48',
          'border-accent-gold/30 placeholder:text-white/45',
          'focus:border-accent-gold/70 focus:bg-white/10 focus:ring-2 focus:ring-accent-gold/30',
          value ? '' : 'animate-pulse-soft',
        )}
      />
    </div>
  );
}

/** Bir tarafın 5 slotu — açık (seçilen kartlar görünür), aktifse vurgulu. */
function DraftField({
  name,
  side,
  active,
  picks,
  playersById,
}: {
  name: string;
  side: DraftSide;
  active: boolean;
  picks: TargetPicks;
  playersById: Map<string, Player>;
}) {
  const accent = side === 'P1' ? 'ring-side-red/60' : 'ring-side-blue/60';
  const filled = picks.filter((v) => v !== null).length;
  const nextSlot = firstEmptySlot(picks);

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
          {filled}/{SLOT_COUNT}
        </span>
      </div>
      <div className="flex justify-center gap-1.5">
        {picks.map((pid, idx) => {
          const player = pid ? playersById.get(pid) : undefined;
          // Aktif tarafın sıradaki (dolacak) slotu vurgulanır.
          const isNext = active && idx === nextSlot;
          return (
            <div
              key={idx}
              className="flex min-w-0 flex-1 flex-col items-center"
              style={{ maxWidth: 92 }}
            >
              <div
                className={cn(
                  'flex aspect-[3/4] w-full items-center justify-center rounded-lg border-2 transition',
                  player
                    ? 'border-transparent'
                    : isNext
                      ? 'border-accent-goldHi bg-accent-gold/10 shadow-glow-gold'
                      : 'border-dashed border-white/15',
                )}
              >
                {player ? (
                  <PlayerCard player={player} size="squad" hideBadges className="w-full" />
                ) : (
                  <span className="text-lg font-black text-white/35">{idx + 1}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
