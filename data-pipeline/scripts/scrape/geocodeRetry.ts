/**
 * Doğum koordinatı eksik kalan oyuncular için 2. tur Nominatim geocode.
 *
 * 1. tur birthCountry text yerine sadece countryId kullanıyordu — XX ülkeler için
 *    Nominatim'in ülke bağlamı yoktu.
 * 2. tur stratejisi:
 *    - birthCity'yi temizle ("---, Baghdad" → "Baghdad")
 *    - birthCountry text'i kullan (modern ülke adı)
 *    - Tarihsel ülkeleri modern karşılığa map'le (CSSR → Czech Republic, UdSSR → Russia)
 *    - Sadece 1. turda not_found olanları dene (resumable)
 *
 * Çıktı: cache/geocode.json güncellenir
 *
 * Kullanım:
 *   pnpm tsx scripts/scrape/geocodeRetry.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TmPlayer } from './players.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = join(__dirname, '..', '..');
const CACHE_DIR = join(PIPELINE_ROOT, 'cache');
const PLAYERS_RAW = join(CACHE_DIR, 'players-raw.json');
const GEOCODE_FILE = join(CACHE_DIR, 'geocode.json');

const MIN_DELAY_MS = 1100;
const USER_AGENT = 'futbol-kart-data-pipeline/0.1 (educational MVP)';

interface GeoEntry {
  key: string;
  city: string;
  countryId: number;
  lat?: number;
  lng?: number;
  status: 'matched' | 'not_found' | 'error';
}

/** Tarihsel ülke adlarını modern karşılığına eşleyen tablo */
const COUNTRY_NORMALIZE: Record<string, string> = {
  'CSSR': 'Czech Republic',
  'UdSSR': 'Russia',
  'East Germany (GDR)': 'Germany',
  'East Germany': 'Germany',
  'GDR': 'Germany',
  'West Germany': 'Germany',
  'Yugoslavia (Rep.)': 'Serbia',
  'Yugoslavia': 'Serbia',
  'British Virgin Islands': 'British Virgin Islands',
};

function normalizeCountry(c: string | undefined): string {
  if (!c) return '';
  return COUNTRY_NORMALIZE[c] ?? c;
}

/** "---, Baghdad" → "Baghdad", "Wien (XII)" → "Wien" */
function cleanCity(s: string): string {
  return s
    .replace(/---,?\s*/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*,\s*$/, '')
    .trim();
}

let lastRequestAt = 0;
async function throttle() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((r) => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

async function geocodeOne(city: string, country: string): Promise<{ lat: number; lng: number } | null> {
  await throttle();
  const query = encodeURIComponent(country ? `${city}, ${country}` : city);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return { lat: parseFloat(arr[0]!.lat), lng: parseFloat(arr[0]!.lon) };
}

async function main() {
  const cacheRaw = JSON.parse(await readFile(PLAYERS_RAW, 'utf8')) as Record<string, TmPlayer>;
  const geo = existsSync(GEOCODE_FILE)
    ? (JSON.parse(await readFile(GEOCODE_FILE, 'utf8')) as Record<string, GeoEntry>)
    : {};

  // Eksik koordinatı olan oyuncular için (city, country) çiftleri çıkar
  // Tek (city, country) çifti birden fazla oyuncudan paylaşılabilir
  const missingPairs = new Map<string, { city: string; country: string; countryId: number; sample: string }>();
  for (const tm of Object.values(cacheRaw)) {
    const cityRaw = tm.meta.birthPlaceDetails?.placeOfBirth;
    const countryId = tm.meta.birthPlaceDetails?.countryOfBirthId ?? 0;
    if (!cityRaw) continue;

    // Eğer mevcut key'de matched varsa atla
    const key = `${cityRaw}|${countryId}`;
    if (geo[key]?.status === 'matched') continue;

    // birthCountry text'i için ham bilgi yok cache'te — oyuncu sayfasından gelmesi gerekir
    // ama oyuncuya bağlı birthPlaceDetails.placeOfBirth ve countryOfBirthId var.
    // Country adını manuel mapping ile bulamayacağımız için, 'Country' string'i için
    // başka bir map kullanmamız gerek. Şimdilik countryId 0 olanları city tek başına dene.

    const city = cleanCity(cityRaw);
    if (!city || city.length < 2) continue;

    // Mevcut not_found ise yeniden dene; yoksa eklemeden geç (zaten ilk turda denenmiş)
    const sample = (tm.meta.name || tm.meta.shortName || '').slice(0, 40);
    if (!missingPairs.has(key)) {
      missingPairs.set(key, { city, country: '', countryId, sample });
    }
  }

  // Cache'teki ülke ad tablosu — tarihsel ülke adları için
  let countryNameById = new Map<number, string>();
  // quickselect/countries cache'inden
  const crypto = await import('node:crypto');
  const hash = crypto.createHash('sha1')
    .update('https://www.transfermarkt.com/quickselect/countries')
    .digest('hex').slice(0, 16);
  const countriesFile = join(CACHE_DIR, `${hash}.html`);
  if (existsSync(countriesFile)) {
    const countries = JSON.parse(await readFile(countriesFile, 'utf8')) as Array<{ id: string; name: string }>;
    countryNameById = new Map(countries.map((c) => [parseInt(c.id, 10), c.name]));
  }
  console.log(`[geocodeRetry] ülke ad tablosu: ${countryNameById.size}`);

  // Country bilgilerini doldur + tarihsel düzeltme uygula
  for (const [, info] of missingPairs) {
    const countryName = countryNameById.get(info.countryId) ?? '';
    info.country = normalizeCountry(countryName);
  }

  // Sadece not_found durumdakileri tekrar dene (matched zaten atlanıyor)
  const toRetry = [...missingPairs.entries()].filter(([key]) => {
    const entry = geo[key];
    return !entry || entry.status === 'not_found' || entry.status === 'error';
  });
  console.log(`[geocodeRetry] toplam eksik şehir+ülke çifti: ${missingPairs.size}`);
  console.log(`[geocodeRetry] retry hedefi (not_found/error): ${toRetry.length}`);

  if (toRetry.length === 0) {
    console.log('Hiçbir şey yapılmadı.');
    return;
  }

  const estMin = Math.ceil((toRetry.length * MIN_DELAY_MS) / 60000);
  console.log(`Tahmini süre: ~${estMin} dk`);

  let newMatched = 0;
  let stillNotFound = 0;
  let errors = 0;

  for (let i = 0; i < toRetry.length; i++) {
    const [key, info] = toRetry[i]!;
    const label = `[${i + 1}/${toRetry.length}] ${info.city}, ${info.country || '?'} (${info.sample})`;
    try {
      // 1. Strategy: city + country
      let res = await geocodeOne(info.city, info.country);
      // 2. Fallback: just city
      if (!res) {
        res = await geocodeOne(info.city, '');
      }
      if (res) {
        geo[key] = { key, city: info.city, countryId: info.countryId, lat: res.lat, lng: res.lng, status: 'matched' };
        newMatched++;
        if (i < 30 || newMatched % 50 === 0) {
          console.log(`${label} → ${res.lat.toFixed(2)}, ${res.lng.toFixed(2)} ✓`);
        }
      } else {
        geo[key] = { key, city: info.city, countryId: info.countryId, status: 'not_found' };
        stillNotFound++;
        if (stillNotFound < 5) console.log(`${label} → STILL NOT FOUND`);
      }
    } catch (err) {
      geo[key] = { key, city: info.city, countryId: info.countryId, status: 'error' };
      errors++;
      console.error(`${label} ! ERROR:`, err instanceof Error ? err.message : err);
    }
    if ((i + 1) % 25 === 0) {
      await writeFile(GEOCODE_FILE, JSON.stringify(geo, null, 2));
    }
  }

  await writeFile(GEOCODE_FILE, JSON.stringify(geo, null, 2));

  console.log(`\n=== ÖZET ===`);
  console.log(`Retry: ${toRetry.length}`);
  console.log(`  ✓ Yeni match: ${newMatched}`);
  console.log(`  ! Hâlâ not found: ${stillNotFound}`);
  console.log(`  ! Error: ${errors}`);
}

main().catch((e) => {
  console.error('[geocodeRetry] fatal:', e);
  process.exit(1);
});
