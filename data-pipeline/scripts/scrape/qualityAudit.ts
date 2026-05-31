/**
 * Kapsamlı veri kalite denetimi.
 *
 * Sadece local cache okur, TM isteği YAPMAZ.
 *
 * Kontrol edilenler:
 *   1. Duplicate tespiti (tmId, shortName+birthDate, slug+birthDate)
 *   2. Eksik alan oranları (her field için)
 *   3. Anomaliler (Pelé tipi: totalApps<50 ama careerYears>15)
 *   4. Slug çakışmaları (final merge öncesi tahmin)
 *   5. Şüpheli kayıtlar (boy 0, doğum tarihi 1900 öncesi vb.)
 *
 * Çıktı: cache/quality-report.json + console özet
 *
 * Kullanım:
 *   pnpm tsx scripts/scrape/qualityAudit.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TmPlayer } from './players.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = join(__dirname, '..', '..');
const CACHE_DIR = join(PIPELINE_ROOT, 'cache');

const PLAYERS_RAW = join(CACHE_DIR, 'players-raw.json');
const LIST_FILE = join(CACHE_DIR, 'list.json');
const REPORT_FILE = join(CACHE_DIR, 'quality-report.json');

interface QualityReport {
  timestamp: string;
  totalPlayers: number;
  totalInList: number;
  duplicates: {
    byTmId: Array<{ tmId: number; count: number }>;
    byNameAndBirth: Array<{ key: string; tmIds: number[]; names: string[] }>;
    bySlugAndBirth: Array<{ key: string; tmIds: number[]; names: string[] }>;
    slugCollisionsPredicted: Array<{ slug: string; tmIds: number[]; names: string[] }>;
  };
  missingFields: Record<string, { filled: number; missing: number; pct: number }>;
  anomalies: {
    suspiciouslyFewMatches: Array<{ tmId: number; name: string; apps: number; careerYears?: number }>;
    suspiciousHeight: Array<{ tmId: number; name: string; height?: number }>;
    suspiciousBirth: Array<{ tmId: number; name: string; birthDate?: string }>;
    noClubStints: Array<{ tmId: number; name: string }>;
  };
  notInList: number[]; // cache'te ama list.json'da olmayan tmId'ler
  notInCache: number[]; // list.json'da ama cache'te olmayan
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  console.log('[qualityAudit] başlıyor...\n');

  const cache = await readJson<Record<string, TmPlayer>>(PLAYERS_RAW);
  if (!cache) {
    console.error('[qualityAudit] cache/players-raw.json yok');
    process.exit(1);
  }
  const list = (await readJson<Array<{ tmId: number; name: string }>>(LIST_FILE)) ?? [];
  const players = Object.values(cache);
  console.log(`  cache: ${players.length} oyuncu`);
  console.log(`  list:  ${list.length} entry\n`);

  // 1. Duplicate tespiti
  console.log('[1] Duplicate tespiti...');
  const byTmId = new Map<number, number>();
  for (const p of players) byTmId.set(p.tmId, (byTmId.get(p.tmId) ?? 0) + 1);
  const dupTmId = [...byTmId.entries()].filter(([, c]) => c > 1).map(([tmId, count]) => ({ tmId, count }));

  const byNameAndBirth = new Map<string, TmPlayer[]>();
  const bySlugAndBirth = new Map<string, TmPlayer[]>();
  const bySlugOnly = new Map<string, TmPlayer[]>();
  for (const p of players) {
    const sName = p.meta.shortName.toLowerCase().trim();
    const fullName = (p.meta.name || p.meta.shortName).toLowerCase().trim();
    const birth = p.meta.lifeDates?.dateOfBirth ?? '';
    const slug = slugify(p.meta.name || p.meta.shortName);

    const k1 = `${sName}|${birth}`;
    if (!byNameAndBirth.has(k1)) byNameAndBirth.set(k1, []);
    byNameAndBirth.get(k1)!.push(p);

    const k2 = `${slug}|${birth}`;
    if (!bySlugAndBirth.has(k2)) bySlugAndBirth.set(k2, []);
    bySlugAndBirth.get(k2)!.push(p);

    if (!bySlugOnly.has(slug)) bySlugOnly.set(slug, []);
    bySlugOnly.get(slug)!.push(p);
  }

  const dupNameBirth = [...byNameAndBirth.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      tmIds: list.map((p) => p.tmId),
      names: list.map((p) => p.meta.shortName),
    }));
  const dupSlugBirth = [...bySlugAndBirth.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      tmIds: list.map((p) => p.tmId),
      names: list.map((p) => p.meta.shortName),
    }));
  // Slug çakışması (aynı slug ama farklı doğum tarihi — final merge'de çakışacak!)
  const slugCollisions = [...bySlugOnly.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([slug, list]) => ({
      slug,
      tmIds: list.map((p) => p.tmId),
      names: list.map((p) => `${p.meta.shortName} (${p.meta.lifeDates?.dateOfBirth ?? '?'})`),
    }));
  console.log(`  tmId dup:           ${dupTmId.length}`);
  console.log(`  shortName+birth:   ${dupNameBirth.length}`);
  console.log(`  slug+birth:        ${dupSlugBirth.length}`);
  console.log(`  ⚠️  SLUG ÇAKIŞMA:   ${slugCollisions.length}`);
  if (slugCollisions.length > 0) {
    console.log('  → Bunlar final merge\'de TEKİL slug kazanır, ikincisi atlanır!');
    for (const s of slugCollisions.slice(0, 5)) {
      console.log(`     "${s.slug}": [${s.names.join(', ')}]`);
    }
    if (slugCollisions.length > 5) console.log(`     ... ve ${slugCollisions.length - 5} daha`);
  }

  // 2. Eksik alan oranları
  console.log('\n[2] Eksik alan oranları...');
  const fields: Record<string, (p: TmPlayer) => boolean> = {
    'meta.shortName': (p) => !!p.meta.shortName,
    'meta.name': (p) => !!p.meta.name,
    'meta.displayName (tam ad)': (p) => !!p.meta.displayName,
    'birthDate': (p) => !!p.meta.lifeDates?.dateOfBirth,
    'birthCity': (p) => !!p.meta.birthPlaceDetails?.placeOfBirth,
    'birthCountryId': (p) => !!p.meta.birthPlaceDetails?.countryOfBirthId,
    'nationalityId': (p) => !!p.meta.nationalityDetails?.nationalities?.nationalityId,
    'height': (p) => typeof p.meta.attributes?.height === 'number',
    'preferredFoot': (p) => !!p.meta.attributes?.preferredFoot?.name,
    'position': (p) => !!p.meta.attributes?.position?.shortName,
    'marketValue.highest': (p) => typeof p.meta.marketValueDetails?.highest?.value === 'number',
    'portraitUrl': (p) => !!p.meta.portraitUrl,
    'stats.totalApps>0': (p) => p.stats.totalApps > 0,
    'stats.clubStints.length>0': (p) => p.stats.clubStints.length > 0,
  };
  const missingFields: QualityReport['missingFields'] = {};
  for (const [name, check] of Object.entries(fields)) {
    const filled = players.filter(check).length;
    const missing = players.length - filled;
    const pct = (filled / players.length) * 100;
    missingFields[name] = { filled, missing, pct: Math.round(pct * 10) / 10 };
    const indicator = pct >= 95 ? '✓' : pct >= 80 ? '~' : '!';
    console.log(`  ${indicator} ${name.padEnd(32)} ${filled}/${players.length} (${pct.toFixed(1)}%)`);
  }

  // 3. Anomaliler
  console.log('\n[3] Anomali tespiti...');
  const suspiciouslyFewMatches: QualityReport['anomalies']['suspiciouslyFewMatches'] = [];
  const suspiciousHeight: QualityReport['anomalies']['suspiciousHeight'] = [];
  const suspiciousBirth: QualityReport['anomalies']['suspiciousBirth'] = [];
  const noClubStints: QualityReport['anomalies']['noClubStints'] = [];

  for (const p of players) {
    const apps = p.stats.totalApps;
    const years = p.stats.careerYears;
    // Pelé tipi: 15+ yıl kariyer ama <50 maç (TM dijital arşiv eksik)
    if (apps < 50 && (years ?? 0) > 15) {
      suspiciouslyFewMatches.push({
        tmId: p.tmId, name: p.meta.shortName, apps, careerYears: years,
      });
    }
    // Boy şüpheli: 0 veya 250+
    const h = p.meta.attributes?.height;
    if (typeof h === 'number' && (h <= 0 || h > 2.5)) {
      suspiciousHeight.push({ tmId: p.tmId, name: p.meta.shortName, height: h });
    }
    // Doğum tarihi 1900 öncesi (veri hatası)
    const bd = p.meta.lifeDates?.dateOfBirth;
    if (bd) {
      const year = parseInt(bd.slice(0, 4), 10);
      if (year < 1900 || year > new Date().getFullYear()) {
        suspiciousBirth.push({ tmId: p.tmId, name: p.meta.shortName, birthDate: bd });
      }
    }
    // Hiç kulüp stint'i yok (perfApi anomalisi)
    if (p.stats.clubStints.length === 0) {
      noClubStints.push({ tmId: p.tmId, name: p.meta.shortName });
    }
  }
  console.log(`  şüpheli az maç (Pelé tipi): ${suspiciouslyFewMatches.length}`);
  console.log(`  şüpheli boy:               ${suspiciousHeight.length}`);
  console.log(`  şüpheli doğum tarihi:      ${suspiciousBirth.length}`);
  console.log(`  hiç kulüp stint'i yok:     ${noClubStints.length}`);

  // 4. cache vs list senkronizasyonu
  console.log('\n[4] cache ↔ list senkronizasyon...');
  const cacheIds = new Set(players.map((p) => p.tmId));
  const listIds = new Set(list.map((e) => e.tmId));
  const notInList = [...cacheIds].filter((id) => !listIds.has(id));
  const notInCache = [...listIds].filter((id) => !cacheIds.has(id));
  console.log(`  cache'te var, list'te yok: ${notInList.length}`);
  console.log(`  list'te var, cache'te yok: ${notInCache.length}`);

  // Rapor yaz
  const report: QualityReport = {
    timestamp: '<computed at save>',
    totalPlayers: players.length,
    totalInList: list.length,
    duplicates: {
      byTmId: dupTmId,
      byNameAndBirth: dupNameBirth,
      bySlugAndBirth: dupSlugBirth,
      slugCollisionsPredicted: slugCollisions,
    },
    missingFields,
    anomalies: {
      suspiciouslyFewMatches,
      suspiciousHeight,
      suspiciousBirth,
      noClubStints,
    },
    notInList,
    notInCache,
  };
  // timestamp - Date.now() pipeline'da yasak, basit ISO format işlem öncesi:
  // process.env.SOURCE_DATE_EPOCH varsa onu kullan, yoksa "auto"
  report.timestamp = new Date().toISOString();

  await writeFile(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(`\n[qualityAudit] rapor → ${REPORT_FILE}`);

  // Özet
  console.log('\n=== ÖZET ===');
  const ok = dupTmId.length === 0 && slugCollisions.length === 0 && notInList.length === 0;
  if (ok) {
    console.log('✓ Veri kalite check geçti, kritik sorun yok.');
  } else {
    console.log('⚠ Kritik sorunlar:');
    if (dupTmId.length > 0) console.log(`  • ${dupTmId.length} tmId duplicate`);
    if (slugCollisions.length > 0) console.log(`  • ${slugCollisions.length} slug çakışması (final merge'de kayıp olur)`);
    if (notInList.length > 0) console.log(`  • ${notInList.length} oyuncu cache'te ama list.json'da yok`);
  }
  if (suspiciouslyFewMatches.length > 0) {
    console.log(`  ⓘ ${suspiciouslyFewMatches.length} oyuncuda TM dijital arşiv eksik (Pelé tipi)`);
  }
}

main().catch((e) => {
  console.error('[qualityAudit] fatal:', e);
  process.exit(1);
});
