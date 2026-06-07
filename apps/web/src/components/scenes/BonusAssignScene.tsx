'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { CountdownRing } from '@/components/CountdownRing';
import { PlayIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import {
  BONUS_ASSIGN_SECONDS,
  buildConditionLibrary,
  type BonusConditionLite,
  type ConditionContext,
} from '@futbol-kart/game-engine';

interface BonusAssignSceneProps {
  /** Atama yapan tarafın adı (başlık için). */
  sideName: string;
  conditions: BonusConditionLite[];
  /** Aktif tarafın eli (Player nesneleri). */
  hand: Player[];
  /** Mevcut atama: slot → cardId | null. */
  assigned: Array<string | null>;
  ctx: ConditionContext;
  onAssign: (slot: number, cardId: string | null) => void;
  onConfirm: () => void;
  /** Süre dolunca: kalan slotları fizibil tamamla + onayla (page.tsx hesaplar). */
  onTimeUp: () => void;
  /** Toplam süre (sn). Verilmezse offline varsayılanı (BONUS_ASSIGN_SECONDS). */
  seconds?: number;
  /** ONLINE: sunucu deadline'ı (epoch ms) — geri sayım buna kilitlenir. */
  deadlineMs?: number | null;
}

const LIBRARY = buildConditionLibrary();
const LIB_BY_ID = new Map(LIBRARY.map((c) => [c.id, c]));

export function BonusAssignScene({
  sideName,
  conditions,
  hand,
  assigned,
  ctx,
  onAssign,
  onConfirm,
  onTimeUp,
  seconds = BONUS_ASSIGN_SECONDS,
  deadlineMs = null,
}: BonusAssignSceneProps) {
  // OPTIMISTIC ATAMA: kart seçimi ANINDA burada görünür; `onAssign` sunucuya
  // arka planda gider. Online'da sunucu gidiş-dönüşü (~300ms) UI'ı bekletmesin
  // → tıklama hissi offline kadar anlık. `assigned` prop'u sunucu KAYNAK-DOĞRU
  // durumu; sunucu yanıtı geldiğinde optimistic durumu onunla EŞİTLERİZ.
  // Eşitleme yalnızca prop GERÇEKTEN değişince olur (referans değil içerik) —
  // böylece 1.5sn poll'ün aynı içerikli prop'u optimistic'i geri almaz.
  const [optimistic, setOptimistic] = useState<Array<string | null>>(assigned);
  const assignedKey = assigned.join('|');
  const prevAssignedKey = useRef(assignedKey);
  useEffect(() => {
    if (prevAssignedKey.current !== assignedKey) {
      prevAssignedKey.current = assignedKey;
      setOptimistic(assigned);
    }
  }, [assignedKey, assigned]);

  // Aktif slot — kart seçince buraya atanır. Varsayılan: ilk boş slot.
  const firstEmpty = optimistic.findIndex((c) => c === null);
  const [activeSlot, setActiveSlot] = useState<number>(firstEmpty === -1 ? 0 : firstEmpty);

  const handById = useMemo(() => new Map(hand.map((p) => [p.id, p])), [hand]);

  // Aktif slotun koşulunu çözüp, eli "uyan / uymayan" diye ayır.
  const activeCond = LIB_BY_ID.get(conditions[activeSlot]?.id ?? '');
  const eligibleIds = useMemo(() => {
    if (!activeCond) return new Set<string>();
    const set = new Set<string>();
    for (const p of hand) if (activeCond.test(p, ctx)) set.add(p.id);
    return set;
  }, [activeCond, hand, ctx]);

  const assignedSet = useMemo(
    () => new Set(optimistic.filter((c): c is string => c !== null)),
    [optimistic],
  );

  const allFilled = optimistic.every((c) => c !== null);

  const handleCardClick = (cardId: string) => {
    // Zaten bir slota atanmışsa: o slotu boşalt (optimistic + sunucu).
    const existingSlot = optimistic.indexOf(cardId);
    if (existingSlot !== -1) {
      setOptimistic((prev) => {
        const next = [...prev];
        next[existingSlot] = null;
        return next;
      });
      onAssign(existingSlot, null);
      setActiveSlot(existingSlot);
      return;
    }
    // Aktif slot için uygun değilse yoksay.
    if (!eligibleIds.has(cardId)) return;
    // ANINDA yerel atama (optimistic) → UI beklemez.
    setOptimistic((prev) => {
      const next = [...prev];
      next[activeSlot] = cardId;
      return next;
    });
    onAssign(activeSlot, cardId);
    // Sonraki boş slota geç.
    const nextEmpty = optimistic.findIndex((c, i) => c === null && i !== activeSlot);
    if (nextEmpty !== -1) setActiveSlot(nextEmpty);
  };

  const filledCount = optimistic.filter((c) => c !== null).length;

  return (
    <section className="flex flex-col gap-3 pb-20">
      {/* Bonus atama geri sayımı — sağ üstte, altın tema. Süre dolarsa kalan
          slotlar fizibil tamamlanıp otomatik onaylanır (kullanıcı seçimi korunur). */}
      <div className="pointer-events-none fixed right-4 top-20 z-40 flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-black/60 p-2 backdrop-blur">
        <CountdownRing
          seconds={seconds}
          deadlineMs={deadlineMs}
          onComplete={onTimeUp}
          color="#f0c14b"
          urgentColor="#ef4444"
          size={56}
          stroke={5}
        />
        <span className="text-[9px] font-semibold uppercase tracking-wider text-white/55">
          Süre
        </span>
      </div>

      {/* Kompakt başlık — dikey alandan tasarruf */}
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="rounded-full bg-accent-gold/20 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-goldHi">
          Bonus Tur — +2 Puan
        </div>
        <h2 className="text-lg font-black sm:text-xl">{sideName}, 3 kategoriye kart ata</h2>
        <p className="max-w-2xl text-xs text-white/55">
          Her kategoriye uygun bir kart yerleştir; turunu kazanırsa{' '}
          <span className="font-semibold text-accent-goldHi">+2 puan</span>. Elindeki kartlar
          her kategoriyi karşılayabilir — sırayla doldur.
        </p>
      </div>

      {/* 3 koşul slotu — büyük kart kabı (w-28 ≈ 1.4×) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {conditions.map((cond, slot) => {
          const cardId = optimistic[slot];
          const card = cardId ? handById.get(cardId) : undefined;
          const isActive = slot === activeSlot;
          return (
            <button
              key={cond.id}
              type="button"
              onClick={() => setActiveSlot(slot)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-2xl border p-2 text-center transition sm:p-2.5',
                isActive
                  ? 'border-accent-gold/70 bg-accent-gold/10 ring-1 ring-accent-gold/40'
                  : 'border-white/10 bg-black/30 hover:border-white/25',
              )}
            >
              <span className="text-[9px] font-semibold uppercase tracking-wider text-accent-goldHi/90 sm:text-[10px]">
                Kategori {slot + 1}
              </span>
              <span className="flex min-h-[2.25rem] items-center justify-center text-xs font-semibold leading-tight text-white/90 sm:text-sm">
                {cond.label}
              </span>
              {/* Sabit boyutlu kart kabı: w-28 kart (112×168) */}
              <div className="flex h-[176px] w-28 items-center justify-center">
                {card ? (
                  <PlayerCard player={card} selected size="md" />
                ) : (
                  <div
                    className={cn(
                      'flex h-full w-full items-center justify-center rounded-xl border-2 border-dashed text-3xl',
                      isActive
                        ? 'border-accent-gold/50 text-accent-gold/70'
                        : 'border-white/15 text-white/25',
                    )}
                  >
                    +
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* El — büyük kartlar, ortalı, tek satıra sığar (8 × w-28) */}
      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-goldHi">
          {activeCond
            ? `"${conditions[activeSlot]?.label}" için uygun kartlar parlak`
            : 'Elin'}
        </div>
        <div className="flex flex-wrap justify-center gap-2 sm:gap-2.5">
          {hand.map((p) => {
            const isAssigned = assignedSet.has(p.id);
            const isEligible = eligibleIds.has(p.id);
            const dimmed = !isAssigned && !isEligible;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleCardClick(p.id)}
                className={cn(
                  'rounded-xl transition',
                  dimmed
                    ? 'cursor-default opacity-30 saturate-50'
                    : 'hover:-translate-y-1',
                  isAssigned && 'ring-2 ring-accent-goldHi/70',
                )}
              >
                <PlayerCard player={p} selected={isAssigned} size="md" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Devam — sticky alt bar; asla kartların altında kalmaz */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center border-t border-white/10 bg-zinc-950/90 px-4 py-3 backdrop-blur-xl">
        <button
          type="button"
          onClick={onConfirm}
          disabled={!allFilled}
          className={cn(
            'btn-primary',
            !allFilled && 'cursor-not-allowed opacity-40',
          )}
        >
          <PlayIcon size={14} />
          {allFilled ? 'Devam — maça başla' : `${filledCount}/3 kategori dolu`}
        </button>
      </div>
    </section>
  );
}
