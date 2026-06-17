import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Ses açık/kapalı tercihi. Web karşılığı: apps/web/src/lib/soundStore.ts
 *
 * Fark: web'de varsayılan KAPALI'ydı (tarayıcı autoplay kısıtı). Mobilde o kısıt
 * yok → varsayılan AÇIK. Persist: AsyncStorage (web'de localStorage).
 */
interface SoundState {
  enabled: boolean;
  toggle: () => void;
  setEnabled: (v: boolean) => void;
}

const STORAGE_KEY = 'fk:sound:v1';

export const useSoundStore = create<SoundState>()(
  persist(
    (set) => ({
      enabled: true,
      toggle: () => set((s) => ({ enabled: !s.enabled })),
      setEnabled: (v) => set({ enabled: v }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
