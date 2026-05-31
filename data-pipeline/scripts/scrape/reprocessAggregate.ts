/**
 * cache'deki TÜM performance-game JSON dosyalarını yeniden aggregate eder.
 *
 * TM'ye yeni istek YAPMAZ — mevcut cache (sha1 hash'li html dosyalar) okur,
 * yeni aggregate fonksiyonunu uygular, players-raw.json'u günceller.
 *
 * Kullanım:
 *   pnpm tsx scripts/scrape/reprocessAggregate.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregate, type PerfGame } from './perfApi.js';
import type { TmPlayer } from './players.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = join(__dirname, '..', '..');
const CACHE_DIR = join(PIPELINE_ROOT, 'cache');
const PLAYERS_RAW = join(CACHE_DIR, 'players-raw.json');

function cacheKey(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 16);
}

interface PerfEnvelope {
  success: boolean;
  data: { performance: PerfGame[] };
}

async function loadPerformanceFromCache(tmId: number): Promise<PerfGame[] | null> {
  const url = `https://www.transfermarkt.com/ceapi/performance-game/${tmId}`;
  const file = join(CACHE_DIR, `${cacheKey(url)}.html`);
  if (!existsSync(file)) return null;
  try {
    const raw = await readFile(file, 'utf8');
    const env = JSON.parse(raw) as PerfEnvelope;
    if (!env.success) return null;
    return env.data.performance;
  } catch {
    return null;
  }
}

async function main() {
  console.log('[reprocess] başlatılıyor…');
  if (!existsSync(PLAYERS_RAW)) {
    console.error('[reprocess] players-raw.json yok');
    process.exit(1);
  }
  const cache = JSON.parse(await readFile(PLAYERS_RAW, 'utf8')) as Record<string, TmPlayer>;
  const tmIds = Object.keys(cache);
  console.log(`[reprocess] toplam ${tmIds.length} oyuncu`);

  let reprocessed = 0;
  let perfMissing = 0;
  let unchanged = 0;
  let napsDecreased = 0;
  let totalNapsDelta = 0;

  for (let i = 0; i < tmIds.length; i++) {
    const tmId = tmIds[i]!;
    const tm = cache[tmId]!;
    const perf = await loadPerformanceFromCache(parseInt(tmId, 10));
    if (!perf) {
      perfMissing++;
      continue;
    }

    const oldNaps = tm.stats.nationalCaps;
    const oldNgoals = tm.stats.nationalGoals;
    const oldApps = tm.stats.totalApps;
    const oldGoals = tm.stats.totalGoals;

    // Yeniden aggregate
    const fresh = aggregate(perf);
    tm.stats = fresh;
    reprocessed++;

    if (fresh.nationalCaps < oldNaps) {
      napsDecreased++;
      totalNapsDelta += oldNaps - fresh.nationalCaps;
    } else if (fresh.nationalCaps === oldNaps && fresh.totalApps === oldApps) {
      unchanged++;
    }

    void oldNgoals; void oldGoals;

    if ((i + 1) % 500 === 0) {
      console.log(`  [${i + 1}/${tmIds.length}]`);
    }
  }

  await writeFile(PLAYERS_RAW, JSON.stringify(cache, null, 2));

  console.log(`\n=== ÖZET ===`);
  console.log(`Reprocessed: ${reprocessed}`);
  console.log(`Perf cache eksik: ${perfMissing}`);
  console.log(`Değişmeden kalan: ${unchanged}`);
  console.log(`A milli düzeltmesiyle nationalCaps düşen oyuncu: ${napsDecreased}`);
  console.log(`Toplam nationalCaps deltası (eski - yeni): ${totalNapsDelta}`);
  console.log(`Ortalama düzeltme: ${napsDecreased > 0 ? (totalNapsDelta / napsDecreased).toFixed(1) : 0} maç`);
}

main().catch((e) => {
  console.error('[reprocess] fatal:', e);
  process.exit(1);
});
