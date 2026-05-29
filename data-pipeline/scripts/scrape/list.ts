/**
 * Transfermarkt "en değerli oyuncular" listesini tarayıp oyuncu profil
 * URL'lerini çıkarır.
 *
 * Çıktı: cache/list.json
 *   [{ name: 'Vinicius Junior', tmId: 371998, profilePath: '/vinicius-junior/profil/spieler/371998' }, ...]
 *
 * Kullanım:
 *   pnpm --filter @futbol-kart/data-pipeline scrape:list
 *
 * Argümanlar:
 *   --pages=12   (default 12 — yaklaşık 300 oyuncu, sayfa başına ~25)
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { fetchHtml } from './http.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', '..', 'cache');
const OUT_FILE = join(CACHE_DIR, 'list.json');

const BASE =
  'https://www.transfermarkt.com/spieler-statistik/wertvollstespieler/marktwertetop';

export interface TmListEntry {
  /** Transfermarkt sayısal id */
  tmId: number;
  /** Profil URL'si — fetchPlayer için relative path */
  profilePath: string;
  /** Liste sayfasındaki görünür ad (yaklaşık) */
  name: string;
  /** Liste sıralamasındaki market değeri (sıralama referansı, oyuna girmeyebilir) */
  marketValueText?: string;
}

function parsePageArg(): number {
  const arg = process.argv.find((a) => a.startsWith('--pages='));
  if (!arg) return 12;
  const n = parseInt(arg.split('=')[1]!, 10);
  if (!Number.isFinite(n) || n < 1) return 12;
  return Math.min(40, n); // güvenlik tavanı
}

function extractFromPage(html: string): TmListEntry[] {
  const $ = cheerio.load(html);
  const out: TmListEntry[] = [];
  // Liste tablosunda her oyuncu için linklenmiş bir <a class="spielprofil_tooltip">
  // veya yeni şablonda <a class="hauptlink"> içinde profile link.
  $('table.items tbody tr').each((_, row) => {
    const anchor = $(row).find('td.hauptlink a, a.spielprofil_tooltip').first();
    const href = anchor.attr('href');
    if (!href) return;
    // href format: /vinicius-junior/profil/spieler/371998
    const match = href.match(/\/profil\/spieler\/(\d+)$/);
    if (!match) return;
    const tmId = parseInt(match[1]!, 10);
    if (!Number.isFinite(tmId)) return;
    const name = anchor.text().trim() || anchor.attr('title')?.trim() || '';
    const marketValueText = $(row)
      .find('td.rechts.hauptlink')
      .first()
      .text()
      .trim();
    out.push({ tmId, profilePath: href, name, marketValueText });
  });
  return out;
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  const pages = parsePageArg();
  console.log(`[list] scraping ${pages} page(s) of Transfermarkt top valued list`);

  const seen = new Set<number>();
  const all: TmListEntry[] = [];

  for (let p = 1; p <= pages; p++) {
    const url = p === 1 ? BASE : `${BASE}?page=${p}`;
    console.log(`[list] page ${p}/${pages} — ${url}`);
    const html = await fetchHtml(url, { ttlDays: 7 });
    const entries = extractFromPage(html);
    let added = 0;
    for (const e of entries) {
      if (seen.has(e.tmId)) continue;
      seen.add(e.tmId);
      all.push(e);
      added++;
    }
    console.log(`  found ${entries.length}, new ${added}, total ${all.length}`);
    if (entries.length === 0) {
      console.warn(`  page yielded 0 entries — possibly anti-bot or layout change`);
      break;
    }
  }

  await writeFile(OUT_FILE, JSON.stringify(all, null, 2));
  console.log(`\n[list] done. ${all.length} players → ${OUT_FILE}`);
}

main().catch((err) => {
  console.error('[list] failed:', err);
  process.exit(1);
});
