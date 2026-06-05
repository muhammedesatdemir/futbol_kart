/**
 * `maxTransferFeeEUR` (peak/zirve piyasa değeri) NULL olan oyuncular için
 * cache/list.json'daki `marketValueText` (GÜNCEL değer) ile fallback doldurur.
 *
 * SORUN (ölçüldü): merge.ts, TM API'nin `marketValueDetails.highest` (zirve)
 * alanını kullanıyor. TM bu "highest"i ESKİ/emekli oyuncularda tutmuyor →
 * players.json'da %20 NULL. Bu, §14.0 "marquee" (kalburüstü) filtresini etkiler
 * (ama orada bileşik OR skoru kullanıldığı için tek başına kritik değil —
 * yine de market-değeri bazlı kriterleri/soruları zayıflatıyor).
 *
 * NEDEN list.json fallback: list aşaması her oyuncu için `marketValueText`
 * (örn. "€200.00m", "€1.50m") topluyor — bu GÜNCEL değer. Zirve >= güncel
 * olduğundan, güncel değer en azından bir ALT SINIR tahminidir. Tamamen NULL
 * bırakmaktansa bu fallback daha kullanışlı (kriter/filtre için).
 *
 * NOT: Bu LOKAL bir adım — scrape YOK (list.json zaten cache'de). Çıktı seed'i
 * doğrudan değiştirmez; bir rapor + opsiyonel `--apply` ile seed/players.json'a
 * yazar (sadece NULL olanlara, mevcut peak değerleri EZMEDEN).
 *
 * Kullanım:
 *   pnpm tsx scripts/scrape/enrichMarketValues.ts            # rapor (yazma yok)
 *   pnpm tsx scripts/scrape/enrichMarketValues.ts --apply    # seed/players.json'a yaz
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = resolve(__dirname, '..', '..');
const LIST_FILE = join(PIPELINE_ROOT, 'cache', 'list.json');
const SEED_PLAYERS = join(PIPELINE_ROOT, 'seed', 'players.json');

interface TmListEntry { tmId: number; name: string; marketValueText?: string; }
interface SeedPlayer {
  slug: string; name: string; displayName?: string;
  stats: { maxTransferFeeEUR?: number };
  // tmId çıktıda yok; isimle eşleştireceğiz (fallback: normalize ad).
}

function parseArgs() { return { apply: process.argv.includes('--apply') }; }

async function readJson<T>(p: string): Promise<T> { return JSON.parse(await readFile(p, 'utf8')) as T; }

/** "€200.00m" / "€1.50m" / "€850k" / "-" → EUR tamsayı (yoksa null). */
function parseMarketValue(text?: string): number | null {
  if (!text) return null;
  const t = text.replace(/\s/g, '').toLowerCase();
  const m = t.match(/€?([\d.,]+)\s*([mk])?/);
  if (!m) return null;
  const num = parseFloat(m[1]!.replace(/,/g, ''));
  if (!Number.isFinite(num) || num <= 0) return null;
  const unit = m[2];
  if (unit === 'm') return Math.round(num * 1_000_000);
  if (unit === 'k') return Math.round(num * 1_000);
  return Math.round(num);
}

/** İsim normalize (aksan/boşluk/küçük harf) — list ↔ seed eşleşmesi için. */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  const { apply } = parseArgs();
  console.log(`[enrichMarketValues] apply=${apply}`);

  if (!existsSync(LIST_FILE)) throw new Error('cache/list.json yok.');
  const list = await readJson<TmListEntry[]>(LIST_FILE);
  const players = await readJson<SeedPlayer[]>(SEED_PLAYERS);

  // list: normalize ad → en yüksek parse edilen güncel değer
  const mvByName = new Map<string, number>();
  for (const e of list) {
    const v = parseMarketValue(e.marketValueText);
    if (v === null) continue;
    const key = norm(e.name);
    mvByName.set(key, Math.max(mvByName.get(key) ?? 0, v));
  }
  console.log(`[enrichMarketValues] list.json'dan ${mvByName.size} isim için güncel değer parse edildi`);

  let nullBefore = 0, filled = 0, noMatch = 0;
  for (const p of players) {
    if ((p.stats.maxTransferFeeEUR ?? 0) > 0) continue; // mevcut peak'i EZME
    nullBefore++;
    const v = mvByName.get(norm(p.displayName || p.name)) ?? mvByName.get(norm(p.name));
    if (v && v > 0) {
      if (apply) p.stats.maxTransferFeeEUR = v;
      filled++;
    } else {
      noMatch++;
    }
  }

  console.log(`[enrichMarketValues] NULL olan: ${nullBefore} | fallback ile dolduralabilir: ${filled} | hâlâ eşleşmeyen: ${noMatch}`);
  console.log(`  → doldurma sonrası NULL kalan: ${noMatch} (%${(noMatch / players.length * 100).toFixed(0)})`);

  if (apply) {
    await writeFile(SEED_PLAYERS, JSON.stringify(players, null, 2) + '\n');
    console.log(`[enrichMarketValues] DONE → seed/players.json yazıldı (+${filled} dolduruldu). 'pnpm build' ile public'e yansıt.`);
  } else {
    console.log('[enrichMarketValues] (rapor modu — yazılmadı. --apply ile seed güncellenir.)');
  }
}

main().catch((e) => { console.error('[enrichMarketValues] fatal:', e); process.exit(1); });
