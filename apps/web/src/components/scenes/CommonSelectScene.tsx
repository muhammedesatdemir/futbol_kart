'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { CountdownRing } from '@/components/CountdownRing';
import { cn } from '@/lib/cn';
import { normalize } from '@/lib/playerFilters';
import { CommonPairHeader } from './CommonPairHeader';
import type { CommonRoundPair, CommonHint, CommonSide } from '@/lib/commonMode';

const SIDE = {
  P1: { text: 'text-side-red', border: 'border-side-red/70', dot: 'bg-side-red' },
  P2: { text: 'text-side-blue', border: 'border-side-blue/70', dot: 'bg-side-blue' },
} as const;

interface CommonSelectSceneProps {
  pair: CommonRoundPair;
  pool: Player[];
  roundNo: number;
  totalRounds: number;
  /** Seçim süresi (sn) — halka oranı referansı. */
  seconds: number;
  timerKey: string | number;
  /** ONLINE: sunucu-otoriteli bitiş anı. */
  deadlineMs?: number | null;
  hideTimer?: boolean;
  /** Bir futbolcu seç (id). */
  onSelect: (playerId: string) => void;
  onTimeout: () => void;
  /** Kimin perspektifinden oynanıyor (skor/etiket rengi). */
  mySide: CommonSide;
  p1Name?: string;
  p2Name?: string;
  /** Toplam skorlar (üst şerit — reveal'larda güncel). */
  p1Score: number;
  p2Score: number;
  /** Bu turda KENDİ seçimim yapıldı mı + doğru muydu (isim onayı; PUAN GİZLİ). */
  myPick?: { playerId: string; correct: boolean } | null;
  /** Rakip bu turda seçimini yaptı mı? ("Rakip hazır ✓" rozeti — isim/puan gizli). */
  opponentReady?: boolean;
  /** Seçim kilitli mi (kendi seçimimi yaptım / bekliyorum). */
  locked?: boolean;
  /** Kilit/bekleme etiketi. */
  waitingLabel?: string | null;
  /** İPUCU JOKERİ (1×/maç). Kullanıldı mı? */
  jokerUsed?: boolean;
  /** Joker'e basıldı — sayfa ipucu hesaplar. Verilmezse joker barı gizli. */
  onHint?: () => void;
  /** Gelen ipucu (joker sonrası) — gösterilir. null → ipucu yok. */
  hint?: CommonHint | null;
}

/**
 * "Ortak Bul" seçim sahnesi (EŞZAMANLI). Üstte iki kulüp + skor; altta havuz +
 * arama. Bir futbolcuya tıkla = bu turki seçimin. Doğruysa "✓ Doğru ortak" görünür
 * AMA PUAN GİZLİ (reveal'da açılır). Rakip seçince "Rakip hazır ✓" rozeti yanıp söner.
 */
export function CommonSelectScene({
  pair,
  pool,
  roundNo,
  totalRounds,
  seconds,
  timerKey,
  deadlineMs = null,
  hideTimer = false,
  onSelect,
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
  jokerUsed = false,
  onHint,
  hint = null,
}: CommonSelectSceneProps) {
  const [search, setSearch] = useState('');

  // Yeni tura geçişte aramayı temizle (önceki tur araması kalmasın).
  useEffect(() => {
    setSearch('');
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

  // Havuz vitrini: arama yoksa rastgele-deterministik bir kesit (maç boyu sabit
  // değil — her tur farklı çift; çift id'sinden türetilen tohum yeter).
  const vitrineSeed = useMemo(() => {
    let h = 2166136261;
    const k = pair.a + pair.b;
    for (let i = 0; i < k.length; i++) {
      h ^= k.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }, [pair.a, pair.b]);

  const candidates = useMemo(() => {
    const q = normalize(search);
    if (q) {
      return pool.filter((p) => normalize(p.displayName).includes(q)).slice(0, 48);
    }
    // Arama yoksa: deterministik karışık bir kesit (ipucu için değil — sadece
    // "boş havuz" yerine bir şeyler görünsün; doğru cevap vitrin sırasından
    // anlaşılmaz → exploit yok). Kullanıcı genelde arar.
    const shuffled = [...pool];
    let s = vitrineSeed >>> 0;
    const rand = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled.slice(0, 24);
  }, [pool, search, vitrineSeed]);

  const myName = mySide === 'P1' ? p1Name : p2Name;
  const oppName = mySide === 'P1' ? p2Name : p1Name;
  const myCls = SIDE[mySide];
  const oppSide: CommonSide = mySide === 'P1' ? 'P2' : 'P1';

  const noResults = search && candidates.length === 0;

  return (
    <section className="flex flex-col gap-4 pb-10">
      {/* Üst: tur + iki kulüp + skor */}
      <header className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-gold/30 bg-accent-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-goldHi">
          Tur {roundNo}/{totalRounds} · {pair.count} ortak isim
        </span>
        <CommonPairHeader pair={pair} compact />
        <div className="flex items-center gap-4">
          <ScorePill name={p1Name} score={p1Score} side="P1" />
          <span className="text-xs font-bold text-white/40">vs</span>
          <ScorePill name={p2Name} score={p2Score} side="P2" />
        </div>
      </header>

      {/* Sıra/durum paneli — sabit, sağ/sol değil ortada (eşzamanlı, "sıra" yok) */}
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

        {/* Kendi seçim durumu */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {myPick ? (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold',
                myPick.correct
                  ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-300'
                  : 'border-side-red/60 bg-side-red/15 text-side-red',
              )}
            >
              <span aria-hidden>{myPick.correct ? '✓' : '✗'}</span>
              {myPick.correct ? 'Doğru ortak! (puan turda açılır)' : 'Bu çiftte oynamamış'}
            </span>
          ) : (
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold', myCls.text)}>
              {myName}: seç →
            </span>
          )}

          {/* Rakip hazır rozeti (isim/puan GİZLİ — sadece "seçti") */}
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

        {/* İPUCU JOKERİ (1×/maç) */}
        {onHint && (
          <button
            type="button"
            disabled={jokerUsed || locked}
            onClick={onHint}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition',
              jokerUsed
                ? 'cursor-not-allowed border-white/10 bg-white/5 text-white/35'
                : 'border-accent-gold/50 bg-accent-gold/15 text-accent-goldHi hover:bg-accent-gold/25',
              locked && !jokerUsed && 'cursor-not-allowed opacity-50',
            )}
            title="Kapatılmamış bir ortağın baş harf + pozisyon + milliyetini açar (maçta 1 kez)"
          >
            <span aria-hidden>💡</span>
            {jokerUsed ? 'İpucu kullanıldı' : 'İpucu jokeri'}
          </button>
        )}

        {/* İpucu içeriği */}
        <AnimatePresence>
          {hint && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass-panel-strong flex flex-col items-center gap-1 rounded-2xl border-2 border-accent-gold/40 px-4 py-2 text-center"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/55">İpucu</span>
              <span className="text-sm font-black text-accent-goldHi">
                {hint.initial}… {hint.position ? `· ${hint.position}` : ''} {hint.nationality ? `· ${hint.nationality}` : ''}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bekleme / kilit etiketi */}
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

      {/* Havuz */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white/80">Ortak futbolcuyu ara</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara: futbolcu adı…"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-accent-gold/40"
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
                onSelect(p.id);
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
          {!search && candidates.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-white/45">
              Aramaya başla — aklındaki ortak futbolcuyu yaz.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ScorePill({ name, score, side }: { name: string; score: number; side: CommonSide }) {
  return (
    <div className={cn('flex flex-col items-center rounded-2xl border border-white/10 px-4 py-1.5')}>
      <span className={cn('text-xs font-bold', SIDE[side].text)}>{name}</span>
      <span className="text-xl font-black tabular-nums">{score}</span>
    </div>
  );
}
