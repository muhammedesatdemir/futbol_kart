'use client';

import { useEffect, useState } from 'react';
import { useSessionStore } from './sessionStore';

/**
 * sessionStorage'taki state'i client'ta hydrate eder.
 * Component'ler bu hook hydrated=true dönene kadar oyun state'ine güvenmemeli.
 */
export function useSessionHydration(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    useSessionStore.persist
      .rehydrate()
      ?.then(() => setHydrated(true))
      .catch(() => setHydrated(true));
  }, []);

  return hydrated;
}
