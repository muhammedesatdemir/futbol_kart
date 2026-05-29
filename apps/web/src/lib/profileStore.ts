'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ProfileState {
  p1Name: string;
  p2Name: string;
  setNames: (p1: string, p2: string) => void;
  setP1: (name: string) => void;
  setP2: (name: string) => void;
}

const STORAGE_KEY = 'fk:profile:v1';

const noopStorage: Storage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  length: 0,
};

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
      name: STORAGE_KEY,
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? noopStorage : localStorage,
      ),
      skipHydration: true,
    },
  ),
);

export function useProfileHydration(): boolean {
  if (typeof window === 'undefined') return false;
  // Statik bir flag yerine doğrudan dene; zaten persist senkron localStorage okur
  return useProfileStore.persist.hasHydrated();
}
