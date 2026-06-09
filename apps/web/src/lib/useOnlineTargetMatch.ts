'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Ably from 'ably';
import type { TargetMatchState } from '@/lib/server/targetMatchEngine';

/**
 * Online "Hedefe Yaklaş" maç köprüsü (client).
 *
 * VS Düello'nun `useOnlineMatch.ts`'inin KARDEŞİ — aynı Ably + poll +
 * versiyon-GET + optimistic-retry iskeleti. Fark: kart-kapışmaya özgü
 * submit-hand/play-card yerine target-özel `draftPick` / `useXray` /
 * `ackReveal`. Dönen `state` = TargetMatchState (sunucu-otoriteli).
 *
 * VS Düello'nun genel `useGameController` köprüsü SessionState'e bağlı olduğu
 * için bu mod onu KULLANMAZ — kendi hook'unu doğrudan sayfada çağırır.
 */
export interface TargetCriterionView {
  id: string;
  title: string;
  unit: string;
}

export interface OnlineTargetMatch {
  state: TargetMatchState | null;
  yourSide: 'P1' | 'P2' | null;
  status: string | null;
  /** Kriter başlık/birim (metric sunucuda kalır). */
  criterion: TargetCriterionView | null;
  loading: boolean;
  error: string | null;
  /** Hedef ekranı görüldü → draft'a geç (idempotent, sunucu-otoriteli). */
  ackReveal: () => Promise<void>;
  /** Sırası gelen taraf bir oyuncu seçer. */
  draftPick: (playerId: string) => Promise<void>;
  /** Röntgen jokeri — bir oyuncunun gizli değerini açar (yalnız bana döner). */
  useXray: (playerId: string) => Promise<number | null>;
  /** Bu aşamanın sunucu-otoriteli bitiş anı (ISO) — client geri sayım gösterir. */
  turnDeadline: string | null;
  /** Sunucudan en güncel state'i yeniden çek. */
  refresh: () => Promise<void>;
}

// Polling nabzı — Ably durumuna göre iki hız (VS Düello hibrit push deseni).
const POLL_MS_NO_ABLY = 1500;
const POLL_MS_WITH_ABLY = 5000;

export function useOnlineTargetMatch(matchId: string | null): OnlineTargetMatch {
  const [state, setState] = useState<TargetMatchState | null>(null);
  const [yourSide, setYourSide] = useState<'P1' | 'P2' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [criterion, setCriterion] = useState<TargetCriterionView | null>(null);
  const [turnDeadline, setTurnDeadline] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ablyRef = useRef<Ably.Realtime | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Aynı state'te boşuna re-render etme (VS Düello deseni — animasyon kasmaz).
  const lastStateJsonRef = useRef<string | null>(null);
  // Versiyon-tabanlı GET: değişmeyen poll'ler minik unchanged döner (bedava).
  const versionRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!matchId) return;
    try {
      const v = versionRef.current;
      const url =
        v !== null ? `/api/match/${matchId}?v=${v}` : `/api/match/${matchId}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Maç yüklenemedi.');
      }
      const data = await res.json();
      // SÜRÜM DEĞİŞMEDİ: sunucu tam state yollamadı — yalnız deadline tazele.
      if (data.unchanged) {
        if (typeof data.version === 'number') versionRef.current = data.version;
        setTurnDeadline(data.turnDeadline ?? null);
        setError(null);
        return;
      }
      if (typeof data.version === 'number') versionRef.current = data.version;
      const nextStateJson = JSON.stringify(data.state ?? null);
      if (nextStateJson !== lastStateJsonRef.current) {
        lastStateJsonRef.current = nextStateJson;
        setState((data.state ?? null) as TargetMatchState | null);
      }
      setYourSide(data.yourSide ?? null);
      setStatus(data.status ?? null);
      setCriterion((data.criterion ?? null) as TargetCriterionView | null);
      setTurnDeadline(data.turnDeadline ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Maç yüklenemedi.');
    }
  }, [matchId]);

  // İlk yükleme + Ably bağlantısı (yoksa polling). VS Düello iskeleti.
  useEffect(() => {
    if (!matchId) return;
    let disposed = false;

    (async () => {
      setLoading(true);
      await refresh();
      if (disposed) return;
      setLoading(false);

      const startPoll = (ms: number) => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(() => void refresh(), ms);
      };

      let ablyConnected = false;
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
          // HİBRİT PUSH: mesaj yalnız "değişti" sinyali; gizli veri taşımaz.
          // Gelince ucuz ?v= GET ile tam state çekilir. Hedefte gizli veri yok
          // (xray değeri yalnız yanıtta döner) → güvenli.
          channel.subscribe('state-changed', () => {
            void refresh();
          });
          client.connection.on('connected', () => startPoll(POLL_MS_WITH_ABLY));
          const onDrop = () => {
            startPoll(POLL_MS_NO_ABLY);
            void refresh();
          };
          client.connection.on('disconnected', onDrop);
          client.connection.on('suspended', onDrop);
          ablyConnected = true;
        }
      } catch {
        // token alınamadı — yalnızca polling ile devam
      }

      startPoll(ablyConnected ? POLL_MS_WITH_ABLY : POLL_MS_NO_ABLY);
    })();

    return () => {
      disposed = true;
      lastStateJsonRef.current = null;
      versionRef.current = null;
      if (pollRef.current) clearInterval(pollRef.current);
      if (ablyRef.current) {
        ablyRef.current.close();
        ablyRef.current = null;
      }
    };
  }, [matchId, refresh]);

  const sendMove = useCallback(
    async (
      bodyObj: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
      if (!matchId) return {};
      // Optimistic-lock retry (409) — VS Düello deseniyle aynı.
      const MAX_RETRY = 4;
      for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
        const res = await fetch(`/api/match/${matchId}/target-move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyObj),
        });
        if (res.status === 409) {
          const data = await res.json().catch(() => ({}));
          if (data.finished) {
            void refresh();
            return {};
          }
          if (attempt < MAX_RETRY) {
            await new Promise((r) =>
              setTimeout(r, 80 * (attempt + 1) + Math.floor((attempt * 37) % 50)),
            );
            continue;
          }
          void refresh();
          return {};
        }
        // 422 (iyi huylu yarış: sıra geçmiş / geç pick) + 429 (rate-limit flood
        // koruması) → throw etme; sunucu otoriter, sessizce tazele. 429'u normal
        // oyuncu görmez (limitler çok cömert).
        if (res.status === 422 || res.status === 429) {
          void refresh();
          return {};
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Hamle reddedildi.');
        }
        const data = await res.json();
        void refresh(); // ateşle-unut (VS Düello deseni)
        return data;
      }
      throw new Error('Hamle çok kez çakıştı, tekrar dene.');
    },
    [matchId, refresh],
  );

  const ackReveal = useCallback(async () => {
    await sendMove({ action: 'ack-reveal' });
  }, [sendMove]);

  const draftPick = useCallback(
    async (playerId: string) => {
      await sendMove({ action: 'draft-pick', playerId });
    },
    [sendMove],
  );

  const useXray = useCallback(
    async (playerId: string): Promise<number | null> => {
      const data = await sendMove({ action: 'xray', playerId });
      return typeof data.xrayValue === 'number' ? data.xrayValue : null;
    },
    [sendMove],
  );

  return {
    state,
    yourSide,
    status,
    criterion,
    loading,
    error,
    ackReveal,
    draftPick,
    useXray,
    turnDeadline,
    refresh,
  };
}
