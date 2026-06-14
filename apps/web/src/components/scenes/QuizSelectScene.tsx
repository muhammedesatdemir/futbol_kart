'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { CountdownRing } from '@/components/CountdownRing';
import { cn } from '@/lib/cn';
import type { QuizSide } from '@/lib/quizMode';

const SIDE = {
  P1: { text: 'text-side-red', border: 'border-side-red/70', dot: 'bg-side-red', ring: 'ring-side-red' },
  P2: { text: 'text-side-blue', border: 'border-side-blue/70', dot: 'bg-side-blue', ring: 'ring-side-blue' },
} as const;

/** İlk harfi Türkçe-duyarlı büyüt (örn. "forvetler" → "Forvetler"). */
function cap(s: string): string {
  return s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);
}

interface QuizSelectSceneProps {
  /** Bu turdaki 4 oyuncu (ekran sırası). */
  choices: Player[];
  /** İyelik ekli soru ifadesi (örn. "toplam kupası") + karşılaştırma fiili. */
  metricQuestion: string;
  metricMost: string;
  /** Pozisyon bağlamı (örn. "forvetler") — pozisyona-bağlı metrikte; yoksa null. */
  positionContext?: string | null;
  roundNo: number;
  totalRounds: number;
  /** Seçim süresi (sn) — halka oranı referansı. */
  seconds: number;
  timerKey: string | number;
  /** ONLINE: sunucu-otoriteli bitiş anı. */
  deadlineMs?: number | null;
  hideTimer?: boolean;
  /** Seçim onayla (1-2 index). x2 aktifse 2 index gönderilebilir. */
  onSubmit: (indexes: number[]) => void;
  onTimeout: () => void;
  mySide: QuizSide;
  p1Name?: string;
  p2Name?: string;
  p1Score: number;
  p2Score: number;
  /** KENDİ seçimim onaylandı mı + doğru muydu (DEĞER GİZLİ — turda açılır). */
  myPick?: { correct: boolean } | null;
  /** Rakip bu turda seçti mi? ("Rakip hazır ✓" rozeti). */
  opponentReady?: boolean;
  /** Seçim kilitli mi (kendi seçimimi yaptım / bekliyorum). */
  locked?: boolean;
  waitingLabel?: string | null;
  // ── Jokerler ──
  /** %50 jokeri kullanıldı mı? (maç-seviyesi → buton disabled) */
  fiftyUsed?: boolean;
  /** x2 jokeri kullanıldı mı? (maç-seviyesi → buton disabled) */
  doubleUsed?: boolean;
  /** x2 BU TUR aktif mi? (2 işaret + Onayla modu — yalnız kullanıldığı tur). */
  doubleActive?: boolean;
  /** Joker'e bas (sayfa state'i işler). Verilmezse joker barı gizli. */
  onJoker?: (joker: 'fifty' | 'double') => void;
  /** %50 sonrası ELENEN index'ler (gri + tıklanamaz). Boş = eleme yok. */
  eliminatedIndexes?: number[];
}

/**
 * "4'lü Kıyas" seçim sahnesi (EŞZAMANLI). 4 kart + 2 joker. x2 aktifken 2 kart
 * işaretlenip "Onayla"; değilse karta tıklamak doğrudan seçer. %50 elenen kartlar
 * grileşir. Doğru/yanlış reveal'da açılır (burada yalnız "✓ kart seçildi" onayı).
 */
export function QuizSelectScene({
  choices,
  metricQuestion,
  metricMost,
  positionContext = null,
  roundNo,
  totalRounds,
  seconds,
  timerKey,
  deadlineMs = null,
  hideTimer = false,
  onSubmit,
  onTimeout,
  mySide,
  p1Name = 'Sen',
  p2Name = 'Rakip',
  p1Score,
  p2Score,
  myPick = null,
  opponentReady = false,
  locked = false,
  waitingLabel = null,
  fiftyUsed = false,
  doubleUsed = false,
  doubleActive = false,
  onJoker,
  eliminatedIndexes = [],
}: QuizSelectSceneProps) {
  // x2 aktif → 2'ye kadar işaretle, sonra "Onayla". Değilse tek tıkla seç.
  const [marked, setMarked] = useState<number[]>([]);

  // Yeni tura geçişte işaretleri temizle.
  useEffect(() => {
    setMarked([]);
  }, [roundNo]);

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

  const maxMarks = doubleActive ? 2 : 1;
  const elimSet = new Set(eliminatedIndexes);

  const myName = mySide === 'P1' ? p1Name : p2Name;
  const oppName = mySide === 'P1' ? p2Name : p1Name;
  const myCls = SIDE[mySide];
  const oppSide: QuizSide = mySide === 'P1' ? 'P2' : 'P1';

  const handleCardClick = (idx: number) => {
    if (locked) {
      triggerDeny();
      return;
    }
    if (elimSet.has(idx)) return; // elenen kart seçilemez
    if (maxMarks === 1) {
      onSubmit([idx]); // x2 yok → doğrudan seç
      return;
    }
    // x2 aktif → işaretle/kaldır (max 2).
    setMarked((prev) => {
      if (prev.includes(idx)) return prev.filter((i) => i !== idx);
      if (prev.length >= maxMarks) return [prev[1] ?? prev[0]!, idx].slice(-maxMarks);
      return [...prev, idx];
    });
  };

  return (
    <section className="flex flex-col gap-4 pb-10">
      {/* Üst: tur + metrik + skor */}
      <header className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-gold/30 bg-accent-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-goldHi">
          Tur {roundNo}/{totalRounds}
        </span>
        <h2 className="text-lg font-black sm:text-xl">
          {positionContext && (
            <span className="text-white/85">{cap(positionContext)} arasında </span>
          )}
          hangisinin <span className="text-accent-goldHi">{metricQuestion}</span> {metricMost}?
        </h2>
        <div className="flex items-center gap-4">
          <ScorePill name={p1Name} score={p1Score} side="P1" />
          <span className="text-xs font-bold text-white/40">vs</span>
          <ScorePill name={p2Name} score={p2Score} side="P2" />
        </div>
      </header>

      {/* Sayaç + durum */}
      <div className="flex flex-col items-center gap-3">
        {!hideTimer && (
          <CountdownRing
            seconds={seconds}
            deadlineMs={deadlineMs}
            runKey={timerKey}
            onComplete={onTimeout}
            size={64}
            stroke={6}
            color="#f0c14b"
            urgentColor="#ef4444"
          />
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          {myPick ? (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold',
                'border-accent-gold/60 bg-accent-gold/15 text-accent-goldHi',
              )}
            >
              <span aria-hidden>✓</span>
              Seçimin alındı (doğru cevap turda açılır)
            </span>
          ) : (
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold', myCls.text)}>
              {myName}: bir kart seç →
            </span>
          )}

          {opponentReady && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold', SIDE[oppSide].border, SIDE[oppSide].text)}
            >
              <span className={cn('h-2 w-2 rounded-full', SIDE[oppSide].dot)} aria-hidden />
              {oppName} hazır ✓
            </motion.span>
          )}
        </div>

        {/* JOKER BARI (her biri 1×/maç; aynı turda birlikte kullanılabilir) */}
        {onJoker && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <JokerButton
              icon="½"
              label={fiftyUsed ? '%50 kullanıldı' : '%50 — 2 şık ele'}
              used={fiftyUsed}
              disabled={locked || elimSet.size > 0}
              onClick={() => onJoker('fifty')}
              title="İstatistik olarak en uzak iki şıkkı eler — doğru cevap + en yakın çeldirici kalır (maçta 1 kez)"
            />
            <JokerButton
              icon="×2"
              label={doubleUsed ? 'x2 kullanıldı' : 'x2 — çift işaret'}
              used={doubleUsed}
              disabled={locked}
              onClick={() => onJoker('double')}
              title="Bu turda 2 kart işaretle; biri doğruysa kazanırsın (maçta 1 kez)"
            />
          </div>
        )}

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
            {denyActive ? 'Seçimini zaten yaptın!' : waitingLabel}
          </motion.div>
        )}
      </div>

      {/* 4 KART */}
      <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {choices.map((p, idx) => {
          const isElim = elimSet.has(idx);
          const isMarked = marked.includes(idx);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleCardClick(idx)}
              disabled={isElim}
              className={cn(
                'relative rounded-xl transition',
                !locked && !isElim && 'hover:-translate-y-1',
                isElim && 'cursor-not-allowed opacity-25 grayscale',
                locked && !isElim && 'cursor-not-allowed opacity-60',
                isMarked && cn('-translate-y-1 ring-4 ring-offset-2 ring-offset-transparent', myCls.ring),
              )}
            >
              <PlayerCard player={p} className="w-full" hideBadges />
              {isMarked && (
                <span className={cn('absolute -top-2 -right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-sm font-black text-white shadow-lg', myCls.dot)} aria-hidden>
                  ✓
                </span>
              )}
              {isElim && (
                <span className="absolute inset-0 z-10 flex items-center justify-center text-3xl" aria-hidden>✕</span>
              )}
            </button>
          );
        })}
      </div>

      {/* x2 aktif → "Onayla" butonu (1-2 işaret) */}
      <AnimatePresence>
        {doubleActive && !locked && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-2"
          >
            <p className="text-xs font-semibold text-white/60">
              x2 aktif — en fazla 2 kart işaretle, sonra onayla.
            </p>
            <button
              type="button"
              disabled={marked.length === 0}
              onClick={() => onSubmit(marked)}
              className={cn('btn-primary px-8 py-2.5', marked.length === 0 && 'cursor-not-allowed opacity-50')}
            >
              {marked.length === 2 ? 'İkisini de onayla ✓✓' : 'Seçimi onayla ✓'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function JokerButton({
  icon,
  label,
  used,
  disabled,
  onClick,
  title,
}: {
  icon: string;
  label: string;
  used: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      disabled={used || disabled}
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition',
        used
          ? 'cursor-not-allowed border-white/10 bg-white/5 text-white/35'
          : 'border-accent-gold/50 bg-accent-gold/15 text-accent-goldHi hover:bg-accent-gold/25',
        !used && disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className="text-sm" aria-hidden>{icon}</span>
      {label}
    </button>
  );
}

function ScorePill({ name, score, side }: { name: string; score: number; side: QuizSide }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/10 px-4 py-1.5">
      <span className={cn('text-xs font-bold', SIDE[side].text)}>{name}</span>
      <span className="text-xl font-black tabular-nums">{score}</span>
    </div>
  );
}
