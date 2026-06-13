/**
 * Sunucu-otoriteli "Ortak Bul" online motoru.
 *
 * `targetMatchEngine.ts` / `chainMatchEngine.ts`'in KARDEŞİ; aynı iskelet.
 * AMA akış VS DÜELLO gibi EŞZAMANLI (snake DEĞİL): her tur 2 kulüp gelir, İKİ
 * taraf AYNI ANDA bir ortak oyuncu seçer; ikisi de seçince (veya süre dolunca)
 * REVEAL'de iki cevap + nadirlik puanları birlikte açılır. 5 tur, en çok puan kazanır.
 *
 * Offline saf mantığı (`@/lib/commonMode`) AYNEN çağırır (tek kaynak), değiştirmez.
 * STATE: `match.state` jsonb OPAK (`match.mode='ortak'` ile yorumlanır) — şema/migration yok.
 *
 * 🔒 SPOILER KORUMASI: Çiftin tam `answers` listesi (cevaplar + nadirlik) client'a
 * GİTMEZ — yalnız "kaç ortak var" (count). Seçim doğrulama + puan SUNUCUDA. Rakibin
 * SELECT'teki seçimi REVEAL'a kadar MASKELENİR (route'ta) — F12'den okunamaz.
 *
 * Bkz PLAN.md §20.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Player } from '@futbol-kart/shared-types';
import { loadGameData } from '@/lib/data';
import {
  curatePairs,
  toRoundPair,
  evaluateSelection,
  decideWinner,
  buildHint,
  COMMON_ROUNDS,
  type ClubPair,
  type ClubPairsFile,
  type PoolClub,
  type CommonRoundPair,
  type CommonHint,
  type CommonSide,
} from '@/lib/commonMode';

/** Bir tarafın bir turdaki seçimi (REVEAL'a kadar rakibe maskelenir). */
export interface CommonSelection {
  /** Seçilen oyuncu id'si (null = henüz seçmedi / pas). */
  playerId: string | null;
  /** Doğru ortak mı? (sunucu hesabı) */
  correct: boolean;
  /** Kazanılan puan (doğruysa nadirlik puanı, yanlış/pas → 0). */
  points: number;
}

const EMPTY_SELECTION: CommonSelection = { playerId: null, correct: false, points: 0 };

/**
 * Online "Ortak Bul" maç durumu — `match.state` jsonb'ye yazılır (opak).
 * Cevap havuzu (pair.answers) BURADA tutulur ama route maskeler (sadece RESULT'ta
 * tam açılır → reveal'da yalnız iki seçim).
 */
export interface CommonMatchState {
  kind: 'ortak';
  /** Maçın 5 çifti (build-time clubPairs'ten kürate; cevaplar+puan DAHİL — sunucu-içi). */
  pairs: ClubPair[];
  /** Ekran çiftleri (logolu, count'lu — client'a güvenle gider; cevap YOK). */
  roundPairs: CommonRoundPair[];
  /** Şu anki tur (0..COMMON_ROUNDS). */
  round: number;
  /** Her turun iki tarafının seçimi. selections[round] = {P1, P2}. */
  selections: Array<{ P1: CommonSelection; P2: CommonSelection }>;
  /** Sunucu-otoriteli sahne. */
  scene: 'REVEAL_PAIR' | 'SELECT' | 'ROUND_REVEAL' | 'RESULT';
  /** Toplam skorlar (her ROUND_REVEAL'de güncellenir). */
  p1Score: number;
  p2Score: number;
  winner: CommonSide | 'tie' | null;
  /** İpucu jokeri kullanıldı mı (taraf başına 1×/maç). */
  jokerUsed: { P1: boolean; P2: boolean };
  p1Name: string;
  p2Name: string;
}

/** Çift açılış ekranı (logolar) gösterim süresi (sn). */
export const COMMON_PAIR_REVEAL_SECONDS = 5;
/** Eşzamanlı seçim süresi (sn) — online + bota karşı ortak. */
export const COMMON_SELECT_SECONDS = 30;
/** Tur sonucu (iki cevap + puan) gösterim süresi (sn) — sonra otomatik ilerler. */
export const COMMON_ROUND_REVEAL_SECONDS = 7;

export function commonSceneDeadlineSeconds(state: CommonMatchState): number | null {
  switch (state.scene) {
    case 'REVEAL_PAIR':
      return COMMON_PAIR_REVEAL_SECONDS;
    case 'SELECT':
      return COMMON_SELECT_SECONDS;
    case 'ROUND_REVEAL':
      return COMMON_ROUND_REVEAL_SECONDS;
    default:
      return null;
  }
}

// Sunucu veri yükleyiciler (data.ts clubPairs/clubPool içermez — chain ile aynı).
let cachedPairs: ClubPairsFile | null = null;
async function loadClubPairs(): Promise<ClubPairsFile> {
  if (cachedPairs) return cachedPairs;
  const path = join(process.cwd(), 'public', 'data', 'clubPairs.json');
  cachedPairs = JSON.parse(await readFile(path, 'utf8')) as ClubPairsFile;
  return cachedPairs;
}

let cachedPool: PoolClub[] | null = null;
async function loadClubPool(): Promise<PoolClub[]> {
  if (cachedPool) return cachedPool;
  const path = join(process.cwd(), 'public', 'data', 'clubPool.json');
  cachedPool = JSON.parse(await readFile(path, 'utf8')) as PoolClub[];
  return cachedPool;
}

/**
 * Online başlangıç state — 5 çift SEED'den DETERMİNİSTİK kürate edilir (sunucu,
 * iki tarafa aynı → adalet). İlk çiftin açılış ekranıyla başlar.
 */
export async function buildInitialCommonState(
  seed: string,
  p1Name: string,
  p2Name: string,
): Promise<CommonMatchState> {
  const file = await loadClubPairs();
  const pool = await loadClubPool();
  const poolById = new Map(pool.map((c) => [c.id, c]));
  const pairs = curatePairs(seed, file);
  const roundPairs = pairs.map((p) => toRoundPair(p, poolById));

  return {
    kind: 'ortak',
    pairs,
    roundPairs,
    round: 0,
    selections: pairs.map(() => ({ P1: { ...EMPTY_SELECTION }, P2: { ...EMPTY_SELECTION } })),
    scene: 'REVEAL_PAIR',
    p1Score: 0,
    p2Score: 0,
    winner: null,
    jokerUsed: { P1: false, P2: false },
    p1Name,
    p2Name,
  };
}

/** Çift açılış ekranı görüldü → SELECT'e geç. İdempotent. */
export function acknowledgeCommonReveal(state: CommonMatchState): CommonMatchState {
  if (state.scene !== 'REVEAL_PAIR') return state;
  return { ...state, scene: 'SELECT' };
}

/** Tur sonucu görüldü → sonraki tur (REVEAL_PAIR) veya RESULT. İdempotent. */
export function acknowledgeCommonRoundReveal(state: CommonMatchState): CommonMatchState {
  if (state.scene !== 'ROUND_REVEAL') return state;
  return advanceRound(state);
}

function finalizeCommon(state: CommonMatchState): CommonMatchState {
  return {
    ...state,
    scene: 'RESULT',
    winner: decideWinner(state.p1Score, state.p2Score),
  };
}

/** ROUND_REVEAL'den sonraki adım: bir sonraki tur açılışı veya maç sonu. */
function advanceRound(state: CommonMatchState): CommonMatchState {
  const nextRound = state.round + 1;
  if (nextRound >= state.pairs.length) {
    return finalizeCommon(state);
  }
  return { ...state, round: nextRound, scene: 'REVEAL_PAIR' };
}

/** Tur sonucu — client'a dönülür (kendi seçiminin doğru/yanlışı; PUAN GİZLİ). */
export interface CommonSelectOutcome {
  /** Doğru ortak mı? (isim onayı için — puanı reveal'da açılır) */
  correct: boolean;
  /** Seçilen oyuncu id'si. */
  playerId: string;
}

/**
 * Bir seçimi SUNUCUDA değerlendir + uygula (EŞZAMANLI — sıra yok).
 *  - Sahne SELECT olmalı.
 *  - Bu taraf bu turda HENÜZ seçmemiş olmalı (tek seçim/tur).
 *  - Seçim çiftin answers'ında mı → doğru + nadirlik puanı; değilse 0.
 *  - İki taraf da seçtiyse → ROUND_REVEAL'e geç + skorları işle.
 *
 * PUAN GİZLİ: outcome yalnız correct + playerId döner (puan reveal'da). Skor state'e
 * yazılır ama route bunu SELECT sırasında maskeler (rakip puanı sızmaz).
 */
export async function applyCommonSelect(
  state: CommonMatchState,
  side: CommonSide,
  playerId: string,
): Promise<{ nextState: CommonMatchState; outcome: CommonSelectOutcome }> {
  if (state.scene !== 'SELECT') {
    throw new Error(`Seçim yapılamaz: sahne SELECT değil (${state.scene}).`);
  }
  const sel = state.selections[state.round]!;
  if (sel[side].playerId !== null) {
    throw new Error('Bu turda zaten seçim yaptın.');
  }
  const { players } = await loadGameData();
  const player = players.find((p: Player) => p.id === playerId);
  if (!player) {
    throw new Error(`Geçersiz oyuncu: ${playerId}.`);
  }
  const pair = state.pairs[state.round]!;
  const result = evaluateSelection(pair, playerId);

  const nextSel = {
    ...sel,
    [side]: { playerId, correct: result.correct, points: result.points },
  } as { P1: CommonSelection; P2: CommonSelection };
  const selections = state.selections.map((s, i) => (i === state.round ? nextSel : s));

  let next: CommonMatchState = { ...state, selections };
  // İki taraf da seçtiyse → tur çözülür (REVEAL + skor).
  if (nextSel.P1.playerId !== null && nextSel.P2.playerId !== null) {
    next = resolveRound(next);
  }
  return { nextState: next, outcome: { correct: result.correct, playerId } };
}

/** Bir turu çöz: skorları topla, ROUND_REVEAL'e geç. */
function resolveRound(state: CommonMatchState): CommonMatchState {
  const sel = state.selections[state.round]!;
  return {
    ...state,
    p1Score: state.p1Score + sel.P1.points,
    p2Score: state.p2Score + sel.P2.points,
    scene: 'ROUND_REVEAL',
  };
}

/** İpucu sonucu — YALNIZCA isteyene döner (kişisel, içerik state'e yazılmaz). */
export interface CommonHintResult {
  hint: CommonHint;
}

/**
 * İpucu jokeri (online) — taraf başına 1×/maç. Aktif çiftin kapatılmamış bir
 * ortağını KISMEN açar (baş harf + pozisyon + milliyet, AD DEĞİL). İçerik
 * yalnızca isteyene döner; state'te yalnız `jokerUsed[side]` işaretlenir
 * (ipucu rakibe sızmaz). Chain öneri jokeriyle aynı desen.
 */
export async function applyCommonHint(
  state: CommonMatchState,
  side: CommonSide,
): Promise<{ nextState: CommonMatchState; hint: CommonHintResult | null }> {
  if (state.scene !== 'SELECT') {
    throw new Error(`İpucu kullanılamaz: sahne SELECT değil (${state.scene}).`);
  }
  if (state.jokerUsed[side]) {
    throw new Error('İpucu jokerini bu maçta zaten kullandın.');
  }
  const { players } = await loadGameData();
  const playersById = new Map(players.map((p: Player) => [p.id, p]));
  const pair = state.pairs[state.round]!;
  // Bu turda iki tarafça seçilmişleri hariç tut (kalan ortaklardan ipucu).
  const sel = state.selections[state.round]!;
  const exclude = new Set<string>();
  if (sel.P1.playerId) exclude.add(sel.P1.playerId);
  if (sel.P2.playerId) exclude.add(sel.P2.playerId);
  const hint = buildHint(pair, playersById, exclude, state.round + 1);

  const nextState: CommonMatchState = {
    ...state,
    jokerUsed: { ...state.jokerUsed, [side]: true },
  };
  return { nextState, hint: hint ? { hint } : null };
}

/**
 * Süre dolumu (sunucu-otoriteli):
 *  - REVEAL_PAIR → SELECT
 *  - SELECT → henüz seçmeyen tarafa 0-puanlık PAS yaz; iki taraf da bittiyse REVEAL
 *  - ROUND_REVEAL → sonraki tur / RESULT
 */
export async function applyCommonTimeout(
  state: CommonMatchState,
  deadlineMs: number | null,
  nowMs: number,
): Promise<{ state: CommonMatchState; changed: boolean }> {
  if (deadlineMs === null || nowMs < deadlineMs) {
    return { state, changed: false };
  }
  if (state.scene === 'REVEAL_PAIR') {
    return { state: { ...state, scene: 'SELECT' }, changed: true };
  }
  if (state.scene === 'ROUND_REVEAL') {
    return { state: advanceRound(state), changed: true };
  }
  if (state.scene === 'SELECT') {
    const sel = state.selections[state.round]!;
    // Henüz seçmeyen tarafa "pas" işaretle (playerId sentinel → tekrar seçemez,
    // correct:false, points:0). Boş playerId null kalsa maybeReveal tetiklenmez.
    const passed = {
      P1: sel.P1.playerId !== null ? sel.P1 : { playerId: '__pass', correct: false, points: 0 },
      P2: sel.P2.playerId !== null ? sel.P2 : { playerId: '__pass', correct: false, points: 0 },
    };
    const selections = state.selections.map((s, i) => (i === state.round ? passed : s));
    const next = resolveRound({ ...state, selections });
    return { state: next, changed: true };
  }
  return { state, changed: false };
}

/**
 * SELECT sırasında rakibin seçimini MASKELE (spoiler koruması). Kendi seçimini
 * görür (correct dahil; puan gizli zaten reveal'da gösterilir ama state'te tutulur
 * → SELECT'te kendi puanını da gizlemek için points'i kendi tarafımızda da 0'larız).
 * ROUND_REVEAL/RESULT'ta her şey açık.
 *
 * AYRICA: cevap havuzu `pairs[].answers` (tüm doğru cevaplar + nadirlik) ASLA
 * client'a gitmemeli → maskeli state'te `pairs` boşaltılır (client `roundPairs`
 * kullanır; answers'a ihtiyacı yok). RESULT'ta da pairs gizli kalır (gerek yok).
 */
export function maskCommonState(state: CommonMatchState, side: CommonSide): CommonMatchState {
  const other: CommonSide = side === 'P1' ? 'P2' : 'P1';
  const masked: CommonMatchState = {
    ...state,
    // Cevap havuzu hiçbir zaman client'a gitmez.
    pairs: [],
    // Skorları da SELECT/REVEAL_PAIR sırasında gizle (rakip puanı sızmasın);
    // ROUND_REVEAL ve RESULT'ta açık (artık reveal anı).
    p1Score: revealScores(state) ? state.p1Score : 0,
    p2Score: revealScores(state) ? state.p2Score : 0,
    selections: state.selections.map((s, i) => maskSelectionRow(s, i, state, side, other)),
  };
  return masked;
}

/** Skorlar/cevaplar bu sahnede açık mı? (ROUND_REVEAL ve RESULT → açık) */
function revealScores(state: CommonMatchState): boolean {
  return state.scene === 'ROUND_REVEAL' || state.scene === 'RESULT';
}

/**
 * Bir tur satırını maskele:
 *  - Geçmiş turlar (i < round): tamamen açık (zaten reveal edildi).
 *  - Aktif tur, ROUND_REVEAL/RESULT: açık.
 *  - Aktif tur, SELECT/REVEAL_PAIR: RAKİBİN seçimi gizli (playerId null, points 0);
 *    KENDİ seçiminde isim+correct açık ama PUAN gizli (reveal'da açılır).
 *  - Gelecek turlar (i > round): zaten boş.
 */
function maskSelectionRow(
  s: { P1: CommonSelection; P2: CommonSelection },
  i: number,
  state: CommonMatchState,
  side: CommonSide,
  other: CommonSide,
): { P1: CommonSelection; P2: CommonSelection } {
  const open = i < state.round || revealScores(state);
  if (open) return s;
  // Aktif tur, henüz reveal değil → rakibi gizle, kendi puanını gizle.
  const out = { P1: { ...s.P1 }, P2: { ...s.P2 } } as { P1: CommonSelection; P2: CommonSelection };
  // Rakip seçimini tamamen gizle (yalnız "seçti mi" bilgisini playerId'nin
  // varlığıyla değil — onu da gizleyip ayrı bir rozetle göstereceğiz; ama
  // "rakip hazır" sinyali için playerId'yi '__hidden' yaparız: doğru/puan sızmaz).
  if (s[other].playerId !== null) {
    out[other] = { playerId: '__hidden', correct: false, points: 0 };
  } else {
    out[other] = { playerId: null, correct: false, points: 0 };
  }
  // Kendi seçimimde puanı gizle (isim + correct açık → "✓ doğru ortak").
  out[side] = { ...s[side], points: 0 };
  return out;
}

export { COMMON_ROUNDS };
