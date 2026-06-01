/**
 * SEED ZENGİNLEŞTİRME (non-destructive, scrape YOK).
 *
 * Mevcut seed/players.json'u OLDUĞU GİBİ alır ve yalnızca iki yeni alanı ekler:
 *   - stats.competitions  ← cache/competition-stats.json  (turnuva maç/gol)
 *   - achievements.trophies ← cache/honours.json          (kupa adetleri)
 *
 * Oyuncu setini, filtreleri, dedup'u DEĞİŞTİRMEZ — sadece eldeki kayıtlara alan
 * ekler. Eşleştirme tmId üzerinden; players.json tmId tutmadığı için imageUrl'den
 * (portrait/big/{tmId}-...) veya players-raw.json'daki slug eşleşmesinden türetilir.
 *
 * Kullanım:
 *   pnpm --filter @futbol-kart/data-pipeline enrich:seed
 *
 * merge.ts'in tam yeniden üretimine alternatif: hızlı, risksiz, idempotent.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Player } from '@futbol-kart/shared-types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SEED_FILE = join(ROOT, 'seed', 'players.json');
const CACHE_DIR = join(ROOT, 'cache');

interface Trophy {
  uclTitles: number; uelTitles: number; otherEuropeanTitles: number;
  domesticLeagueTitles: number; domesticCupTitles: number;
  worldCupTitles: number; continentalNationalTitles: number; totalTitles: number;
  individual?: {
    ballonDor: number; fifaBest: number; goldenBoot: number;
    topScorerAwards: number; playerOfTheYear: number;
    otherIndividual: number; totalIndividual: number;
  };
}
interface Comp {
  uclApps: number; uclGoals: number; uelApps: number; uelGoals: number;
  worldCupApps: number; worldCupGoals: number; leagueApps: number;
  leagueGoals: number; domesticCupApps: number;
}

/** players.json'daki imageUrl'den TM portrait id'sini çıkar. */
function tmIdFromImage(url: string | undefined): number | null {
  if (!url) return null;
  const m = url.match(/portrait\/(?:big|medium|small|header)\/(\d+)-/);
  return m ? parseInt(m[1]!, 10) : null;
}

async function readJsonIf<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function main() {
  const players = JSON.parse(await readFile(SEED_FILE, 'utf8')) as Player[];

  const honours = (await readJsonIf<Record<string, Trophy>>(join(CACHE_DIR, 'honours.json'))) ?? {};
  const comps = (await readJsonIf<Record<string, Comp>>(join(CACHE_DIR, 'competition-stats.json'))) ?? {};
  console.log(`[enrich] seed: ${players.length} oyuncu | honours: ${Object.keys(honours).length} | competitions: ${Object.keys(comps).length}`);

  // slug → tmId köprüsü (players-raw.json varsa, imageUrl'siz oyuncular için yedek)
  const slugToTmId = new Map<string, number>();
  const raw = await readJsonIf<Record<string, { tmId: number; meta?: { shortName?: string } }>>(
    join(CACHE_DIR, 'players-raw.json'),
  );
  if (raw) {
    for (const r of Object.values(raw)) {
      const sn = r.meta?.shortName;
      if (sn) slugToTmId.set(slugify(sn), r.tmId);
    }
  }

  let withComp = 0;
  let withTrophy = 0;
  for (const p of players) {
    let tmId = tmIdFromImage(p.imageUrl);
    if (tmId === null) tmId = slugToTmId.get(p.slug) ?? null;
    if (tmId === null) continue;
    const key = String(tmId);

    const c = comps[key];
    if (c) {
      p.stats.competitions = c;
      withComp++;
    }
    const h = honours[key];
    if (h) {
      p.achievements.trophies = h;
      p.achievements.hasWorldCup = h.worldCupTitles > 0;
      withTrophy++;
    }
  }

  await writeFile(SEED_FILE, JSON.stringify(players), 'utf8');
  console.log(`✅ Zenginleştirildi: ${withComp} oyuncuya competitions, ${withTrophy} oyuncuya trophies eklendi.`);
  console.log(`   Sonraki adım: pnpm --filter @futbol-kart/data-pipeline build`);
}

/** merge.ts'teki slugify ile aynı sade kural (eşleştirme tutarlılığı). */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
