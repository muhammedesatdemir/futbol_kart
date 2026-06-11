'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { CountdownRing } from '@/components/CountdownRing';
import { XrayJokerButton } from '@/components/scenes/TargetXrayOverlay';
import { JokerHelpButton } from '@/components/JokerHelpButton';
import { normalize } from '@/lib/playerFilters';
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
  /**
   * ONLINE (opsiyonel): sunucu-otoriteli bitiş anı (epoch ms). Verilirse geri
   * sayım buna KİLİTLENİR (kalan = deadline - now) → iki tarafta süre EŞ akar,
   * optimistic seçimde sayaç lokal sıfırlanıp "sıçramaz". OFFLINE'da verilmez
   * (undefined) → mevcut lokal `seconds` sayımı aynen korunur (davranış değişmez).
   */
  deadlineMs?: number | null;
  /**
   * ONLINE (opsiyonel): true iken geri sayım DURAKLAR. Optimistic seçimden sonra
   * (kullanıcı seçti, sunucu yanıtı bekleniyor) sayaç boşuna saymasın diye —
   * kullanıcının sırası bitti, sunucu yeni tura geçince taze deadline'la başlar.
   * OFFLINE'da verilmez (false) → davranış değişmez.
   */
  paused?: boolean;
  /**
   * ONLINE (opsiyonel): sıra bu istemcide DEĞİL. Kart seçimi kilitlenir; karta
   * tıklanırsa "sıra sende değil" uyarısı güçlenir (shake + gölge). Joker barının
   * altında `waitingLabel` sabit gösterilir. OFFLINE'da verilmez (false).
   */
  locked?: boolean;
  /**
   * ONLINE (opsiyonel): kilitliyken joker barının yanında SABİT gösterilecek
   * bilgi (örn. "Rakip seçiyor… (sıra X)"). OFFLINE'da verilmez.
   */
  waitingLabel?: string | null;
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
  deadlineMs = null,
  paused = false,
  locked = false,
  waitingLabel = null,
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
  // Kilitliyken (sıra bende değil) karta tıklanırsa uyarıyı GEÇİCİ olarak GÜÇLENDİR:
  // ~2.5sn kırmızı + shake ("izin yok" geri bildirimi), sonra normale (sarı) döner.
  // `denyActive` = geçici kırmızı; `denyShake` = her tıklamada artan shake tetiği.
  // Üst üste tıklamada timer yenilenir (kırmızı süresi uzar) — akışı kullanıcı hisseder.
  const [denyActive, setDenyActive] = useState(false);
  const [denyShake, setDenyShake] = useState(0);
  const denyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerDeny = () => {
    setDenyActive(true);
    setDenyShake((n) => n + 1); // her tıklama yeni shake (key değişir → animasyon tekrar)
    if (denyTimerRef.current) clearTimeout(denyTimerRef.current);
    denyTimerRef.current = setTimeout(() => setDenyActive(false), 2500);
  };
  // Unmount / kilit kalkınca timer'ı temizle (sızıntı + bayat kırmızı önle).
  useEffect(() => {
    if (!locked && denyActive) setDenyActive(false);
    return () => {
      if (denyTimerRef.current) clearTimeout(denyTimerRef.current);
    };
  }, [locked, denyActive]);

  const excluded = useMemo(
    () => draftedTargetIds(p1Picks, p2Picks),
    [p1Picks, p2Picks],
  );

  // Havuz: metrik verisi olan + kullanılmamış + arama. RASTGELE sıra (kör).
  const candidates = useMemo(() => {
    const q = normalize(search);
    const base = pool
      .filter((p) => criterion.metric(p) !== null)
      .filter((p) => !criterion.poolFilter || criterion.poolFilter(p))
      .filter((p) => !excluded.has(p.id))
      .filter((p) => (q ? normalize(p.displayName).includes(q) : true));
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
            deadlineMs={deadlineMs}
            paused={paused}
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
      <div className="flex flex-col items-center gap-2">
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

        {/* SIRA UYARISI (ONLINE) — kilitliyken joker barının ALTINDA SABİT durur.
            Karta tıklanınca (denyPulse) shake + gölge ile güçlenir: "sıra sende
            değil" geri bildirimi (erişimsiz kullanıcının klasik uyarısı gibi). */}
        {locked && waitingLabel && (
          <motion.div
            // key = shake tetiği: her "izin yok" tıklamasında değişir → shake yeniden oynar.
            key={denyShake}
            animate={
              denyActive
                ? { x: [0, -8, 8, -6, 6, -3, 3, 0], scale: [1, 1.06, 1] }
                : {}
            }
            transition={{ duration: 0.45 }}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold transition-colors duration-300',
              // denyActive: GEÇİCİ kırmızı (~2.5sn), sonra normale (sarı) döner.
              denyActive
                ? 'border-side-red/70 bg-side-red/20 text-side-red shadow-[0_0_22px_-2px_rgba(220,38,38,0.7)]'
                : 'border-accent-gold/40 bg-accent-gold/10 text-accent-goldHi',
            )}
          >
            <span aria-hidden>{denyActive ? '🚫' : '⏳'}</span>
            {denyActive ? 'Sıra sende değil!' : waitingLabel}
          </motion.div>
        )}
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
              onClick={() => {
                // Sıra bende değilse (locked): seçme — uyarıyı güçlendir (shake).
                if (locked && !xrayArmed) {
                  triggerDeny();
                  return;
                }
                xrayArmed ? onXrayPick(p.id) : onSelect(p.id);
              }}
              className={cn(
                'rounded-lg p-1 transition hover:-translate-y-1',
                xrayArmed && 'cursor-help hover:bg-side-blue/15 hover:ring-2 hover:ring-side-blue/50',
                // Kilitliyken kartlar soluk + "izin yok" imleci (tıklama uyarı verir).
                locked && !xrayArmed && 'cursor-not-allowed opacity-60 hover:translate-y-0',
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
