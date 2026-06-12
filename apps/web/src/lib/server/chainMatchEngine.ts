/**
 * Sunucu-otoriteli "Zincir Kur" online motoru.
 *
 * `squaresMatchEngine.ts` / `listMatchEngine.ts`'in KARDEŞİ; aynı iskelet.
 * Offline saf mantığı (`@/lib/chainMode`) AYNEN çağırır (tek kaynak), değiştirmez.
 * STATE: `match.state` jsonb OPAK (`match.mode='zincir'` ile yorumlanır) — şema/migration yok.
 *
 * MASKELEME YOK: 7 kulüp ZATEN AÇIK (ekranda görünür), "cevap" = girilen futbolcunun
 * tuttuğu kulüpler (açık). Hedefe/Kadro gibi açık mod. Pick doğrulama (keşişim)
 * SUNUCUDA → client manipüle edemez.
 *
 * Sıra-tabanlı (snake A-B-B-A-A-B-B-A-A-B): tek aktif taraf bir futbolcu girer.
 * Her taraf 5 pick; 10 adım sonunda VEYA havuz biterse RESULT. Can YOK.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Player } from '@futbol-kart/shared-types';
import { loadGameData } from '@/lib/data';
import {
  curateClubs,
  matchedClubs,
  decideWinner,
  chainSnakeOrder,
  suggestPick,
  CHAIN_TOTAL_STEPS,
  type ChainClub,
  type ChainPick,
  type ChainSide,
  type PoolClub,
} from '@/lib/chainMode';

/**
 * Online "Zincir Kur" maç durumu — `match.state` jsonb'ye yazılır (opak).
 * 7 kulüp + snake sırası + adım + iki tarafın pick'leri. Maskeleme yok.
 */
export interface ChainMatchState {
  kind: 'zincir';
  /** Kürasyonlu 7 kulüp (açık — client olduğu gibi görür). */
  clubs: ChainClub[];
  /** Snake sırası (A-B-B-A-A-B-B-A-A-B). */
  order: ChainSide[];
  /** Şu anki adım indeksi (0..CHAIN_TOTAL_STEPS). */
  step: number;
  /** Tarafların pick'leri. */
  p1Picks: ChainPick[];
  p2Picks: ChainPick[];
  /** Sunucu-otoriteli sahne. */
  scene: 'REVEAL' | 'PLAY' | 'RESULT';
  winner: ChainSide | 'tie' | null;
  /** Öneri jokeri kullanıldı mı (taraf başına 1×). */
  jokerUsed: { P1: boolean; P2: boolean };
  p1Name: string;
  p2Name: string;
}

/** Kulüp açılış ekranı gösterim süresi (sn). */
export const CHAIN_REVEAL_SECONDS = 10;
/** Online tahmin süresi (sn) — dolunca 0-puanlık pas. */
export const CHAIN_ONLINE_TURN_SECONDS = 35;

export function chainSceneDeadlineSeconds(state: ChainMatchState): number | null {
  switch (state.scene) {
    case 'REVEAL':
      return CHAIN_REVEAL_SECONDS;
    case 'PLAY':
      return CHAIN_ONLINE_TURN_SECONDS;
    default:
      return null;
  }
}

// Sunucu clubPool yükleyici (data.ts clubPool içermez — squaresMatchEngine ile aynı).
let cachedPool: PoolClub[] | null = null;
async function loadClubPool(): Promise<PoolClub[]> {
  if (cachedPool) return cachedPool;
  const path = join(process.cwd(), 'public', 'data', 'clubPool.json');
  cachedPool = JSON.parse(await readFile(path, 'utf8')) as PoolClub[];
  return cachedPool;
}

/**
 * Online başlangıç state — 7 kulüp SEED'den DETERMİNİSTİK kürate edilir (sunucu,
 * iki tarafa aynı → adalet). Açılış ekranıyla başlar.
 */
export async function buildInitialChainState(
  seed: string,
  p1Name: string,
  p2Name: string,
): Promise<ChainMatchState> {
  const { players } = await loadGameData();
  const pool = await loadClubPool();
  const clubs = curateClubs(seed, pool, players);

  return {
    kind: 'zincir',
    clubs,
    order: chainSnakeOrder('P1'),
    step: 0,
    p1Picks: [],
    p2Picks: [],
    scene: 'REVEAL',
    winner: null,
    jokerUsed: { P1: false, P2: false },
    p1Name,
    p2Name,
  };
}

/** Kulüp ekranı görüldü → PLAY'e geç. İdempotent. */
export function acknowledgeChainReveal(state: ChainMatchState): ChainMatchState {
  if (state.scene !== 'REVEAL') return state;
  return { ...state, scene: 'PLAY' };
}

function finalizeChain(state: ChainMatchState): ChainMatchState {
  return { ...state, scene: 'RESULT', winner: decideWinner(state.p1Picks, state.p2Picks) };
}

/** Bir pick ekle + adımı ilerlet (bitiş kontrolü). */
function advance(state: ChainMatchState, side: ChainSide, pick: ChainPick): ChainMatchState {
  const next: ChainMatchState = {
    ...state,
    p1Picks: side === 'P1' ? [...state.p1Picks, pick] : state.p1Picks,
    p2Picks: side === 'P2' ? [...state.p2Picks, pick] : state.p2Picks,
    step: state.step + 1,
  };
  if (next.step >= CHAIN_TOTAL_STEPS) return finalizeChain(next);
  return next;
}

/** Tahmin sonucu — client'a dönülür (kulüpler açık, sızıntı yok). */
export interface ChainGuessOutcome {
  /** Tutulan kulüp id'leri (UI animasyonu + puan). */
  matchedClubIds: string[];
  /** Kazanılan puan (= matchedClubIds.length). */
  gained: number;
}

/**
 * Bir pick'i SUNUCUDA değerlendir + uygula. Sıra-tabanlı: yalnız AKTİF taraf.
 *  - Sahne PLAY, side = sıradaki taraf (order[step]).
 *  - playerId güncel veride + henüz girilmemiş olmalı.
 *  - Keşişim (matchedClubs) SUNUCUDA → client manipüle edemez.
 */
export async function applyChainGuess(
  state: ChainMatchState,
  side: ChainSide,
  playerId: string,
): Promise<{ nextState: ChainMatchState; outcome: ChainGuessOutcome }> {
  if (state.scene !== 'PLAY') {
    throw new Error(`Tahmin yapılamaz: sahne PLAY değil (${state.scene}).`);
  }
  if (state.order[state.step] !== side) {
    throw new Error('Sıra sende değil.');
  }
  const { players } = await loadGameData();
  const player = players.find((p: Player) => p.id === playerId);
  if (!player) {
    throw new Error(`Geçersiz oyuncu: ${playerId}.`);
  }
  // Zaten girilmiş mi? (iki taraf da tekrar giremez)
  const used = new Set([...state.p1Picks, ...state.p2Picks].map((p) => p.playerId));
  if (used.has(playerId)) {
    throw new Error('Bu futbolcu zaten girildi.');
  }

  const clubIds = new Set(state.clubs.map((c) => c.id));
  const matched = matchedClubs(player, clubIds);
  const pick: ChainPick = { playerId, matchedClubIds: matched };
  const nextState = advance(state, side, pick);
  return { nextState, outcome: { matchedClubIds: matched, gained: matched.length } };
}

/** Öneri jokeri sonucu — YALNIZCA isteyene döner (kişisel, state'e yazılmaz). */
export interface ChainSuggestResult {
  playerId: string;
}

/**
 * Öneri jokeri (online) — aktif tarafa 1×. İyi bir futbolcu önerir (offline
 * `suggestPick`, üst dilim). Önerilen playerId YALNIZCA isteyene döner; state'te
 * yalnız `jokerUsed[side]` işaretlenir (öneri içeriği rakibe sızmaz). Öneriyi
 * kabul = ayrı bir `guess` (client kararı). Kadro öneri jokeriyle aynı desen.
 */
export async function applyChainSuggest(
  state: ChainMatchState,
  side: ChainSide,
): Promise<{ nextState: ChainMatchState; suggestion: ChainSuggestResult | null }> {
  if (state.scene !== 'PLAY') {
    throw new Error(`Öneri kullanılamaz: sahne PLAY değil (${state.scene}).`);
  }
  if (state.jokerUsed[side]) {
    throw new Error('Öneri jokerini bu maçta zaten kullandın.');
  }
  if (state.order[state.step] !== side) {
    throw new Error('Öneri yalnızca kendi sıranda kullanılabilir.');
  }
  const { players } = await loadGameData();
  const clubIds = new Set(state.clubs.map((c) => c.id));
  const used = new Set([...state.p1Picks, ...state.p2Picks].map((p) => p.playerId));
  // Deterministik öneri (adım bazlı sözde-rastgele — Kadro deseni).
  let s = state.step * 2654435761;
  const rng = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s % 1_000_000) / 1_000_000;
  };
  const sug = suggestPick(clubIds, players, used, rng);

  const nextState: ChainMatchState = {
    ...state,
    jokerUsed: { ...state.jokerUsed, [side]: true },
  };
  return { nextState, suggestion: sug ? { playerId: sug.player.id } : null };
}

/**
 * Süre dolumu (sunucu-otoriteli). REVEAL→PLAY; PLAY→aktif taraf 0-puanlık PAS
 * (boş pick ekle, sıra ilerler). Can yok → pas sadece adımı yakar.
 */
export async function applyChainTimeout(
  state: ChainMatchState,
  deadlineMs: number | null,
  nowMs: number,
): Promise<{ state: ChainMatchState; changed: boolean }> {
  if (deadlineMs === null || nowMs < deadlineMs) {
    return { state, changed: false };
  }
  if (state.scene === 'REVEAL') {
    return { state: { ...state, scene: 'PLAY' }, changed: true };
  }
  if (state.scene === 'PLAY') {
    const side = state.order[state.step]!;
    // 0-puanlık pas (benzersiz placeholder id — used setine takılmaz).
    const pass: ChainPick = { playerId: `__pass_${state.step}`, matchedClubIds: [] };
    return { state: advance(state, side, pass), changed: true };
  }
  return { state, changed: false };
}

export { CHAIN_TOTAL_STEPS };
