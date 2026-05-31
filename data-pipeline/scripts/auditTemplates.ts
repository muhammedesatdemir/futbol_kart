/**
 * ŞABLON SAĞLIK DENETİMİ
 *
 * Tüm soru şablonlarını GERÇEK veri seti (players.json) üzerinde simüle eder ve
 * "karşılaştıracak veri bulunamayan" / veri-soru uyumsuzluğu olan şablonları
 * tespit eder. Veri her değiştiğinde tekrar çalıştırılabilir:
 *
 *   pnpm --filter @futbol-kart/data-pipeline audit:templates
 *
 * Tespit edilen sorun tipleri:
 *   - KÜÇÜK_HAVUZ      : Şablonun uygulanabildiği oyuncu sayısı çok az.
 *   - TEK_DEĞER        : Numeric şablon havuzda tek bir değer üretiyor → hep tie.
 *   - BOOL_NADİR       : Bool şablonda "Evet" oranı çok düşük → pratikte hep tie.
 *   - BOOL_HİÇ_EVET    : Bool şablonda hiç "Evet" yok → soru çözülemez (KIRIK).
 *   - İKİSİ_NULL       : requiresFields geçtiği halde değer null çıkıyor (veri uyumsuzluğu).
 *   - YÜKSEK_TIE       : Numeric/proximity şablonda beklenmedik yüksek beraberlik.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Player } from '@futbol-kart/shared-types';
import {
  TEMPLATES,
  templateApplicable,
  resolveRound,
  computeValue,
  pickParams,
  type ResolverContext,
  type ClubLite,
} from '@futbol-kart/question-templates';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

const players: Player[] = JSON.parse(
  readFileSync(resolve(ROOT, 'apps/web/public/data/players.json'), 'utf8'),
);
const clubsRaw: ClubLite[] = JSON.parse(
  readFileSync(resolve(ROOT, 'apps/web/public/data/clubs.json'), 'utf8'),
);
const clubsById = new Map(clubsRaw.map((c) => [c.id, c]));

const PAIRS = 500; // şablon başına simüle edilen ikili
const MIN_POOL = 50; // bu sayının altında havuz uyarısı
const BOOL_RARE_PCT = 1.5; // bu yüzdenin altında "Evet" → nadir uyarısı
const NUM_TIE_PCT = 25; // numeric için bu yüzdenin üstünde tie → uyarı

// Deterministik PRNG (sonuç tekrar edilebilir)
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface Issue {
  id: string;
  category: string;
  op: string;
  pool: number;
  detail: string;
  severity: 'KIRIK' | 'UYARI';
}

const issues: Issue[] = [];
let cleanCount = 0;

for (const t of TEMPLATES) {
  const rng = mulberry32(hashStr(t.id));
  const ctx: ResolverContext = {
    clubsById,
    rng,
    params: t.params?.length ? pickParams(t, rng) : undefined,
  };
  const pool = players.filter((p) => templateApplicable(t, p));
  const localIssues: Issue[] = [];
  const mk = (severity: Issue['severity'], detail: string) =>
    localIssues.push({ id: t.id, category: t.category, op: t.compareOp, pool: pool.length, detail, severity });

  if (pool.length < MIN_POOL) {
    mk('UYARI', `KÜÇÜK_HAVUZ: yalnızca ${pool.length} oyuncu uygulanabilir`);
  }

  if (t.compareOp === 'bool') {
    // "Evet" diyen oyuncu oranı
    let yes = 0;
    let known = 0;
    for (const p of pool) {
      const v = computeValue(t, p, ctx);
      if (v === null) continue;
      known++;
      if (v === true) yes++;
    }
    const yesPct = known ? (yes / known) * 100 : 0;
    if (yes === 0) mk('KIRIK', `BOOL_HİÇ_EVET: ${pool.length} oyuncunun hiçbiri "Evet" değil`);
    else if (yesPct < BOOL_RARE_PCT)
      mk('UYARI', `BOOL_NADİR: yalnızca %${yesPct.toFixed(2)} oyuncu "Evet" (${yes}) → pratikte hep beraberlik`);
  } else {
    // Numeric/proximity: değer çeşitliliği + simüle tie oranı
    const valSet = new Set<string>();
    let known = 0;
    const sample = pool.length > 2000 ? sampleN(pool, rng, 2000) : pool;
    for (const p of sample) {
      const v = computeValue(t, p, ctx);
      if (v === null) continue;
      known++;
      valSet.add(typeof v === 'number' ? (Math.round(v * 10000) / 10000).toString() : String(v));
    }
    if (known > 0 && valSet.size <= 1)
      mk('KIRIK', `TEK_DEĞER: havuzda tek bir değer (${[...valSet][0]}) → hep beraberlik`);

    if (pool.length >= 2) {
      let ties = 0;
      let bothNull = 0;
      for (let i = 0; i < PAIRS; i++) {
        const a = pool[Math.floor(rng() * pool.length)]!;
        let b = pool[Math.floor(rng() * pool.length)]!;
        if (a === b) b = pool[(pool.indexOf(a) + 1) % pool.length]!;
        const r = resolveRound(t, a, b, ctx);
        if (r.winner === 'tie') ties++;
        if (r.p1Value === null && r.p2Value === null) bothNull++;
      }
      const tiePct = (ties / PAIRS) * 100;
      const bothNullPct = (bothNull / PAIRS) * 100;
      if (bothNullPct > 5)
        mk('UYARI', `İKİSİ_NULL: %${bothNullPct.toFixed(0)} ikilide iki taraf da null (veri uyumsuzluğu)`);
      if (tiePct > NUM_TIE_PCT)
        mk('UYARI', `YÜKSEK_TIE: %${tiePct.toFixed(0)} ikili beraberlikle bitiyor (farklı değer: ${valSet.size})`);
    }
  }

  if (localIssues.length === 0) cleanCount++;
  issues.push(...localIssues);
}

function sampleN<T>(arr: T[], rng: () => number, n: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(rng() * arr.length)]!);
  return out;
}

// ---- Rapor ----
const broken = issues.filter((i) => i.severity === 'KIRIK');
const warnings = issues.filter((i) => i.severity === 'UYARI');

console.log('='.repeat(96));
console.log(`ŞABLON DENETİMİ — ${TEMPLATES.length} şablon, ${players.length} oyuncu (ikili/şablon: ${PAIRS})`);
console.log('='.repeat(96));
console.log(`✅ Temiz: ${cleanCount}   🔴 Kırık: ${broken.length}   🟡 Uyarı: ${warnings.length}\n`);

if (broken.length) {
  console.log('🔴 KIRIK ŞABLONLAR (acil):');
  for (const i of broken) console.log(`  [${i.id}] (${i.category}/${i.op}, havuz=${i.pool})  ${i.detail}`);
  console.log('');
}
if (warnings.length) {
  console.log('🟡 UYARILAR (gözden geçir):');
  for (const i of warnings) console.log(`  [${i.id}] (${i.category}/${i.op}, havuz=${i.pool})  ${i.detail}`);
  console.log('');
}

// CI/exit: kırık şablon varsa hata kodu döndür
if (broken.length > 0) {
  console.error(`\n❌ ${broken.length} kırık şablon bulundu.`);
  process.exit(1);
}
console.log('✔️  Kırık şablon yok.');
