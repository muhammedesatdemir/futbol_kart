'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { CountdownRing } from '@/components/CountdownRing';
import { cn } from '@/lib/cn';
import { normalize } from '@/lib/playerFilters';
import { ChainClubsGrid } from './ChainClubsGrid';
import {
  matchedClubs,
  CHAIN_PICKS_PER_SIDE,
  type ChainClub,
  type ChainPick,
  type ChainSide,
} from '@/lib/chainMode';

const SIDE = {
  P1: { text: 'text-side-red', border: 'border-side-red/70', glow: 'shadow-[0_0_22px_rgba(239,68,68,0.45)]' },
  P2: { text: 'text-side-blue', border: 'border-side-blue/70', glow: 'shadow-[0_0_22px_rgba(59,130,246,0.45)]' },
} as const;

/** Deterministik karıştırma (vitrin için — maç boyu sabit). */
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
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

interface ChainPlaySceneProps {
  clubs: ChainClub[];
  pool: Player[];
  /** Tahmin süresi (sn). */
  seconds: number;
  timerKey: string | number;
  /** Bir futbolcu seç (id). */
  onGuess: (playerId: string) => void;
  onTimeout: () => void;
  activeSide: ChainSide;
  /** Taraf pick'leri (skor + kaç pick yapıldığı). */
  p1Picks: ChainPick[];
  p2Picks: ChainPick[];
  p1Name?: string;
  p2Name?: string;
  /** Son girilen pick'in tuttuğu kulüpler — grid pop animasyonu. */
  highlightClubIds?: string[];
  highlightSide?: ChainSide | null;
  /** Geçersiz/0-puan tahmin damgası (shake). */
  missTick?: number;
  /** ONLINE (opsiyonel). */
  deadlineMs?: number | null;
  locked?: boolean;
  waitingLabel?: string | null;
  hideTimer?: boolean;
  /** ÖNERİ JOKERİ (1×/taraf). Aktif tarafın jokeri kullanılmış mı? */
  jokerUsed?: boolean;
  /** Joker'e basıldı — sayfa öneri hesaplar. Verilmezse joker barı gizli. */
  onSuggest?: () => void;
  /** Önerilen oyuncu id'si (joker sonrası) — havuzda parlatılır + rozet. null → öneri yok. */
  suggestedId?: string | null;
}

/**
 * "Zincir Kur" oyun sahnesi. Üstte 7 kulüp (4+3 düzen), altta havuz + arama;
 * bir futbolcuya tıkla = pick. Futbolcu bu 7 kulüpten kaçında oynadıysa o kadar
 * puan. Her taraf 5 pick. Sıra-tabanlı (snake), dinamik sıra/süre paneli.
 */
export function ChainPlayScene({
  clubs,
  pool,
  seconds,
  timerKey,
  onGuess,
  onTimeout,
  activeSide,
  p1Picks,
  p2Picks,
  p1Name = 'Sen',
  p2Name = 'Bot',
  highlightClubIds = [],
  highlightSide = null,
  missTick = 0,
  deadlineMs = null,
  locked = false,
  waitingLabel = null,
  hideTimer = false,
  jokerUsed = false,
  onSuggest,
  suggestedId = null,
}: ChainPlaySceneProps) {
  const [search, setSearch] = useState('');

  const [denyActive, setDenyActive] = useState(false);
  const [denyShake, setDenyShake] = useState(0);
  const denyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerDeny = () => {
    setDenyActive(true);
    setDenyShake((n) => n + 1);
    if (denyTimerRef.current) clearTimeout(denyTimerRef.current);
    denyTimerRef.current = setTimeout(() => setDenyActive(false), 2500);
  };
  useEffect(() => {
    if (!locked && denyActive) setDenyActive(false);
    return () => {
      if (denyTimerRef.current) clearTimeout(denyTimerRef.current);
    };
  }, [locked, denyActive]);

  const clubIds = useMemo(() => new Set(clubs.map((c) => c.id)), [clubs]);

  // Vitrin tohumu — kulüplerden türetilir → maç boyu sabit, her oyunda farklı.
  const vitrineSeed = useMemo(() => {
    let h = 2166136261;
    for (const c of clubs) for (let i = 0; i < c.id.length; i++) {
      h ^= c.id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }, [clubs]);

  // Zaten girilmiş oyuncular (iki taraf da tekrar giremez).
  const usedIds = useMemo(
    () => new Set([...p1Picks, ...p2Picks].map((p) => p.playerId)),
    [p1Picks, p2Picks],
  );

  const candidates = useMemo(() => {
    const q = normalize(search);
    const filtered = pool.filter((p) => (q ? normalize(p.displayName).includes(q) : true));
    if (!q) {
      // Vitrin: en az 1 kulübü tutan + henüz girilmemiş, RASTGELE sırada (exploit
      // koruması — "en çok tutan en üstte" değil), maç boyu sabit.
      const eligible = filtered.filter(
        (p) => !usedIds.has(p.id) && matchedClubs(p, clubIds).length >= 1,
      );
      let list = shuffled(eligible, vitrineSeed).slice(0, 48);
      // ÖNERİ JOKERİ: önerilen oyuncu vitrinde olmayabilir → başa zorla ekle.
      if (suggestedId) {
        const sug = pool.find((p) => p.id === suggestedId);
        if (sug) list = [sug, ...list.filter((p) => p.id !== suggestedId)];
      }
      return list;
    }
    return filtered.slice(0, 48);
  }, [pool, search, clubIds, usedIds, vitrineSeed, suggestedId]);

  // Kulüp başına tutan taraf noktaları (grid gösterimi).
  const hitsByClub = useMemo(() => {
    const out: Record<string, ChainSide[]> = {};
    for (const pk of p1Picks) for (const cid of pk.matchedClubIds) (out[cid] ??= []).includes('P1') || out[cid].push('P1');
    for (const pk of p2Picks) for (const cid of pk.matchedClubIds) (out[cid] ??= []).includes('P2') || out[cid].push('P2');
    return out;
  }, [p1Picks, p2Picks]);

  const p1Score = useMemo(() => p1Picks.reduce((n, p) => n + p.matchedClubIds.length, 0), [p1Picks]);
  const p2Score = useMemo(() => p2Picks.reduce((n, p) => n + p.matchedClubIds.length, 0), [p2Picks]);
  const activeName = activeSide === 'P1' ? p1Name : p2Name;
  const sideCls = SIDE[activeSide];
  const activePicksLeft =
    CHAIN_PICKS_PER_SIDE - (activeSide === 'P1' ? p1Picks.length : p2Picks.length);

  return (
    <section className="flex flex-col gap-4 pb-10">
      {/* Dinamik sıra/süre paneli.
          MOBİL (9:16, <640px): viewport'a `fixed`lenince dar ekranda içeriğin
          ÜSTÜNE biniyordu → mobilde AKIŞ İÇİNDE (static), tam-genişlik YATAY
          kompakt şerit. ≥640px'te (PC/TV) `sm:` ile BUGÜNKÜ fixed-yan-panel AYNEN. */}
      <div
        className={cn(
          'z-40 flex w-full justify-center sm:pointer-events-none sm:fixed sm:top-1/4 sm:w-auto sm:flex-col sm:items-center sm:gap-3',
          activeSide === 'P1' ? 'sm:left-8' : 'sm:right-8',
        )}
      >
        <motion.div
          key={activeSide}
          initial={{ opacity: 0, x: activeSide === 'P1' ? -28 : 28, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className={cn(
            // Mobil: yatay satır, küçük padding/radius. ≥640px: dikey kolon AYNEN.
            // SABİT GENİŞLİK (sm:w-44): P1 (Öneri jokeri) ile P2 (Rakip oynuyor)
            // panel boyutu içeriğe göre değişmesin → her durumda eşit.
            'glass-panel-strong pointer-events-auto flex w-full flex-row flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-2xl border-2 px-3 py-2',
            'sm:w-44 sm:flex-col sm:flex-nowrap sm:gap-2 sm:rounded-3xl sm:px-4 sm:py-4',
            sideCls.border,
            sideCls.glow,
          )}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">Sıra</span>
          <span className={cn('text-xl font-black leading-none', sideCls.text)}>{activeName}</span>
          {hideTimer ? (
            <div className="flex items-center justify-center rounded-full border-2 border-white/10 text-white/30" style={{ width: 68, height: 68 }}>
              <span className="text-2xl">⏸</span>
            </div>
          ) : (
            <CountdownRing
              seconds={seconds}
              deadlineMs={deadlineMs}
              runKey={timerKey}
              onComplete={onTimeout}
              size={68}
              stroke={6}
              color={activeSide === 'P1' ? '#ef4444' : '#3b82f6'}
              urgentColor="#ef4444"
            />
          )}
          {/* Kalan pick rozeti */}
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/75">
            {activePicksLeft} hak kaldı
          </span>

          {/* ÖNERİ JOKERİ (1×/taraf) — basınca iyi bir futbolcu önerir + parlatır. */}
          {onSuggest && (
            <button
              type="button"
              disabled={jokerUsed || locked}
              onClick={onSuggest}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition',
                jokerUsed
                  ? 'cursor-not-allowed border-white/10 bg-white/5 text-white/35'
                  : 'border-accent-gold/50 bg-accent-gold/15 text-accent-goldHi hover:bg-accent-gold/25',
                locked && 'cursor-not-allowed opacity-50',
              )}
              title="Bu turda iyi bir futbolcu öner (maçta 1 kez)"
            >
              <span aria-hidden>💡</span>
              {jokerUsed ? 'Öneri kullanıldı' : 'Öneri jokeri'}
            </button>
          )}

          {locked && waitingLabel && (
            <motion.div
              key={denyShake}
              animate={denyActive ? { x: [0, -6, 6, -4, 4, -2, 2, 0] } : {}}
              transition={{ duration: 0.45 }}
              className={cn(
                'mt-1 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors duration-300',
                denyActive
                  ? 'border-side-red/70 bg-side-red/20 text-side-red'
                  : 'border-accent-gold/40 bg-accent-gold/10 text-accent-goldHi',
              )}
            >
              <span aria-hidden>{denyActive ? '🚫' : '⏳'}</span>
              {denyActive ? 'Sıra sende değil!' : waitingLabel}
            </motion.div>
          )}
        </motion.div>

        <AnimatePresence>
          {missTick > 0 && <MissNote key={missTick} side={activeSide} />}
        </AnimatePresence>
      </div>

      {/* Skor şeridi */}
      <header className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-4">
          <ScorePill name={p1Name} score={p1Score} side="P1" active={activeSide === 'P1'} count={p1Picks.length} />
          <span className="text-xs font-bold text-white/40">vs</span>
          <ScorePill name={p2Name} score={p2Score} side="P2" active={activeSide === 'P2'} count={p2Picks.length} />
        </div>
        <p className="text-xs text-white/55">
          Bir futbolcu seç — bu 7 kulüpten <span className="font-semibold text-accent-goldHi">kaçında oynadıysa o kadar puan</span>.
        </p>
      </header>

      {/* 7 kulüp (4+3) */}
      <motion.div
        key={`miss-${missTick}`}
        animate={missTick > 0 ? { x: [0, -8, 8, -5, 5, 0] } : {}}
        transition={{ duration: 0.4 }}
      >
        <ChainClubsGrid
          clubs={clubs}
          hitsByClub={hitsByClub}
          highlightClubIds={highlightClubIds}
          highlightSide={highlightSide}
        />
      </motion.div>

      {/* Havuz */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white/80">Futbolcunu seç</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara: futbolcu adı…"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-accent-gold/40"
          />
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-5 lg:gap-5">
          {candidates.map((p) => {
            const already = usedIds.has(p.id);
            const isSuggested = suggestedId === p.id;
            return (
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
                disabled={already && !locked}
                className={cn(
                  'relative rounded-lg transition hover:-translate-y-1',
                  already && 'pointer-events-none opacity-35',
                  locked && 'cursor-not-allowed opacity-60 hover:translate-y-0',
                  // ÖNERİLEN: altın halka + hafif parıltı → göze çarpar.
                  isSuggested &&
                    'rounded-xl ring-2 ring-accent-gold shadow-[0_0_22px_rgba(240,193,75,0.55)]',
                )}
              >
                {isSuggested && (
                  <span className="absolute -top-2 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent-gold px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-black shadow">
                    💡 Önerilen
                  </span>
                )}
                <PlayerCard player={p} className="w-full" />
              </button>
            );
          })}
          {candidates.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-white/45">
              {search ? 'Bu aramaya uygun futbolcu yok.' : 'Uygun futbolcu kalmadı — arama yap.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ScorePill({ name, score, side, active, count }: { name: string; score: number; side: ChainSide; active: boolean; count: number }) {
  return (
    <div className={cn('flex flex-col items-center rounded-2xl border px-4 py-2 transition', active ? cn(SIDE[side].border, 'bg-white/5') : 'border-white/10')}>
      <span className={cn('text-xs font-bold', SIDE[side].text)}>{name}</span>
      <span className="text-2xl font-black tabular-nums">{score}</span>
      <span className="text-[9px] uppercase tracking-wider text-white/40">puan · {count}/{CHAIN_PICKS_PER_SIDE}</span>
    </div>
  );
}

function MissNote({ side }: { side: ChainSide }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <motion.div
      initial={{ opacity: 0, x: side === 'P1' ? -24 : 24, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: side === 'P1' ? -24 : 24, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className="glass-panel-strong flex flex-col items-center gap-0.5 rounded-2xl border-2 border-side-red/50 px-4 py-3 text-center"
    >
      <span className="text-2xl">⚠️</span>
      <span className="text-xs font-black uppercase tracking-wider text-white/85">Bu kulüplerde oynamamış!</span>
      <span className="text-sm font-black text-side-red">0 puan</span>
    </motion.div>
  );
}
