/**
 * "İki Takım Ortak Oyuncusu" modu (PLAN.md §15.3 / Mod C) için kulüp-çifti
 * havuzu üretir (LOKAL, scrape YOK).
 *
 * NEDEN: Online'da ekrana 2 kulüp gelir; kullanıcı her ikisinde de oynamış
 * futbolcuları bilmeye çalışır. Kullanıcı filtresi: sorulan eşleşmenin EN AZ
 * 3 ortak cevabı olsun (Kayserispor-Getafe gibi 0-cevaplı saçma eşleşme çıkmasın).
 *
 * GİRDİ: clubPool.json (buildClubPool çıktısı — top ~75 kulüp) + players.json.
 *   clubPool yoksa, players.json'dan popülerlikle on-the-fly top-N türetir.
 *
 * ALGORİTMA: Havuzdaki her kulüp çifti (i<j) için, İKİSİNDE DE oynamış oyuncuları
 * bul. Ortak oyuncu sayısı >= minAnswers ise çifti kaydet (kabul edilen cevap
 * listesiyle). O(kulüp² × oyuncu) ama havuz küçük (75² ≈ 2775 çift) → hızlı.
 *
 * ÇIKTI: apps/web/public/data/clubPairs.json
 *   { generatedAt, minAnswers, clubCount, pairs: [
 *       { a, b, aName, bName, answers: [{id,name}], count }
 *   ]}
 *
 * Kullanım:
 *   pnpm tsx scripts/buildClubPairs.ts                 # min 3 ortak cevap
 *   pnpm tsx scripts/buildClubPairs.ts --min=4 --pool=50
 *   pnpm tsx scripts/buildClubPairs.ts --dry
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC_DATA = join(ROOT, '..', 'apps', 'web', 'public', 'data');
const PLAYERS = join(PUBLIC_DATA, 'players.json');
const CLUBS = join(PUBLIC_DATA, 'clubs.json');
const CLUB_POOL = join(PUBLIC_DATA, 'clubPool.json');
const OUT = join(PUBLIC_DATA, 'clubPairs.json');

interface Player { id: string; name: string; displayName?: string; clubs?: Array<{ clubId: string }>; imageUrl?: string; }
interface Club { id: string; name: string; continent: string; }
interface PoolEntry { id: string; name: string; }

function parseArgs() {
  const a = process.argv;
  const get = (k: string) => a.find((x) => x.startsWith(`--${k}=`))?.split('=')[1];
  return {
    min: get('min') ? parseInt(get('min')!, 10) : 3,
    pool: get('pool') ? parseInt(get('pool')!, 10) : 75,
    dry: a.includes('--dry'),
  };
}

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await readFile(p, 'utf8')) as T;
}

async function main() {
  const { min, pool: poolSize, dry } = parseArgs();
  console.log(`[buildClubPairs] minAnswers=${min} pool=${poolSize} dry=${dry}`);

  if (!existsSync(PLAYERS)) throw new Error('players.json yok — önce pnpm build.');
  const players = await readJson<Player[]>(PLAYERS);
  const clubs = await readJson<Club[]>(CLUBS);
  const clubsById = new Map(clubs.map((c) => [c.id, c]));

  // Kulüp havuzu: clubPool.json varsa onu kullan, yoksa popülerlikle türet
  let poolIds: PoolEntry[];
  if (existsSync(CLUB_POOL)) {
    const cp = await readJson<PoolEntry[]>(CLUB_POOL);
    poolIds = cp.slice(0, poolSize);
    console.log(`[buildClubPairs] clubPool.json kullanılıyor (${poolIds.length} kulüp)`);
  } else {
    const pop = new Map<string, number>();
    for (const p of players) {
      const seen = new Set<string>();
      for (const s of p.clubs ?? []) { if (!seen.has(s.clubId)) { seen.add(s.clubId); pop.set(s.clubId, (pop.get(s.clubId) ?? 0) + 1); } }
    }
    poolIds = [...pop.entries()]
      .map(([id, n]) => ({ id, n, c: clubsById.get(id) }))
      .filter((x) => x.c && x.c.continent === 'Europe')
      .sort((a, b) => b.n - a.n).slice(0, poolSize)
      .map((x) => ({ id: x.id, name: x.c!.name }));
    console.log(`[buildClubPairs] clubPool.json yok → popülerlikten ${poolIds.length} kulüp türetildi`);
  }

  const poolSet = new Set(poolIds.map((p) => p.id));
  const nameById = new Map(poolIds.map((p) => [p.id, p.name]));

  // Her kulüp için: o kulüpte oynamış oyuncular (yalnız havuz kulüpleri)
  const clubPlayers = new Map<string, Player[]>();
  for (const id of poolSet) clubPlayers.set(id, []);
  for (const p of players) {
    const seen = new Set<string>();
    for (const s of p.clubs ?? []) {
      if (poolSet.has(s.clubId) && !seen.has(s.clubId)) {
        seen.add(s.clubId);
        clubPlayers.get(s.clubId)!.push(p);
      }
    }
  }

  // Tüm çiftler (i<j), ortak oyuncu >= min
  const ids = poolIds.map((p) => p.id);
  const pairs: Array<{ a: string; b: string; aName: string; bName: string; count: number; answers: Array<{ id: string; name: string }> }> = [];
  let evaluated = 0;
  for (let i = 0; i < ids.length; i++) {
    const aId = ids[i]!;
    const aPlayers = clubPlayers.get(aId)!;
    const aSet = new Set(aPlayers.map((p) => p.id));
    for (let j = i + 1; j < ids.length; j++) {
      const bId = ids[j]!;
      evaluated++;
      const common = clubPlayers.get(bId)!.filter((p) => aSet.has(p.id));
      if (common.length >= min) {
        pairs.push({
          a: aId, b: bId, aName: nameById.get(aId)!, bName: nameById.get(bId)!,
          count: common.length,
          answers: common.map((p) => ({ id: p.id, name: p.displayName || p.name })),
        });
      }
    }
  }
  pairs.sort((a, b) => b.count - a.count);

  console.log(`[buildClubPairs] ${evaluated} çift değerlendirildi → ${pairs.length} uygun (>=${min} cevap, %${(pairs.length / evaluated * 100).toFixed(0)})`);
  console.log(`  en zengin 5: ${pairs.slice(0, 5).map((p) => `${p.aName}×${p.bName}(${p.count})`).join(', ')}`);
  const totalAnswers = pairs.reduce((s, p) => s + p.count, 0);
  console.log(`  ortalama cevap/çift: ${(totalAnswers / Math.max(1, pairs.length)).toFixed(1)}`);

  if (dry) { console.log('[buildClubPairs] --dry: yazılmadı.'); return; }
  await writeFile(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(), minAnswers: min, clubCount: poolIds.length, pairCount: pairs.length, pairs,
  }, null, 2) + '\n');
  console.log(`[buildClubPairs] DONE → ${OUT}`);
}

main().catch((e) => { console.error('[buildClubPairs] fatal:', e); process.exit(1); });
