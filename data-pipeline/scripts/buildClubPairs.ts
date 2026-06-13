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
 *       { a, b, aName, bName, answers: [{id,name,points}], count }
 *   ]}
 *
 * NADİRLİK PUANI (PLAN.md §20.2 — "Ortak Bul" modu): Her çiftin answers'ı
 * o çifte ÖZGÜ bilinirliğe göre 3 banda bölünür → her answer'a `points` (1|2|3):
 *   1 = bariz/yıldız (herkesin bileceği)   ← yüksek bilinirlik
 *   2 = orta
 *   3 = gizli/şaşırtıcı ortak               ← düşük bilinirlik
 * Bilinirlik skoru = marquee proxy (milli maç + maç + gol + market değeri,
 * §14.0 isMarquee sinyalleriyle uyumlu). Çift-İÇİ göreli bandlama (mutlak eşik
 * DEĞİL) → her çiftte adil: 41-cevaplı derin çiftte de 3-cevaplı sığ çiftte de
 * "bariz vs gizli" ayrımı anlamlı. Build-time hesaplanır → runtime hesap yok.
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

interface PlayerStats {
  totalApps?: number;
  totalGoals?: number;
  nationalCaps?: number;
  maxTransferFeeEUR?: number;
}
interface Player {
  id: string;
  name: string;
  displayName?: string;
  clubs?: Array<{ clubId: string }>;
  imageUrl?: string;
  stats?: PlayerStats;
}
interface Club { id: string; name: string; continent: string; }
interface PoolEntry { id: string; name: string; }

/**
 * Bir oyuncunun "bilinirlik" skoru — nadirlik bandlaması için ham sinyal.
 * Yüksek = herkesin tanıdığı (milli maç + kariyer maçı/golü + zirve transfer
 * ücreti). log ölçek → uç değerler (Pelé tipi) bandı ezmesin. Mutlak anlamı
 * yok; SADECE çift-içi sıralama için kullanılır.
 */
function fameScore(p: Player): number {
  const s = p.stats ?? {};
  const caps = s.nationalCaps ?? 0;
  const apps = s.totalApps ?? 0;
  const goals = s.totalGoals ?? 0;
  const mvM = (s.maxTransferFeeEUR ?? 0) / 1_000_000; // milyon €
  // Ağırlıklar: milli maç en güçlü "bilinirlik" sinyali (efsaneleri de yakalar),
  // sonra market değeri (modern yıldız), sonra hacim (maç/gol). log1p ile sıkıştır.
  return (
    Math.log1p(caps) * 3.0 +
    Math.log1p(mvM) * 2.2 +
    Math.log1p(apps) * 1.0 +
    Math.log1p(goals) * 1.2
  );
}

/**
 * Bir çiftin ortak oyuncularını bilinirliğe göre 3 banda böl → her birine
 * points (1=bariz/yüksek-bilinirlik, 3=gizli/düşük-bilinirlik). Çift-içi göreli:
 * oyuncular fameScore'a göre AZALAN sıralanır, eşit üçe bölünür (ilk üçte=1,
 * orta=2, son=3). 3'ten az olamaz (minAnswers≥3 garanti). Eşit skorlarda id ile
 * deterministik sıra (tutarlı çıktı).
 */
function assignPoints(
  common: Player[],
): Array<{ id: string; name: string; points: 1 | 2 | 3 }> {
  const scored = common
    .map((p) => ({ p, fame: fameScore(p) }))
    .sort((a, b) => (b.fame - a.fame) || a.p.id.localeCompare(b.p.id));
  const n = scored.length;
  // Bant sınırları: ilk ~1/3 bariz, orta ~1/3, son ~1/3 gizli.
  const t1 = Math.floor(n / 3); // [0,t1)   → 1 puan (bariz)
  const t2 = Math.floor((2 * n) / 3); // [t1,t2)  → 2 puan (orta)
  return scored.map(({ p }, i) => {
    const points: 1 | 2 | 3 = i < t1 ? 1 : i < t2 ? 2 : 3;
    return { id: p.id, name: p.displayName || p.name, points };
  });
}

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
  const pairs: Array<{ a: string; b: string; aName: string; bName: string; count: number; answers: Array<{ id: string; name: string; points: 1 | 2 | 3 }> }> = [];
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
          // Nadirlik bandı (1=bariz, 2=orta, 3=gizli) — çift-içi göreli.
          answers: assignPoints(common),
        });
      }
    }
  }
  pairs.sort((a, b) => b.count - a.count);

  console.log(`[buildClubPairs] ${evaluated} çift değerlendirildi → ${pairs.length} uygun (>=${min} cevap, %${(pairs.length / evaluated * 100).toFixed(0)})`);
  console.log(`  en zengin 5: ${pairs.slice(0, 5).map((p) => `${p.aName}×${p.bName}(${p.count})`).join(', ')}`);
  const totalAnswers = pairs.reduce((s, p) => s + p.count, 0);
  console.log(`  ortalama cevap/çift: ${(totalAnswers / Math.max(1, pairs.length)).toFixed(1)}`);
  // Nadirlik bandı dağılımı (1=bariz, 2=orta, 3=gizli) — kabaca dengeli olmalı.
  const band = { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>;
  for (const p of pairs) for (const a of p.answers) band[a.points]++;
  console.log(`  nadirlik bandı: bariz(1)=${band[1]} · orta(2)=${band[2]} · gizli(3)=${band[3]}`);
  // Örnek: en zengin çiftin en bariz + en gizli ismi (göz kontrolü).
  if (pairs[0]) {
    const a = pairs[0];
    const obvious = a.answers.find((x) => x.points === 1);
    const hidden = a.answers.find((x) => x.points === 3);
    console.log(`  örnek ${a.aName}×${a.bName}: bariz="${obvious?.name}" gizli="${hidden?.name}"`);
  }

  if (dry) { console.log('[buildClubPairs] --dry: yazılmadı.'); return; }
  await writeFile(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(), minAnswers: min, clubCount: poolIds.length, pairCount: pairs.length, pairs,
  }, null, 2) + '\n');
  console.log(`[buildClubPairs] DONE → ${OUT}`);
}

main().catch((e) => { console.error('[buildClubPairs] fatal:', e); process.exit(1); });
