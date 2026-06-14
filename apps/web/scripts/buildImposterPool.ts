/**
 * kariyer-havuz.txt ilk 585 oyuncuyu players.json ID'lerine eşle → imposterPool.json.
 * Bant: rank 1-300 (tierA) + 301-585 (tierB). Runtime ağırlık (60/40) motorda
 * (`pickSecretFromPool`). İmposter gizli futbolcusu BU havuzdan çıkar (rastgele değil).
 *
 * NE ZAMAN ÇALIŞTIR: kariyer-havuz.txt sıralaması/içeriği değişince. Çalıştır:
 *   cd apps/web && pnpm build:imposter-pool
 * Çıktı `public/data/imposterPool.json` git'e commit edilir (runtime fs'ten okur).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Player } from '@futbol-kart/shared-types';

const players = JSON.parse(
  readFileSync(join(process.cwd(), 'public', 'data', 'players.json'), 'utf8'),
) as Player[];

const txt = readFileSync(join(process.cwd(), '..', '..', 'kariyer-havuz.txt'), 'utf8');
const lines = txt.split(/\r?\n/);

// Satırları parse et: "# | İsim | Milliyet | cap | değer". İlk 585 oyuncu (rank).
interface Row { rank: number; name: string; nat: string }
const rows: Row[] = [];
for (const ln of lines) {
  const m = ln.match(/^\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
  if (!m) continue;
  const rank = Number(m[1]);
  if (rank < 1 || rank > 585) continue;
  rows.push({ rank, name: m[2]!.trim(), nat: m[3]!.trim() });
}
rows.sort((a, b) => a.rank - b.rank);
console.log(`Parse edilen oyuncu (rank 1-585): ${rows.length}`);

// İsim normalize (eşleştirme için): küçült + aksan kaldır + boşluk sadeleştir.
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // aksanları kaldır
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// players.json: normalize edilmiş ad → id (displayName + name ikisi de indekslenir).
const byName = new Map<string, Player>();
for (const p of players) {
  for (const nm of [p.displayName, p.name]) {
    if (nm) {
      const k = norm(nm);
      if (!byName.has(k)) byName.set(k, p);
    }
  }
}

const resolved: Array<{ id: string; rank: number }> = [];
const unmatched: Row[] = [];
for (const r of rows) {
  const hit = byName.get(norm(r.name));
  if (hit) resolved.push({ id: hit.id, rank: r.rank });
  else unmatched.push(r);
}

console.log(`Eşleşen: ${resolved.length}/${rows.length}`);
if (unmatched.length) {
  console.log(`Eşleşmeyen (${unmatched.length}):`, unmatched.slice(0, 40).map((u) => `${u.rank}:${u.name}`).join(', '));
}

// Bant ayrımı (rank'e göre): A = 1-300, B = 301-585.
const tierA = resolved.filter((r) => r.rank <= 300).map((r) => r.id);
const tierB = resolved.filter((r) => r.rank > 300).map((r) => r.id);
console.log(`Tier A (1-300): ${tierA.length} · Tier B (301-585): ${tierB.length}`);

const out = { generatedFrom: 'kariyer-havuz.txt (rank 1-585)', tierA, tierB };
const outPath = join(process.cwd(), 'public', 'data', 'imposterPool.json');
writeFileSync(outPath, JSON.stringify(out));
console.log(`Yazıldı: ${outPath}`);
