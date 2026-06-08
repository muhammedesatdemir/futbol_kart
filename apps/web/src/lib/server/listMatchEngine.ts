/**
 * Sunucu-otoriteli "Liste Doldur" online motoru.
 *
 * `targetMatchEngine.ts` / `squadMatchEngine.ts`'in KARDEŞİ; aynı iskelet ama
 * bu mod KATEGORİK olarak farklı + EN ÖNEMLİSİ HİLE KORUMALI:
 *
 *  🔒 LİSTE GİZLİ (spoiler koruması — bu modun kalbi): top-10 listesi (cevaplar)
 *     client'a ASLA gönderilmez. State'te yalnız `criterionId` saklanır; liste her
 *     çağrıda `buildList`'ten sunucuda türetilir. Client'a yalnız AÇILMIŞ sıralar
 *     (filledBy/filledPlayer/filledValue) + tahmin sonucu gider. F12'den cevaplar
 *     görünmez. (VS Düello'nun "doğru cevap reveal'a kadar sızmaz" felsefesi.)
 *
 *  Asimetrik sıra: tek aktif taraf tahmin eder. Doğru → sıraya oturur + puan +
 *  sıra geçer; yanlış/zaten-dolu/süre → can −1 + sıra geçer. Can sistemi: her
 *  tarafa LIST_LIVES (3). İki tarafın canı bitince VEYA liste dolunca RESULT.
 *
 *  Offline saf mantığı (`@/lib/listMode`) AYNEN çağrılır (tek kaynak), değiştirilmez.
 *  STATE: `match.state` jsonb OPAK (`match.mode='liste'` ile yorumlanır) — şema/migration yok.
 */
import { createPRNG } from '@futbol-kart/game-engine';
import { LIST_LIVES } from '@futbol-kart/game-engine';
import type { Player } from '@futbol-kart/shared-types';
import { loadGameData } from '@/lib/data';
import {
  LIST_SIZE,
  pruneListCriteria,
  buildList,
  evaluateGuess,
  scoreFilled,
  compareScores,
  pointsForRank,
  type ListCriterion,
  type ListEntry,
  type ListSide,
} from '@/lib/listMode';

/**
 * Online "Liste Doldur" maç durumu — `match.state` jsonb'ye yazılır (opak).
 * DİKKAT: listenin kendisi (cevaplar) BURADA YOK — yalnız criterionId + açılmışlar.
 * Açılmış sıralar Map serileştirilemediği için DÜZ NESNE/DİZİ olarak tutulur.
 */
export interface ListMatchState {
  /** Mod imzası (savunma). */
  kind: 'liste';
  /** Kriter id'si — liste sunucuda bundan türetilir (cevaplar client'a gitmez). */
  criterionId: string;
  /** Açılmış sıralar: rank → açan taraf. */
  filledBy: Record<number, ListSide>;
  /** Açılmış sıralar: rank → oyuncu id (artık açık, gizli değil). */
  filledPlayer: Record<number, string>;
  /** Açılmış sıralar: rank → metrik değeri (rozet için). */
  filledValue: Record<number, number>;
  /** Taraf canları. */
  lives: { P1: number; P2: number };
  /** Sıradaki taraf (asimetrik — tek aktif). */
  activeSide: ListSide;
  /** Sunucu-otoriteli sahne. */
  scene: 'REVEAL_LIST' | 'PLAY' | 'RESULT';
  /** Sonuç (RESULT'ta). */
  winner: ListSide | 'tie' | null;
  /** İsimler (gösterim için). */
  p1Name: string;
  p2Name: string;
}

/** Kriter açılış ekranının (her iki tarafa) gösterim süresi (sn). */
export const LIST_REVEAL_SECONDS = 12;
/** Online tahmin süresi (sn) — süre dolunca pas (can −1). Offline LIST_TURN_SECONDS=35. */
export const LIST_ONLINE_TURN_SECONDS = 35;

/** Bir sahnenin süre limiti (sn) — süresiz sahneler null. */
export function listSceneDeadlineSeconds(state: ListMatchState): number | null {
  switch (state.scene) {
    case 'REVEAL_LIST':
      return LIST_REVEAL_SECONDS;
    case 'PLAY':
      return LIST_ONLINE_TURN_SECONDS;
    default:
      return null; // RESULT — süresiz
  }
}

/** Kriteri id'den GÜNCEL havuza göre yeniden çözer + listeyi türetir (SUNUCUDA). */
async function resolveList(
  criterionId: string,
): Promise<{ criterion: ListCriterion; list: ListEntry[]; players: Player[] }> {
  const { players } = await loadGameData();
  const healthy = pruneListCriteria(players);
  const criterion = healthy.find((c) => c.id === criterionId);
  if (!criterion) {
    throw new Error(`Kriter bulunamadı veya artık geçersiz: ${criterionId}.`);
  }
  const list = buildList(criterion, players);
  return { criterion, list, players };
}

/**
 * Online "Liste Doldur" başlangıç state — kriter SEED'den DETERMİNİSTİK seçilir
 * (sunucu seçer, iki tarafa aynı, adalet). Liste açılış ekranıyla başlar.
 * Liste state'e KONMAZ (gizli) — yalnız criterionId.
 */
export async function buildInitialListState(
  seed: string,
  p1Name: string,
  p2Name: string,
): Promise<ListMatchState> {
  const { players } = await loadGameData();
  const healthy = pruneListCriteria(players);
  if (healthy.length === 0) {
    throw new Error('Sağlıklı liste kriteri bulunamadı.');
  }
  const prng = createPRNG(`list:${seed}:crit`);
  const criterion = healthy[Math.floor(prng.next() * healthy.length)]!;

  return {
    kind: 'liste',
    criterionId: criterion.id,
    filledBy: {},
    filledPlayer: {},
    filledValue: {},
    lives: { P1: LIST_LIVES, P2: LIST_LIVES },
    activeSide: 'P1',
    scene: 'REVEAL_LIST',
    winner: null,
    p1Name,
    p2Name,
  };
}

/** Liste açılış ekranı görüldü → PLAY'e geç. İdempotent. */
export function acknowledgeListReveal(state: ListMatchState): ListMatchState {
  if (state.scene !== 'REVEAL_LIST') return state;
  return { ...state, scene: 'PLAY' };
}

/** Açılmış sıra sayısı. */
function filledCount(state: ListMatchState): number {
  return Object.keys(state.filledPlayer).length;
}

/** Bir tarafın açtığı sıraların puan toplamı. */
function sideScore(state: ListMatchState, side: ListSide): number {
  const ranks = new Set<number>();
  for (const [rank, s] of Object.entries(state.filledBy)) {
    if (s === side) ranks.add(Number(rank));
  }
  return scoreFilled(ranks);
}

/**
 * Sıra geçişi + bitiş kontrolü (offline `passTurnAfter`'ın sunucu karşılığı).
 * `justActed` tarafı hamlesini yaptı; canı olan KARŞI tarafa geç. İki tarafın da
 * canı 0 → RESULT. Liste tamamen dolduysa → RESULT.
 */
function advanceTurn(state: ListMatchState, justActed: ListSide): ListMatchState {
  // Liste tamamen doldu → sonuç.
  if (filledCount(state) >= LIST_SIZE) {
    return finalizeList(state);
  }
  // İki tarafın da canı bitti → sonuç.
  if (state.lives.P1 <= 0 && state.lives.P2 <= 0) {
    return finalizeList(state);
  }
  // Karşı tarafa geç; onun canı yoksa aynı tarafta kal (tek taraf devam eder).
  const other: ListSide = justActed === 'P1' ? 'P2' : 'P1';
  const nextSide = state.lives[other] > 0 ? other : justActed;
  return { ...state, activeSide: nextSide };
}

/** RESULT'a geç + kazananı belirle (taraf skorları). */
function finalizeList(state: ListMatchState): ListMatchState {
  const p1 = sideScore(state, 'P1');
  const p2 = sideScore(state, 'P2');
  return { ...state, scene: 'RESULT', winner: compareScores(p1, p2) };
}

/** Bir sırayı aç (taraf adına) — state'e işle. */
function fillRank(
  state: ListMatchState,
  rank: number,
  playerId: string,
  value: number,
  side: ListSide,
): ListMatchState {
  return {
    ...state,
    filledBy: { ...state.filledBy, [rank]: side },
    filledPlayer: { ...state.filledPlayer, [rank]: playerId },
    filledValue: { ...state.filledValue, [rank]: value },
  };
}

/** Tahmin sonucu — client'a dönülecek (liste sızdırmaz; yalnız bu tahminin sonucu). */
export interface ListGuessOutcome {
  /** Doğru + yeni sıra mı açıldı? */
  hit: boolean;
  /** Açıldıysa hangi sıra/oyuncu/değer (zaten client'ın seçtiği oyuncu — sızıntı yok). */
  rank?: number;
  value?: number;
  /** Tahmin sonrası tarafın canı (miss'te azalmış). */
  lives: { P1: number; P2: number };
}

/**
 * Bir tahmini SUNUCUDA değerlendirir ve uygular. Sıra-tabanlı: yalnız AKTİF taraf.
 *
 * Doğrulamalar (sunucu otoritesi + hile koruması):
 *  - Sahne PLAY, side AKTİF taraf, tarafın canı > 0.
 *  - playerId güncel veride olmalı.
 *  - Liste SUNUCUDA türetilir; `evaluateGuess` ile kontrol → cevap client'a sızmaz.
 *
 * Doğru + yeni sıra → fillRank + sıra geç (can gitmez). Yanlış/zaten-dolu →
 * can −1 + sıra geç. Dönen state DB'ye yazılır; outcome client'a (yalnız sonuç).
 */
export async function applyListGuess(
  state: ListMatchState,
  side: ListSide,
  playerId: string,
): Promise<{ nextState: ListMatchState; outcome: ListGuessOutcome }> {
  if (state.scene !== 'PLAY') {
    throw new Error(`Tahmin yapılamaz: sahne PLAY değil (${state.scene}).`);
  }
  if (state.activeSide !== side) {
    throw new Error('Sıra sende değil.');
  }
  if (state.lives[side] <= 0) {
    throw new Error('Canın bitti.');
  }
  const { list, players } = await resolveList(state.criterionId);
  if (!players.some((p) => p.id === playerId)) {
    throw new Error(`Geçersiz oyuncu: ${playerId} (güncel veride yok).`);
  }

  const filledRanks = new Set(Object.keys(state.filledPlayer).map(Number));
  const res = evaluateGuess(playerId, list, filledRanks);

  if (res.hit && !res.alreadyFilled) {
    // DOĞRU + YENİ: sıraya otur (can gitmez), sıra karşıya geç.
    let next = fillRank(state, res.entry.rank, playerId, res.entry.value, side);
    next = advanceTurn(next, side);
    return {
      nextState: next,
      outcome: {
        hit: true,
        rank: res.entry.rank,
        value: res.entry.value,
        lives: next.lives,
      },
    };
  }

  // YANLIŞ / ZATEN DOLU: can −1, sıra geç.
  const lives = { ...state.lives, [side]: Math.max(0, state.lives[side] - 1) };
  let next: ListMatchState = { ...state, lives };
  next = advanceTurn(next, side);
  return { nextState: next, outcome: { hit: false, lives: next.lives } };
}

/**
 * Süre dolumunu uygular (sunucu-otoriteli). `nowMs >= deadlineMs` ise:
 *  - REVEAL_LIST: süre dolunca PLAY'e geç.
 *  - PLAY: aktif tarafın süresi dolduysa PAS (yanlış gibi: can −1 + sıra geç).
 *
 * Bir hamle olur (changed=true) → DB'ye yaz + Ably publish.
 */
export async function applyListTimeout(
  state: ListMatchState,
  deadlineMs: number | null,
  nowMs: number,
): Promise<{ state: ListMatchState; changed: boolean }> {
  if (deadlineMs === null || nowMs < deadlineMs) {
    return { state, changed: false };
  }

  if (state.scene === 'REVEAL_LIST') {
    return { state: { ...state, scene: 'PLAY' }, changed: true };
  }

  if (state.scene === 'PLAY') {
    const side = state.activeSide;
    // Aktif tarafın canı zaten 0 ise (tutarsızlık) sırayı ilerlet, can düşürme.
    if (state.lives[side] <= 0) {
      const next = advanceTurn(state, side);
      // Hiç değişmediyse (tek taraf, canı 0 → sonsuz döngü riski) finalize et.
      if (next.activeSide === side && next.scene === 'PLAY') {
        return { state: finalizeList(next), changed: true };
      }
      return { state: next, changed: true };
    }
    // PAS: can −1 + sıra geç (offline onTimeout mantığı).
    const lives = { ...state.lives, [side]: Math.max(0, state.lives[side] - 1) };
    let next: ListMatchState = { ...state, lives };
    next = advanceTurn(next, side);
    return { state: next, changed: true };
  }

  return { state, changed: false };
}

/** Client'a gönderilecek güvenli kriter özeti (metric/cevap içermez). */
export interface ListCriterionView {
  id: string;
  title: string;
  unit: string;
  /** Liste uzunluğu (UI'da boş sıraları çizmek için — cevap DEĞİL). */
  size: number;
}

export async function listCriterionView(
  criterionId: string,
): Promise<ListCriterionView | null> {
  try {
    const { criterion } = await resolveList(criterionId);
    return { id: criterion.id, title: criterion.title, unit: criterion.unit, size: LIST_SIZE };
  } catch {
    return null;
  }
}

/**
 * Tam listeyi (cevaplar) döner — YALNIZCA maç BİTİNCE (RESULT) çağrılmalı.
 * Sonuç ekranı tüm 1-10 sırayı gösterir (artık spoiler değil). PLAY/REVEAL'da
 * ASLA çağrılmaz (route bunu scene==='RESULT' ile garantiler).
 */
export async function listFullList(
  criterionId: string,
): Promise<ListEntry[]> {
  try {
    const { list } = await resolveList(criterionId);
    return list;
  } catch {
    return [];
  }
}

export { LIST_SIZE, LIST_LIVES, pointsForRank };
