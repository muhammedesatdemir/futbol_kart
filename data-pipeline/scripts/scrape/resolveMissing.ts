/**
 * Eksik manuel isimleri TM search ile çözüp tmId'lerini bulur.
 *
 * Input:
 *   - cache/manual-missing.json (diffManualNames.ts'in çıktısı)
 *
 * Strateji:
 *   1. Her eksik isim için TM search yap (cache'li)
 *   2. İlk 3 adayı al, isim normalize ile en iyi match'i seç
 *   3. Sonuçlarda farklılaşma:
 *      - matched      : tek aday net, tmId atandı
 *      - ambiguous    : birden fazla iyi aday, manuel onay
 *      - not_found    : 0 aday veya çok düşük benzerlik
 *
 * Resumable: cache/missing-resolved.json'a checkpoint yazılır.
 *
 * Çıktı:
 *   - cache/missing-resolved.json — { [normalizedKey]: ResolveEntry }
 *
 * Kullanım:
 *   pnpm tsx scripts/scrape/resolveMissing.ts
 *   pnpm tsx scripts/scrape/resolveMissing.ts --limit=100   (test için)
 *   pnpm tsx scripts/scrape/resolveMissing.ts --skip-existing-in-list
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TmListEntry } from './list.js';
import type { ManualName } from './parseManualLists.js';
import { normalizeForMatch } from './parseManualLists.js';
import { search, type SearchHit } from './search.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = join(__dirname, '..', '..');
const CACHE_DIR = join(PIPELINE_ROOT, 'cache');

const MISSING_FILE = join(CACHE_DIR, 'manual-missing.json');
const RESOLVED_FILE = join(CACHE_DIR, 'missing-resolved.json');
const LIST_FILE = join(CACHE_DIR, 'list.json');

interface ResolveEntry {
  manual: ManualName;
  status: 'matched' | 'ambiguous' | 'not_found';
  tmId?: number;
  matchedName?: string;
  profilePath?: string;
  /** Tüm adaylar (debug için) */
  candidates?: Array<{
    tmId: number;
    name: string;
    profilePath: string;
    score: number;
  }>;
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

/** Tokens karşılaştırması ile bir benzerlik skoru. */
function scoreCandidate(query: string, candidate: string): number {
  const q = normalizeForMatch(query);
  const c = normalizeForMatch(candidate);

  if (q === c) return 100;
  if (c.includes(q) || q.includes(c)) return 85;

  const qTokens = q.split(' ').filter((t) => t.length > 1);
  const cTokens = c.split(' ').filter((t) => t.length > 1);
  const common = qTokens.filter((t) => cTokens.includes(t));
  if (common.length === 0) return 0;

  // Her ortak token = 30 puan; soyad ortakksa bonus
  let score = common.length * 30;
  // Son token (soyad) ortaksa ekstra bonus
  if (qTokens.length > 0 && cTokens.length > 0) {
    const qLast = qTokens[qTokens.length - 1]!;
    const cLast = cTokens[cTokens.length - 1]!;
    if (qLast === cLast) score += 25;
  }
  return Math.min(score, 95);
}

function parseArgs(): { limit?: number; skipExistingInList: boolean } {
  const args = process.argv;
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : undefined;
  const skipExistingInList = args.includes('--skip-existing-in-list');
  return { limit, skipExistingInList };
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  const { limit, skipExistingInList } = parseArgs();

  const missing = await readJson<ManualName[]>(MISSING_FILE);
  if (!missing) {
    console.error('[resolveMissing] cache/manual-missing.json yok.');
    process.exit(1);
  }
  console.log(`[resolveMissing] eksik isim: ${missing.length}`);

  const resolved = (await readJson<Record<string, ResolveEntry>>(RESOLVED_FILE)) ?? {};
  console.log(`[resolveMissing] cache: ${Object.keys(resolved).length} çözülmüş`);

  const list = (await readJson<TmListEntry[]>(LIST_FILE)) ?? [];
  const existingIds = new Set(list.map((e) => e.tmId));

  const todo = missing.filter((m) => {
    if (resolved[m.normalizedKey]) return false;
    return true;
  });
  const limited = limit ? todo.slice(0, limit) : todo;
  console.log(`[resolveMissing] işlenecek: ${limited.length}${limit ? ' (limit)' : ''}`);

  let matched = 0;
  let ambiguous = 0;
  let notFound = 0;
  let alreadyInList = 0;

  for (let i = 0; i < limited.length; i++) {
    const m = limited[i]!;
    console.log(`[${i + 1}/${limited.length}] ${m.name}`);
    try {
      const hits = await search(m.name, 5);
      if (hits.length === 0) {
        resolved[m.normalizedKey] = { manual: m, status: 'not_found' };
        notFound++;
        console.log(`  ! NOT FOUND`);
      } else {
        const scored = hits
          .map((h) => ({
            tmId: h.tmId,
            name: h.name,
            profilePath: h.profilePath,
            score: scoreCandidate(m.name, h.name),
          }))
          .sort((a, b) => b.score - a.score);

        const best = scored[0]!;

        if (best.score >= 70) {
          resolved[m.normalizedKey] = {
            manual: m,
            status: 'matched',
            tmId: best.tmId,
            matchedName: best.name,
            profilePath: best.profilePath,
            candidates: scored,
          };
          matched++;
          if (skipExistingInList && existingIds.has(best.tmId)) alreadyInList++;
          console.log(`  ✓ tmId=${best.tmId} ${best.name} (score=${best.score})`);
        } else if (best.score >= 40) {
          resolved[m.normalizedKey] = {
            manual: m,
            status: 'ambiguous',
            tmId: best.tmId,
            matchedName: best.name,
            profilePath: best.profilePath,
            candidates: scored,
          };
          ambiguous++;
          console.log(`  ? AMBIGUOUS (best score=${best.score})`);
        } else {
          resolved[m.normalizedKey] = {
            manual: m,
            status: 'not_found',
            candidates: scored,
          };
          notFound++;
          console.log(`  ! NOT FOUND (best score=${best.score})`);
        }
      }
    } catch (err) {
      console.error(`  ! arama hatası:`, err instanceof Error ? err.message : err);
      resolved[m.normalizedKey] = { manual: m, status: 'not_found' };
      notFound++;
    }

    // Her 10 ismimizde checkpoint
    if ((i + 1) % 10 === 0) {
      await writeFile(RESOLVED_FILE, JSON.stringify(resolved, null, 2));
    }
  }

  await writeFile(RESOLVED_FILE, JSON.stringify(resolved, null, 2));

  console.log(`\n=== ÖZET ===`);
  console.log(`İşlenen:     ${limited.length}`);
  console.log(`  ✓ Matched: ${matched}`);
  console.log(`  ? Ambig:   ${ambiguous}`);
  console.log(`  ! Notfound:${notFound}`);
  if (skipExistingInList) {
    console.log(`  ↳ Zaten list.json'da: ${alreadyInList}`);
  }
  console.log(`Cache toplam: ${Object.keys(resolved).length}`);
  console.log(`Çıktı: ${RESOLVED_FILE}`);
}

main().catch((e) => {
  console.error('[resolveMissing] fatal:', e);
  process.exit(1);
});

// SearchHit import için
export type { SearchHit };
