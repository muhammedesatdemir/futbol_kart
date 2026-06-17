import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Player } from '@futbol-kart/shared-types';
import type { ClubLite } from '@futbol-kart/question-templates';
import { createFlowContext, type FlowContext } from '@futbol-kart/game-engine';
import { loadGameData } from './gameData';

/**
 * Oyun verisini (players + clubsLite) yükler ve getFlow sağlar.
 * Web karşılığı: apps/web/src/lib/GameSessionProvider.tsx
 *
 * Fark: web fetch + in-memory, mobil expo-file-system cache (gameData.ts).
 * İlk yükleme bitene kadar ready=false (tüketici ekranlar BallLoader gösterir).
 */
interface SessionApi {
  players: Player[];
  clubsLite: ClubLite[];
  ready: boolean;
  error: string | null;
  getFlow: (seed: string) => FlowContext;
  retry: () => void;
}

const SessionCtx = createContext<SessionApi | null>(null);

export function GameSessionProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<{ players: Player[]; clubsLite: ClubLite[] }>({
    players: [],
    clubsLite: [],
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const flowRef = useRef<{ seed: string; flow: FlowContext } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setReady(false);
    loadGameData()
      .then((d) => {
        if (cancelled) return;
        setData({ players: d.players, clubsLite: d.clubsLite });
        setReady(true);
        flowRef.current = null;
      })
      .catch(() => {
        if (cancelled) return;
        setError('Oyuncu verisi yüklenemedi. İnternet bağlantını kontrol et.');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const api = useMemo<SessionApi>(
    () => ({
      players: data.players,
      clubsLite: data.clubsLite,
      ready,
      error,
      retry: () => setAttempt((a) => a + 1),
      getFlow: (seed: string) => {
        if (flowRef.current?.seed === seed) return flowRef.current.flow;
        const flow = createFlowContext(seed, data.players, data.clubsLite);
        flowRef.current = { seed, flow };
        return flow;
      },
    }),
    [data, ready, error],
  );

  return <SessionCtx.Provider value={api}>{children}</SessionCtx.Provider>;
}

export function useGameSession(): SessionApi {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error('useGameSession must be used inside GameSessionProvider');
  return ctx;
}
