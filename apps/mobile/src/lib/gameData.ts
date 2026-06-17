import { File, Paths } from 'expo-file-system';
import type { Player } from '@futbol-kart/shared-types';
import type { ClubLite } from '@futbol-kart/question-templates';
import { dataUrls } from './config';

/**
 * Oyuncu/kulüp verisi yükleyici (mobil). Web karşılığı: playersClient.ts
 *
 * VERİ KARARI (MOBIL-YOL-HARITASI.md Faz 3):
 *   - players.json ~25MB, clubs.json ~1.3MB → AsyncStorage'a SIĞMAZ (Android ~6MB
 *     limit). Bu yüzden expo-file-system ile DOSYA olarak cache'lenir.
 *   - İlk açılış: derbygoal.com'dan indir → cache dizinine yaz. İnternet ŞART.
 *   - Sonraki açılışlar: cache'den oku (anlık, internetsiz) → offline modlar çalışır.
 *   - Web verisine dokunulmaz (tek kaynak, public statik dosya).
 */

interface ClubRaw {
  id: string;
  country: string;
  countryCode: string;
  continent: string;
  lat: number;
  lng: number;
}

export interface GameData {
  players: Player[];
  clubsLite: ClubLite[];
}

const PLAYERS_FILE = 'players.json';
const CLUBS_FILE = 'clubs.json';

let cached: GameData | null = null;
let inFlight: Promise<GameData> | null = null;

/** Cache'de her iki dosya da var mı? (offline açılış için hızlı kontrol.) */
export async function isDataCached(): Promise<boolean> {
  const players = new File(Paths.cache, PLAYERS_FILE);
  const clubs = new File(Paths.cache, CLUBS_FILE);
  return players.exists && clubs.exists;
}

/**
 * Veriyi yükler. Önce in-memory cache, sonra dosya cache, en son ağ.
 * @param forceRefresh true → cache'i atla, taze indir (veri güncellemesi için).
 */
export async function loadGameData(forceRefresh = false): Promise<GameData> {
  if (cached && !forceRefresh) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const playersFile = new File(Paths.cache, PLAYERS_FILE);
    const clubsFile = new File(Paths.cache, CLUBS_FILE);

    // 1. Cache yoksa veya zorla yenileme → indir.
    if (forceRefresh || !playersFile.exists) {
      if (playersFile.exists) playersFile.delete();
      await File.downloadFileAsync(dataUrls.players, playersFile);
    }
    if (forceRefresh || !clubsFile.exists) {
      if (clubsFile.exists) clubsFile.delete();
      await File.downloadFileAsync(dataUrls.clubs, clubsFile);
    }

    // 2. Cache'den oku + parse.
    const players = JSON.parse(await playersFile.text()) as Player[];
    const clubsRaw = JSON.parse(await clubsFile.text()) as ClubRaw[];
    const clubsLite: ClubLite[] = clubsRaw.map((c) => ({
      id: c.id,
      country: c.country,
      countryCode: c.countryCode,
      continent: c.continent,
      lat: c.lat,
      lng: c.lng,
    }));

    cached = { players, clubsLite };
    return cached;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
