/**
 * TM kulüp kadro sayfalarından oyuncu çıkarır.
 *
 * URL pattern: /{slug}/kader/verein/{tmClubId}/saison_id/{yyyy}
 *   Örnek: /galatasaray/kader/verein/141/saison_id/2025
 *
 * Strateji: her kulüp için BIRKAÇ farklı sezonun kadrosu çekilir
 *   (güncel + 10y geçmiş + 20y geçmiş + 30y geçmiş = ~4 sezon).
 * Bu, hem güncel hem efsane jenerasyonu kapsar; duplicate elenir.
 *
 * Çıktı: cache/list.json'a yeni TmListEntry'ler eklenir.
 *
 * Kullanım:
 *   pnpm tsx scripts/scrape/clubSquads.ts
 *   pnpm tsx scripts/scrape/clubSquads.ts --clubs=141,36 --seasons=2025,2015
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { fetchHtml } from './http.js';
import type { TmListEntry } from './list.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', '..', 'cache');
const LIST_FILE = join(CACHE_DIR, 'list.json');

const BASE = 'https://www.transfermarkt.com';

/**
 * Süper Lig "4 büyükler" + Başakşehir + Trabzonspor.
 * TM kulüp ID'leri (slug bilgisi sadece URL için, parse'ta tm_clubId kullanılır).
 */
const SUPER_LIG_CLUBS: Array<{ tmId: number; slug: string; name: string }> = [
  { tmId: 141, slug: 'galatasaray', name: 'Galatasaray' },
  { tmId: 36, slug: 'fenerbahce', name: 'Fenerbahçe' },
  { tmId: 114, slug: 'besiktas', name: 'Beşiktaş' },
  { tmId: 449, slug: 'trabzonspor', name: 'Trabzonspor' },
  { tmId: 31614, slug: 'istanbul-basaksehir-fk', name: 'İstanbul Başakşehir FK' },
];

/**
 * Hem güncel hem tarihsel jenerasyonu kapsayacak sezonlar.
 * Daha eski sezonlarda TM kadrosu eksik olabilir; o yıllar yine de denenir.
 */
const DEFAULT_SEASONS = [2025, 2015, 2005, 1995, 1985];

function parseArgs(): { clubs: number[]; seasons: number[] } {
  const args = process.argv;
  const clubsArg = args.find((a) => a.startsWith('--clubs='));
  const seasonsArg = args.find((a) => a.startsWith('--seasons='));
  const clubs = clubsArg
    ? clubsArg.split('=')[1]!.split(',').map((x) => parseInt(x, 10))
    : SUPER_LIG_CLUBS.map((c) => c.tmId);
  const seasons = seasonsArg
    ? seasonsArg.split('=')[1]!.split(',').map((x) => parseInt(x, 10))
    : DEFAULT_SEASONS;
  return { clubs, seasons };
}

function extractFromSquadPage(html: string): TmListEntry[] {
  const $ = cheerio.load(html);
  const out: TmListEntry[] = [];
  const seenIds = new Set<number>();
  // TM kader sayfası: <table class="items"> içinde her oyuncu için profil linki
  $('table.items tbody tr a[href*="/profil/spieler/"]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href) return;
    const m = href.match(/\/profil\/spieler\/(\d+)/);
    if (!m) return;
    const tmId = parseInt(m[1]!, 10);
    if (!Number.isFinite(tmId) || seenIds.has(tmId)) return;
    seenIds.add(tmId);
    const name = $(a).text().trim() || $(a).attr('title')?.trim() || '';
    if (!name) return; // çok kısa veya boş entry'leri atla
    out.push({
      tmId,
      profilePath: href.replace(/^https?:\/\/[^/]+/, ''),
      name,
    });
  });
  return out;
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function main() {
  const { clubs, seasons } = parseArgs();
  console.log(`[clubSquads] kulüpler: ${clubs.join(', ')}`);
  console.log(`[clubSquads] sezonlar: ${seasons.join(', ')}`);

  const existing = (await readJson<TmListEntry[]>(LIST_FILE)) ?? [];
  const seenGlobalIds = new Set(existing.map((e) => e.tmId));
  console.log(`[clubSquads] mevcut list.json: ${existing.length} oyuncu`);

  const allNew: TmListEntry[] = [];

  for (const clubId of clubs) {
    const clubMeta = SUPER_LIG_CLUBS.find((c) => c.tmId === clubId);
    const clubName = clubMeta?.name ?? `tm_${clubId}`;
    const clubSlug = clubMeta?.slug ?? 'club';
    let addedClubTotal = 0;

    for (const season of seasons) {
      const url = `${BASE}/${clubSlug}/kader/verein/${clubId}/saison_id/${season}`;
      try {
        const html = await fetchHtml(url, { ttlDays: 90 });
        const entries = extractFromSquadPage(html);
        let newThisSeason = 0;
        for (const e of entries) {
          if (seenGlobalIds.has(e.tmId)) continue;
          seenGlobalIds.add(e.tmId);
          allNew.push(e);
          newThisSeason++;
          addedClubTotal++;
        }
        console.log(`  [${clubName}] ${season}: ${entries.length} bulundu, +${newThisSeason} yeni`);
      } catch (err) {
        console.error(`  [${clubName}] ${season} hata:`, err instanceof Error ? err.message : err);
      }
    }
    console.log(`[${clubName}] tamam: +${addedClubTotal} yeni oyuncu\n`);
  }

  const merged = [...existing, ...allNew];
  await writeFile(LIST_FILE, JSON.stringify(merged, null, 2));
  console.log(`[clubSquads] DONE. +${allNew.length} yeni oyuncu`);
  console.log(`  list.json toplam: ${merged.length}`);
}

main().catch((e) => {
  console.error('[clubSquads] fatal:', e);
  process.exit(1);
});
