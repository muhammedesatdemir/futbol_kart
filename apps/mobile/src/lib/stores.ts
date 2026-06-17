import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initialSession,
  reduceSession,
  type SessionEvent,
  type SessionState,
} from '@futbol-kart/game-engine';

/**
 * Oyun oturumu ve oyuncu profili store'ları. Web karşılığı:
 *   apps/web/src/lib/sessionStore.ts + profileStore.ts
 *
 * Fark: persist storage AsyncStorage (web sessionStorage/localStorage). Zustand
 * persist AsyncStorage ile asenkron hidrasyon yapar → skipHydration gerekmez.
 */

interface SessionStore {
  state: SessionState;
  dispatch: (event: SessionEvent) => void;
  init: (gameId: string, seed: string) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      state: initialSession('', ''),
      dispatch: (event) => set((s) => ({ state: reduceSession(s.state, event) })),
      init: (gameId, seed) => set({ state: initialSession(gameId, seed) }),
      reset: () => {
        const { gameId, seed } = get().state;
        set({ state: initialSession(gameId, seed) });
      },
    }),
    {
      name: 'fk:session:v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ state: s.state }),
    },
  ),
);

interface ProfileState {
  p1Name: string;
  p2Name: string;
  setNames: (p1: string, p2: string) => void;
  setP1: (name: string) => void;
  setP2: (name: string) => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      p1Name: '',
      p2Name: '',
      setNames: (p1, p2) => set({ p1Name: p1.trim(), p2Name: p2.trim() }),
      setP1: (name) => set({ p1Name: name.trim() }),
      setP2: (name) => set({ p2Name: name.trim() }),
    }),
    {
      name: 'fk:profile:v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
