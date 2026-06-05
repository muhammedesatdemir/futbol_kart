/**
 * Kulüp-bazlı modlar için "kürasyonlu kulüp havuzu" üretir (LOKAL, scrape YOK).
 *
 * NEDEN: Futbol Çinko / Rastgele 7 / İki Takım Eşleşmesi modları "en iyi ~50-75
 * Avrupa kulübü" arasından seçim yapacak. Bu havuz, players.json'daki kulüp
 * popülerliğinden (o kulüpte oynamış farklı oyuncu sayısı) türetilir.
 *
 * Türk-kulüp ağırlığı (veri Süper Lig-yoğun) dengelensin diye: havuz "Avrupa"
 * ile sınırlanır AMA ülke başına makul bir tavan uygulanır (default: ülke başına
 * max 12 kulüp) ki tek ülke havuzu domine etmesin. Türk büyük kulüpleri (Eto'o'nun
 * Konyaspor'u gibi kritik olanlar) yine de girer.
 *
 * ÇIKTI: apps/web/public/data/clubPool.json
 *   [{ id, name, country, crestUrl?, playerCount, rank }]
 *
 * Kullanım:
 *   pnpm tsx scripts/buildClubPool.ts                  # top 75, ülke başına max 12
 *   pnpm tsx scripts/buildClubPool.ts --size=50 --perCountry=8
 *   pnpm tsx scripts/buildClubPool.ts --dry            # yazma, sadece listele
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PROJECT_ROOT = resolve(ROOT, '..');
const PUBLIC_DATA = join(PROJECT_ROOT, 'apps', 'web', 'public', 'data');
const PLAYERS = join(PUBLIC_DATA, 'players.json');
const CLUBS = join(PUBLIC_DATA, 'clubs.json');
const OUT = join(PUBLIC_DATA, 'clubPool.json');

interface Club {
  id: string; name: string; country: string; continent: string;
  crestUrl?: string; colors?: Record<string, string>;
}
interface Player { clubs?: Array<{ clubId: string }>; }

function parseArgs() {
  const a = process.argv;
  const get = (k: string) => a.find((x) => x.startsWith(`--${k}=`))?.split('=')[1];
  return {
    size: get('size') ? parseInt(get('size')!, 10) : 75,
    perCountry: get('perCountry') ? parseInt(get('perCountry')!, 10) : 12,
    dry: a.includes('--dry'),
  };
}

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await readFile(p, 'utf8')) as T;
}

async function main() {
  const { size, perCountry, dry } = parseArgs();
  console.log(`[buildClubPool] size=${size} perCountry=${perCountry} dry=${dry}`);

  if (!existsSync(PLAYERS) || !existsSync(CLUBS)) {
    throw new Error('players.json / clubs.json yok — önce pnpm build çalıştır.');
  }
  const players = await readJson<Player[]>(PLAYERS);
  const clubs = await readJson<Club[]>(CLUBS);
  const clubsById = new Map(clubs.map((c) => [c.id, c]));

  // Popülerlik: kulüp başına farklı oyuncu sayısı
  const pop = new Map<string, number>();
  for (const p of players) {
    const seen = new Set<string>();
    for (const s of p.clubs ?? []) {
      if (seen.has(s.clubId)) continue;
      seen.add(s.clubId);
      pop.set(s.clubId, (pop.get(s.clubId) ?? 0) + 1);
    }
  }

  // Sadece Avrupa kulüpleri, popülerliğe göre sırala
  const ranked = [...pop.entries()]
    .map(([id, n]) => ({ id, n, club: clubsById.get(id) }))
    .filter((x) => x.club && x.club.continent === 'Europe')
    .sort((a, b) => b.n - a.n);

  // Ülke başına tavan uygulayarak top-N seç (tek ülke domine etmesin)
  const perCountryCount = new Map<string, number>();
  const pool: Array<{ id: string; name: string; country: string; crestUrl?: string; playerCount: number; rank: number }> = [];
  for (const x of ranked) {
    if (pool.length >= size) break;
    const country = x.club!.country;
    const c = perCountryCount.get(country) ?? 0;
    if (c >= perCountry) continue;
    perCountryCount.set(country, c + 1);
    pool.push({
      id: x.id, name: x.club!.name, country, crestUrl: x.club!.crestUrl,
      playerCount: x.n, rank: pool.length + 1,
    });
  }

  const missingLogo = pool.filter((p) => !p.crestUrl).length;
  console.log(`[buildClubPool] havuz: ${pool.length} kulüp (${new Set(pool.map((p) => p.country)).size} ülke)`);
  console.log(`  ülke dağılımı:`, [...perCountryCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`).join(', '));
  console.log(`  logosu eksik: ${missingLogo}/${pool.length} (enrichClubLogos ile doldurulmalı)`);
  console.log(`  ilk 10: ${pool.slice(0, 10).map((p) => p.name).join(', ')}`);

  if (dry) { console.log('[buildClubPool] --dry: yazılmadı.'); return; }
  await writeFile(OUT, JSON.stringify(pool, null, 2) + '\n');
  console.log(`[buildClubPool] DONE → ${OUT}`);
}

main().catch((e) => { console.error('[buildClubPool] fatal:', e); process.exit(1); });
