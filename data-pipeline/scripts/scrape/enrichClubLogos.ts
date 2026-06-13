/**
 * Kulüp logolarını (crestUrl) ve renklerini (colors) Transfermarkt'tan çeker,
 * seed/clubs.json'daki ilgili kulüplere ekler.
 *
 * NEDEN: Kulüp-bazlı modlar (Futbol Çinko, Rastgele 7, İki Takım Eşleşmesi,
 * Kariyer Yolu) hücrelerde/kartlarda kulüp AMBLEMİ gösterecek. clubs.json'da
 * şu an logo/renk YOK. TM API (`TmApiClub.crestUrl` + `.colors`) bu bilgiyi
 * veriyor ama mevcut merge.ts bunları atlıyordu.
 *
 * STRATEJİ (maliyet kontrolü): TÜM 6240 kulüp değil — sadece "popüler" kulüpler
 * gerekli (modlar top ~75 Avrupa kulübü kullanacak). Popülerlik = players.json'da
 * o kulüpte oynamış FARKLI oyuncu sayısı. Default: top 120 (top 75 + tampon).
 *
 * Yalnızca `tm_<id>` formatlı clubId'ler TM'den çekilebilir (id doğrudan TM id).
 * Manuel slug'lı kulüpler (galatasaray, fenerbahce...) clubSquads'taki TM-id
 * eşlemesiyle çözülür (SUPER_LIG_TM_IDS).
 *
 * ÇIKTI: seed/clubs.json güncellenir (her kulübe crestUrl + colors eklenir).
 * Idempotent: zaten crestUrl'i olan kulüpler atlanır (--force ile yeniden çeker).
 *
 * Kullanım:
 *   pnpm tsx scripts/scrape/enrichClubLogos.ts                 # top 120 kulüp (popülerlik)
 *   pnpm tsx scripts/scrape/enrichClubLogos.ts --top=75
 *   pnpm tsx scripts/scrape/enrichClubLogos.ts --career        # KARİYER YOLU: F havuzu + ≥2 oyuncu eşik
 *   pnpm tsx scripts/scrape/enrichClubLogos.ts --career --min=3 # ≥3 oyuncu eşik
 *   pnpm tsx scripts/scrape/enrichClubLogos.ts --limit=3       # TEST: sadece 3 kulüp çek
 *   pnpm tsx scripts/scrape/enrichClubLogos.ts --dry           # çekme, sadece plan göster
 *   pnpm tsx scripts/scrape/enrichClubLogos.ts --force         # mevcut logoları da yenile
 *
 * `--career` modu (Kariyer Yolu için): popülerlik=tüm-havuz yerine, SADECE
 * "Kariyer Yolu uygun havuzu"ndaki (marquee + ≥3 kulüp + 6 büyük ülkeden ≥2 +
 * ≥1 elit) oyuncuların kariyer duraklarını sayar; ≥min (default 2) oyuncuda
 * geçen kulüpleri çeker. Niş alt-kulüpler (II takımları) bayrak fallback'te kalır.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchClubs, type TmApiClub } from './tmApi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const PROJECT_ROOT = resolve(ROOT, '..');
const SEED_CLUBS = join(ROOT, 'seed', 'clubs.json');
// Popülerlik için ürün çıktısındaki oyuncular (kulüp başına oyuncu sayısı).
const PLAYERS_PUBLIC = join(PROJECT_ROOT, 'apps', 'web', 'public', 'data', 'players.json');

/** Manuel slug'lı büyük kulüpler → TM id (logo çekebilmek için). */
const SLUG_TO_TM_ID: Record<string, number> = {
  galatasaray: 141,
  fenerbahce: 36,
  besiktas: 114,
  trabzonspor: 449,
  // Diğer manuel slug'lar gerektikçe eklenir; çoğu kulüp zaten tm_ formatında.
};

interface SeedClub {
  id: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  continent: string;
  lat: number;
  lng: number;
  founded?: number;
  // YENİ alanlar:
  crestUrl?: string;
  colors?: { primary?: string; secondary?: string; tertiary?: string };
}

interface SeedPlayer {
  imageUrl?: string;
  nationalityCode?: string;
  stats?: { nationalCaps?: number; maxTransferFeeEUR?: number };
  clubs?: Array<{ clubId: string }>;
}

/**
 * Kariyer Yolu "uygun havuz" (F) — careerMode.ts isCareerEligible ile AYNI kural.
 * 5 büyük lig + TR ülke kodları + elit kulüp id'leri (Zincir/Ortak Bul ile aynı).
 */
const BIG6_COUNTRY_CODES = new Set(['EN', 'ES', 'DE', 'IT', 'FR', 'TR']);
const ELITE_CLUB_IDS = new Set([
  'tm_5', 'tm_46', 'tm_506', 'tm_6195', 'tm_12', 'tm_36', 'tm_141', 'tm_114',
  'tm_148', 'tm_11', 'tm_281', 'tm_31', 'tm_985', 'tm_631', 'tm_27', 'tm_16',
  'tm_15', 'tm_33', 'tm_244', 'tm_583', 'tm_1041', 'tm_131', 'tm_418', 'tm_13',
  'tm_368', 'tm_610', 'tm_294', 'tm_720',
]);

function parseArgs() {
  const a = process.argv;
  const get = (k: string) => a.find((x) => x.startsWith(`--${k}=`))?.split('=')[1];
  return {
    top: get('top') ? parseInt(get('top')!, 10) : 120,
    limit: get('limit') ? parseInt(get('limit')!, 10) : Infinity,
    career: a.includes('--career'),
    min: get('min') ? parseInt(get('min')!, 10) : 2,
    dry: a.includes('--dry'),
    force: a.includes('--force'),
  };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

/** Bir clubId'yi TM numeric id'ye çevir (çekilebilir mi?). */
function tmIdOf(clubId: string): number | null {
  if (clubId.startsWith('tm_')) {
    const n = parseInt(clubId.slice(3), 10);
    return Number.isFinite(n) ? n : null;
  }
  if (clubId in SLUG_TO_TM_ID) return SLUG_TO_TM_ID[clubId]!;
  return null;
}

/** TM colors objesini bizim {primary,secondary,tertiary} formatına çevir. */
function mapColors(tc: TmApiClub): SeedClub['colors'] | undefined {
  const c = tc.baseDetails.superiorClub?.colors;
  if (!c) return undefined;
  const out: SeedClub['colors'] = {};
  if (c.firstColor) out.primary = c.firstColor;
  if (c.secondColor) out.secondary = c.secondColor;
  if (c.thirdColor) out.tertiary = c.thirdColor;
  return Object.keys(out).length ? out : undefined;
}

async function main() {
  const { top, limit, career, min, dry, force } = parseArgs();
  console.log(
    `[enrichClubLogos] mode=${career ? `career(min=${min})` : `top=${top}`} ` +
      `limit=${limit === Infinity ? 'all' : limit} dry=${dry} force=${force}`,
  );

  const clubs = await readJson<SeedClub[]>(SEED_CLUBS);
  const clubsById = new Map(clubs.map((c) => [c.id, c]));
  console.log(`[enrichClubLogos] seed/clubs.json: ${clubs.length} kulüp`);

  if (!existsSync(PLAYERS_PUBLIC)) {
    console.warn(`[enrichClubLogos] UYARI: players.json yok — çekim atlanıyor.`);
    return;
  }
  const players = await readJson<SeedPlayer[]>(PLAYERS_PUBLIC);

  // Kulüp → kaç (uygun) oyuncuda geçiyor sayacı.
  const popularity = new Map<string, number>();

  if (career) {
    // KARİYER YOLU: sadece F-havuzu (uygun) oyuncuların duraklarını say.
    const ccById = new Map(clubs.map((c) => [c.id, c.countryCode]));
    const isMarquee = (p: SeedPlayer) =>
      !!p.imageUrl &&
      ((p.stats?.nationalCaps ?? 0) >= 30 || (p.stats?.maxTransferFeeEUR ?? 0) >= 25_000_000);
    const distinctIds = (p: SeedPlayer) => [...new Set((p.clubs ?? []).map((s) => s.clubId))];
    const big6 = (ids: string[]) => {
      const set = new Set<string>();
      for (const id of ids) {
        const cc = ccById.get(id);
        if (cc && BIG6_COUNTRY_CODES.has(cc)) set.add(cc);
      }
      return set.size;
    };
    const eligible = (p: SeedPlayer) => {
      if (!isMarquee(p)) return false;
      const ids = distinctIds(p);
      if (ids.length < 3) return false;
      if (big6(ids) < 2) return false;
      return ids.some((id) => ELITE_CLUB_IDS.has(id));
    };

    let pool = 0;
    for (const p of players) {
      if (!eligible(p)) continue;
      pool++;
      for (const id of distinctIds(p)) popularity.set(id, (popularity.get(id) ?? 0) + 1);
    }
    console.log(`[enrichClubLogos] Kariyer F-havuzu: ${pool} oyuncu, ${popularity.size} farklı kulüp durağı`);
  } else {
    // POPÜLERLİK (varsayılan): tüm havuzda kulüp başına farklı oyuncu sayısı.
    for (const p of players) {
      const seen = new Set<string>();
      for (const s of p.clubs ?? []) {
        if (seen.has(s.clubId)) continue;
        seen.add(s.clubId);
        popularity.set(s.clubId, (popularity.get(s.clubId) ?? 0) + 1);
      }
    }
    console.log(`[enrichClubLogos] popülerlik hesaplandı (${popularity.size} kulüp oyuncu barındırıyor)`);
  }

  // Aday kulüpler: TM'den çekilebilir (tmId çözülebilen) + (career ise ≥min eşik).
  const ranked = [...popularity.entries()]
    .filter(([, n]) => (career ? n >= min : true))
    .map(([id, n]) => ({ id, n, tmId: tmIdOf(id), club: clubsById.get(id) }))
    .filter((x) => x.tmId !== null && x.club !== undefined)
    .sort((a, b) => b.n - a.n)
    .slice(0, career ? Infinity : top);

  // Zaten logosu olanları (force değilse) atla
  const todo = ranked.filter((x) => force || !x.club!.crestUrl).slice(0, limit);
  console.log(`[enrichClubLogos] hedef: ${ranked.length} popüler kulüp, çekilecek: ${todo.length}`);
  if (todo.length) {
    console.log(`  ilk 5: ${todo.slice(0, 5).map((x) => `${x.club!.name}(${x.n})`).join(', ')}`);
  }

  if (dry) {
    console.log('[enrichClubLogos] --dry: çekim yapılmadı. Plan yukarıda.');
    return;
  }

  const tmIds = todo.map((x) => String(x.tmId));
  if (tmIds.length === 0) {
    console.log('[enrichClubLogos] çekilecek kulüp yok (hepsi güncel).');
    return;
  }

  const fetched = await fetchClubs(tmIds);
  const byTmId = new Map(fetched.map((tc) => [tc.id, tc]));
  console.log(`[enrichClubLogos] TM'den ${fetched.length} kulüp döndü`);

  let updated = 0, withCrest = 0, withColors = 0;
  for (const item of todo) {
    const tc = byTmId.get(String(item.tmId));
    if (!tc) continue;
    const club = item.club!;
    if (tc.crestUrl) { club.crestUrl = tc.crestUrl; withCrest++; }
    const colors = mapColors(tc);
    if (colors) { club.colors = colors; withColors++; }
    updated++;
  }

  console.log(`[enrichClubLogos] güncellendi: ${updated} kulüp (crest: ${withCrest}, renk: ${withColors})`);
  await writeFile(SEED_CLUBS, JSON.stringify(clubs, null, 2) + '\n');
  console.log(`[enrichClubLogos] DONE → seed/clubs.json yazıldı`);
}

main().catch((e) => {
  console.error('[enrichClubLogos] fatal:', e);
  process.exit(1);
});
