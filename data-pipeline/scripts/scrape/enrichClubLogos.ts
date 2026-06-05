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
 *   pnpm tsx scripts/scrape/enrichClubLogos.ts                 # top 120 kulüp
 *   pnpm tsx scripts/scrape/enrichClubLogos.ts --top=75
 *   pnpm tsx scripts/scrape/enrichClubLogos.ts --limit=3       # TEST: sadece 3 kulüp çek
 *   pnpm tsx scripts/scrape/enrichClubLogos.ts --dry           # çekme, sadece plan göster
 *   pnpm tsx scripts/scrape/enrichClubLogos.ts --force         # mevcut logoları da yenile
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
  clubs?: Array<{ clubId: string }>;
}

function parseArgs() {
  const a = process.argv;
  const get = (k: string) => a.find((x) => x.startsWith(`--${k}=`))?.split('=')[1];
  return {
    top: get('top') ? parseInt(get('top')!, 10) : 120,
    limit: get('limit') ? parseInt(get('limit')!, 10) : Infinity,
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
  const { top, limit, dry, force } = parseArgs();
  console.log(`[enrichClubLogos] top=${top} limit=${limit === Infinity ? 'all' : limit} dry=${dry} force=${force}`);

  const clubs = await readJson<SeedClub[]>(SEED_CLUBS);
  const clubsById = new Map(clubs.map((c) => [c.id, c]));
  console.log(`[enrichClubLogos] seed/clubs.json: ${clubs.length} kulüp`);

  // Popülerlik: players.json'da kulüp başına farklı oyuncu sayısı
  const popularity = new Map<string, number>();
  if (existsSync(PLAYERS_PUBLIC)) {
    const players = await readJson<SeedPlayer[]>(PLAYERS_PUBLIC);
    for (const p of players) {
      const seen = new Set<string>();
      for (const s of p.clubs ?? []) {
        if (seen.has(s.clubId)) continue;
        seen.add(s.clubId);
        popularity.set(s.clubId, (popularity.get(s.clubId) ?? 0) + 1);
      }
    }
    console.log(`[enrichClubLogos] popülerlik hesaplandı (${popularity.size} kulüp oyuncu barındırıyor)`);
  } else {
    console.warn(`[enrichClubLogos] UYARI: players.json yok, popülerlik sıralaması atlanıyor`);
  }

  // En popüler top-N kulüp, TM'den çekilebilir (tmId çözülebilen) olanlar
  const ranked = [...popularity.entries()]
    .map(([id, n]) => ({ id, n, tmId: tmIdOf(id), club: clubsById.get(id) }))
    .filter((x) => x.tmId !== null && x.club !== undefined)
    .sort((a, b) => b.n - a.n)
    .slice(0, top);

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
