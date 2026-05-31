import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Player } from '@futbol-kart/shared-types';
import { TEMPLATES, templateApplicable } from '@futbol-kart/question-templates';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const PLAYERS_FILE = resolve(PROJECT_ROOT, 'apps/web/public/data/players.json');

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function colorPct(pct: number): string {
  if (pct >= 80) return `\x1b[32m${pct.toFixed(0)}%\x1b[0m`;
  if (pct >= 50) return `\x1b[33m${pct.toFixed(0)}%\x1b[0m`;
  return `\x1b[31m${pct.toFixed(0)}%\x1b[0m`;
}

function main(): void {
  let players: Player[];
  try {
    players = JSON.parse(readFileSync(PLAYERS_FILE, 'utf8'));
  } catch {
    console.error(`\x1b[31m[report]\x1b[0m players.json not found at ${PLAYERS_FILE}`);
    console.error('  Run \x1b[1mpnpm --filter @futbol-kart/data-pipeline build\x1b[0m first.');
    process.exit(1);
  }

  const total = players.length;
  console.log(`\n\x1b[1mTemplate coverage report\x1b[0m  (${total} players, ${TEMPLATES.length} templates)\n`);
  console.log(pad('template', 36), pad('category', 10), pad('applicable', 12), 'coverage');
  console.log('-'.repeat(80));

  const lowCoverage: string[] = [];
  const byCategory: Record<string, { total: number; ok: number }> = {};

  for (const t of TEMPLATES) {
    const ok = players.filter((p) => templateApplicable(t, p)).length;
    const pct = ok / total;
    const threshold = t.minPoolCoverage ?? 0.8;
    const okStatus = pct >= threshold ? 'OK' : 'LOW';
    console.log(
      pad(t.id, 36),
      pad(t.category, 10),
      pad(`${ok}/${total}`, 12),
      colorPct(pct * 100),
      `(eşik: ${(threshold * 100).toFixed(0)}%)`,
      okStatus === 'LOW' ? '\x1b[31m!\x1b[0m' : '',
    );
    if (okStatus === 'LOW') {
      lowCoverage.push(`${t.id} (${(pct * 100).toFixed(0)}% < eşik ${(threshold * 100).toFixed(0)}%)`);
    }
    byCategory[t.category] ??= { total: 0, ok: 0 };
    byCategory[t.category]!.total++;
    if (okStatus !== 'LOW') byCategory[t.category]!.ok++;
  }

  console.log();
  console.log('\x1b[1mKategori bazında:\x1b[0m');
  for (const [cat, c] of Object.entries(byCategory)) {
    console.log(`  ${pad(cat, 12)} ${c.ok}/${c.total} eşik üstü`);
  }

  console.log();
  if (lowCoverage.length === 0) {
    console.log('\x1b[32mTüm şablonlar kendi eşiklerini geçti. Hazır.\x1b[0m');
  } else {
    console.log(`\x1b[33m${lowCoverage.length} şablon eşiğin altında:\x1b[0m`);
    for (const w of lowCoverage) console.log(`  - ${w}`);
  }
}

main();
