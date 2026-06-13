/**
 * "Ortak Bul" modu için kulüp-çifti havuzu (clubPairs.json) client-side yükleyici.
 *
 * OFFLINE (bota/arkadaşa karşı) çiftleri client'ta kürate eder + cevap doğrular.
 * ONLINE'da kürasyon/doğrulama SUNUCUDA — bu yükleyici çağrılmaz (cevap havuzu
 * sızmasın). clubPoolClient.ts ile aynı desen: modül-içi cache, doğrulayan fetch.
 */
'use client';

import type { ClubPairsFile } from './commonMode';

let cached: ClubPairsFile | null = null;
let inFlight: Promise<ClubPairsFile> | null = null;

export async function fetchClubPairs(): Promise<ClubPairsFile> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const res = await fetch('/data/clubPairs.json', { cache: 'default' });
    if (!res.ok) throw new Error(`clubPairs yüklenemedi: ${res.status}`);
    const file = (await res.json()) as ClubPairsFile;
    cached = file;
    return cached;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
