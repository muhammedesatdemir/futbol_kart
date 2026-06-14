'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Ably from 'ably';
import type { ImposterView, ImposterWordOutcome } from '@/lib/server/imposterMatchEngine';

/**
 * Online "İmposter" maç köprüsü (client). ÇOK-OYUNCULU (3-5).
 *
 * `useOnlineCareerMatch.ts`'in KARDEŞİ — aynı Ably + poll + versiyon-GET +
 * optimistic-retry iskeleti. FARK: GET ham state DEĞİL, taraf-özel `view`
 * (ImposterView) döner → rol/oy/cevap maskeli. yourSide = oyuncu INDEX'i (sayı).
 * Aksiyonlar: ackRole / submitWord(word) / vote(target|null).
 */
export interface OnlineImposterMatch {
  view: ImposterView | null;
  yourIndex: number | null;
  status: string | null;
  loading: boolean;
  error: string | null;
  /** Rol açılışı görüldü → herkes onaylayınca WORDS. */
  ackRole: () => Promise<void>;
  /** Sıra-tabanlı kelime (aktif oyuncu) — outcome döner (kabul/red + reason). */
  submitWord: (word: string) => Promise<ImposterWordOutcome | null>;
  /** Oy ver (target index | null = çekimser). */
  vote: (target: number | null) => Promise<void>;
  turnDeadline: string | null;
  refresh: () => Promise<void>;
}

const POLL_MS_NO_ABLY = 1500;
const POLL_MS_WITH_ABLY = 5000;

export function useOnlineImposterMatch(matchId: string | null): OnlineImposterMatch {
  const [view, setView] = useState<ImposterView | null>(null);
  const [yourIndex, setYourIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [turnDeadline, setTurnDeadline] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ablyRef = useRef<Ably.Realtime | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastViewJsonRef = useRef<string | null>(null);
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
      const nextViewJson = JSON.stringify(data.view ?? null);
      if (nextViewJson !== lastViewJsonRef.current) {
        lastViewJsonRef.current = nextViewJson;
        setView((data.view ?? null) as ImposterView | null);
      }
      setYourIndex(typeof data.yourSide === 'number' ? data.yourSide : null);
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
      lastViewJsonRef.current = null;
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
        const res = await fetch(`/api/match/${matchId}/imposter-move`, {
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
          // 422 = reddedilen hamle (yasak kelime / sıra değil): body'yi DÖNDÜR
          //  ki çağıran (submitWord) red sebebini gösterebilsin.
          const data = await res.json().catch(() => ({}));
          void refresh();
          return data;
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

  const ackRole = useCallback(async () => {
    await sendMove({ action: 'ack-role' });
  }, [sendMove]);

  const submitWord = useCallback(
    async (word: string): Promise<ImposterWordOutcome | null> => {
      const data = await sendMove({ action: 'submit-word', word });
      // 422 red yanıtında { error } döner (wordOutcome yok) → reddedildi say.
      if (data.wordOutcome) return data.wordOutcome as ImposterWordOutcome;
      if (typeof data.error === 'string') return { accepted: false, reason: data.error };
      return null;
    },
    [sendMove],
  );

  const vote = useCallback(
    async (target: number | null): Promise<void> => {
      await sendMove({ action: 'vote', target });
    },
    [sendMove],
  );

  return {
    view,
    yourIndex,
    status,
    loading,
    error,
    ackRole,
    submitWord,
    vote,
    turnDeadline,
    refresh,
  };
}
