'use client';

import { useState } from 'react';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { cn } from '@/lib/cn';

/**
 * Online transfer (takas) seçim modalı.
 *
 * Soruyu gördükten sonra, kart oynamadan önce açılır. Oyuncu kendi
 * transfer-edilebilir kartlarından 1'ini verir + rakibin transfer-edilebilir
 * kartlarından 1'ini alır (gerçek kart görselleriyle). Hak bir kez, kalıcı.
 * Rakip kartları yalnızca bu panelde (transfer-edilebilir olanlar) görünür —
 * gizlilik korunur. Bkz ONLINE-YOL-HARITASI.md.
 */
export function TransferPanel({
  ownCards,
  oppCards,
  players,
  onCancel,
  onConfirm,
}: {
  ownCards: string[];
  oppCards: string[];
  players: Player[];
  onCancel: () => void;
  onConfirm: (give: string, take: string) => void;
}) {
  const [give, setGive] = useState<string | null>(null);
  const [take, setTake] = useState<string | null>(null);
  const byId = new Map(players.map((p) => [p.id, p]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      {/* Geniş pencere (max-w-5xl) + büyük kartlar (size md) — kartlar rahat
          görünsün. İç içerik dikeyde taşarsa kaydırılabilir (max-h + overflow). */}
      <div className="glass-panel-strong max-h-[92vh] w-full max-w-5xl overflow-y-auto p-6 sm:p-8">
        <h3 className="text-center text-2xl font-black text-accent-goldHi">
          🔄 Transfer Hamlesi
        </h3>
        <p className="mt-1 text-center text-sm text-white/55">
          Bir kartını ver, rakipten bir kart al. Hak bir kez — değişim kalıcı.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div>
            <p className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-side-red">
              Vereceğin kart
            </p>
            <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
              {ownCards.length === 0 && (
                <span className="text-xs text-white/40">Verilebilir kart yok</span>
              )}
              {ownCards.map((id) => {
                const p = byId.get(id);
                if (!p) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setGive(id)}
                    className={cn(
                      'rounded-xl transition',
                      give === id
                        ? '-translate-y-1.5 ring-[3px] ring-side-red ring-offset-2 ring-offset-transparent'
                        : 'opacity-80 hover:-translate-y-1 hover:opacity-100',
                    )}
                  >
                    <PlayerCard player={p} size="md" />
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-accent-goldHi">
              Alacağın kart (rakip)
            </p>
            <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
              {oppCards.length === 0 && (
                <span className="text-xs text-white/40">Alınabilir kart yok</span>
              )}
              {oppCards.map((id) => {
                const p = byId.get(id);
                if (!p) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTake(id)}
                    className={cn(
                      'rounded-xl transition',
                      take === id
                        ? '-translate-y-1.5 ring-[3px] ring-accent-goldHi ring-offset-2 ring-offset-transparent'
                        : 'opacity-80 hover:-translate-y-1 hover:opacity-100',
                    )}
                  >
                    <PlayerCard player={p} size="md" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-center gap-3">
          <button type="button" onClick={onCancel} className="btn-ghost">
            Vazgeç
          </button>
          <button
            type="button"
            disabled={!give || !take}
            onClick={() => give && take && onConfirm(give, take)}
            className="btn-primary disabled:opacity-40"
          >
            Takası yap
          </button>
        </div>
      </div>
    </div>
  );
}
