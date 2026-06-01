'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface SoundState {
  /** Ses açık mı? Varsayılan KAPALI (mobil autoplay + kullanıcı tercihi). */
  enabled: boolean;
  toggle: () => void;
  setEnabled: (v: boolean) => void;
}

const STORAGE_KEY = 'fk:sound:v1';

const noopStorage: Storage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  length: 0,
};

export const useSoundStore = create<SoundState>()(
  persist(
    (set) => ({
      enabled: false,
      toggle: () => set((s) => ({ enabled: !s.enabled })),
      setEnabled: (v) => set({ enabled: v }),
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
