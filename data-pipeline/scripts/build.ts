import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { playerSchema, clubSchema, type PlayerInput, type ClubInput } from './schema.js';
import { loadCorrections, applyCorrection } from './corrections.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PROJECT_ROOT = resolve(ROOT, '..');

const PLAYERS_SEED = resolve(ROOT, 'seed/players.json');
const CLUBS_SEED = resolve(ROOT, 'seed/clubs.json');
const CORRECTIONS = resolve(ROOT, 'corrections.csv');
const OUT_DIR = resolve(PROJECT_ROOT, 'apps/web/public/data');
const PLAYERS_OUT = resolve(OUT_DIR, 'players.json');
const CLUBS_OUT = resolve(OUT_DIR, 'clubs.json');
const META_OUT = resolve(OUT_DIR, 'meta.json');

interface BuildResult {
  players: number;
  clubs: number;
  corrections: number;
  errors: string[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function fail(msg: string): never {
  console.error(`\x1b[31m[pipeline] ERROR:\x1b[0m ${msg}`);
  process.exit(1);
}

function main(): BuildResult {
  console.log('[pipeline] reading seed files...');
  const rawPlayers = readJson<unknown[]>(PLAYERS_SEED);
  const rawClubs = readJson<unknown[]>(CLUBS_SEED);

  console.log('[pipeline] applying corrections...');
  const corrections = loadCorrections(CORRECTIONS);
  const errors: string[] = [];

  const playersBySlug = new Map<string, Record<string, unknown>>();
  for (const p of rawPlayers as Record<string, unknown>[]) {
    if (typeof p.slug !== 'string') continue;
    playersBySlug.set(p.slug, p);
  }

  for (const c of corrections) {
    const target = playersBySlug.get(c.slug);
    if (!target) {
      errors.push(`corrections: player slug "${c.slug}" not found`);
      continue;
    }
    applyCorrection(target, c.field, c.value);
  }

  console.log('[pipeline] validating clubs...');
  const clubs: ClubInput[] = [];
  for (const raw of rawClubs) {
    const parsed = clubSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`club: ${JSON.stringify(raw).slice(0, 80)} - ${parsed.error.issues[0]?.message}`);
      continue;
    }
    clubs.push(parsed.data);
  }
  const clubIds = new Set(clubs.map((c) => c.id));

  console.log('[pipeline] validating players...');
  const players: PlayerInput[] = [];
  for (const raw of rawPlayers) {
    const parsed = playerSchema.safeParse(raw);
    if (!parsed.success) {
      const slug = (raw as { slug?: string }).slug ?? '<unknown>';
      errors.push(`player ${slug}: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
      continue;
    }
    for (const stint of parsed.data.clubs) {
      if (!clubIds.has(stint.clubId)) {
        errors.push(`player ${parsed.data.slug}: unknown clubId "${stint.clubId}"`);
      }
    }
    players.push(parsed.data);
  }

  if (errors.length > 0) {
    for (const e of errors) console.error(`  ! ${e}`);
    fail(`${errors.length} validation error(s)`);
  }

  console.log('[pipeline] writing outputs...');
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(PLAYERS_OUT, JSON.stringify(players, null, 2) + '\n');
  writeFileSync(CLUBS_OUT, JSON.stringify(clubs, null, 2) + '\n');
  writeFileSync(
    META_OUT,
    JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        playerCount: players.length,
        clubCount: clubs.length,
        correctionsApplied: corrections.length,
      },
      null,
      2,
    ) + '\n',
  );

  const result: BuildResult = {
    players: players.length,
    clubs: clubs.length,
    corrections: corrections.length,
    errors,
  };

  console.log(
    `\n[pipeline] \x1b[32mOK\x1b[0m  players=${result.players}  clubs=${result.clubs}  corrections=${result.corrections}`,
  );
  console.log(`           wrote ${PLAYERS_OUT}`);
  console.log(`           wrote ${CLUBS_OUT}`);
  console.log(`           wrote ${META_OUT}`);
  return result;
}

main();
