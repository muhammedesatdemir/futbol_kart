/**
 * Transfermarkt OYUNCU BAŞARILARI (Erfolge / Honours) scrape'i.
 *
 * Her oyuncunun "başarılar" sayfasından kazandığı kupaların ADET'lerini çeker
 * ve kategorize eder (Şampiyonlar Ligi, Avrupa Ligi, yerel lig, yerel kupa,
 * Dünya Kupası vb.). Çıktı tmId bazlı bir JSON; merge.ts bunu players.json'a
 * `achievements.trophies` olarak ekler.
 *
 * Kaynak sayfa (HTML):
 *   https://www.transfermarkt.com/spieler/erfolge/spieler/{tmId}
 *   Tablo: her satırda "<adet>x <kupa adı>" + sezon listesi.
 *
 * Kullanım:
 *   pnpm --filter @futbol-kart/data-pipeline scrape:honours
 *   pnpm --filter @futbol-kart/data-pipeline scrape:honours -- --limit=200
 *   pnpm --filter @futbol-kart/data-pipeline scrape:honours -- --only-famous
 *
 * İyi vatandaş: http.ts üzerinden 2 sn rate limit + disk cache. ~8.900 oyuncu
 * × 2 sn = ~5 saat (cache'li tekrarlar anında). --limit ile parça parça çekilebilir.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { fetchHtml } from './http.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', '..', 'cache');
const RAW_FILE = join(CACHE_DIR, 'players-raw.json');
const OUT_FILE = join(CACHE_DIR, 'honours.json');

/**
 * Bir oyuncunun kategorize edilmiş kupa adetleri. Tüm alanlar adet (int).
 * Sıfır olanlar da yazılır ki "veri çekildi ama 0 kupa" ile "veri yok" ayrılsın.
 */
export interface TrophyCounts {
  /** UEFA Şampiyonlar Ligi / Avrupa Şampiyon Kulüpler Kupası */
  uclTitles: number;
  /** UEFA Avrupa Ligi / UEFA Kupası */
  uelTitles: number;
  /** UEFA Süper Kupa + Konferans Ligi gibi diğer UEFA kupaları */
  otherEuropeanTitles: number;
  /** Herhangi bir ülkenin birinci lig şampiyonluğu (toplam) */
  domesticLeagueTitles: number;
  /** Herhangi bir ülkenin ulusal kupası (FA Cup, ZTK, Copa del Rey, DFB Pokal, Carabao/lig kupası dahil) */
  domesticCupTitles: number;
  /** FIFA Dünya Kupası (milli) */
  worldCupTitles: number;
  /** Kıtasal milli turnuva (EURO, Copa América, Afrika Uluslar Kupası vb.) */
  continentalNationalTitles: number;
  /** TAKIM kupalarının toplamı (bireysel ödüller HARİÇ) */
  totalTitles: number;
  /** Bireysel ödüller — takım kupası değil, ayrı tutulur (toplama dahil DEĞİL). */
  individual: IndividualAwards;
}

/**
 * Bireysel ödül adetleri. Takım kupası sayılmaz; ayrı sorular için
 * ("daha fazla Ballon d'Or kazanan", "gol kralı olmuş mu" vb.).
 */
export interface IndividualAwards {
  /** Ballon d'Or (Altın Top) */
  ballonDor: number;
  /** The Best FIFA / eski FIFA World Player */
  fifaBest: number;
  /** Avrupa Altın Ayakkabı (Golden Boot — gol kralı) */
  goldenBoot: number;
  /** Lig/ülke bazlı "gol kralı / top goal scorer" ödülleri */
  topScorerAwards: number;
  /** Yılın oyuncusu / Footballer/Player of the Year (lig veya ülke) */
  playerOfTheYear: number;
  /** Puskás (yılın golü), Golden Boy, UEFA Best Player gibi diğer prestijli bireysel ödüller */
  otherIndividual: number;
  /** Tüm bireysel ödüllerin toplamı */
  totalIndividual: number;
}

interface RawPlayers {
  [key: string]: { tmId: number; meta?: { relativeUrl?: string } };
}

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

type TeamKey = Exclude<keyof TrophyCounts, 'totalTitles' | 'individual'>;
type IndividualKey = Exclude<keyof IndividualAwards, 'totalIndividual'>;
type Category =
  | { kind: 'team'; key: TeamKey }
  | { kind: 'individual'; key: IndividualKey }
  | null;

/**
 * Başlığı kategoriye eşler. SIRA ÖNEMLİ — spesifik kalıplar önce.
 * Üç sonuç: takım kupası | bireysel ödül | yok (altyapı/kadın/anlamsız).
 *
 * Gerçek TM başlık örnekleri:
 *   "4x UEFA Champions League winner" → team:ucl
 *   "3x Uefa Supercup winner" → team:otherEuropean (UEL DEĞİL)
 *   "3x FIFA Club World Cup winner" → team:otherEuropean
 *   "1x World Cup winner" → team:worldCup ; "1x Under-20 World Cup" → HARİÇ (altyapı)
 *   "8x Winner Ballon d'Or" → individual:ballonDor
 *   "25x Top goal scorer" → individual:topScorerAwards
 *   "6x Golden Boot winner (Europe)" → individual:goldenBoot
 */
function categorize(title: string): Category {
  const t = title.toLowerCase();

  // 0) HARİÇ: altyapı / kadın / olimpiyat madalyesi (bunlar bireysel de değil takım da)
  if (/u-?\d{2}|under-?\d{2}|youth|women|olympic/.test(t)) return null;

  // 1) BİREYSEL ÖDÜLLER (takım kupasından ÖNCE — toplama dahil edilmez)
  if (/ballon d'or|ballon d´or/.test(t)) return { kind: 'individual', key: 'ballonDor' };
  if (/the best fifa|fifa men's player|fifa world player|best fifa/.test(t)) return { kind: 'individual', key: 'fifaBest' };
  if (/golden boot/.test(t)) return { kind: 'individual', key: 'goldenBoot' };
  if (/top goal scorer|top scorer|torsch(ü|ue)tzenk(ö|oe)nig|gol kral/.test(t)) return { kind: 'individual', key: 'topScorerAwards' };
  if (/footballer of the year|player of the (year|season)/.test(t)) return { kind: 'individual', key: 'playerOfTheYear' };
  if (/puskas|puskás|golden boy|golden ball|golden glove|uefa best player|best player in europe|mvp|team of the|breakthrough|tm-player|player of the month/.test(t)) {
    return { kind: 'individual', key: 'otherIndividual' };
  }

  // 2) TAKIM KUPALARI
  if (/club world cup|intercontinental|toyota|cup of champions|recopa|libertadores|sudamericana/.test(t)) {
    return { kind: 'team', key: 'otherEuropeanTitles' };
  }
  if (/world cup|weltmeister|coupe du monde|copa del mundo|confederations cup/.test(t)) {
    return { kind: 'team', key: 'worldCupTitles' };
  }
  if (/european championship|euro winner|em-pokal|european champion\b|copa américa|copa america|africa cup|afcon|gold cup|asian cup|nations league/.test(t)) {
    return { kind: 'team', key: 'continentalNationalTitles' };
  }
  if (/super ?cup|supercup|conference league|cup winners|pokalsieger|intertoto/.test(t) && /uefa|european|conference|cup winners|intertoto/.test(t)) {
    return { kind: 'team', key: 'otherEuropeanTitles' };
  }
  if (/champions league|european cup|landesmeister/.test(t)) {
    return { kind: 'team', key: 'uclTitles' };
  }
  if (/europa league|uefa cup|uefa-pokal/.test(t)) {
    return { kind: 'team', key: 'uelTitles' };
  }
  if (
    !/cup|pokal|copa|coupe|coppa|beker|taça|puchar|kupas/.test(t) &&
    /champion|campeão|campeao|meister|league title|liga|serie a|bundesliga|ligue 1|premier|eredivisie|primeira|şampiyon|shield/.test(t)
  ) {
    return { kind: 'team', key: 'domesticLeagueTitles' };
  }
  if (
    /\bcup\b|pokal|copa|coupe|coppa|beker|taça|puchar|kupas/.test(t) &&
    !/champions league|europa|uefa|conference|club world|world cup|intercontinental/.test(t)
  ) {
    return { kind: 'team', key: 'domesticCupTitles' };
  }
  return null;
}

function emptyCounts(): TrophyCounts {
  return {
    uclTitles: 0,
    uelTitles: 0,
    otherEuropeanTitles: 0,
    domesticLeagueTitles: 0,
    domesticCupTitles: 0,
    worldCupTitles: 0,
    continentalNationalTitles: 0,
    totalTitles: 0,
    individual: {
      ballonDor: 0,
      fifaBest: 0,
      goldenBoot: 0,
      topScorerAwards: 0,
      playerOfTheYear: 0,
      otherIndividual: 0,
      totalIndividual: 0,
    },
  };
}

/**
 * Honours sayfasının HTML'inden takım kupası + bireysel ödül adetlerini parse eder.
 * Her başarı bloğu "<n>x <başlık>" formatında.
 */
export function parseHonours(html: string): TrophyCounts {
  const $ = cheerio.load(html);
  const counts = emptyCounts();

  const blocks = $('.large-8 .box, #main .box, .box');
  blocks.each((_, box) => {
    const headerText = $(box).find('h2, .content-box-headline, .table-header').first().text().trim();
    if (!headerText) return;
    const m = headerText.match(/^(\d+)\s*x\s+(.+?)(?:\s+winner)?$/i);
    if (!m) return;
    const n = parseInt(m[1]!, 10);
    const title = m[2]!.trim();
    if (!Number.isFinite(n) || n <= 0) return;
    const cat = categorize(title);
    if (!cat) return;
    if (cat.kind === 'team') counts[cat.key] += n;
    else counts.individual[cat.key] += n;
  });

  counts.totalTitles =
    counts.uclTitles +
    counts.uelTitles +
    counts.otherEuropeanTitles +
    counts.domesticLeagueTitles +
    counts.domesticCupTitles +
    counts.worldCupTitles +
    counts.continentalNationalTitles;

  const iv = counts.individual;
  iv.totalIndividual =
    iv.ballonDor + iv.fifaBest + iv.goldenBoot + iv.topScorerAwards + iv.playerOfTheYear + iv.otherIndividual;

  return counts;
}

function honoursUrl(tmId: number): string {
  // Slug TM tarafından yok sayılır; sade /spieler/ yolu yeterli ve 200 döner.
  return `https://www.transfermarkt.com/spieler/erfolge/spieler/${tmId}`;
}

async function main() {
  const limit = arg('limit') ? parseInt(arg('limit')!, 10) : Infinity;
  const onlyFamous = hasFlag('only-famous');

  const raw: RawPlayers = JSON.parse(await readFile(RAW_FILE, 'utf8'));
  let entries = Object.values(raw).filter((p) => Number.isFinite(p.tmId));

  // --tmids=28003,8198 : yalnızca belirli oyuncuları çek (parser doğrulama için).
  const tmidsArg = arg('tmids');
  if (tmidsArg) {
    const want = new Set(tmidsArg.split(',').map((x) => parseInt(x.trim(), 10)));
    entries = entries.filter((p) => want.has(p.tmId));
    console.log(`  [honours] --tmids: ${entries.length} hedef oyuncu`);
  }

  // --only-famous: düşük tmId'ler genelde daha köklü/ünlü oyuncular değil;
  // bu flag yerine ileride market değeri sırası kullanılabilir. Şimdilik no-op
  // dışında basit bir kısıtlama: ilk N (limit) zaten parça çekme sağlıyor.
  void onlyFamous;

  // Önceki çıktı varsa üzerine ekle (resume desteği — cache + birikimli yazım)
  let out: Record<string, TrophyCounts> = {};
  try {
    out = JSON.parse(await readFile(OUT_FILE, 'utf8'));
  } catch {
    /* ilk çalıştırma */
  }

  let done = 0;
  let fetched = 0;
  for (const p of entries) {
    if (done >= limit) break;
    const key = String(p.tmId);
    if (out[key]) {
      done++;
      continue; // zaten çekilmiş
    }
    try {
      const html = await fetchHtml(honoursUrl(p.tmId), { ttlDays: 90 });
      out[key] = parseHonours(html);
      fetched++;
    } catch (err) {
      console.warn(`  [honours] tmId=${p.tmId} hata:`, err instanceof Error ? err.message : err);
      out[key] = emptyCounts(); // hata = 0 kupa say, tekrar denemesin
    }
    done++;
    // Her 25 oyuncuda bir ara kayıt (uzun scrape'te ilerleme kaybolmasın)
    if (fetched > 0 && fetched % 25 === 0) {
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(OUT_FILE, JSON.stringify(out), 'utf8');
      console.log(`  [honours] ${done}/${entries.length} (yeni çekilen: ${fetched})`);
    }
  }

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out, null, 0), 'utf8');

  // Özet
  const all = Object.values(out);
  const withAny = all.filter((c) => c.totalTitles > 0).length;
  console.log(`\n✅ Honours tamamlandı: ${all.length} oyuncu, ${withAny} tanesinde 1+ kupa.`);
  console.log(`   Çıktı: ${OUT_FILE}`);
  console.log(`   Sonraki adım: merge.ts honours.json'u achievements.trophies olarak ekleyecek.`);
}

// Doğrudan çalıştırıldığında main() — import edildiğinde sadece parseHonours export.
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
