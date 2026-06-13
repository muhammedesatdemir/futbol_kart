'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { CountdownRing } from '@/components/CountdownRing';
import { cn } from '@/lib/cn';
import { normalize } from '@/lib/playerFilters';
import { nationalityTr } from '@/lib/trLocale';
import { CareerTimeline } from './CareerTimeline';
import { TIER_POINTS, type CareerClue, type CareerSide } from '@/lib/careerMode';

const SIDE = {
  P1: { text: 'text-side-red', border: 'border-side-red/70', dot: 'bg-side-red', glow: 'shadow-[0_0_18px_rgba(239,68,68,0.4)]' },
  P2: { text: 'text-side-blue', border: 'border-side-blue/70', dot: 'bg-side-blue', glow: 'shadow-[0_0_18px_rgba(59,130,246,0.4)]' },
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
  onGuess: (playerId: string) => void;
  onTimeout: () => void;
  mySide: CareerSide;
  p1Name?: string;
  p2Name?: string;
  p1Score: number;
  p2Score: number;
  myGuess?: { correct: boolean } | null;
  myLocked?: boolean;
  myPoints?: number;
  oppSignal?: { tier: number; locked: boolean; submitted: boolean } | null;
  locked?: boolean;
  waitingLabel?: string | null;
}

/**
 * "Kariyer Yolu" tahmin sahnesi (KADEMELİ). Kompakt üst panel (skorlar kademe
 * çubuğunun iki yanında) + SAĞ-STICKY sayaç (sayfa kaydıkça görünür, kartlarla
 * çakışmaz) + İRİ kariyer çizelgesi + belirgin ipucu kutuları + havuz arama.
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

  const oppSide: CareerSide = mySide === 'P1' ? 'P2' : 'P1';
  const tierPoints = TIER_POINTS[clue.tier] ?? 0;
  const noResults = search && candidates.length === 0;

  return (
    <section className="flex flex-col gap-5 pb-10">
      {/* ───── KOMPAKT ÜST PANEL: [P1 skor] — [kademe çubuğu] — [P2 skor] ───── */}
      <header className="flex flex-col items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-gold/30 bg-accent-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-goldHi">
          🎽 Kariyer Yolu · Tur {roundNo}/{totalRounds}
        </span>

        <div className="flex w-full max-w-3xl items-center justify-center gap-3 sm:gap-5">
          <ScoreBlock name={p1Name} score={p1Score} side="P1" />

          {/* Kademe çubuğu (4 nokta, puan azalan) — ORTA */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {TIER_POINTS.map((pts, i) => (
              <div
                key={i}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 transition',
                  i === clue.tier
                    ? 'bg-accent-gold/20 ring-2 ring-accent-gold/60 shadow-[0_0_16px_rgba(240,193,75,0.4)]'
                    : i < clue.tier
                      ? 'opacity-35'
                      : 'opacity-25',
                )}
              >
                <span className={cn('text-base font-black leading-none', i === clue.tier ? 'text-accent-goldHi' : 'text-white/55')}>
                  {pts}p
                </span>
                <span className="text-[8px] uppercase tracking-wider text-white/40">{i + 1}.</span>
              </div>
            ))}
          </div>

          <ScoreBlock name={p2Name} score={p2Score} side="P2" />
        </div>

        <p className="text-xs text-white/55">
          Şu an <span className="font-bold text-accent-goldHi">{tierPoints} puan</span> · {TIER_LABEL[clue.tier]}
        </p>
      </header>

      {/* ───── SAĞ-STICKY SAYAÇ + DURUM (sayfa kaydıkça görünür, kartlarla çakışmaz) ───── */}
      <div className="pointer-events-none fixed right-3 top-1/3 z-40 flex flex-col items-center gap-2 sm:right-6">
        {!hideTimer && !myLocked && (
          <div className="pointer-events-auto rounded-full bg-black/40 p-1.5 backdrop-blur-sm">
            <CountdownRing
              seconds={seconds}
              deadlineMs={deadlineMs}
              runKey={timerKey}
              onComplete={onTimeout}
              size={62}
              stroke={6}
              color="#f0c14b"
              urgentColor="#ef4444"
            />
          </div>
        )}
        {/* Kendi durum rozeti */}
        <div className="pointer-events-auto flex flex-col items-center gap-1.5">
          {myLocked ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/60 bg-emerald-400/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300 backdrop-blur-sm">
              ✓ +{myPoints}
            </span>
          ) : myGuess ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold backdrop-blur-sm',
                myGuess.correct
                  ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-300'
                  : 'border-side-red/60 bg-side-red/15 text-side-red',
              )}
            >
              {myGuess.correct ? '✓ Doğru' : '✗ Yanlış'}
            </span>
          ) : null}
          {/* Rakip sinyali (kim/ne GİZLİ; sadece durum) */}
          {oppSignal && (
            <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold backdrop-blur-sm', SIDE[oppSide].border, SIDE[oppSide].text)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', SIDE[oppSide].dot)} aria-hidden />
              {oppSignal.locked ? 'bildi ✓' : oppSignal.submitted ? 'seçti' : `${oppSignal.tier + 1}. ipucu`}
            </span>
          )}
        </div>
      </div>

      {/* ───── DURUM / BEKLEME ETİKETİ (akış içinde, sticky değil) ───── */}
      {(locked || myGuess) && (
        <div className="flex justify-center">
          {locked && waitingLabel ? (
            <motion.div
              key={denyShake}
              animate={denyActive ? { x: [0, -6, 6, -4, 4, -2, 2, 0] } : {}}
              transition={{ duration: 0.45 }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-bold transition-colors duration-300',
                denyActive
                  ? 'border-side-red/70 bg-side-red/20 text-side-red'
                  : 'border-accent-gold/40 bg-accent-gold/10 text-accent-goldHi',
              )}
            >
              <span aria-hidden>{denyActive ? '🚫' : '⏳'}</span>
              {denyActive ? 'Şu an tahmin edemezsin!' : waitingLabel}
            </motion.div>
          ) : null}
        </div>
      )}

      {/* ───── İPUCU KUTULARI (milliyet / ilk harf) — BELİRGİN + yanıp sönen glow ───── */}
      {(clue.nationality || clue.initial) && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {clue.nationality && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1, boxShadow: ['0 0 0px rgba(255,255,255,0)', '0 0 18px rgba(255,255,255,0.18)', '0 0 0px rgba(255,255,255,0)'] }}
              transition={{ boxShadow: { duration: 2, repeat: Infinity, ease: 'easeInOut' } }}
              className="flex flex-col items-center gap-1 rounded-2xl border-2 border-white/25 bg-white/8 px-5 py-2.5"
            >
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/45">Milliyet</span>
              <span className="text-lg font-black text-white/95">🌍 {nationalityTr(clue.nationality)}</span>
            </motion.div>
          )}
          {clue.initial && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1, boxShadow: ['0 0 8px rgba(240,193,75,0.25)', '0 0 26px rgba(240,193,75,0.6)', '0 0 8px rgba(240,193,75,0.25)'] }}
              transition={{ boxShadow: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } }}
              className="flex flex-col items-center gap-1 rounded-2xl border-2 border-accent-gold/60 bg-accent-gold/15 px-5 py-2.5"
            >
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-accent-goldHi/70">İlk harf</span>
              <span className="text-2xl font-black text-accent-goldHi">{clue.initial}…</span>
            </motion.div>
          )}
        </div>
      )}

      {/* ───── KARİYER ÇİZELGESİ (İRİ) ───── */}
      <CareerTimeline clue={clue} />

      {/* ───── HAVUZ ARAMA ───── */}
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
              <p className="text-sm font-semibold text-white/70">Bu isim oyuncu havuzumuzda yok gibi görünüyor.</p>
              <p className="text-xs text-white/45">Farklı bir yazım dene — yalnızca havuzdaki futbolcular seçilebilir.</p>
            </div>
          )}
          {!search && (
            <p className="col-span-full py-6 text-center text-sm text-white/45">İpuçlarına bak, aklındaki futbolcuyu yaz.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function ScoreBlock({ name, score, side }: { name: string; score: number; side: CareerSide }) {
  return (
    <div className={cn('flex min-w-[72px] flex-col items-center rounded-2xl border bg-white/5 px-3 py-1.5', SIDE[side].border)}>
      <span className={cn('max-w-[90px] truncate text-xs font-bold', SIDE[side].text)}>{name}</span>
      <span className="text-2xl font-black tabular-nums">{score}</span>
    </div>
  );
}
