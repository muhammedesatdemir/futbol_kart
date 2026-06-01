/**
 * TURNUVA-BAZLI İSTATİSTİKLER (cache'ten yeniden işleme — SCRAPE YOK).
 *
 * Her oyuncunun zaten cache'lenmiş performance-game verisinden (maç-maç,
 * competitionId + competitionTypeId içerir) turnuva bazlı agregalar türetir:
 *   - Şampiyonlar Ligi (UCL) maç + gol
 *   - Avrupa Ligi (UEL) maç + gol
 *   - Dünya Kupası (final turnuvası) maç + gol
 *   - Ulusal lig maç + gol
 *   - Ulusal kupa maç
 *
 * Bu veri "Hedefe Yaklaş" modunun turnuva hedeflerini (70 Dünya Kupası maçı,
 * 500 ŞL maçı vb.) ve bazı liste tiplerini besler. TM'ye İSTEK GİTMEZ —
 * reprocessAggregate.ts ile aynı mantık: sha1 cache okunur.
 *
 * Kullanım:
 *   pnpm --filter @futbol-kart/data-pipeline reprocess:competitions
 *
 * Çıktı: cache/competition-stats.json  ({ [tmId]: CompetitionStats })
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PerfGame } from './perfApi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', '..', 'cache');
const RAW_FILE = join(CACHE_DIR, 'players-raw.json');
const OUT_FILE = join(CACHE_DIR, 'competition-stats.json');

const PERF_BASE = 'https://www.transfermarkt.com/ceapi/performance-game';
const PLAYED = 'played';

/** Oyuncunun turnuva bazlı maç/gol/asist agregaları (tümü "played" maçlardan). */
export interface CompetitionStats {
  uclApps: number;
  uclGoals: number;
  uclAssists: number;
  uelApps: number;
  uelGoals: number;
  uelAssists: number;
  /** FIFA Dünya Kupası FİNAL turnuvası (eleme hariç) */
  worldCupApps: number;
  worldCupGoals: number;
  worldCupAssists: number;
  /** Dünya Kupası'nda kalecinin sahada yediği gol (clean-sheet/az-yiyen soruları için) */
  worldCupGoalsConceded: number;
  /** Ulusal birinci lig (type 1) */
  leagueApps: number;
  leagueGoals: number;
  leagueAssists: number;
  /** Ulusal kupa (type 8) — FA Cup, Copa del Rey, ZTK, lig kupası vb. */
  domesticCupApps: number;
  domesticCupGoals: number;
}

type Bucket = 'ucl' | 'uel' | 'worldCup' | 'league' | 'domesticCup' | null;

function cacheKey(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 16);
}

/**
 * competitionId → turnuva sınıfı. TM kodları sabit ve okunabilir:
 *   CL = UEFA Champions League, EL/UEFA = Europa League,
 *   FIWC = FIFA World Cup (final), WMQ* = World Cup qualifiers (eleme — sayılmaz)
 * competitionTypeId fallback: 1=lig, 8=ulusal kupa.
 */
function classify(g: PerfGame): Bucket {
  const comp = (g.gameInformation.competitionId || '').toUpperCase();
  const type = g.gameInformation.competitionTypeId;
  if (comp === 'CL') return 'ucl';
  if (comp === 'EL' || comp === 'UEFA' || comp === 'ELQ') return 'uel';
  if (comp === 'FIWC' || comp === 'WM') return 'worldCup';
  if (type === 1 && !g.gameInformation.isNationalGame) return 'league';
  if (type === 8 && !g.gameInformation.isNationalGame) return 'domesticCup';
  return null;
}

export function aggregateCompetitions(performance: PerfGame[]): CompetitionStats {
  const s: CompetitionStats = {
    uclApps: 0, uclGoals: 0, uclAssists: 0,
    uelApps: 0, uelGoals: 0, uelAssists: 0,
    worldCupApps: 0, worldCupGoals: 0, worldCupAssists: 0, worldCupGoalsConceded: 0,
    leagueApps: 0, leagueGoals: 0, leagueAssists: 0,
    domesticCupApps: 0, domesticCupGoals: 0,
  };
  for (const g of performance) {
    if (g.statistics?.generalStatistics?.participationState !== PLAYED) continue;
    const b = classify(g);
    if (!b) continue;
    const gs = g.statistics?.goalStatistics;
    const goals = gs?.goalsScoredTotal ?? 0;
    const assists = gs?.assists ?? 0;
    if (b === 'ucl') { s.uclApps++; s.uclGoals += goals; s.uclAssists += assists; }
    else if (b === 'uel') { s.uelApps++; s.uelGoals += goals; s.uelAssists += assists; }
    else if (b === 'worldCup') {
      s.worldCupApps++; s.worldCupGoals += goals; s.worldCupAssists += assists;
      // Kalecinin sahadayken yediği gol (rakip golü). Forvetlerde de dolar ama
      // anlamı kaleci soruları için; havuz pozisyonla filtrelenir.
      s.worldCupGoalsConceded += gs?.opponentGoalsOnThePitch ?? 0;
    }
    else if (b === 'league') { s.leagueApps++; s.leagueGoals += goals; s.leagueAssists += assists; }
    else if (b === 'domesticCup') { s.domesticCupApps++; s.domesticCupGoals += goals; }
  }
  return s;
}

interface PerfEnvelope {
  success: boolean;
  data: { performance: PerfGame[] };
}

interface RawPlayers {
  [key: string]: { tmId: number };
}

async function main() {
  const raw: RawPlayers = JSON.parse(await readFile(RAW_FILE, 'utf8'));
  const out: Record<string, CompetitionStats> = {};

  let processed = 0;
  let missing = 0;
  for (const p of Object.values(raw)) {
    if (!Number.isFinite(p.tmId)) continue;
    const path = join(CACHE_DIR, `${cacheKey(`${PERF_BASE}/${p.tmId}`)}.html`);
    if (!existsSync(path)) {
      missing++;
      continue;
    }
    try {
      const env: PerfEnvelope = JSON.parse(await readFile(path, 'utf8'));
      if (!env.success) continue;
      out[String(p.tmId)] = aggregateCompetitions(env.data.performance);
      processed++;
    } catch {
      missing++;
    }
  }

  await writeFile(OUT_FILE, JSON.stringify(out), 'utf8');

  // Özet
  const vals = Object.values(out);
  const withUcl = vals.filter((v) => v.uclApps > 0).length;
  const withWc = vals.filter((v) => v.worldCupApps > 0).length;
  console.log(`\n✅ Turnuva istatistikleri: ${processed} oyuncu işlendi, ${missing} cache eksik.`);
  console.log(`   ŞL maçı olan: ${withUcl} | Dünya Kupası maçı olan: ${withWc}`);
  console.log(`   Çıktı: ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
