import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Player } from '@futbol-kart/shared-types';
import type { ClubLite } from '@futbol-kart/question-templates';

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
  /** Kulüp logosu — yalnız top ~120 kulüpte var (Kariyer Yolu logo/bayrak fallback). */
  crestUrl?: string;
}

let cached: {
  players: Player[];
  clubs: ClubRaw[];
  clubsLite: ClubLite[];
} | null = null;

export async function loadGameData() {
  if (cached) return cached;

  const dataDir = join(process.cwd(), 'public', 'data');
  const [playersRaw, clubsRaw] = await Promise.all([
    readFile(join(dataDir, 'players.json'), 'utf8'),
    readFile(join(dataDir, 'clubs.json'), 'utf8'),
  ]);

  const players = JSON.parse(playersRaw) as Player[];
  const clubs = JSON.parse(clubsRaw) as ClubRaw[];

  const clubsLite: ClubLite[] = clubs.map((c) => ({
    id: c.id,
    country: c.country,
    countryCode: c.countryCode,
    continent: c.continent,
    lat: c.lat,
    lng: c.lng,
  }));

  cached = { players, clubs, clubsLite };
  return cached;
}
