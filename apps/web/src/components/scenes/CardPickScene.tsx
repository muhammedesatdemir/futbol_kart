'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import type { Player, PlayerSide } from '@futbol-kart/shared-types';
import { SelectablePlayerCard } from '@/components/SelectablePlayerCard';
import { PlayerSearchBar } from '@/components/PlayerSearchBar';
import { PlayerFilterChips } from '@/components/PlayerFilterChips';
import { SelectedCardsRail } from '@/components/SelectedCardsRail';
import { cn } from '@/lib/cn';
import { HAND_SIZE as DEFAULT_HAND_SIZE } from '@/lib/gameConstants';
import { fetchGameData } from '@/lib/playersClient';
import {
  EMPTY_CRITERIA,
  applyFilters,
  curateDefaultPool,
  uniqueCountries,
  type ClubLookup,
  type FilterCriteria,
} from '@/lib/playerFilters';

interface CardPickSceneProps {
  side: PlayerSide;
  /** İsteğe bağlı: server-side önceden yüklenmiş players (eski API uyumluluğu). Verilmezse client fetch. */
  players?: Player[];
  excludedCards?: string[];
  onSubmit: (cards: string[]) => void;
  ctaLabel: string;
  handSize?: number;
  playerName?: string;
}

const INITIAL_VISIBLE = 32;
const PAGE_SIZE = 32;

export function CardPickScene({
  side,
  players: playersProp,
  excludedCards = [],
  onSubmit,
  ctaLabel,
  handSize = DEFAULT_HAND_SIZE,
  playerName,
}: CardPickSceneProps) {
  const t = useTranslations('pick');

  // Veri yükleme: prop varsa onu kullan (eski API), yoksa client fetch
  const [players, setPlayers] = useState<Player[] | null>(playersProp ?? null);
  const [clubsById, setClubsById] = useState<Map<string, ClubLookup> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (playersProp && playersProp.length > 0) {
      // Prop verildi — yine de clubs lookup için fetch lazım
      fetchGameData()
        .then((data) => setClubsById(data.clubsById))
        .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
      return;
    }
    fetchGameData()
      .then((data) => {
        setPlayers(data.players);
        setClubsById(data.clubsById);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [playersProp]);

  const [picked, setPicked] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<FilterCriteria>(EMPTY_CRITERIA);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  // Excluded cards uygulanmış havuz
  const available = useMemo(() => {
    if (!players) return [];
    return players.filter((p) => !excludedCards.includes(p.id));
  }, [players, excludedCards]);

  // Aktif filtre/arama var mı?
  const hasActiveFilter = useMemo(() => {
    return (
      criteria.search.trim().length > 0 ||
      criteria.position !== null ||
      criteria.countryCode !== null ||
      criteria.era !== null ||
      criteria.activeOnly !== null
    );
  }, [criteria]);

  // Filtre yapılmadığında: kürasyon (16 efsane + 16 güncel)
  // Filtre yapıldığında: tüm havuzda filtre uygula
  const filteredPool = useMemo(() => {
    if (!players || !clubsById) return [];
    if (!hasActiveFilter) {
      return curateDefaultPool(available, Math.max(INITIAL_VISIBLE * 4, 128));
    }
    return applyFilters(available, clubsById, criteria);
  }, [players, clubsById, available, criteria, hasActiveFilter]);

  // Görünür slice
  const visible = useMemo(
    () => filteredPool.slice(0, visibleCount),
    [filteredPool, visibleCount],
  );

  // Filtre/arama değişince visibleCount'u sıfırla
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [criteria]);

  // IntersectionObserver: sentinel görünürse +PAGE_SIZE yükle
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (visibleCount >= filteredPool.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisibleCount((c) => Math.min(c + PAGE_SIZE, filteredPool.length));
          }
        }
      },
      { rootMargin: '600px 0px 600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [filteredPool.length, visibleCount]);

  // Ülke listesi (filtre dropdown için) — sadece available pool'dan
  const countries = useMemo(() => uniqueCountries(available), [available]);

  // Seçili oyuncuların gerçek nesneleri
  const pickedPlayers = useMemo(() => {
    if (!players) return [];
    const byId = new Map(players.map((p) => [p.id, p]));
    return picked.map((id) => byId.get(id)!).filter(Boolean);
  }, [picked, players]);

  const toggle = useCallback(
    (id: string) => {
      setPicked((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        if (prev.length >= handSize) return prev;
        return [...prev, id];
      });
    },
    [handSize],
  );

  const remove = useCallback((id: string) => {
    setPicked((prev) => prev.filter((x) => x !== id));
  }, []);

  const clear = useCallback(() => setPicked([]), []);
  const submit = useCallback(() => onSubmit(picked), [onSubmit, picked]);

  // Rastgele: mevcut havuzdan (excluded hariç) rastgele handSize oyuncu seç.
  const randomPick = useCallback(() => {
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    setPicked(shuffled.slice(0, handSize).map((p) => p.id));
  }, [available, handSize]);

  const canConfirm = picked.length === handSize;
  const fallbackHeading = side === 'P1' ? t('p1Heading') : t('p2Heading');
  const heading = playerName ? `${playerName} — elini hazırla` : fallbackHeading;

  // Yükleme durumları
  if (loadError) {
    return (
      <section className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-red-300">Oyuncu verisi yüklenemedi.</p>
        <p className="text-xs text-white/55">{loadError}</p>
      </section>
    );
  }
  if (!players || !clubsById) {
    return (
      <section className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-accent-gold" />
        <p className="text-sm text-white/55">Oyuncu verisi yükleniyor…</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {/* Üst panel — sticky, seçilenler + CTA */}
      <SelectedCardsRail
        selected={pickedPlayers}
        total={handSize}
        onRemove={remove}
        onClear={clear}
        onRandom={randomPick}
        ctaLabel={ctaLabel}
        onConfirm={submit}
        heading={heading}
        subtitle={t('subtitle', { count: handSize })}
      />

      {/* Arama */}
      <PlayerSearchBar
        value={criteria.search}
        onChange={(search) => setCriteria((c) => ({ ...c, search }))}
        resultCount={filteredPool.length}
        totalCount={available.length}
      />

      {/* Filtreler */}
      <PlayerFilterChips
        position={criteria.position}
        onPositionChange={(position) => setCriteria((c) => ({ ...c, position }))}
        countryCode={criteria.countryCode}
        onCountryChange={(code) => setCriteria((c) => ({ ...c, countryCode: code }))}
        countries={countries}
        era={criteria.era}
        onEraChange={(era) => setCriteria((c) => ({ ...c, era }))}
      />

      {/* Bilgi satırı */}
      <div className="flex items-center justify-between text-xs text-white/55">
        <span>
          {hasActiveFilter ? (
            <>
              <span className="font-semibold text-white/85">{filteredPool.length}</span> sonuç
              {' • '}
              <span>{visible.length} gösteriliyor</span>
            </>
          ) : (
            <>
              <span className="font-semibold text-white/85">Öne çıkanlar</span>
              {' — '}
              {available.length.toLocaleString('tr-TR')} oyuncu arasından seç, arama veya filtre kullan
            </>
          )}
        </span>
        {canConfirm && (
          <span className="font-semibold text-accent-goldHi">Hazırsın → "OYNA"</span>
        )}
      </div>

      {/* Kart havuzu — saha çerçeveli bölge */}
      <div
        className={cn(
          'relative rounded-2xl border border-white/10 bg-black/30 p-3 sm:p-4',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_60px_rgba(0,0,0,0.4)]',
          'before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl',
          'before:bg-[repeating-linear-gradient(180deg,transparent_0_60px,rgba(255,255,255,0.025)_60px_61px)]',
        )}
      >
        {visible.length === 0 ? (
          <div className="flex min-h-[30vh] flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-semibold text-white/65">Sonuç bulunamadı</p>
            <p className="text-xs text-white/40">Filtreyi ya da aramayı değiştirmeyi dene.</p>
          </div>
        ) : (
          <div
            className={cn(
              'relative grid justify-items-center',
              'grid-cols-2 gap-3',
              'sm:grid-cols-3 sm:gap-4',
              'md:grid-cols-4',
              'lg:grid-cols-5',
              'xl:grid-cols-6',
            )}
          >
            {visible.map((p) => (
              <SelectablePlayerCard
                key={p.id}
                player={p}
                selected={picked.includes(p.id)}
                disabled={!picked.includes(p.id) && picked.length >= handSize}
                onToggle={() => toggle(p.id)}
              />
            ))}
          </div>
        )}

        {/* Sentinel — IntersectionObserver bunu görünce +32 yükler */}
        {visibleCount < filteredPool.length && (
          <div
            ref={sentinelRef}
            className="flex items-center justify-center py-6 text-xs text-white/35"
          >
            <motion.span
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              Daha fazla yükleniyor… ({filteredPool.length - visibleCount} kaldı)
            </motion.span>
          </div>
        )}
      </div>
    </section>
  );
}
