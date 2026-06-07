'use client';

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
import { fetchGameData } from '@/lib/playersClient';

interface SessionData {
  players: Player[];
  clubsLite: ClubLite[];
}

interface SessionApi extends SessionData {
  getFlow: (seed: string) => FlowContext;
  /** Oyuncu verisi yüklendi mi? (false iken players boş — tüketiciler bekler.) */
  ready: boolean;
}

const SessionCtx = createContext<SessionApi | null>(null);

/**
 * Oyun verisini (players + clubsLite) CLIENT-SIDE lazy yükler.
 *
 * Eskiden bu veri root layout'ta `await loadGameData()` ile sunucuda yüklenip
 * prop olarak geçiliyordu → 25MB her sayfanın SSR HTML'ine gömülüyor, her
 * navigasyonda 8-9sn bloklama + kara ekran oluyordu (özellikle online rematch).
 *
 * Artık veri tarayıcıda `fetchGameData()` ile bir kez çekilir (force-cache,
 * /data/players.json). Gelene kadar `players: []`, `ready: false`. Online mod
 * zaten sunucu-otoriteli; veriye yalnızca kart seçim ekranı muhtaç (o da kendi
 * fetch'ini yapıyor). Bkz ONLINE-YOL-HARITASI.md (Faz 0).
 */
export function GameSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [data, setData] = useState<SessionData>({ players: [], clubsLite: [] });
  const [ready, setReady] = useState(false);
  const flowRef = useRef<{ seed: string; flow: FlowContext } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGameData()
      .then((d) => {
        if (cancelled) return;
        setData({ players: d.players, clubsLite: d.clubsLite });
        setReady(true);
        flowRef.current = null; // veri geldi → eski (boş) flow'u geçersiz kıl
      })
      .catch(() => {
        // yüklenemedi — players boş kalır; tüketici ekranlar kendi hatasını gösterir
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const api = useMemo<SessionApi>(
    () => ({
      players: data.players,
      clubsLite: data.clubsLite,
      ready,
      getFlow: (seed: string) => {
        if (flowRef.current?.seed === seed) return flowRef.current.flow;
        const flow = createFlowContext(seed, data.players, data.clubsLite);
        flowRef.current = { seed, flow };
        return flow;
      },
    }),
    [data, ready],
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
