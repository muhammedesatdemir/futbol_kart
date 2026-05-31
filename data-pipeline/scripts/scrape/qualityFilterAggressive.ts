/**
 * Agresif kalite filtre simülasyonu.
 *
 * 4 farklı strateji denenir, her birinin etkisi karşılaştırılır:
 *
 * STRATEJİ A (mevcut hafif): hayalet + pozisyon-aware temel
 * STRATEJİ B (orta): pozisyon-aware sıkı eşik
 * STRATEJİ C (sıkı): yüksek minimum apps + min gol
 * STRATEJİ D (en sıkı): "şampiyonluk veya yüksek kariyer" istisna
 *
 * Tüm stratejilerde istisnalar aynı:
 *   - TR vatandaşı
 *   - maxTransferFeeEUR > 1M
 *   - nationalCaps >= 10
 *   - totalGoals >= 50
 *   - totalApps >= 300 (sadece bu artırıldı, 200 → 300)
 *
 * Çıktı: 4 stratejinin etki tablosu + her birinin örnek silinecekler
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

function isProtected(p: Player): boolean {
  if (p.nationalityCode === 'TR') return true;
  if ((p.stats.maxTransferFeeEUR ?? 0) > 1_000_000) return true;
  if (p.stats.nationalCaps >= 10) return true;
  if (p.stats.totalGoals >= 50) return true;
  if (p.stats.totalApps >= 300) return true;
  // KULÜP SAYISI istisna kaldırıldı (3+ kulüp efsane olmayabilir)
  return false;
}

function isGhost(p: Player): boolean {
  return p.stats.totalApps === 0 && (p.clubs?.length ?? 0) === 0 && p.stats.nationalCaps === 0;
}

// Strateji A: hafif (mevcut)
function strategyA(p: Player): string | null {
  if (isGhost(p)) return 'Hayalet';
  const apps = p.stats.totalApps;
  const goals = p.stats.totalGoals;
  const clubs = p.clubs?.length ?? 0;
  switch (p.position) {
    case 'GK':
      if (apps < 30 && !p.heightCm && !p.imageUrl) return 'GK kimlik yok';
      return null;
    case 'DEF':
    case 'MID':
      if (apps < 20 && goals === 0 && clubs < 2) return 'DEF/MID yetersiz';
      return null;
    case 'FWD':
      if (goals === 0 && apps < 50) return 'FWD gol yok';
      return null;
  }
  return null;
}

// Strateji B: orta
function strategyB(p: Player): string | null {
  if (isGhost(p)) return 'Hayalet';
  const apps = p.stats.totalApps;
  const goals = p.stats.totalGoals;
  switch (p.position) {
    case 'GK':
      if (apps < 50) return 'GK apps<50';
      return null;
    case 'DEF':
      if (apps < 50 && goals === 0) return 'DEF apps<50 + gol=0';
      return null;
    case 'MID':
      if (apps < 80 && goals < 5) return 'MID apps<80 + gol<5';
      return null;
    case 'FWD':
      if (goals < 10 && apps < 100) return 'FWD gol<10 + apps<100';
      return null;
  }
  return null;
}

// Strateji C: sıkı
function strategyC(p: Player): string | null {
  if (isGhost(p)) return 'Hayalet';
  const apps = p.stats.totalApps;
  const goals = p.stats.totalGoals;
  switch (p.position) {
    case 'GK':
      if (apps < 80) return 'GK apps<80';
      return null;
    case 'DEF':
      if (apps < 100) return 'DEF apps<100';
      return null;
    case 'MID':
      if (apps < 100 || goals < 10) return 'MID apps<100 veya gol<10';
      return null;
    case 'FWD':
      if (apps < 100 || goals < 20) return 'FWD apps<100 veya gol<20';
      return null;
  }
  return null;
}

// Strateji D: en sıkı
function strategyD(p: Player): string | null {
  if (isGhost(p)) return 'Hayalet';
  const apps = p.stats.totalApps;
  const goals = p.stats.totalGoals;
  // Her pozisyon için minimum: 150 maç VEYA güçlü gol
  switch (p.position) {
    case 'GK':
      if (apps < 150) return 'GK apps<150';
      return null;
    case 'DEF':
      if (apps < 150) return 'DEF apps<150';
      return null;
    case 'MID':
      if (apps < 150 || goals < 15) return 'MID apps<150 veya gol<15';
      return null;
    case 'FWD':
      if (goals < 30) return 'FWD gol<30';
      return null;
  }
  return null;
}

async function main() {
  const seed = JSON.parse(await readFile(SEED_PLAYERS, 'utf8')) as Player[];
  const total = seed.length;
  console.log(`Toplam: ${total}\n`);

  const strategies = [
    { name: 'A (hafif - mevcut)', fn: strategyA },
    { name: 'B (orta)', fn: strategyB },
    { name: 'C (sıkı)', fn: strategyC },
    { name: 'D (en sıkı)', fn: strategyD },
  ];

  console.log('| Strateji | Aday | Korunan (TR) | Silinecek | Kalan |');
  console.log('|---|---|---|---|---|');
  const results: Array<{ name: string; toRemove: Player[] }> = [];
  for (const s of strategies) {
    let candidates = 0;
    let protectedCount = 0;
    let protectedTR = 0;
    const toRemove: Player[] = [];
    for (const p of seed) {
      const reason = s.fn(p);
      if (!reason) continue;
      candidates++;
      if (isProtected(p)) {
        protectedCount++;
        if (p.nationalityCode === 'TR') protectedTR++;
        continue;
      }
      toRemove.push(p);
    }
    results.push({ name: s.name, toRemove });
    const removeCount = toRemove.length;
    console.log(`| ${s.name} | ${candidates} | ${protectedCount} (TR:${protectedTR}) | ${removeCount} (${((removeCount / total) * 100).toFixed(2)}%) | ${total - removeCount} |`);
  }

  console.log('\n=== POZİSYON DAĞILIMLARI ===');
  for (const r of results) {
    const byPos: Record<string, number> = {};
    for (const p of r.toRemove) byPos[p.position] = (byPos[p.position] ?? 0) + 1;
    console.log(`  ${r.name}:`, byPos);
  }

  console.log('\n=== DOĞUM ON YILI DAĞILIMI ===');
  for (const r of results) {
    const byDecade: Record<string, number> = {};
    for (const p of r.toRemove) {
      const d = Math.floor(parseInt(p.birthDate?.slice(0, 4) ?? '0', 10) / 10) * 10;
      if (d) byDecade[`${d}s`] = (byDecade[`${d}s`] ?? 0) + 1;
    }
    console.log(`  ${r.name}:`);
    for (const [d, c] of Object.entries(byDecade).sort()) console.log(`    ${d}: ${c}`);
  }

  // Her strateji için ilk 5 örnek
  console.log('\n=== STRATEJİ C ÖRNEKLERİ (ilk 30) ===');
  const strategyCResult = results[2]!;
  for (const p of strategyCResult.toRemove.slice(0, 30)) {
    console.log(`  ${p.name.padEnd(35)} (${p.birthDate?.slice(0, 4)}, ${p.position}, ${p.nationalityCode}) apps=${p.stats.totalApps} goals=${p.stats.totalGoals} clubs=${p.clubs?.length ?? 0}`);
  }

  // Rapor yaz
  const out = join(CACHE_DIR, 'quality-strategy-comparison.json');
  await writeFile(out, JSON.stringify({
    total,
    strategies: results.map((r) => ({
      name: r.name,
      removeCount: r.toRemove.length,
      remaining: total - r.toRemove.length,
      players: r.toRemove.slice(0, 100).map((p) => ({
        slug: p.slug, name: p.name, year: p.birthDate?.slice(0, 4), pos: p.position, nat: p.nationalityCode,
        apps: p.stats.totalApps, goals: p.stats.totalGoals, clubs: p.clubs?.length ?? 0,
      })),
    })),
  }, null, 2));
  console.log(`\nRapor: ${out}`);
}

main();
