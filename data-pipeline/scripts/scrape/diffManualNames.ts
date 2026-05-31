/**
 * Manuel toplanmış isim listesini mevcut veri setiyle karşılaştırır.
 *
 * Input:
 *   - cache/manual-names.json (parseManualLists.ts'in çıktısı)
 *   - cache/players-raw.json   (mevcut TM scrape verisi)
 *
 * Match stratejisi (sıralı):
 *   1. Tam normalize edilmiş isim eşleşmesi
 *   2. shortName ile karşılaştırma
 *   3. displayName (tam ad) ile karşılaştırma
 *   4. Soyad token eşleşmesi + ilk harf
 *
 * Output:
 *   - cache/manual-matched.json    — zaten veride var olan isimler
 *   - cache/manual-missing.json    — eksik (TM'den çekilmesi gerekir)
 *   - cache/manual-ambiguous.json  — birden fazla aday (manuel onay)
 *
 * TM isteği YAPMAZ.
 *
 * Kullanım:
 *   pnpm tsx scripts/scrape/diffManualNames.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TmPlayer } from './players.js';
import { normalizeForMatch, type ManualName } from './parseManualLists.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = join(__dirname, '..', '..');
const CACHE_DIR = join(PIPELINE_ROOT, 'cache');

const MANUAL_NAMES_FILE = join(CACHE_DIR, 'manual-names.json');
const PLAYERS_RAW_FILE = join(CACHE_DIR, 'players-raw.json');
const OUT_MATCHED = join(CACHE_DIR, 'manual-matched.json');
const OUT_MISSING = join(CACHE_DIR, 'manual-missing.json');
const OUT_AMBIGUOUS = join(CACHE_DIR, 'manual-ambiguous.json');

interface MatchResult {
  manual: ManualName;
  tmId: number;
  matchedName: string;
  matchType: 'exact' | 'shortName' | 'displayName' | 'lastnameToken';
}

interface AmbiguousResult {
  manual: ManualName;
  candidates: Array<{
    tmId: number;
    name: string;
    matchType: string;
  }>;
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

/** İsmin son kelimesi (soyad). */
function lastnameToken(name: string): string {
  const tokens = name.split(/\s+/);
  return tokens[tokens.length - 1]!;
}

/** İsmin ilk kelimesi (ad). */
function firstNameToken(name: string): string {
  return name.split(/\s+/)[0]!;
}

async function main() {
  console.log('[diffManualNames] başlıyor...');

  const manuals = await readJson<ManualName[]>(MANUAL_NAMES_FILE);
  if (!manuals) {
    console.error('[diffManualNames] cache/manual-names.json yok. Önce parseManualLists.ts çalıştır.');
    process.exit(1);
  }

  const playersCache = await readJson<Record<string, TmPlayer>>(PLAYERS_RAW_FILE);
  if (!playersCache) {
    console.error('[diffManualNames] cache/players-raw.json yok.');
    process.exit(1);
  }
  const players = Object.values(playersCache);
  console.log(`[diffManualNames] manuel: ${manuals.length}, players: ${players.length}`);

  // İndeksler oluştur
  //  byExactName: tüm normalize isim varyantları → tmId
  const byExactName = new Map<string, number[]>();
  //  byLastname: soyad token → tmId
  const byLastname = new Map<string, number[]>();
  for (const p of players) {
    const candidates = new Set<string>();
    candidates.add(p.meta.shortName);
    if (p.meta.name) candidates.add(p.meta.name);
    if (p.meta.displayName) candidates.add(p.meta.displayName);
    if (p.meta.artistName) candidates.add(p.meta.artistName);

    for (const c of candidates) {
      const n = normalizeForMatch(c);
      if (!byExactName.has(n)) byExactName.set(n, []);
      byExactName.get(n)!.push(p.tmId);

      // Soyad
      const last = normalizeForMatch(lastnameToken(c));
      if (last.length >= 3) {
        if (!byLastname.has(last)) byLastname.set(last, []);
        byLastname.get(last)!.push(p.tmId);
      }
    }
  }

  const matched: MatchResult[] = [];
  const missing: ManualName[] = [];
  const ambiguous: AmbiguousResult[] = [];

  const tmById = new Map(players.map((p) => [p.tmId, p]));

  for (const m of manuals) {
    const key = m.normalizedKey;

    // 1. Tam isim eşleşmesi
    const exactHits = byExactName.get(key);
    if (exactHits && exactHits.length === 1) {
      const tmId = exactHits[0]!;
      matched.push({
        manual: m,
        tmId,
        matchedName: tmById.get(tmId)!.meta.shortName,
        matchType: 'exact',
      });
      continue;
    }
    if (exactHits && exactHits.length > 1) {
      // Birden fazla aday tam isim ile
      const uniqIds = [...new Set(exactHits)];
      if (uniqIds.length === 1) {
        const tmId = uniqIds[0]!;
        matched.push({
          manual: m,
          tmId,
          matchedName: tmById.get(tmId)!.meta.shortName,
          matchType: 'exact',
        });
        continue;
      }
      ambiguous.push({
        manual: m,
        candidates: uniqIds.map((id) => ({
          tmId: id,
          name: tmById.get(id)!.meta.shortName,
          matchType: 'exact',
        })),
      });
      continue;
    }

    // 2. Soyad + ilk harf eşleşmesi (örn. "M. Ozil" vs "Mesut Özil")
    const last = normalizeForMatch(lastnameToken(m.name));
    const first = normalizeForMatch(firstNameToken(m.name));
    if (last.length >= 3) {
      const lastHits = byLastname.get(last) ?? [];
      // Adayları daralt: ilk harf eşleşmeli ya da tek aday varsa direkt al
      const filtered = lastHits.filter((id) => {
        const p = tmById.get(id)!;
        const pFirstNormalized = normalizeForMatch(firstNameToken(p.meta.shortName));
        // İlk harf veya tam ad'da ortak bir token
        return pFirstNormalized.charAt(0) === first.charAt(0);
      });
      const uniqIds = [...new Set(filtered)];

      if (uniqIds.length === 1) {
        const tmId = uniqIds[0]!;
        matched.push({
          manual: m,
          tmId,
          matchedName: tmById.get(tmId)!.meta.shortName,
          matchType: 'lastnameToken',
        });
        continue;
      }
      if (uniqIds.length > 1 && uniqIds.length <= 5) {
        ambiguous.push({
          manual: m,
          candidates: uniqIds.map((id) => ({
            tmId: id,
            name: tmById.get(id)!.meta.shortName,
            matchType: 'lastnameToken',
          })),
        });
        continue;
      }
    }

    // Bulunamadı
    missing.push(m);
  }

  // Yaz
  await writeFile(OUT_MATCHED, JSON.stringify(matched, null, 2));
  await writeFile(OUT_MISSING, JSON.stringify(missing, null, 2));
  await writeFile(OUT_AMBIGUOUS, JSON.stringify(ambiguous, null, 2));

  // Özet
  console.log(`\n=== ÖZET ===`);
  console.log(`Manuel toplam:   ${manuals.length}`);
  console.log(`  ✓ Matched:     ${matched.length} (${((matched.length / manuals.length) * 100).toFixed(1)}%)`);
  console.log(`  ? Ambiguous:   ${ambiguous.length}`);
  console.log(`  ! Missing:     ${missing.length} (${((missing.length / manuals.length) * 100).toFixed(1)}%)`);

  // Match type dağılımı
  const byType: Record<string, number> = {};
  for (const m of matched) byType[m.matchType] = (byType[m.matchType] ?? 0) + 1;
  console.log(`\nMatch tipleri:`);
  for (const [t, n] of Object.entries(byType)) console.log(`  ${t}: ${n}`);

  console.log(`\nÇıktılar:`);
  console.log(`  ${OUT_MATCHED}`);
  console.log(`  ${OUT_MISSING}`);
  console.log(`  ${OUT_AMBIGUOUS}`);

  // Eksiklerin en çok popüler ilk 15'i (debug, beklemediğimiz şeyler varsa görelim)
  if (missing.length > 0) {
    console.log(`\nİlk 15 eksik (debug):`);
    for (const m of missing.slice(0, 15)) {
      console.log(`  ${m.name.padEnd(30)} → ${m.sourceContexts.slice(0, 2).join(' / ')}`);
    }
  }
}

main().catch((e) => {
  console.error('[diffManualNames] fatal:', e);
  process.exit(1);
});
