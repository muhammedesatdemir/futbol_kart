/**
 * Client-side oyuncu verisi yükleyici.
 *
 * Server-side data.ts (fs.readFile) çok büyük veri setleri için
 * SSR HTML şişer; bunun yerine browser fetch ile JSON çekiyoruz.
 *
 * Cache: modül seviyesinde, ilk fetch'ten sonra in-memory.
 * (IndexedDB ileride eklenebilir — basit MVP için sufficient.)
 */
'use client';

import type { Player } from '@futbol-kart/shared-types';
import { buildClubLookup, type ClubLookup } from './playerFilters';

interface ClubRaw {
  id: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  continent: string;
  lat: number;
  lng: number;
  founded?: number;
}

interface GameData {
  players: Player[];
  clubs: ClubRaw[];
  clubsById: Map<string, ClubLookup>;
}

let cached: GameData | null = null;
let inFlight: Promise<GameData> | null = null;

export async function fetchGameData(): Promise<GameData> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const [playersRes, clubsRes] = await Promise.all([
      fetch('/data/players.json', { cache: 'force-cache' }),
      fetch('/data/clubs.json', { cache: 'force-cache' }),
    ]);
    if (!playersRes.ok) throw new Error(`Failed to load players: ${playersRes.status}`);
    if (!clubsRes.ok) throw new Error(`Failed to load clubs: ${clubsRes.status}`);

    const players = (await playersRes.json()) as Player[];
    const clubs = (await clubsRes.json()) as ClubRaw[];
    const clubsById = buildClubLookup(clubs);

    cached = { players, clubs, clubsById };
    return cached;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
