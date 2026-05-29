'use client';

import { createContext, useContext, useMemo, useRef } from 'react';
import type { Player } from '@futbol-kart/shared-types';
import type { ClubLite } from '@futbol-kart/question-templates';
import { createFlowContext, type FlowContext } from './gameFlow';

interface SessionData {
  players: Player[];
  clubsLite: ClubLite[];
}

interface SessionApi extends SessionData {
  getFlow: (seed: string) => FlowContext;
}

const SessionCtx = createContext<SessionApi | null>(null);

export function GameSessionProvider({
  players,
  clubsLite,
  children,
}: SessionData & { children: React.ReactNode }) {
  const flowRef = useRef<{ seed: string; flow: FlowContext } | null>(null);

  const api = useMemo<SessionApi>(
    () => ({
      players,
      clubsLite,
      getFlow: (seed: string) => {
        if (flowRef.current?.seed === seed) return flowRef.current.flow;
        const flow = createFlowContext(seed, players, clubsLite);
        flowRef.current = { seed, flow };
        return flow;
      },
    }),
    [players, clubsLite],
  );

  return <SessionCtx.Provider value={api}>{children}</SessionCtx.Provider>;
}

export function useGameSession(): SessionApi {
  const ctx = useContext(SessionCtx);
  if (!ctx) {
    throw new Error('useGameSession must be used inside GameSessionProvider');
  }
  return ctx;
}
