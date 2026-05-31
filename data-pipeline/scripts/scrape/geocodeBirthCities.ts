/**
 * Oyuncu doğum şehirleri için Nominatim (OSM) ile koordinat geocode'u.
 *
 * Mevcut TM API doğum şehri adını döner ama enlem/boylam vermez.
 * q11_equator_dist, q12_istanbul_dist, q13_more_north şablonları için lazım.
 *
 * Strateji:
 *   1. cache/players-raw.json'dan unique (city, countryId) çiftlerini çıkar
 *   2. Her biri için Nominatim search: "{city}, {countryName}"
 *   3. İlk sonucun lat/lng'sini al
 *   4. cache/geocode.json'a yaz (resumable)
 *
 * Rate limit: Nominatim 1 req/sn, ücretsiz.
 *
 * Kullanım:
 *   pnpm tsx scripts/scrape/geocodeBirthCities.ts
 *   pnpm tsx scripts/scrape/geocodeBirthCities.ts --limit=50  (test)
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TmPlayer } from './players.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = join(__dirname, '..', '..');
const CACHE_DIR = join(PIPELINE_ROOT, 'cache');
const PLAYERS_RAW = join(CACHE_DIR, 'players-raw.json');
const GEOCODE_FILE = join(CACHE_DIR, 'geocode.json');

const MIN_DELAY_MS = 1100; // Nominatim politika: max 1 req/sec
const USER_AGENT = 'futbol-kart-data-pipeline/0.1 (educational MVP)';

export interface GeoEntry {
  /** Aranan: city|countryId */
  key: string;
  city: string;
  countryId: number;
  lat?: number;
  lng?: number;
  status: 'matched' | 'not_found' | 'error';
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

/** TM countryId → adı bulmak için quickselect cache'i. */
async function loadCountryNames(): Promise<Map<number, string>> {
  // Bu cache her zaman var (merge.ts ilk koşmada çekti)
  const crypto = await import('node:crypto');
  const hash = crypto
    .createHash('sha1')
    .update('https://www.transfermarkt.com/quickselect/countries')
    .digest('hex')
    .slice(0, 16);
  const file = join(CACHE_DIR, `${hash}.html`);
  if (!existsSync(file)) {
    throw new Error('quickselect/countries cache yok. Önce scrape:merge çalıştır.');
  }
  const raw = await readFile(file, 'utf8');
  const countries = JSON.parse(raw) as Array<{ id: string; name: string }>;
  const out = new Map<number, string>();
  for (const c of countries) out.set(parseInt(c.id, 10), c.name);
  return out;
}

let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((r) => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

async function geocodeOne(city: string, country: string): Promise<{ lat: number; lng: number } | null> {
  await throttle();
  const query = encodeURIComponent(`${city}, ${country}`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&addressdetails=0`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return { lat: parseFloat(arr[0]!.lat), lng: parseFloat(arr[0]!.lon) };
}

function parseArgs(): { limit?: number } {
  const args = process.argv;
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : undefined;
  return { limit };
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  const { limit } = parseArgs();

  const cache = await readJson<Record<string, TmPlayer>>(PLAYERS_RAW);
  if (!cache) {
    console.error('[geocodeBirthCities] players-raw.json yok');
    process.exit(1);
  }
  const countryNames = await loadCountryNames();

  // Unique (city, countryId) çiftleri
  const uniqueKeys = new Map<string, { city: string; countryId: number }>();
  for (const p of Object.values(cache)) {
    const city = p.meta.birthPlaceDetails?.placeOfBirth;
    const countryId = p.meta.birthPlaceDetails?.countryOfBirthId;
    if (!city || !countryId) continue;
    const key = `${city}|${countryId}`;
    if (!uniqueKeys.has(key)) {
      uniqueKeys.set(key, { city, countryId });
    }
  }
  console.log(`[geocodeBirthCities] unique şehir+ülke: ${uniqueKeys.size}`);

  // Mevcut geocode cache
  const existing = (await readJson<Record<string, GeoEntry>>(GEOCODE_FILE)) ?? {};
  console.log(`[geocodeBirthCities] cache: ${Object.keys(existing).length} kayıt`);

  const todo = [...uniqueKeys.entries()].filter(([key]) => !existing[key]);
  const limited = limit ? todo.slice(0, limit) : todo;
  console.log(`[geocodeBirthCities] işlenecek: ${limited.length}${limit ? ' (limit)' : ''}`);

  if (limited.length === 0) {
    console.log('Hiçbir şey yapılmadı; cache tam.');
    return;
  }

  // Tahmini süre
  const estMin = Math.ceil((limited.length * MIN_DELAY_MS) / 60000);
  console.log(`Tahmini süre: ~${estMin} dk`);

  let matched = 0;
  let notFound = 0;
  let errors = 0;

  for (let i = 0; i < limited.length; i++) {
    const [key, { city, countryId }] = limited[i]!;
    const country = countryNames.get(countryId) ?? '';
    const label = `[${i + 1}/${limited.length}] ${city}, ${country} (id=${countryId})`;
    try {
      const result = await geocodeOne(city, country);
      if (result) {
        existing[key] = { key, city, countryId, lat: result.lat, lng: result.lng, status: 'matched' };
        matched++;
        if (i < 20 || i % 50 === 0) {
          console.log(`${label} → ${result.lat.toFixed(3)}, ${result.lng.toFixed(3)}`);
        }
      } else {
        existing[key] = { key, city, countryId, status: 'not_found' };
        notFound++;
        if (notFound < 10) console.log(`${label} → NOT FOUND`);
      }
    } catch (err) {
      existing[key] = { key, city, countryId, status: 'error' };
      errors++;
      console.error(`${label} ! ERROR:`, err instanceof Error ? err.message : err);
    }
    // Her 25'te checkpoint
    if ((i + 1) % 25 === 0) {
      await writeFile(GEOCODE_FILE, JSON.stringify(existing, null, 2));
    }
  }

  await writeFile(GEOCODE_FILE, JSON.stringify(existing, null, 2));

  console.log(`\n=== ÖZET ===`);
  console.log(`İşlenen:    ${limited.length}`);
  console.log(`  ✓ Match:  ${matched}`);
  console.log(`  ! NF:     ${notFound}`);
  console.log(`  ! Error:  ${errors}`);
  console.log(`Cache toplam: ${Object.keys(existing).length}`);
}

main().catch((e) => {
  console.error('[geocodeBirthCities] fatal:', e);
  process.exit(1);
});
