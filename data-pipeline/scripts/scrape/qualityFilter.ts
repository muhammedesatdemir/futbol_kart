/**
 * Pozisyon-aware veri kalite filtresi — eleme önizlemesi.
 *
 * İki katmanlı strateji:
 *
 *   KATMAN 1 (kesin sil — "hayalet kayıt"):
 *     totalApps === 0 VE clubs.length === 0 VE nationalCaps === 0
 *
 *   KATMAN 2 (pozisyon-aware kritik eksiklik):
 *     - GK: totalApps < 30 VE heightCm yok VE imageUrl yok
 *     - DEF/MID: totalApps < 20 VE totalGoals === 0 VE clubs < 2
 *     - FWD: totalGoals === 0 VE totalApps < 50
 *
 *   İSTİSNALAR (asla silme):
 *     - nationalityCode === 'TR' (Türk pazarı odağı)
 *     - maxTransferFeeEUR > 1M (tanınmış oyuncu)
 *     - nationalCaps >= 10 (milli takım kimliği var)
 *     - clubs.length >= 3 (kariyer dolu)
 *     - totalGoals >= 50 (gol katkısı yüksek - efsaneler)
 *     - totalApps >= 200 (uzun kariyer)
 *
 * Çıktı: cache/quality-removal-preview.json
 *
 * TM isteği YAPMAZ.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Player } from '@futbol-kart/shared-types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = join(__dirname, '..', '..');
const CACHE_DIR = join(PIPELINE_ROOT, 'cache');
const SEED_PLAYERS = join(PIPELINE_ROOT, 'seed', 'players.json');
const OUT_FILE = join(CACHE_DIR, 'quality-removal-preview.json');

interface RemovalRecord {
  id: string;
  slug: string;
  name: string;
  birthYear: string;
  position: string;
  nationalityCode: string;
  totalApps: number;
  totalGoals: number;
  totalAssists: number;
  nationalCaps: number;
  clubsCount: number;
  jerseyCount: number;
  hasHeight: boolean;
  hasFoot: boolean;
  hasImage: boolean;
  hasCoord: boolean;
  hasMarketValue: boolean;
  reason: string;
}

interface ExceptionReason {
  applied: boolean;
  why?: string;
}

/** Bu oyuncu istisna kapsamında mı (asla silinmemeli)? */
function isProtected(p: Player): ExceptionReason {
  if (p.nationalityCode === 'TR') return { applied: true, why: 'Türk pazarı korunması' };
  if ((p.stats.maxTransferFeeEUR ?? 0) > 1_000_000) {
    return { applied: true, why: 'Piyasa değeri > 1M €' };
  }
  if (p.stats.nationalCaps >= 10) {
    return { applied: true, why: 'Milli takım kimliği (caps >= 10)' };
  }
  if ((p.clubs?.length ?? 0) >= 3) {
    return { applied: true, why: 'Kariyer dolu (3+ kulüp)' };
  }
  if (p.stats.totalGoals >= 50) {
    return { applied: true, why: 'Yüksek gol katkısı (50+)' };
  }
  if (p.stats.totalApps >= 200) {
    return { applied: true, why: 'Uzun kariyer (200+ maç)' };
  }
  return { applied: false };
}

/** Katman 1: hayalet kayıt mı? */
function isGhostRecord(p: Player): boolean {
  return (
    p.stats.totalApps === 0 &&
    (p.clubs?.length ?? 0) === 0 &&
    p.stats.nationalCaps === 0
  );
}

/** Katman 2: pozisyon-aware kritik eksiklik */
function failsPositionCheck(p: Player): string | null {
  const apps = p.stats.totalApps;
  const goals = p.stats.totalGoals;
  const clubs = p.clubs?.length ?? 0;
  const hasHeight = (p.heightCm ?? 0) > 0;
  const hasImage = !!p.imageUrl;

  switch (p.position) {
    case 'GK':
      // Kaleci: kimlik gösteren temel veri yoksa
      if (apps < 30 && !hasHeight && !hasImage) {
        return 'GK kimlik yok (apps<30, boy yok, foto yok)';
      }
      return null;
    case 'DEF':
    case 'MID':
      // Orta saha/defans: az maç + hiç gol + 1-2 kulüp
      if (apps < 20 && goals === 0 && clubs < 2) {
        return `${p.position} yetersiz veri (apps<20, gol=0, kulüp<2)`;
      }
      return null;
    case 'FWD':
      // Forvet: gol YOKSA ve az maç → bilgi yetersiz
      if (goals === 0 && apps < 50) {
        return 'FWD gol yok ve apps<50';
      }
      return null;
  }
  return null;
}

async function main() {
  if (!existsSync(SEED_PLAYERS)) {
    console.error('[qualityFilter] seed/players.json yok');
    process.exit(1);
  }
  const seed = JSON.parse(await readFile(SEED_PLAYERS, 'utf8')) as Player[];
  console.log(`[qualityFilter] toplam: ${seed.length}`);

  const toRemove: RemovalRecord[] = [];
  const protectedCount: Record<string, number> = {};

  let ghostCount = 0;
  let positionFailCount = 0;
  let protectedFromPositionFail = 0;
  let protectedFromGhost = 0;

  for (const p of seed) {
    const ghost = isGhostRecord(p);
    const posFail = failsPositionCheck(p);
    const isCandidate = ghost || posFail !== null;
    if (!isCandidate) continue;

    const protection = isProtected(p);
    if (protection.applied) {
      // Bu oyuncu istisna kapsamında — silmiyoruz
      if (ghost) protectedFromGhost++;
      if (posFail) protectedFromPositionFail++;
      protectedCount[protection.why!] = (protectedCount[protection.why!] ?? 0) + 1;
      continue;
    }

    let reason: string;
    if (ghost) {
      reason = 'Hayalet kayıt (apps=0, clubs=0, nat=0)';
      ghostCount++;
    } else {
      reason = posFail!;
      positionFailCount++;
    }

    toRemove.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      birthYear: p.birthDate?.slice(0, 4) ?? '?',
      position: p.position,
      nationalityCode: p.nationalityCode,
      totalApps: p.stats.totalApps,
      totalGoals: p.stats.totalGoals,
      totalAssists: p.stats.totalAssists,
      nationalCaps: p.stats.nationalCaps,
      clubsCount: p.clubs?.length ?? 0,
      jerseyCount: p.jerseyNumbers?.length ?? 0,
      hasHeight: (p.heightCm ?? 0) > 0,
      hasFoot: !!p.preferredFoot,
      hasImage: !!p.imageUrl,
      hasCoord: typeof p.birthLat === 'number',
      hasMarketValue: (p.stats.maxTransferFeeEUR ?? 0) > 0,
      reason,
    });
  }

  // Sıralama: pozisyona göre, sonra çıkarılma sebebine
  toRemove.sort((a, b) => {
    if (a.position !== b.position) return a.position.localeCompare(b.position);
    return a.name.localeCompare(b.name);
  });

  // Pozisyon dağılımı
  const byPos: Record<string, number> = {};
  for (const r of toRemove) byPos[r.position] = (byPos[r.position] ?? 0) + 1;

  // Ülke dağılımı (top 10)
  const byNat: Record<string, number> = {};
  for (const r of toRemove) byNat[r.nationalityCode] = (byNat[r.nationalityCode] ?? 0) + 1;
  const topNats = Object.entries(byNat).sort((a, b) => b[1] - a[1]).slice(0, 15);

  // Doğum yılı dağılımı
  const byDecade: Record<string, number> = {};
  for (const r of toRemove) {
    const decade = Math.floor(parseInt(r.birthYear, 10) / 10) * 10;
    if (!Number.isNaN(decade)) byDecade[`${decade}s`] = (byDecade[`${decade}s`] ?? 0) + 1;
  }

  await writeFile(OUT_FILE, JSON.stringify({
    summary: {
      totalPlayers: seed.length,
      ghostRecords: ghostCount,
      positionFails: positionFailCount,
      totalToRemove: toRemove.length,
      protectedFromGhost,
      protectedFromPositionFail,
      protectedReasons: protectedCount,
      remainingAfterRemoval: seed.length - toRemove.length,
      removalPct: ((toRemove.length / seed.length) * 100).toFixed(2),
    },
    byPosition: byPos,
    byNationality: Object.fromEntries(topNats),
    byBirthDecade: byDecade,
    players: toRemove,
  }, null, 2));

  console.log('\n=== ÖZET ===');
  console.log(`Total oyuncu: ${seed.length}`);
  console.log(`Hayalet kayıt aday: ${ghostCount + protectedFromGhost}`);
  console.log(`  → ${ghostCount} silinecek, ${protectedFromGhost} istisna ile korunuyor`);
  console.log(`Pozisyon-aware kritik eksiklik aday: ${positionFailCount + protectedFromPositionFail}`);
  console.log(`  → ${positionFailCount} silinecek, ${protectedFromPositionFail} istisna ile korunuyor`);
  console.log(`\nTOPLAM SİLİNECEK: ${toRemove.length} (${((toRemove.length / seed.length) * 100).toFixed(2)}%)`);
  console.log(`KALAN: ${seed.length - toRemove.length}`);

  console.log('\nİstisna sebepleri:');
  for (const [why, count] of Object.entries(protectedCount)) {
    console.log(`  ${why}: ${count}`);
  }

  console.log('\nSilinecek - pozisyon dağılımı:');
  for (const [pos, n] of Object.entries(byPos)) console.log(`  ${pos}: ${n}`);

  console.log('\nSilinecek - ilk 15 ülke:');
  for (const [n, c] of topNats) console.log(`  ${n}: ${c}`);

  console.log('\nSilinecek - doğum on yılı dağılımı:');
  for (const [d, c] of Object.entries(byDecade).sort()) console.log(`  ${d}: ${c}`);

  console.log('\n=== SİLİNECEK ÖRNEKLER (ilk 20) ===');
  for (const r of toRemove.slice(0, 20)) {
    console.log(`  ${r.name.padEnd(30)} (${r.birthYear}, ${r.position}, ${r.nationalityCode}) | apps=${r.totalApps} goals=${r.totalGoals} clubs=${r.clubsCount} | ${r.reason}`);
  }
  if (toRemove.length > 20) {
    console.log(`  ... ve ${toRemove.length - 20} daha (tam liste: ${OUT_FILE})`);
  }
}

main().catch((e) => {
  console.error('[qualityFilter] fatal:', e);
  process.exit(1);
});
