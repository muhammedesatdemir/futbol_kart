'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Ably from 'ably';
import type {
  ListMatchState,
  ListGuessOutcome,
} from '@/lib/server/listMatchEngine';
import type { ListEntry } from '@/lib/listMode';

/**
 * Online "Liste Doldur" maç köprüsü (client).
 *
 * `useOnlineSquadMatch.ts`/`useOnlineTargetMatch.ts`'in KARDEŞİ — aynı Ably +
 * poll + versiyon-GET + optimistic-retry iskeleti. Fark: `guess(playerId)` /
 * `ackReveal`. Dönen `state` = ListMatchState (liste İÇERMEZ — gizli). `guess`
 * sunucudan yalnız `outcome` (hit/rank/value/lives) döner (cevap sızmaz).
 */
export interface ListCriterionView {
  id: string;
  title: string;
  unit: string;
  size: number;
}

export interface OnlineListMatch {
  state: ListMatchState | null;
  yourSide: 'P1' | 'P2' | null;
  status: string | null;
  criterion: ListCriterionView | null;
  /** Tam liste — YALNIZ maç bitince (RESULT) dolu; sonuç ekranı için. Aksi halde null. */
  fullList: ListEntry[] | null;
  loading: boolean;
  error: string | null;
  /** Liste ekranı görüldü → play'e geç (idempotent). */
  ackReveal: () => Promise<void>;
  /** Sırası gelen taraf bir oyuncu tahmin eder. Sonuç (hit/miss) döner. */
  guess: (playerId: string) => Promise<ListGuessOutcome | null>;
  turnDeadline: string | null;
  refresh: () => Promise<void>;
}

const POLL_MS_NO_ABLY = 1500;
const POLL_MS_WITH_ABLY = 5000;

export function useOnlineListMatch(matchId: string | null): OnlineListMatch {
  const [state, setState] = useState<ListMatchState | null>(null);
  const [yourSide, setYourSide] = useState<'P1' | 'P2' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [criterion, setCriterion] = useState<ListCriterionView | null>(null);
  const [fullList, setFullList] = useState<ListEntry[] | null>(null);
  const [turnDeadline, setTurnDeadline] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ablyRef = useRef<Ably.Realtime | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStateJsonRef = useRef<string | null>(null);
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
        setState((data.state ?? null) as ListMatchState | null);
      }
      setYourSide(data.yourSide ?? null);
      setStatus(data.status ?? null);
      setCriterion((data.criterion ?? null) as ListCriterionView | null);
      setFullList((data.fullList ?? null) as ListEntry[] | null);
      setTurnDeadline(data.turnDeadline ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Maç yüklenemedi.');
    }
  }, [matchId]);

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
        // token alınamadı — yalnızca polling
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
      const MAX_RETRY = 4;
      for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
        const res = await fetch(`/api/match/${matchId}/list-move`, {
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
        if (res.status === 422) {
          void refresh();
          return {};
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Hamle reddedildi.');
        }
        const data = await res.json();
        void refresh();
        return data;
      }
      throw new Error('Hamle çok kez çakıştı, tekrar dene.');
    },
    [matchId, refresh],
  );

  const ackReveal = useCallback(async () => {
    await sendMove({ action: 'ack-reveal' });
  }, [sendMove]);

  const guess = useCallback(
    async (playerId: string): Promise<ListGuessOutcome | null> => {
      const data = await sendMove({ action: 'guess', playerId });
      return (data.outcome ?? null) as ListGuessOutcome | null;
    },
    [sendMove],
  );

  return {
    state,
    yourSide,
    status,
    criterion,
    fullList,
    loading,
    error,
    ackReveal,
    guess,
    turnDeadline,
    refresh,
  };
}
