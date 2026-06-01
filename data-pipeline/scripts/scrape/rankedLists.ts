/**
 * SIRALI LİSTELER (Mod 3: "Listeyi doldur").
 *
 * Transfermarkt'ın hazır sıralı istatistik sayfalarından "ilk 10" listeleri
 * çeker ve oyun için saklar. Liste-bazlı veri (oyuncu-bazlı değil) → lists.json.
 *
 * Liste tipleri (TM "ewige" = all-time sayfaları, leagueScorers.ts ile aynı kalıp):
 *   - ewigeTorschuetzen   → lig all-time gol kralları
 *   - ewigeSpieler        → lig all-time en çok maç
 *   - ewigeVorlagengeber  → lig all-time en çok asist
 * Pozisyon filtresi (örn. "en çok maça çıkan kaleci") TM'nin ?position param'ı
 * ile veya parse sonrası bizim verimizle (position alanı) yapılabilir.
 *
 * Ballon d'Or / yıl bazlı ödül listeleri AYRI sayfa yapısındadır (faqStatistik
 * veya manuel) — bu script şimdilik TM "ewige" listelerini kapsar; ödül
 * arşivleri ileride manuel JSON veya ayrı parser ile eklenir (TODO not edildi).
 *
 * Kullanım:
 *   pnpm --filter @futbol-kart/data-pipeline scrape:lists
 *   pnpm --filter @futbol-kart/data-pipeline scrape:lists -- --top=10
 *
 * Çıktı: cache/lists.json
 *   [{ id, title, competition, metric, entries: [{rank, tmId, name, value}] }]
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { fetchHtml } from './http.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', '..', 'cache');
const OUT_FILE = join(CACHE_DIR, 'lists.json');
const BASE = 'https://www.transfermarkt.com';

type Metric = 'goals' | 'apps' | 'assists';

interface ListSpec {
  id: string;
  title: string;
  /** TM lig kodu (TR1, GB1, ...) */
  competition: string;
  metric: Metric;
  /** TM "ewige" endpoint adı */
  endpoint: string;
}

interface ListEntry {
  rank: number;
  tmId: number;
  name: string;
  /** Sıralama değeri (gol/maç/asist sayısı) — metinden parse */
  value: number;
}

interface RankedList {
  id: string;
  title: string;
  competition: string;
  metric: Metric;
  entries: ListEntry[];
}

// Başlangıç liste seti — örnek görsellere yakın. Genişletilebilir.
// NOT: TM "all-time gol kralları" (ewigeTorschuetzen) endpoint'i doğrulandı ve
// 200 dönüyor. "En çok maç" (ewigeSpieler) ve "en çok asist" (ewigeVorlagengeber)
// kodları 404 verdi — TM bunları farklı bir yolda sunuyor; sonraki turda eklenecek
// (Ballon d'Or arşivi gibi). Şimdilik 6 lig × gol kralı listesi.
const SPECS: ListSpec[] = [
  { id: 'tr1_scorers', title: 'Süper Lig — All-time En Çok Gol', competition: 'TR1', metric: 'goals', endpoint: 'ewigeTorschuetzen' },
  { id: 'gb1_scorers', title: 'Premier League — All-time En Çok Gol', competition: 'GB1', metric: 'goals', endpoint: 'ewigeTorschuetzen' },
  { id: 'es1_scorers', title: 'LaLiga — All-time En Çok Gol', competition: 'ES1', metric: 'goals', endpoint: 'ewigeTorschuetzen' },
  { id: 'it1_scorers', title: 'Serie A — All-time En Çok Gol', competition: 'IT1', metric: 'goals', endpoint: 'ewigeTorschuetzen' },
  { id: 'l1_scorers', title: 'Bundesliga — All-time En Çok Gol', competition: 'L1', metric: 'goals', endpoint: 'ewigeTorschuetzen' },
  { id: 'fr1_scorers', title: 'Ligue 1 — All-time En Çok Gol', competition: 'FR1', metric: 'goals', endpoint: 'ewigeTorschuetzen' },
];

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : undefined;
}

/** Bir satırdaki son sayısal hücreyi (sıralama metriği) parse et. */
function parseValue(rowText: string): number {
  // Tablo hücrelerindeki sayılar virgül/nokta ile gelebilir; son sayıyı al.
  const nums = rowText.replace(/\./g, '').match(/\d+/g);
  if (!nums || nums.length === 0) return 0;
  return parseInt(nums[nums.length - 1]!, 10);
}

export function parseRankedList(html: string, top: number): ListEntry[] {
  const $ = cheerio.load(html);
  const out: ListEntry[] = [];
  const seen = new Set<number>();
  $('table.items tbody tr').each((_, row) => {
    if (out.length >= top) return;
    const $row = $(row);
    const tds = $row.find('td');
    // Gerçek sıralama satırı: İLK hücre saf bir rütbe numarası ("1", "2", ...).
    // TM her oyuncu için ek alt-satırlar (sadece ad / pozisyon) üretir; onları atla.
    const rankText = $(tds[0]).text().trim();
    if (!/^\d+$/.test(rankText)) return;
    const anchor = $row.find('a[href*="/profil/spieler/"]').first();
    const href = anchor.attr('href');
    if (!href) return;
    const m = href.match(/\/profil\/spieler\/(\d+)/);
    if (!m) return;
    const tmId = parseInt(m[1]!, 10);
    if (!Number.isFinite(tmId) || seen.has(tmId)) return;
    seen.add(tmId);
    const name = anchor.text().trim() || anchor.attr('title')?.trim() || '';
    // Metrik değeri: son hücre (gol/maç/asist sayısı).
    const value = parseValue($(tds[tds.length - 1]).text());
    out.push({ rank: out.length + 1, tmId, name, value });
  });
  return out;
}

async function main() {
  const top = arg('top') ? parseInt(arg('top')!, 10) : 10;
  const lists: RankedList[] = [];

  for (const spec of SPECS) {
    const url = `${BASE}/competition-na/${spec.endpoint}/wettbewerb/${spec.competition}`;
    try {
      const html = await fetchHtml(url, { ttlDays: 30 });
      const entries = parseRankedList(html, top);
      if (entries.length === 0) {
        console.warn(`  [lists] ${spec.id}: 0 satır parse edildi (selector/endpoint kontrol et)`);
      }
      lists.push({ id: spec.id, title: spec.title, competition: spec.competition, metric: spec.metric, entries });
      console.log(`  [lists] ${spec.id}: ${entries.length} oyuncu`);
    } catch (err) {
      console.warn(`  [lists] ${spec.id} hata:`, err instanceof Error ? err.message : err);
    }
  }

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(lists, null, 1), 'utf8');
  console.log(`\n✅ ${lists.length} sıralı liste yazıldı: ${OUT_FILE}`);
  console.log('   NOT: Ballon d\'Or / yıl bazlı ödül listeleri ayrı yapıda — sonraki turda eklenecek.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
