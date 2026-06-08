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
import type { ClubLite } from '@futbol-kart/question-templates';
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
  /** Flow/soru çözümü için hafif kulüp verisi (createFlowContext kullanır). */
  clubsLite: ClubLite[];
}

let cached: GameData | null = null;
let inFlight: Promise<GameData> | null = null;

export async function fetchGameData(): Promise<GameData> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    // cache: 'default' (force-cache DEĞİL): force-cache players.json'u tarayıcıda
    // KALICI tutar → dosya rebuild'de değişse bile ESKİ sürüm gelir → kullanıcı
    // artık var olmayan bir kart id'si seçer (örn. `p_e-colak-2006`) → sunucu
    // reddeder, maç bozulur. 'default' ile tarayıcı ETag/Last-Modified ile
    // DOĞRULAR: değişmemişse 304 (anlık, bedava), değişmişse yeni indirir. Böylece
    // veri güncellemeleri client'a otomatik yansır, bayat-cache bug'ı biter.
    const [playersRes, clubsRes] = await Promise.all([
      fetch('/data/players.json', { cache: 'default' }),
      fetch('/data/clubs.json', { cache: 'default' }),
    ]);
    if (!playersRes.ok) throw new Error(`Failed to load players: ${playersRes.status}`);
    if (!clubsRes.ok) throw new Error(`Failed to load clubs: ${clubsRes.status}`);

    const players = (await playersRes.json()) as Player[];
    const clubs = (await clubsRes.json()) as ClubRaw[];
    const clubsById = buildClubLookup(clubs);
    const clubsLite: ClubLite[] = clubs.map((c) => ({
      id: c.id,
      country: c.country,
      countryCode: c.countryCode,
      continent: c.continent,
      lat: c.lat,
      lng: c.lng,
    }));

    cached = { players, clubs, clubsById, clubsLite };
    return cached;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
