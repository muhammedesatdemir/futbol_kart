/**
 * İyi vatandaş HTTP client:
 * - Sabit User-Agent (Transfermarkt'a tanıtım, "ben şeffafım")
 * - İstekler arası min 2 saniye delay (rate limit)
 * - Exponential backoff retry (429/503 hatalarında)
 * - Disk cache (aynı URL'yi 2 kez çekme — geliştirme döngüsü hızlı)
 *
 * NOT: Bu pipeline build-time çalışır, runtime'da Transfermarkt'a istek
 * gitmez. Üretim siteniz Transfermarkt'tan bağımsız static JSON serve eder.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', '..', 'cache');

// TM JSON API'leri sade UA ile 403 atıyor; gerçek tarayıcı UA daha güvenli.
// Build-time pipeline + rate limit (2 sn) — sıradan ziyaretçi davranışı.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const MIN_DELAY_MS = 2000;
const MAX_RETRIES = 3;

let lastRequestAt = 0;

interface FetchOptions {
  /** Cache kullanılsın mı (default true). */
  useCache?: boolean;
  /** Cache TTL — gün cinsinden. Default 30 (oyuncu sayfaları sık değişmez). */
  ttlDays?: number;
}

async function ensureCacheDir() {
  await mkdir(CACHE_DIR, { recursive: true });
}

function cacheKey(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 16);
}

async function readCache(url: string, ttlDays: number): Promise<string | null> {
  const path = join(CACHE_DIR, `${cacheKey(url)}.html`);
  try {
    const s = await stat(path);
    const ageMs = Date.now() - s.mtimeMs;
    const maxAgeMs = ttlDays * 24 * 60 * 60 * 1000;
    if (ageMs > maxAgeMs) return null;
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

async function writeCache(url: string, body: string): Promise<void> {
  const path = join(CACHE_DIR, `${cacheKey(url)}.html`);
  await writeFile(path, body, 'utf8');
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_DELAY_MS) {
    await sleep(MIN_DELAY_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

/**
 * JSON endpoint için: HTML yerine parse edilmiş objeyi döner.
 * Cache HTML dosyası olarak tutulur (sade text), TTL aynı çalışır.
 */
export async function fetchJson<T>(
  url: string,
  opts: FetchOptions = {},
): Promise<T> {
  const body = await fetchHtml(url, opts, {
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://www.transfermarkt.com/',
    Origin: 'https://www.transfermarkt.com',
  });
  try {
    return JSON.parse(body) as T;
  } catch (e) {
    throw new Error(
      `JSON parse failed for ${url}: ${e instanceof Error ? e.message : e}`,
    );
  }
}

/**
 * Verilen URL'yi getirir. Cache'liyse cache'ten, değilse network'ten.
 */
export async function fetchHtml(
  url: string,
  opts: FetchOptions = {},
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  const useCache = opts.useCache ?? true;
  const ttlDays = opts.ttlDays ?? 30;

  await ensureCacheDir();

  if (useCache) {
    const cached = await readCache(url, ttlDays);
    if (cached !== null) {
      return cached;
    }
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await throttle();
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept':
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,tr;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          ...extraHeaders,
        },
      });
      if (res.status === 429 || res.status === 503) {
        const wait = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.warn(
          `  [http] ${res.status} on ${url} — backing off ${wait}ms`,
        );
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const body = await res.text();
      if (useCache) await writeCache(url, body);
      return body;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      const wait = Math.pow(2, attempt) * 1000;
      console.warn(`  [http] error on ${url}, retry in ${wait}ms`, err);
      await sleep(wait);
    }
  }
  throw new Error('unreachable');
}
