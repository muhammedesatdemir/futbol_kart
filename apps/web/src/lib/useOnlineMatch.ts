'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Ably from 'ably';
import type { SessionState } from '@futbol-kart/game-engine';

/**
 * Online maç köprüsü (client).
 *
 * - Maçı sunucudan yükler (GET /api/match/[id]) → kaynak-doğru state.
 * - Ably ile maç kanalını dinler; key yoksa kısa-aralıklı polling'e düşer.
 * - Kullanıcı aksiyonlarını sunucuya gönderir (POST .../move) — state'i
 *   client hesaplamaz, sunucudan gelen state'i gösterir (sunucu-otoriteli).
 *
 * Dönen `state` sunucudaki SessionState; oyna sayfası bunu mevcut sahnelerle
 * render eder. `yourSide` client'ın hangi oyuncu olduğunu söyler.
 */
export interface OnlineMatch {
  state: SessionState | null;
  yourSide: 'P1' | 'P2' | null;
  status: string | null;
  /** Son tur reveal'i (sunucudan) — RoundScene için. */
  lastReveal: RoundReveal | null;
  loading: boolean;
  error: string | null;
  submitHand: (cards: string[]) => Promise<void>;
  playCard: (cardId: string) => Promise<void>;
  /** Çarpan jokeri (×2/÷2) — kart oynamadan önce. */
  useMultiplier: () => Promise<void>;
  /** İstatistik-gör jokeri — kendi elinin değerlerini getirir (revealValues'a yazar). */
  useReveal: () => Promise<void>;
  /** İstatistik jokeri sonucu: kendi elimin bu sorudaki değerleri (gizli, sadece bana). */
  revealValues: RevealedValue[] | null;
  /** Transfer seçenekleri: kendi + rakibin transfer-edilebilir kartları (açma anında). */
  fetchTransferOptions: () => Promise<TransferOptions>;
  /** Transfer takası: kendi `give` kartını ver, rakipten `take` kartını al. */
  transfer: (give: string, take: string) => Promise<void>;
  /** Son transfer tabelası (her iki tarafa açık) — gösterildikten sonra temizlenir. */
  lastTransfer: TransferInfo | null;
  /** Transfer tabelasını kapat (gösterim bitince). */
  clearTransfer: () => void;
  /** Sunucudan en güncel state'i yeniden çek. */
  refresh: () => Promise<void>;
}

export interface TransferInfo {
  side: 'P1' | 'P2';
  give: string;
  take: string;
}

export interface TransferOptions {
  /** Verebileceğim kartlar (kendi elimden). */
  ownCards: string[];
  /** Alabileceğim kartlar (rakipten — yalnızca transfer-edilebilir). */
  oppCards: string[];
}

export interface RoundReveal {
  questionTitle: string;
  p1Value: number | boolean | null;
  p2Value: number | boolean | null;
  winner: 'P1' | 'P2' | 'tie';
  tiebreakerUsed?: string;
  multiplier?: { side: 'P1' | 'P2'; dir: 'x2' | 'half' };
}

export interface RevealedValue {
  cardId: string;
  value: number | boolean | null;
}

const POLL_MS = 2500;

export function useOnlineMatch(matchId: string | null): OnlineMatch {
  const [state, setState] = useState<SessionState | null>(null);
  const [yourSide, setYourSide] = useState<'P1' | 'P2' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lastReveal, setLastReveal] = useState<RoundReveal | null>(null);
  const [revealValues, setRevealValues] = useState<RevealedValue[] | null>(null);
  const [lastTransfer, setLastTransfer] = useState<TransferInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ablyRef = useRef<Ably.Realtime | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!matchId) return;
    try {
      const res = await fetch(`/api/match/${matchId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Maç yüklenemedi.');
      }
      const data = await res.json();
      setState(data.state as SessionState);
      setYourSide(data.yourSide);
      setStatus(data.status);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Maç yüklenemedi.');
    }
  }, [matchId]);

  // İlk yükleme + Ably bağlantısı (yoksa polling).
  useEffect(() => {
    if (!matchId) return;
    let disposed = false;

    (async () => {
      setLoading(true);
      await refresh();
      if (disposed) return;
      setLoading(false);

      // Ably token al; yapılandırılmışsa realtime, değilse polling.
      try {
        const res = await fetch(`/api/match/${matchId}/ably-token`);
        const data = await res.json();
        if (disposed) return;
        if (data.enabled && data.tokenRequest) {
          const client = new Ably.Realtime({
            authCallback: (_params, cb) => cb(null, data.tokenRequest),
          });
          ablyRef.current = client;
          const channel = client.channels.get(`match:${matchId}`);
          channel.subscribe('state-changed', (msg) => {
            // Sunucu durum değişikliğini bildirdi → en güncel state'i çek.
            const payload = msg.data as
              | { reveal?: RoundReveal; transfer?: TransferInfo }
              | undefined;
            if (payload?.reveal) setLastReveal(payload.reveal);
            // Transfer tabelası — rakibin yaptığı transferi de burada görürüm.
            if (payload?.transfer) setLastTransfer(payload.transfer);
            void refresh();
          });
          return;
        }
      } catch {
        // token alınamadı → polling'e düş
      }

      // Polling yedek (Ably yoksa).
      pollRef.current = setInterval(() => void refresh(), POLL_MS);
    })();

    return () => {
      disposed = true;
      if (pollRef.current) clearInterval(pollRef.current);
      if (ablyRef.current) {
        ablyRef.current.close();
        ablyRef.current = null;
      }
    };
  }, [matchId, refresh]);

  const sendMove = useCallback(
    async (bodyObj: Record<string, unknown>): Promise<Record<string, unknown>> => {
      if (!matchId) return {};
      const res = await fetch(`/api/match/${matchId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Hamle reddedildi.');
      }
      const data = await res.json();
      if (data.reveal) setLastReveal(data.reveal as RoundReveal);
      // Hamle sonrası kendi state'imizi de tazele (Ably'yi beklemeden).
      await refresh();
      return data;
    },
    [matchId, refresh],
  );

  const submitHand = useCallback(
    async (cards: string[]) => {
      setRevealValues(null); // yeni el → eski reveal değerleri geçersiz
      await sendMove({ action: 'submit-hand', cards });
    },
    [sendMove],
  );
  const playCard = useCallback(
    async (cardId: string) => {
      setRevealValues(null); // kart oynandı → reveal rozetleri kalkar
      await sendMove({ action: 'play-card', cardId });
    },
    [sendMove],
  );
  const useMultiplier = useCallback(async () => {
    await sendMove({ action: 'use-multiplier' });
  }, [sendMove]);
  const useReveal = useCallback(async () => {
    const data = await sendMove({ action: 'use-reveal' });
    if (Array.isArray(data.revealValues)) {
      setRevealValues(data.revealValues as RevealedValue[]);
    }
  }, [sendMove]);
  const fetchTransferOptions =
    useCallback(async (): Promise<TransferOptions> => {
      if (!matchId) return { ownCards: [], oppCards: [] };
      const res = await fetch(`/api/match/${matchId}/transfer-options`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Transfer açılamadı.');
      }
      return (await res.json()) as TransferOptions;
    }, [matchId]);
  const transfer = useCallback(
    async (give: string, take: string) => {
      const data = await sendMove({ action: 'transfer', give, take });
      if (data.transfer) setLastTransfer(data.transfer as TransferInfo);
    },
    [sendMove],
  );
  const clearTransfer = useCallback(() => setLastTransfer(null), []);

  return {
    state,
    yourSide,
    status,
    lastReveal,
    revealValues,
    loading,
    error,
    submitHand,
    playCard,
    useMultiplier,
    useReveal,
    fetchTransferOptions,
    transfer,
    lastTransfer,
    clearTransfer,
    refresh,
  };
}
