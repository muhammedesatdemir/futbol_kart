/**
 * Sunucu-otoriteli "Kareleri Kap" online motoru.
 *
 * `listMatchEngine.ts` / `targetMatchEngine.ts`'in KARDEŞİ; aynı iskelet.
 * Offline saf mantığı (`@/lib/squaresMode`) AYNEN çağırır (tek kaynak), değiştirmez.
 * STATE: `match.state` jsonb OPAK (`match.mode='kareler'` ile yorumlanır) — şema/migration yok.
 *
 * MASKELEME YOK: matris (kulüpler + kapanma durumu) ZATEN AÇIK — kulüpler ekranda
 * görünür, "cevap" = hangi futbolcunun hangi kareyi açtığı (açık bilgi). Liste
 * Doldur'dan farkı bu (orada top-10 cevap gizliydi). Hedefe/Kadro gibi açık mod.
 *
 * Sıra-tabanlı: tek aktif taraf bir futbolcu tahmin eder. Doğru (bitişik grup
 * varsa) → kareler kapanır + sıra geçer; yanlış/süre → can −1 + sıra geçer.
 * Her tarafa SQUARES_LIVES (3) can; iki tarafın canı bitince VEYA matris dolunca RESULT.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Player } from '@futbol-kart/shared-types';
import { loadGameData } from '@/lib/data';
import {
  generateGrid,
  evaluateGuess,
  captureCells,
  sideScore,
  emptyCount,
  decideWinner,
  playerClubIds,
  largestAdjacentGroup,
  suggestGuess,
  SQUARES_LIVES,
  type SquaresGrid as GridData,
  type SquaresSide,
  type PoolClub,
} from '@/lib/squaresMode';

/**
 * Online "Kareleri Kap" maç durumu — `match.state` jsonb'ye yazılır (opak).
 * Matris (kapanma durumuyla) state'te tutulur → her hamlede yeniden üretilmez,
 * tutarlı kalır. Maskeleme yok (matris açık).
 */
export interface SquaresMatchState {
  /** Mod imzası (savunma). */
  kind: 'kareler';
  /** Matris (kulüpler + kapanma durumu). Açık — client olduğu gibi görür. */
  grid: GridData;
  /** Taraf canları. */
  lives: { P1: number; P2: number };
  /** Sıradaki taraf (asimetrik — tek aktif). */
  activeSide: SquaresSide;
  /** Sunucu-otoriteli sahne. */
  scene: 'REVEAL' | 'PLAY' | 'RESULT';
  /** Sonuç (RESULT'ta). */
  winner: SquaresSide | 'tie' | null;
  /** Öneri jokeri kullanıldı mı (taraf başına 1×). */
  jokerUsed: { P1: boolean; P2: boolean };
  /** İsimler. */
  p1Name: string;
  p2Name: string;
}

/** Kriter açılış ekranı gösterim süresi (sn). Liste LIST_REVEAL_SECONDS=12 ile aynı. */
export const SQUARES_REVEAL_SECONDS = 10;
/** Online tahmin süresi (sn) — dolunca pas (can −1). Offline 35 ile aynı. */
export const SQUARES_ONLINE_TURN_SECONDS = 35;

/** Bir sahnenin süre limiti (sn) — süresiz sahneler null. */
export function squaresSceneDeadlineSeconds(state: SquaresMatchState): number | null {
  switch (state.scene) {
    case 'REVEAL':
      return SQUARES_REVEAL_SECONDS;
    case 'PLAY':
      return SQUARES_ONLINE_TURN_SECONDS;
    default:
      return null; // RESULT — süresiz
  }
}

// ── Sunucu clubPool yükleyici (data.ts clubPool içermez → ayrı, cache'li) ──
let cachedPool: PoolClub[] | null = null;
async function loadClubPool(): Promise<PoolClub[]> {
  if (cachedPool) return cachedPool;
  const path = join(process.cwd(), 'public', 'data', 'clubPool.json');
  const raw = await readFile(path, 'utf8');
  cachedPool = JSON.parse(raw) as PoolClub[];
  return cachedPool;
}

/**
 * Online "Kareleri Kap" başlangıç state — matris SEED'den DETERMİNİSTİK üretilir
 * (sunucu üretir, iki tarafa aynı → adalet). Matris açılış ekranıyla başlar.
 */
export async function buildInitialSquaresState(
  seed: string,
  p1Name: string,
  p2Name: string,
): Promise<SquaresMatchState> {
  const { players } = await loadGameData();
  const pool = await loadClubPool();
  const grid = generateGrid(seed, pool, players);

  return {
    kind: 'kareler',
    grid,
    lives: { P1: SQUARES_LIVES, P2: SQUARES_LIVES },
    activeSide: 'P1',
    scene: 'REVEAL',
    winner: null,
    jokerUsed: { P1: false, P2: false },
    p1Name,
    p2Name,
  };
}

/** Matris açılış ekranı görüldü → PLAY'e geç. İdempotent. */
export function acknowledgeSquaresReveal(state: SquaresMatchState): SquaresMatchState {
  if (state.scene !== 'REVEAL') return state;
  return { ...state, scene: 'PLAY' };
}

/** RESULT'a geç + kazananı belirle. */
function finalizeSquares(state: SquaresMatchState): SquaresMatchState {
  return { ...state, scene: 'RESULT', winner: decideWinner(state.grid) };
}

/**
 * Sıra geçişi + bitiş kontrolü. `justActed` hamlesini yaptı; canı olan KARŞI
 * tarafa geç. Matris dolu VEYA iki tarafın canı 0 → RESULT.
 */
function advanceTurn(state: SquaresMatchState, justActed: SquaresSide): SquaresMatchState {
  if (emptyCount(state.grid) === 0) return finalizeSquares(state);
  if (state.lives.P1 <= 0 && state.lives.P2 <= 0) return finalizeSquares(state);
  const other: SquaresSide = justActed === 'P1' ? 'P2' : 'P1';
  const nextSide = state.lives[other] > 0 ? other : justActed;
  return { ...state, activeSide: nextSide };
}

/** Tahmin sonucu — client'a dönülür (matris zaten açık, sızıntı yok). */
export interface SquaresGuessOutcome {
  hit: boolean;
  /** Kapanan hücre indeksleri (hit'te) — UI animasyonu için. */
  cells?: number[];
  /** Kazanılan kare (grup boyutu). */
  gained?: number;
  /** Tahmin sonrası canlar. */
  lives: { P1: number; P2: number };
}

/**
 * Bir tahmini SUNUCUDA değerlendirir + uygular. Sıra-tabanlı: yalnız AKTİF taraf.
 *
 * Doğrulamalar (sunucu otoritesi):
 *  - Sahne PLAY, side AKTİF taraf, tarafın canı > 0.
 *  - playerId güncel veride olmalı.
 *  - Bitişik grup SUNUCUDA hesaplanır (largestAdjacentGroup) → client manipüle edemez.
 *
 * Doğru (grup ≥1) → kareler kapanır + sıra geç (can gitmez). Boş grup → can −1 + sıra geç.
 */
export async function applySquaresGuess(
  state: SquaresMatchState,
  side: SquaresSide,
  playerId: string,
): Promise<{ nextState: SquaresMatchState; outcome: SquaresGuessOutcome }> {
  if (state.scene !== 'PLAY') {
    throw new Error(`Tahmin yapılamaz: sahne PLAY değil (${state.scene}).`);
  }
  if (state.activeSide !== side) {
    throw new Error('Sıra sende değil.');
  }
  if (state.lives[side] <= 0) {
    throw new Error('Canın bitti.');
  }
  const { players } = await loadGameData();
  const player = players.find((p: Player) => p.id === playerId);
  if (!player) {
    throw new Error(`Geçersiz oyuncu: ${playerId} (güncel veride yok).`);
  }

  const res = evaluateGuess(state.grid, player);
  if (res.hit) {
    // DOĞRU: kareleri kapat (can gitmez), sıra geç.
    const ng = captureCells(state.grid, res.cells, side, playerId);
    let next: SquaresMatchState = { ...state, grid: ng };
    next = advanceTurn(next, side);
    return {
      nextState: next,
      outcome: { hit: true, cells: res.cells, gained: res.gained, lives: next.lives },
    };
  }

  // YANLIŞ (uygun bitişik grup yok): can −1, sıra geç.
  const lives = { ...state.lives, [side]: Math.max(0, state.lives[side] - 1) };
  let next: SquaresMatchState = { ...state, lives };
  next = advanceTurn(next, side);
  return { nextState: next, outcome: { hit: false, lives: next.lives } };
}

/** Öneri jokeri sonucu — YALNIZCA isteyene döner (kişisel, state'e yazılmaz). */
export interface SquaresSuggestResult {
  playerId: string;
}

/**
 * Öneri jokeri (online) — aktif tarafa 1×. Büyük grup açan iyi bir futbolcu
 * önerir (offline `suggestGuess`, üst dilim). Önerilen playerId YALNIZCA isteyene
 * döner; state'te yalnız `jokerUsed[side]` işaretlenir. Kabul = ayrı `guess`.
 */
export async function applySquaresSuggest(
  state: SquaresMatchState,
  side: SquaresSide,
): Promise<{ nextState: SquaresMatchState; suggestion: SquaresSuggestResult | null }> {
  if (state.scene !== 'PLAY') {
    throw new Error(`Öneri kullanılamaz: sahne PLAY değil (${state.scene}).`);
  }
  if (state.jokerUsed[side]) {
    throw new Error('Öneri jokerini bu maçta zaten kullandın.');
  }
  if (state.activeSide !== side) {
    throw new Error('Öneri yalnızca kendi sıranda kullanılabilir.');
  }
  const { players } = await loadGameData();
  // Deterministik öneri (kapatılan kare sayısı bazlı sözde-rastgele).
  const captured = state.grid.cells.filter((c) => c.capturedBy !== null).length;
  let s = (captured + 1) * 2654435761;
  const rng = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s % 1_000_000) / 1_000_000;
  };
  const sug = suggestGuess(state.grid, players, rng);

  const nextState: SquaresMatchState = {
    ...state,
    jokerUsed: { ...state.jokerUsed, [side]: true },
  };
  return { nextState, suggestion: sug ? { playerId: sug.player.id } : null };
}

/**
 * Süre dolumunu uygular (sunucu-otoriteli). `nowMs >= deadlineMs` ise:
 *  - REVEAL: PLAY'e geç.
 *  - PLAY: aktif tarafın süresi dolduysa PAS (can −1 + sıra geç).
 */
export async function applySquaresTimeout(
  state: SquaresMatchState,
  deadlineMs: number | null,
  nowMs: number,
): Promise<{ state: SquaresMatchState; changed: boolean }> {
  if (deadlineMs === null || nowMs < deadlineMs) {
    return { state, changed: false };
  }

  if (state.scene === 'REVEAL') {
    return { state: { ...state, scene: 'PLAY' }, changed: true };
  }

  if (state.scene === 'PLAY') {
    const side = state.activeSide;
    if (state.lives[side] <= 0) {
      const next = advanceTurn(state, side);
      if (next.activeSide === side && next.scene === 'PLAY') {
        return { state: finalizeSquares(next), changed: true };
      }
      return { state: next, changed: true };
    }
    const lives = { ...state.lives, [side]: Math.max(0, state.lives[side] - 1) };
    let next: SquaresMatchState = { ...state, lives };
    next = advanceTurn(next, side);
    return { state: next, changed: true };
  }

  return { state, changed: false };
}

/** İki tarafın kapattığı kare sayısı (skor) — client gösterimi için yardımcı. */
export function squaresScores(state: SquaresMatchState): { P1: number; P2: number } {
  return { P1: sideScore(state.grid, 'P1'), P2: sideScore(state.grid, 'P2') };
}

// Re-export (route + GET kolu kullanır).
export { SQUARES_LIVES, largestAdjacentGroup, playerClubIds };
