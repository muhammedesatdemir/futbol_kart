/**
 * seed/legend-candidates.json'daki isim listesini TM ID'lerine eşleyip
 * list.json'a ekler.
 *
 * resolveManualIds.ts'e benzer ama farklı kaynak (kürate liste, seed değil).
 * Doğum tarihi YOK — sadece isim search ile ilk hit alınır. Belirsiz olanlar
 * cache/legends-resolved.json'a "ambiguous" diye işaretlenir, manuel düzeltme bekler.
 *
 * Kullanım:
 *   pnpm tsx scripts/scrape/resolveLegends.ts
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { search } from './search.js';
import type { TmListEntry } from './list.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = join(__dirname, '..', '..');
const CANDIDATES_FILE = join(PIPELINE_ROOT, 'seed', 'legend-candidates.json');
const CACHE_DIR = join(PIPELINE_ROOT, 'cache');
const RESOLVED_FILE = join(CACHE_DIR, 'legends-resolved.json');
const LIST_FILE = join(CACHE_DIR, 'list.json');

interface ResolvedLegend {
  query: string;
  tmId?: number;
  profilePath?: string;
  resolvedName?: string;
  status: 'matched' | 'not_found';
}

interface Candidates {
  turkish_legends?: string[];
  world_legends_defenders_keepers?: string[];
  world_legends_midfielders_attackers?: string[];
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });

  const cand = await readJson<Candidates>(CANDIDATES_FILE);
  if (!cand) {
    console.error('[resolveLegends] seed/legend-candidates.json bulunamadı.');
    process.exit(1);
  }
  // Tüm kategori isimlerini birleştir
  const allNames = [
    ...(cand.turkish_legends ?? []),
    ...(cand.world_legends_defenders_keepers ?? []),
    ...(cand.world_legends_midfielders_attackers ?? []),
  ];
  console.log(`[resolveLegends] toplam ${allNames.length} efsane aday`);

  const resolved = (await readJson<Record<string, ResolvedLegend>>(RESOLVED_FILE)) ?? {};
  console.log(`[resolveLegends] cache'de ${Object.keys(resolved).length} çözülmüş kayıt`);

  const list = (await readJson<TmListEntry[]>(LIST_FILE)) ?? [];
  const existingIds = new Set(list.map((e) => e.tmId));
  console.log(`[resolveLegends] list.json'da ${existingIds.size} oyuncu`);

  let matched = 0;
  let cached = 0;
  let notFound = 0;
  let alreadyInList = 0;
  const newEntries: TmListEntry[] = [];

  for (let i = 0; i < allNames.length; i++) {
    const name = allNames[i]!;
    if (resolved[name] && resolved[name]!.status === 'matched') {
      const r = resolved[name]!;
      cached++;
      if (r.tmId && !existingIds.has(r.tmId)) {
        newEntries.push({
          tmId: r.tmId,
          profilePath: r.profilePath ?? `/legend/profil/spieler/${r.tmId}`,
          name: r.resolvedName ?? name,
        });
        existingIds.add(r.tmId);
      } else if (r.tmId) {
        alreadyInList++;
      }
      continue;
    }

    console.log(`[${i + 1}/${allNames.length}] ${name}`);
    try {
      const hits = await search(name, 3);
      if (hits.length === 0) {
        console.log(`  ! NOT FOUND`);
        resolved[name] = { query: name, status: 'not_found' };
        notFound++;
        continue;
      }
      const best = hits[0]!;
      console.log(`  ✓ tmId=${best.tmId} (${best.name})`);
      resolved[name] = {
        query: name,
        tmId: best.tmId,
        profilePath: best.profilePath,
        resolvedName: best.name,
        status: 'matched',
      };
      matched++;
      if (!existingIds.has(best.tmId)) {
        newEntries.push({
          tmId: best.tmId,
          profilePath: best.profilePath,
          name: best.name,
        });
        existingIds.add(best.tmId);
      } else {
        alreadyInList++;
      }
    } catch (err) {
      console.error(`  ! arama hatası:`, err instanceof Error ? err.message : err);
      notFound++;
    }

    // Her 5'te bir checkpoint
    if ((i + 1) % 5 === 0) {
      await writeFile(RESOLVED_FILE, JSON.stringify(resolved, null, 2));
    }
  }

  await writeFile(RESOLVED_FILE, JSON.stringify(resolved, null, 2));

  if (newEntries.length > 0) {
    const updated = [...list, ...newEntries];
    await writeFile(LIST_FILE, JSON.stringify(updated, null, 2));
    console.log(`\n[resolveLegends] list.json: +${newEntries.length} yeni (toplam ${updated.length})`);
  } else {
    console.log(`\n[resolveLegends] list.json değişmedi (hepsi mevcut)`);
  }

  console.log(`\n[resolveLegends] DONE.`);
  console.log(`  matched:        ${matched}`);
  console.log(`  cached:         ${cached}`);
  console.log(`  already in list: ${alreadyInList}`);
  console.log(`  not found:      ${notFound}`);
}

main().catch((e) => {
  console.error('[resolveLegends] fatal:', e);
  process.exit(1);
});
