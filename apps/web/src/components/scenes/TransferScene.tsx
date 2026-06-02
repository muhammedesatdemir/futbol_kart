'use client';

import { useRef, useState } from 'react';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { CountdownRing } from '@/components/CountdownRing';
import { PlayIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

interface TransferSceneProps {
  /** Transfer yapan tarafın adı. */
  sideName: string;
  /** Rakibin adı (alınacak kartlar onun). */
  oppName: string;
  /** Kendi transfer-EDİLEBİLİR kartların (verilebilir). */
  ownCards: Player[];
  /** Rakibin transfer-EDİLEBİLİR kartları (alınabilir, açık gösterilir). */
  oppCards: Player[];
  /** Geri sayım süresi (sn). */
  seconds: number;
  /**
   * Transfer'i sonuçlandır. give/take null olabilir — sistem (page.tsx) eksikleri
   * deterministik tamamlar. Joker'e basıldıysa transfer KESİN gerçekleşir:
   *  - Kullanıcı "Takas" basınca (mevcut seçimlerle),
   *  - veya süre dolunca (otomatik) bir kez çağrılır.
   */
  onResolve: (give: string | null, take: string | null) => void;
}

/**
 * Transfer Hamlesi sahnesi (ROUND_TRANSFER).
 *
 * Açık + yarı-geçici tasarım: rakibin transfer-edilebilir kartları AÇIK gösterilir
 * ama bir geri sayım çalışır (süre dolunca otomatik atlanır → "geçici bakış").
 * Oyuncu kendi elinden 1 kart + rakipten 1 kart seçip değiş-tokuş yapar.
 *
 * Kaos kuralı: rakibin transfer-edilebilir kartı yoksa değişim yapılamaz; oyuncu
 * yalnızca "Vazgeç" ile çıkar (hak zaten yandı).
 */
export function TransferScene({
  sideName,
  oppName,
  ownCards,
  oppCards,
  seconds,
  onResolve,
}: TransferSceneProps) {
  const [give, setGive] = useState<string | null>(null);
  const [take, setTake] = useState<string | null>(null);
  // Tek-sefer guard: süre + buton aynı anda tetiklenmesin.
  const resolvedRef = useRef(false);

  const oppEmpty = oppCards.length === 0;

  // Mevcut seçimlerle (eksikler null) transfer'i sonuçlandır — bir kez.
  const resolve = (g: string | null, t: string | null) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    onResolve(g, t);
  };

  const handleConfirm = () => resolve(give, take);
  // Süre dolunca: mevcut seçimlerle otomatik tamamla (sistem eksikleri doldurur).
  const handleTimeout = () => resolve(give, take);

  // Akıllı buton metni: seçim durumuna göre.
  const buttonLabel = oppEmpty
    ? 'Kapat'
    : give && take
      ? 'Takas et'
      : !give && !take
        ? 'Rastgele takas'
        : 'Eksiği tamamla & takas';

  return (
    <section className="flex flex-col gap-4 pb-24">
      {/* Başlık + geri sayım (aynı satır, sağda halka) */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-side-red/25 px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-side-red ring-1 ring-side-red/40">
            🔄 Transfer Hamlesi
          </div>
          <h2 className="text-lg font-black sm:text-xl">
            {sideName}, bir değiş-tokuş yap
          </h2>
          <p className="max-w-2xl text-xs text-white/55">
            Kendi elinden{' '}
            <span className="font-semibold text-white/80">1 kart ver</span>,{' '}
            {oppName}
            &apos;in elinden{' '}
            <span className="font-semibold text-white/80">1 kart al</span>.
            Aldığın kart bir daha geri alınamaz.{' '}
            <span className="text-white/45">
              Süre dolarsa sistem senin yerine tamamlar — transfer mutlaka olur.
            </span>
          </p>
        </div>
        {/* Geri sayım — reusable CountdownRing (transfer teması: kırmızı) */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          <CountdownRing
            seconds={seconds}
            onComplete={handleTimeout}
            color="#f0c14b"
            urgentColor="#ef4444"
            size={56}
            stroke={5}
          />
          <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
            Süre
          </span>
        </div>
      </div>

      {/* Rakip eli — alınacak kart (açık) */}
      <div>
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-side-blue">
          <span className="h-2 w-2 rounded-full bg-side-blue" />
          {oppName} — al ({oppCards.length})
        </div>
        {oppEmpty ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-6 text-center text-sm text-white/45">
            Rakibin transfer edilebilir kartı kalmadı — değişim yapılamaz.
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-2 sm:gap-2.5">
            {oppCards.map((p) => (
              <SelectCard
                key={p.id}
                player={p}
                selected={take === p.id}
                tone="blue"
                onClick={() => setTake((cur) => (cur === p.id ? null : p.id))}
              />
            ))}
          </div>
        )}
      </div>

      {/* Takas oku */}
      <div className="flex items-center justify-center text-accent-goldHi/70">
        <span className="text-2xl">⇅</span>
      </div>

      {/* Kendi elin — verilecek kart */}
      <div>
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-side-red">
          <span className="h-2 w-2 rounded-full bg-side-red" />
          {sideName} — ver ({ownCards.length})
        </div>
        <div className="flex flex-wrap justify-center gap-2 sm:gap-2.5">
          {ownCards.map((p) => (
            <SelectCard
              key={p.id}
              player={p}
              selected={give === p.id}
              tone="red"
              onClick={() => setGive((cur) => (cur === p.id ? null : p.id))}
            />
          ))}
        </div>
      </div>

      {/* Sticky alt bar — tek akıllı buton (geri çıkış yok; transfer kesin). */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-1 border-t border-white/10 bg-zinc-950/90 px-4 py-3 backdrop-blur-xl">
        <button type="button" onClick={handleConfirm} className="btn-primary">
          <PlayIcon size={14} />
          {buttonLabel}
        </button>
        {!oppEmpty && !(give && take) && (
          <span className="text-[10px] text-white/40">
            Seçmezsen sistem rastgele tamamlar
          </span>
        )}
      </div>
    </section>
  );
}

function SelectCard({
  player,
  selected,
  tone,
  onClick,
}: {
  player: Player;
  selected: boolean;
  tone: 'red' | 'blue';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl transition hover:-translate-y-1',
        selected &&
          (tone === 'red'
            ? 'ring-2 ring-side-red drop-shadow-[0_0_18px_rgba(200,50,61,0.55)]'
            : 'ring-2 ring-side-blue drop-shadow-[0_0_18px_rgba(44,95,214,0.55)]'),
      )}
    >
      <PlayerCard player={player} selected={selected} size="md" />
    </button>
  );
}
