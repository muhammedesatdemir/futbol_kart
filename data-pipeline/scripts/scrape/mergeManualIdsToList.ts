/**
 * cache/manual-ids.json'daki 49 tmId'yi cache/list.json'a ekler.
 *
 * - Duplicate (top 25 listede zaten varsa) atlanır.
 * - profilePath manuel-ids'te yok → minimal path üret (scrape:players kullanmıyor zaten).
 *
 * Çalıştırma:
 *   pnpm tsx scripts/scrape/mergeManualIdsToList.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TmListEntry } from './list.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', '..', 'cache');
const LIST_FILE = join(CACHE_DIR, 'list.json');
const MANUAL_IDS = join(CACHE_DIR, 'manual-ids.json');

interface ManualId {
  slug: string;
  name: string;
  birthDate: string;
  tmId?: number;
  status: string;
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function main() {
  const list = (await readJson<TmListEntry[]>(LIST_FILE)) ?? [];
  const manuals = (await readJson<Record<string, ManualId>>(MANUAL_IDS)) ?? {};
  const seenIds = new Set(list.map((e) => e.tmId));

  let added = 0;
  let skipped = 0;
  for (const m of Object.values(manuals)) {
    if (!m.tmId || m.status !== 'matched') {
      skipped++;
      continue;
    }
    if (seenIds.has(m.tmId)) {
      skipped++;
      continue;
    }
    list.push({
      tmId: m.tmId,
      profilePath: `/${m.slug}/profil/spieler/${m.tmId}`,
      name: m.name,
    });
    seenIds.add(m.tmId);
    added++;
  }

  await writeFile(LIST_FILE, JSON.stringify(list, null, 2));
  console.log(`[mergeManualIdsToList] +${added} eklendi, ${skipped} atlandı`);
  console.log(`[mergeManualIdsToList] yeni toplam: ${list.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
