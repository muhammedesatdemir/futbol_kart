/**
 * Mevcut manuel seed oyuncularını (mevcut 49) TM ID'lerine eşleştir.
 *
 * Mantık:
 *   1. seed/players.json'dan TM-kaynaklı olmayanları al (manuel kayıtlar)
 *   2. Her oyuncu için ad (slug → "lionel-messi" → "Lionel Messi") ile search
 *   3. İlk 5 adayı al, her birinin tmApi.players ile doğum yılını çek
 *   4. Doğum yılı seed'tekiyle eşleşen ilk adayı seç
 *   5. Eşleşme yoksa "AMBIGUOUS" diye işaretle, manuel düzeltme bekle
 *
 * Çıktı: cache/manual-ids.json — { slug: { tmId, status, candidates? } }
 * Sonra: list.json'a entegre edip scrape:players ile çekilir.
 *
 * Kullanım:
 *   pnpm tsx scripts/scrape/resolveManualIds.ts
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Player } from '@futbol-kart/shared-types';
import { search, type SearchHit } from './search.js';
import { fetchPlayers } from './tmApi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = join(__dirname, '..', '..');
const SEED_PLAYERS = join(PIPELINE_ROOT, 'seed', 'players.json');
const CACHE_DIR = join(PIPELINE_ROOT, 'cache');
const OUT_FILE = join(CACHE_DIR, 'manual-ids.json');

interface ResolveResult {
  /** seed'teki slug */
  slug: string;
  /** seed'teki ad (search query için) */
  name: string;
  /** seed'teki doğum tarihi (yyyy-mm-dd) — match anahtarı */
  birthDate: string;
  /** Tahmin: bulunan tmId */
  tmId?: number;
  /** Eşleşme HOW emin? */
  status: 'matched' | 'ambiguous' | 'not_found' | 'cached';
  /** Tüm adaylar (debug + manuel düzeltme için) */
  candidates?: Array<{
    tmId: number;
    name: string;
    dateOfBirth?: string;
    score: number;
  }>;
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

/**
 * slug "lionel-messi" → "Lionel Messi" (search query'si için)
 * Çok uzun tam adlar (Mohamed Salah Hamed Mahrous Ghaly) arama eşleşmesini bozar
 * — slug'tan kısa form üretmek daha güvenli.
 */
function slugToQuery(slug: string, _fallbackName: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** "2000-07-12" → 2000 */
function yearOf(dateStr: string): number {
  return parseInt(dateStr.slice(0, 4), 10);
}

async function resolveOne(player: Player): Promise<ResolveResult> {
  const query = slugToQuery(player.slug, player.name);
  const targetYear = yearOf(player.birthDate);

  let hits: SearchHit[];
  try {
    hits = await search(query, 5);
  } catch (e) {
    return {
      slug: player.slug,
      name: player.name,
      birthDate: player.birthDate,
      status: 'not_found',
      candidates: [],
    };
  }

  if (hits.length === 0) {
    return {
      slug: player.slug,
      name: player.name,
      birthDate: player.birthDate,
      status: 'not_found',
    };
  }

  // Her adayın gerçek doğum yılını JSON'dan al (tek istek 5 aday)
  let metas: Awaited<ReturnType<typeof fetchPlayers>>;
  try {
    metas = await fetchPlayers(hits.map((h) => h.tmId));
  } catch (e) {
    return {
      slug: player.slug,
      name: player.name,
      birthDate: player.birthDate,
      status: 'not_found',
      candidates: hits.map((h) => ({
        tmId: h.tmId,
        name: h.name,
        score: 0,
      })),
    };
  }

  const metaById = new Map(metas.map((m) => [m.id, m]));

  // Skorla: doğum tarihi tam match = 100, sadece yıl match = 50, hiçbiri = 0
  const candidates = hits.map((h) => {
    const meta = metaById.get(String(h.tmId));
    const dob = meta?.lifeDates?.dateOfBirth;
    let score = 0;
    if (dob === player.birthDate) score = 100;
    else if (dob && yearOf(dob) === targetYear) score = 50;
    return {
      tmId: h.tmId,
      name: meta?.shortName ?? h.name,
      dateOfBirth: dob,
      score,
    };
  });

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;

  if (best.score >= 100) {
    return {
      slug: player.slug,
      name: player.name,
      birthDate: player.birthDate,
      tmId: best.tmId,
      status: 'matched',
      candidates,
    };
  }
  if (best.score >= 50) {
    return {
      slug: player.slug,
      name: player.name,
      birthDate: player.birthDate,
      tmId: best.tmId,
      status: 'matched', // yıl match yeterli, gün/ay TM'de farklı olabilir
      candidates,
    };
  }
  return {
    slug: player.slug,
    name: player.name,
    birthDate: player.birthDate,
    status: 'ambiguous',
    candidates,
  };
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });

  const seed = (await readJson<Player[]>(SEED_PLAYERS)) ?? [];
  const manuals = seed.filter(
    (p) => !p.clubs.some((s) => s.clubId.startsWith('tm_')),
  );
  console.log(`[resolveManualIds] manuel oyuncu sayısı: ${manuals.length}`);

  const cache = (await readJson<Record<string, ResolveResult>>(OUT_FILE)) ?? {};
  console.log(`[resolveManualIds] cache'de ${Object.keys(cache).length} kayıt`);

  let resolved = 0;
  let ambiguous = 0;
  let notFound = 0;
  let cached = 0;

  for (let i = 0; i < manuals.length; i++) {
    const p = manuals[i]!;
    if (cache[p.slug] && cache[p.slug]!.status !== 'not_found') {
      cached++;
      continue;
    }
    console.log(`[${i + 1}/${manuals.length}] ${p.name} (${p.birthDate})`);
    const result = await resolveOne(p);
    cache[p.slug] = result;
    if (result.status === 'matched') {
      console.log(`  ✓ tmId=${result.tmId} (${result.candidates?.[0]?.name})`);
      resolved++;
    } else if (result.status === 'ambiguous') {
      console.log(`  ? AMBIGUOUS — candidates:`);
      for (const c of result.candidates ?? []) {
        console.log(`      tmId=${c.tmId} ${c.name} dob=${c.dateOfBirth ?? '?'} score=${c.score}`);
      }
      ambiguous++;
    } else {
      console.log(`  ! NOT FOUND`);
      notFound++;
    }
    // Her 3 oyuncuda checkpoint
    if ((i + 1) % 3 === 0) {
      await writeFile(OUT_FILE, JSON.stringify(cache, null, 2));
    }
  }

  await writeFile(OUT_FILE, JSON.stringify(cache, null, 2));

  console.log(`\n[resolveManualIds] done.`);
  console.log(`  matched: ${resolved}`);
  console.log(`  cached:  ${cached}`);
  console.log(`  ambiguous: ${ambiguous}`);
  console.log(`  not found: ${notFound}`);
  console.log(`  wrote ${OUT_FILE}`);
}

main().catch((e) => {
  console.error('[resolveManualIds] fatal:', e);
  process.exit(1);
});
