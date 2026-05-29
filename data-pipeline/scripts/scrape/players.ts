/**
 * Liste sayfasından (cache/list.json) gelen her oyuncu için:
 *   1. tmApi.players → metadata (ad, doğum, milliyet, boy, ayak, pozisyon, market değeri)
 *   2. perfApi.fetchPerformance → 600+ maç → aggregate (totalGoals, clubStints, …)
 *   3. clubStint'lerde geçen tüm clubId'leri topla — kulüp koordinatları için
 *
 * Çıktı: cache/players-raw.json — { [tmId]: TmPlayer }
 * Checkpoint: her 3 oyuncuda diske yazılır, kesilirse oradan devam.
 * Hata olan oyuncu kaydedilmez — sonraki çağrıda tekrar denenir.
 *
 * Kullanım:
 *   pnpm --filter @futbol-kart/data-pipeline scrape:players
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPlayers, type TmApiPlayer } from './tmApi.js';
import { fetchPerformance, aggregate, type AggregatedStats } from './perfApi.js';
import type { TmListEntry } from './list.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', '..', 'cache');
const LIST_FILE = join(CACHE_DIR, 'list.json');
const OUT_FILE = join(CACHE_DIR, 'players-raw.json');

/** Bir oyuncunun cache'lenen tüm scrape sonucu. merge.ts bunu okur. */
export interface TmPlayer {
  tmId: number;
  /** tmApi.players ham yanıtı — tam metadata */
  meta: TmApiPlayer;
  /** perfApi aggregate sonucu */
  stats: AggregatedStats;
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as T;
}

async function processOne(tmId: number): Promise<TmPlayer> {
  // İki istek paralel — bağımsız endpoint'ler
  const [metaArr, perf] = await Promise.all([
    fetchPlayers([tmId]),
    fetchPerformance(tmId),
  ]);
  const meta = metaArr[0];
  if (!meta) {
    throw new Error(`tmApi.players boş döndü: ${tmId}`);
  }
  const stats = aggregate(perf);
  return { tmId, meta, stats };
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });

  const list = await readJson<TmListEntry[]>(LIST_FILE);
  if (!list) {
    console.error(
      '[players] cache/list.json yok. Önce şunu çalıştır:\n  pnpm --filter @futbol-kart/data-pipeline scrape:list',
    );
    process.exit(1);
  }

  const existing = (await readJson<Record<string, TmPlayer>>(OUT_FILE)) ?? {};
  console.log(
    `[players] toplam ${list.length}, zaten parse edilmiş ${Object.keys(existing).length}`,
  );

  let processed = 0;
  let errors = 0;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i]!;
    const key = String(entry.tmId);
    if (existing[key]) continue;
    const label = `[${i + 1}/${list.length}] ${entry.name} (tm:${entry.tmId})`;
    try {
      console.log(label);
      const player = await processOne(entry.tmId);
      existing[key] = player;
      processed++;
      console.log(
        `  ✓ ${player.meta.shortName}: ${player.stats.totalApps} maç, ${player.stats.totalGoals} G, ${player.stats.clubStints.length} kulüp`,
      );
      // Her 3 oyuncuda checkpoint
      if (processed % 3 === 0) {
        await writeFile(OUT_FILE, JSON.stringify(existing, null, 2));
      }
    } catch (err) {
      errors++;
      console.error(`  ! ${label} parse hatası:`, err instanceof Error ? err.message : err);
    }
  }

  // Son yazma
  await writeFile(OUT_FILE, JSON.stringify(existing, null, 2));

  console.log(
    `\n[players] done. processed=${processed} errors=${errors} total cache=${Object.keys(existing).length}`,
  );
  console.log(`           wrote ${OUT_FILE}`);
}

main().catch((err) => {
  console.error('[players] fatal:', err);
  process.exit(1);
});
