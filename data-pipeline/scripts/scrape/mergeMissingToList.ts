/**
 * cache/missing-resolved.json'daki tmId'leri cache/list.json'a ekler.
 *
 * - matched: doğrudan ekle
 * - ambiguous: best score'lu adayı ekle (ileride manuel düzeltilebilir)
 * - not_found: atla
 *
 * Mevcut list'te olanlar atlanır (scrape:players resumable).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TmListEntry } from './list.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', '..', 'cache');
const LIST_FILE = join(CACHE_DIR, 'list.json');
const RESOLVED_FILE = join(CACHE_DIR, 'missing-resolved.json');

interface ResolveEntry {
  manual: { name: string };
  status: 'matched' | 'ambiguous' | 'not_found';
  tmId?: number;
  matchedName?: string;
  profilePath?: string;
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function main() {
  const list = (await readJson<TmListEntry[]>(LIST_FILE)) ?? [];
  const resolved = (await readJson<Record<string, ResolveEntry>>(RESOLVED_FILE)) ?? {};

  const seenIds = new Set(list.map((e) => e.tmId));
  let added = 0;
  let skippedExisting = 0;
  let skippedAmbiguous = 0;
  let skippedNotFound = 0;

  for (const entry of Object.values(resolved)) {
    if (entry.status === 'not_found') {
      skippedNotFound++;
      continue;
    }
    if (!entry.tmId) {
      skippedNotFound++;
      continue;
    }
    if (seenIds.has(entry.tmId)) {
      skippedExisting++;
      continue;
    }
    list.push({
      tmId: entry.tmId,
      profilePath: entry.profilePath ?? `/legend/profil/spieler/${entry.tmId}`,
      name: entry.matchedName ?? entry.manual.name,
    });
    seenIds.add(entry.tmId);
    added++;
    if (entry.status === 'ambiguous') skippedAmbiguous++;
  }

  await writeFile(LIST_FILE, JSON.stringify(list, null, 2));
  console.log(`[mergeMissingToList] +${added} yeni (${skippedAmbiguous} ambig best-pick dahil)`);
  console.log(`  skipped existing: ${skippedExisting}`);
  console.log(`  skipped not_found: ${skippedNotFound}`);
  console.log(`  list.json toplam: ${list.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
