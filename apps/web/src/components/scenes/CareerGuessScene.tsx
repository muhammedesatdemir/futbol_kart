'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { CountdownRing } from '@/components/CountdownRing';
import { cn } from '@/lib/cn';
import { normalize } from '@/lib/playerFilters';
import { CareerTimeline } from './CareerTimeline';
import { TIER_POINTS, type CareerClue, type CareerSide } from '@/lib/careerMode';

const SIDE = {
  P1: { text: 'text-side-red', border: 'border-side-red/70', dot: 'bg-side-red' },
  P2: { text: 'text-side-blue', border: 'border-side-blue/70', dot: 'bg-side-blue' },
} as const;

const TIER_LABEL = ['Dağınık kulüpler', 'Kronolojik sıra', 'Yıllar + milliyet', 'İlk harf'];

interface CareerGuessSceneProps {
  clue: CareerClue;
  pool: Player[];
  roundNo: number;
  totalRounds: number;
  seconds: number;
  timerKey: string | number;
  deadlineMs?: number | null;
  hideTimer?: boolean;
  /** Bir futbolcu seç (id). */
  onGuess: (playerId: string) => void;
  onTimeout: () => void;
  mySide: CareerSide;
  p1Name?: string;
  p2Name?: string;
  p1Score: number;
  p2Score: number;
  /** Bu kademede tahminim yapıldı mı + doğru muydu (puan reveal'da). */
  myGuess?: { correct: boolean } | null;
  /** Doğru bilip kilitlendim mi (artık bekliyorum)? */
  myLocked?: boolean;
  myPoints?: number;
  /** Rakip sinyali: hangi kademede, kilitlendi mi, bu kademede tahmin etti mi. */
  oppSignal?: { tier: number; locked: boolean; submitted: boolean } | null;
  /** Seçim kilitli mi (tahmin yaptım/kilitliyim → bekle). */
  locked?: boolean;
  waitingLabel?: string | null;
}

/**
 * "Kariyer Yolu" tahmin sahnesi (KADEMELİ). Üstte kademe + puan + süre; ortada
 * kariyer çizelgesi (CareerTimeline); altta havuz + arama. Bir futbolcuya tıkla =
 * bu kademedeki tahminin. Doğru → kilitlenirsin (puan). Yanlış → sonraki kademe.
 */
export function CareerGuessScene({
  clue,
  pool,
  roundNo,
  totalRounds,
  seconds,
  timerKey,
  deadlineMs = null,
  hideTimer = false,
  onGuess,
  onTimeout,
  mySide,
  p1Name = 'Sen',
  p2Name = 'Rakip',
  p1Score,
  p2Score,
  myGuess = null,
  myLocked = false,
  myPoints = 0,
  oppSignal = null,
  locked = false,
  waitingLabel = null,
}: CareerGuessSceneProps) {
  const [search, setSearch] = useState('');

  // Kademe değişince aramayı temizle (yeni ipucu, taze arama).
  useEffect(() => {
    setSearch('');
  }, [clue.tier, roundNo]);

  const [denyActive, setDenyActive] = useState(false);
  const [denyShake, setDenyShake] = useState(0);
  const denyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerDeny = () => {
    setDenyActive(true);
    setDenyShake((n) => n + 1);
    if (denyTimerRef.current) clearTimeout(denyTimerRef.current);
    denyTimerRef.current = setTimeout(() => setDenyActive(false), 2200);
  };
  useEffect(() => {
    if (!locked && denyActive) setDenyActive(false);
    return () => {
      if (denyTimerRef.current) clearTimeout(denyTimerRef.current);
    };
  }, [locked, denyActive]);

  const candidates = useMemo(() => {
    const q = normalize(search);
    if (!q) return [];
    return pool.filter((p) => normalize(p.displayName).includes(q)).slice(0, 48);
  }, [pool, search]);

  const myName = mySide === 'P1' ? p1Name : p2Name;
  const oppName = mySide === 'P1' ? p2Name : p1Name;
  const oppSide: CareerSide = mySide === 'P1' ? 'P2' : 'P1';
  const tierPoints = TIER_POINTS[clue.tier] ?? 0;
  const noResults = search && candidates.length === 0;

  return (
    <section className="flex flex-col gap-4 pb-10">
      {/* Üst: tur + kademe + puan göstergesi */}
      <header className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-gold/30 bg-accent-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-goldHi">
          🎽 Kariyer Yolu · Tur {roundNo}/{totalRounds}
        </span>
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">Bu kariyer kimin?</h1>

        {/* Kademe ilerleme çubuğu (4 nokta, puan azalan) */}
        <div className="flex items-center gap-2">
          {TIER_POINTS.map((pts, i) => (
            <div
              key={i}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 transition',
                i === clue.tier
                  ? 'bg-accent-gold/20 ring-1 ring-accent-gold/50'
                  : i < clue.tier
                    ? 'opacity-40'
                    : 'opacity-25',
              )}
            >
              <span className={cn('text-sm font-black', i === clue.tier ? 'text-accent-goldHi' : 'text-white/60')}>
                {pts}p
              </span>
              <span className="text-[8px] uppercase tracking-wider text-white/40">{i + 1}. ipucu</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/55">
          Şu an <span className="font-semibold text-accent-goldHi">{tierPoints} puan</span> · {TIER_LABEL[clue.tier]}
        </p>

        <div className="flex items-center gap-4">
          <ScorePill name={p1Name} score={p1Score} side="P1" />
          <span className="text-xs font-bold text-white/40">vs</span>
          <ScorePill name={p2Name} score={p2Score} side="P2" />
        </div>
      </header>

      {/* Süre + durum */}
      <div className="flex flex-col items-center gap-3">
        {!hideTimer && !myLocked && (
          <CountdownRing
            seconds={seconds}
            deadlineMs={deadlineMs}
            runKey={timerKey}
            onComplete={onTimeout}
            size={60}
            stroke={6}
            color="#f0c14b"
            urgentColor="#ef4444"
          />
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          {/* Kendi durumum */}
          {myLocked ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/60 bg-emerald-400/15 px-3 py-1.5 text-xs font-bold text-emerald-300">
              ✓ Bildin · +{myPoints} · rakip bekleniyor
            </span>
          ) : myGuess ? (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold',
                myGuess.correct
                  ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-300'
                  : 'border-side-red/60 bg-side-red/15 text-side-red',
              )}
            >
              {myGuess.correct ? '✓ Doğru!' : '✗ Yanlış — sonraki ipucu açılıyor'}
            </span>
          ) : (
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold', SIDE[mySide].text)}>
              {myName}: tahmin et →
            </span>
          )}

          {/* Rakip sinyali (kim/ne seçtiği GİZLİ; sadece durum) */}
          {oppSignal && (
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold', SIDE[oppSide].border, SIDE[oppSide].text)}>
              <span className={cn('h-2 w-2 rounded-full', SIDE[oppSide].dot)} aria-hidden />
              {oppSignal.locked
                ? `${oppName} bildi ✓`
                : oppSignal.submitted
                  ? `${oppName} tahmin etti`
                  : `${oppName}: ${oppSignal.tier + 1}. ipucu`}
            </span>
          )}
        </div>

        {/* Bekleme/kilit etiketi + deny shake */}
        {locked && waitingLabel && (
          <motion.div
            key={denyShake}
            animate={denyActive ? { x: [0, -6, 6, -4, 4, -2, 2, 0] } : {}}
            transition={{ duration: 0.45 }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors duration-300',
              denyActive
                ? 'border-side-red/70 bg-side-red/20 text-side-red'
                : 'border-accent-gold/40 bg-accent-gold/10 text-accent-goldHi',
            )}
          >
            <span aria-hidden>{denyActive ? '🚫' : '⏳'}</span>
            {denyActive ? 'Şu an tahmin edemezsin!' : waitingLabel}
          </motion.div>
        )}
      </div>

      {/* Kariyer çizelgesi */}
      <CareerTimeline clue={clue} />

      {/* Açık ipuçları (milliyet / ilk harf) */}
      {(clue.nationality || clue.initial) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {clue.nationality && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/80">
              🌍 {clue.nationality}
            </span>
          )}
          {clue.initial && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-gold/40 bg-accent-gold/15 px-3 py-1.5 text-xs font-black text-accent-goldHi">
              İlk harf: {clue.initial}…
            </span>
          )}
        </div>
      )}

      {/* Havuz arama */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white/80">Futbolcuyu tahmin et</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={locked}
            placeholder="Ara: futbolcu adı…"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-accent-gold/40 disabled:opacity-40"
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
                'relative rounded-lg transition hover:-translate-y-1',
                locked && 'cursor-not-allowed opacity-60 hover:translate-y-0',
              )}
            >
              <PlayerCard player={p} className="w-full" />
            </button>
          ))}
          {noResults && (
            <div className="col-span-full flex flex-col items-center gap-1 py-8 text-center">
              <span className="text-2xl" aria-hidden>🔍</span>
              <p className="text-sm font-semibold text-white/70">
                Bu isim oyuncu havuzumuzda yok gibi görünüyor.
              </p>
              <p className="text-xs text-white/45">
                Farklı bir yazım dene — yalnızca havuzdaki futbolcular seçilebilir.
              </p>
            </div>
          )}
          {!search && (
            <p className="col-span-full py-6 text-center text-sm text-white/45">
              İpuçlarına bak, aklındaki futbolcuyu yaz.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ScorePill({ name, score, side }: { name: string; score: number; side: CareerSide }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/10 px-4 py-1.5">
      <span className={cn('text-xs font-bold', SIDE[side].text)}>{name}</span>
      <span className="text-xl font-black tabular-nums">{score}</span>
    </div>
  );
}
