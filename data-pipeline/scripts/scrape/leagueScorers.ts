/**
 * TM lig "all-time top scorers" (ewigeTorschuetzen) listelerini tarayıp
 * önemli oyuncuları list.json'a ekler.
 *
 * URL pattern: /competition-na/ewigeTorschuetzen/wettbewerb/{LIGA_KOD}?page=N
 *
 * Sınır: her sayfada 26 oyuncu, ~10 sayfa pagine, sonrası tekrar başlar.
 * Yani lig başına maksimum ~250 unique oyuncu.
 *
 * 10 büyük lig × 100 oyuncu = ~1000 (duplicate ile ~700 unique).
 *
 * Kullanım:
 *   pnpm tsx scripts/scrape/leagueScorers.ts
 *   pnpm tsx scripts/scrape/leagueScorers.ts --leagues=TR1,GB1 --pages=5
 */
import { writeFile, readFile } from 'node:fs/promises';
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
 * TM'nin all-time top scorer sayfası bulunan ligler (test edildi, 200 dönüyor).
 *
 * Aşama 1 (11 lig): büyük Avrupa + S. Amerika + Rusya + Türkiye
 * Aşama 2 (+21 lig): genişletilmiş Avrupa orta ölçek + Asya + Afrika + N. Amerika
 *
 * Çalışmayan kodlar (denenip terk edildi): JL1/J1 (Japonya), USA1 (yerine MLS1)
 */
const LEAGUES: Array<{ code: string; name: string; tier: 1 | 2 }> = [
  // Aşama 1
  { code: 'TR1', name: 'Süper Lig', tier: 1 },
  { code: 'GB1', name: 'Premier League', tier: 1 },
  { code: 'ES1', name: 'LaLiga', tier: 1 },
  { code: 'IT1', name: 'Serie A', tier: 1 },
  { code: 'L1', name: 'Bundesliga', tier: 1 },
  { code: 'FR1', name: 'Ligue 1', tier: 1 },
  { code: 'NL1', name: 'Eredivisie', tier: 1 },
  { code: 'PO1', name: 'Primeira Liga', tier: 1 },
  { code: 'BRA1', name: 'Brasileirão Série A', tier: 1 },
  { code: 'ARG1', name: 'Liga Profesional', tier: 1 },
  { code: 'RU1', name: 'Premier Liga (RU)', tier: 1 },
  // Aşama 2 — orta ölçek Avrupa
  { code: 'BE1', name: 'Pro League (Belçika)', tier: 2 },
  { code: 'SC1', name: 'Scottish Premiership', tier: 2 },
  { code: 'A1', name: 'Bundesliga (Avusturya)', tier: 2 },
  { code: 'TS1', name: 'Fortuna Liga (Çekya)', tier: 2 },
  { code: 'C1', name: 'Super League (İsviçre)', tier: 2 },
  { code: 'GR1', name: 'Super League (Yunanistan)', tier: 2 },
  { code: 'PL1', name: 'Ekstraklasa (Polonya)', tier: 2 },
  { code: 'SER1', name: 'SuperLiga (Sırbistan)', tier: 2 },
  { code: 'KR1', name: '1. HNL (Hırvatistan)', tier: 2 },
  { code: 'SE1', name: 'Allsvenskan (İsveç)', tier: 2 },
  { code: 'NO1', name: 'Eliteserien (Norveç)', tier: 2 },
  { code: 'DK1', name: 'Superligaen (Danimarka)', tier: 2 },
  { code: 'UKR1', name: 'Premier League (Ukrayna)', tier: 2 },
  // Aşama 2 — Amerika
  { code: 'MEX1', name: 'Liga MX', tier: 2 },
  { code: 'MLS1', name: 'MLS (ABD)', tier: 2 },
  // Aşama 2 — Asya
  { code: 'CSL', name: 'Süper Lig (Çin)', tier: 2 },
  { code: 'KO1', name: 'K League 1 (Güney Kore)', tier: 2 },
  { code: 'SA1', name: 'Pro League (Suudi)', tier: 2 },
  { code: 'UAE1', name: 'Pro League (BAE)', tier: 2 },
  { code: 'IRN1', name: 'Persian Gulf Pro League (İran)', tier: 2 },
  // Aşama 2 — Afrika
  { code: 'EGY1', name: 'Premier League (Mısır)', tier: 2 },
];

function parseArgs(): { leagues: string[]; pages: number } {
  const args = process.argv;
  const leaguesArg = args.find((a) => a.startsWith('--leagues='));
  const pagesArg = args.find((a) => a.startsWith('--pages='));
  const tierArg = args.find((a) => a.startsWith('--tier='));
  let leagues: string[];
  if (leaguesArg) {
    leagues = leaguesArg.split('=')[1]!.split(',');
  } else if (tierArg) {
    const tier = parseInt(tierArg.split('=')[1]!, 10);
    leagues = LEAGUES.filter((l) => l.tier === tier).map((l) => l.code);
  } else {
    leagues = LEAGUES.map((l) => l.code);
  }
  const pages = pagesArg ? parseInt(pagesArg.split('=')[1]!, 10) : 10;
  return { leagues, pages: Math.min(15, pages) };
}

function extractFromPage(html: string): TmListEntry[] {
  const $ = cheerio.load(html);
  const out: TmListEntry[] = [];
  $('table.items tbody tr').each((_, row) => {
    const anchor = $(row).find('a[href*="/profil/spieler/"]').first();
    const href = anchor.attr('href');
    if (!href) return;
    const m = href.match(/\/profil\/spieler\/(\d+)/);
    if (!m) return;
    const tmId = parseInt(m[1]!, 10);
    if (!Number.isFinite(tmId)) return;
    const name = anchor.text().trim() || anchor.attr('title')?.trim() || '';
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
  const { leagues, pages } = parseArgs();
  console.log(`[leagueScorers] tarayacak ligler: ${leagues.join(', ')}`);
  console.log(`[leagueScorers] sayfa başı (max): ${pages}`);

  const existing = (await readJson<TmListEntry[]>(LIST_FILE)) ?? [];
  const seenIds = new Set(existing.map((e) => e.tmId));
  console.log(`[leagueScorers] mevcut list.json: ${existing.length} oyuncu`);

  const allNew: TmListEntry[] = [];

  for (const code of leagues) {
    const leagueInfo = LEAGUES.find((l) => l.code === code);
    const leagueName = leagueInfo?.name ?? code;
    let addedThis = 0;
    const seenThisLeague = new Set<number>();

    for (let p = 1; p <= pages; p++) {
      const url = `${BASE}/competition-na/ewigeTorschuetzen/wettbewerb/${code}${p > 1 ? `?page=${p}` : ''}`;
      try {
        const html = await fetchHtml(url, { ttlDays: 30 });
        const entries = extractFromPage(html);

        // Bu sayfada zaten gördüğümüz oyuncular yoksa sayfa tekrarı başlamış demektir
        const newOnPage = entries.filter((e) => !seenThisLeague.has(e.tmId));
        if (newOnPage.length === 0 && p > 2) {
          console.log(`  [${code}] page ${p}: tekrar başladı, lig için durduruluyor`);
          break;
        }

        for (const e of newOnPage) {
          seenThisLeague.add(e.tmId);
          if (!seenIds.has(e.tmId)) {
            seenIds.add(e.tmId);
            allNew.push(e);
            addedThis++;
          }
        }
        console.log(`  [${code}] page ${p}: +${newOnPage.length} yeni (lig toplam: ${seenThisLeague.size}, eklenen: ${addedThis})`);
      } catch (err) {
        console.error(`  [${code}] page ${p} hata:`, err instanceof Error ? err.message : err);
        break;
      }
    }
    console.log(`[${code}] ${leagueName} tamam: ${addedThis} yeni oyuncu eklendi\n`);
  }

  const merged = [...existing, ...allNew];
  await writeFile(LIST_FILE, JSON.stringify(merged, null, 2));
  console.log(`[leagueScorers] DONE. +${allNew.length} yeni oyuncu`);
  console.log(`  list.json toplam: ${merged.length}`);
}

main().catch((e) => {
  console.error('[leagueScorers] fatal:', e);
  process.exit(1);
});
