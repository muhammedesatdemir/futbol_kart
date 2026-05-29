'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  initialSession,
  reduceSession,
  type SessionEvent,
  type SessionState,
} from './sessionMachine';

interface SessionStore {
  state: SessionState;
  dispatch: (event: SessionEvent) => void;
  init: (gameId: string, seed: string) => void;
  reset: () => void;
}

const STORAGE_KEY = 'fk:session:v1';

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      state: initialSession('', ''),

      dispatch: (event) => {
        set((s) => ({ state: reduceSession(s.state, event) }));
      },

      init: (gameId, seed) => {
        set({ state: initialSession(gameId, seed) });
      },

      reset: () => {
        const { gameId, seed } = get().state;
        set({ state: initialSession(gameId, seed) });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? noopStorage : sessionStorage,
      ),
      partialize: (s) => ({ state: s.state }),
      skipHydration: true,
    },
  ),
);

const noopStorage: Storage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  length: 0,
};
