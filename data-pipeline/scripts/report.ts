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
  for (const t of TEMPLATES) {
    const ok = players.filter((p) => templateApplicable(t, p)).length;
    const pct = (ok / total) * 100;
    console.log(
      pad(t.id, 36),
      pad(t.category, 10),
      pad(`${ok}/${total}`, 12),
      colorPct(pct),
    );
    if (pct < 80) lowCoverage.push(`${t.id} (${pct.toFixed(0)}%)`);
  }

  console.log();
  if (lowCoverage.length === 0) {
    console.log('\x1b[32mAll templates >= 80% coverage. Good to go.\x1b[0m');
  } else {
    console.log(`\x1b[33m${lowCoverage.length} template(s) below 80% coverage:\x1b[0m`);
    for (const w of lowCoverage) console.log(`  - ${w}`);
    console.log('\nConsider: fill in missing fields via corrections.csv, or disable these templates at runtime.');
  }
}

main();
