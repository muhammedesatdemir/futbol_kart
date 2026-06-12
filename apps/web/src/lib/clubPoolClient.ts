/**
 * "Kareleri Kap" modu için kulüp havuzu (clubPool.json) client-side yükleyici.
 *
 * GameSessionProvider yalnız players + clubsLite yükler; bu mod ayrıca kürasyonlu
 * kulüp havuzuna (75 kulüp, logolu) ihtiyaç duyar. Provider'a dokunmadan (mevcut
 * akışı bozmadan) burada izole çekilir — playersClient.ts ile aynı desen:
 * modül-içi cache, force-cache fetch, tek uçuş (in-flight) koruması.
 */
'use client';

import type { PoolClub } from './squaresMode';

let cached: PoolClub[] | null = null;
let inFlight: Promise<PoolClub[]> | null = null;

export async function fetchClubPool(): Promise<PoolClub[]> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    // 'default': ETag/Last-Modified ile doğrular (playersClient ile aynı strateji).
    const res = await fetch('/data/clubPool.json', { cache: 'default' });
    if (!res.ok) throw new Error(`clubPool yüklenemedi: ${res.status}`);
    const pool = (await res.json()) as PoolClub[];
    cached = pool;
    return cached;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
