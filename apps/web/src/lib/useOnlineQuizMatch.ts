'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Ably from 'ably';
import type {
  QuizMatchState,
  QuizSelectOutcome,
  QuizJokerResult,
} from '@/lib/server/quizMatchEngine';
import type { QuizJoker } from '@/lib/quizMode';

/**
 * Online "4'lü Kıyas" maç köprüsü (client).
 *
 * `useOnlineCommonMatch.ts`'in KARDEŞİ — aynı Ably + poll + versiyon-GET +
 * optimistic-retry iskeleti. AMA akış EŞZAMANLI: `select(indexes)` bu turdaki
 * seçim (x2 jokeri → 2 index); `ackReveal` metrik açılışını, `ackRound` tur
 * sonucunu onaylar; `useJoker('fifty'|'double')` joker oynar (1×/maç).
 * Dönen `state` = MASKELİ QuizMatchState (değer + doğru cevap + rakip seçimi gizli).
 */
export interface OnlineQuizMatch {
  state: QuizMatchState | null;
  yourSide: 'P1' | 'P2' | null;
  status: string | null;
  loading: boolean;
  error: string | null;
  /** Metrik açılış ekranı görüldü → SELECT. */
  ackReveal: () => Promise<void>;
  /** Tur sonucu görüldü → sonraki tur / RESULT. */
  ackRound: () => Promise<void>;
  /** Bu turdaki kart seçimi — outcome döner (correct + indexes; değer gizli). */
  select: (indexes: number[]) => Promise<QuizSelectOutcome | null>;
  /** Joker — sonuç döner (yalnız isteyene; fifty → kalan index'ler). 1×/maç. */
  useJoker: (joker: QuizJoker) => Promise<QuizJokerResult | null>;
  turnDeadline: string | null;
  refresh: () => Promise<void>;
}

const POLL_MS_NO_ABLY = 1500;
const POLL_MS_WITH_ABLY = 5000;

export function useOnlineQuizMatch(matchId: string | null): OnlineQuizMatch {
  const [state, setState] = useState<QuizMatchState | null>(null);
  const [yourSide, setYourSide] = useState<'P1' | 'P2' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
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
        setState((data.state ?? null) as QuizMatchState | null);
      }
      setYourSide(data.yourSide ?? null);
      setStatus(data.status ?? null);
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
        const res = await fetch(`/api/match/${matchId}/quiz-move`, {
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
        if (res.status === 422 || res.status === 429) {
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

  const ackRound = useCallback(async () => {
    await sendMove({ action: 'ack-round' });
  }, [sendMove]);

  const select = useCallback(
    async (indexes: number[]): Promise<QuizSelectOutcome | null> => {
      const data = await sendMove({ action: 'select', indexes });
      return (data.outcome ?? null) as QuizSelectOutcome | null;
    },
    [sendMove],
  );

  const useJoker = useCallback(
    async (joker: QuizJoker): Promise<QuizJokerResult | null> => {
      const data = await sendMove({ action: 'use-joker', joker });
      return (data.joker ?? null) as QuizJokerResult | null;
    },
    [sendMove],
  );

  return {
    state,
    yourSide,
    status,
    loading,
    error,
    ackReveal,
    ackRound,
    select,
    useJoker,
    turnDeadline,
    refresh,
  };
}
