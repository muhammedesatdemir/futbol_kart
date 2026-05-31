/**
 * seed/players.json içindeki duplicate oyuncuları tespit eder.
 *
 * Kriter (sıralı):
 *   1. tmId (clubStint slug'larından çıkarılır + manual-ids.json'dan eşlenir)
 *   2. name + birthDate + nationalityCode üçlüsü
 *   3. name + birthDate (gevşek kontrol)
 *
 * Çıktı: cache/duplicate-report.json
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
const OUT_FILE = join(CACHE_DIR, 'duplicate-report.json');

interface DupeGroup {
  key: string;
  reason: 'name+birth+nat' | 'name+birth';
  players: Array<{
    id: string;
    slug: string;
    name: string;
    displayName: string;
    birthDate: string;
    nationalityCode: string;
    hasClubs: boolean;
    clubsCount: number;
    appsTotal: number;
  }>;
}

function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  if (!existsSync(SEED_PLAYERS)) {
    console.error('[duplicateReport] seed/players.json yok');
    process.exit(1);
  }
  const seed = JSON.parse(await readFile(SEED_PLAYERS, 'utf8')) as Player[];
  console.log(`[duplicateReport] toplam: ${seed.length}`);

  // Group by name+birth+nat (strict)
  const byStrict = new Map<string, Player[]>();
  // Group by name+birth (loose)
  const byLoose = new Map<string, Player[]>();

  for (const p of seed) {
    const nm = normName(p.name || p.displayName);
    const strictKey = `${nm}|${p.birthDate}|${p.nationalityCode}`;
    const looseKey = `${nm}|${p.birthDate}`;
    (byStrict.get(strictKey) ?? byStrict.set(strictKey, []).get(strictKey)!).push(p);
    (byLoose.get(looseKey) ?? byLoose.set(looseKey, []).get(looseKey)!).push(p);
  }

  // Sadece 2+ olanlar duplicate
  const strictDupes: DupeGroup[] = [];
  for (const [key, players] of byStrict) {
    if (players.length < 2) continue;
    strictDupes.push({
      key,
      reason: 'name+birth+nat',
      players: players.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        displayName: p.displayName,
        birthDate: p.birthDate,
        nationalityCode: p.nationalityCode,
        hasClubs: p.clubs && p.clubs.length > 0,
        clubsCount: p.clubs?.length ?? 0,
        appsTotal: p.stats?.totalApps ?? 0,
      })),
    });
  }

  // Loose ama strict'te olmayan
  const strictKeys = new Set(strictDupes.map((d) => d.key));
  const looseDupes: DupeGroup[] = [];
  for (const [key, players] of byLoose) {
    if (players.length < 2) continue;
    // Bu loose key altında farklı milliyet kodu olan duplicate'ları yakalar
    // (örn. ikili vatandaş, kayıt hatası)
    const nats = new Set(players.map((p) => p.nationalityCode));
    if (nats.size === 1) continue; // strict zaten yakaladı
    looseDupes.push({
      key,
      reason: 'name+birth',
      players: players.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        displayName: p.displayName,
        birthDate: p.birthDate,
        nationalityCode: p.nationalityCode,
        hasClubs: p.clubs && p.clubs.length > 0,
        clubsCount: p.clubs?.length ?? 0,
        appsTotal: p.stats?.totalApps ?? 0,
      })),
    });
  }

  // Slug duplicate kontrolü (zaten merge'de çakışma çözüldü ama emin olalım)
  const bySlug = new Map<string, Player[]>();
  for (const p of seed) {
    (bySlug.get(p.slug) ?? bySlug.set(p.slug, []).get(p.slug)!).push(p);
  }
  const slugDupes = [...bySlug.entries()].filter(([, list]) => list.length > 1);

  await writeFile(OUT_FILE, JSON.stringify({
    summary: {
      totalPlayers: seed.length,
      strictDuplicateGroups: strictDupes.length,
      strictDuplicatePlayers: strictDupes.reduce((s, g) => s + g.players.length, 0),
      strictExtraPlayersToRemove: strictDupes.reduce((s, g) => s + (g.players.length - 1), 0),
      looseDuplicateGroups: looseDupes.length,
      slugDuplicateGroups: slugDupes.length,
    },
    strictDupes,
    looseDupes,
    slugDupes: slugDupes.map(([slug, list]) => ({ slug, count: list.length })),
  }, null, 2));

  // Konsol özet
  console.log('\n=== ÖZET ===');
  console.log(`Strict duplicate grup (name+birth+nat):   ${strictDupes.length}`);
  console.log(`  → toplam kayıt:                          ${strictDupes.reduce((s, g) => s + g.players.length, 0)}`);
  console.log(`  → temizlenince çıkarılacak fazla kayıt:  ${strictDupes.reduce((s, g) => s + (g.players.length - 1), 0)}`);
  console.log(`Loose duplicate (name+birth, farklı nat): ${looseDupes.length}`);
  console.log(`Slug duplicate (kritik bug):              ${slugDupes.length}`);

  console.log('\n=== STRICT DUPE ÖRNEKLERİ (ilk 10) ===');
  for (const g of strictDupes.slice(0, 10)) {
    console.log(`\n${g.key}:`);
    for (const p of g.players) {
      console.log(`  ${p.slug.padEnd(35)} | apps=${String(p.appsTotal).padStart(4)} | clubs=${p.clubsCount}`);
    }
  }

  console.log(`\nRapor: ${OUT_FILE}`);
}

main().catch((e) => {
  console.error('[duplicateReport] fatal:', e);
  process.exit(1);
});
