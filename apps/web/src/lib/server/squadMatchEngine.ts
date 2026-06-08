/**
 * Sunucu-otoriteli "Kadro Kur" online motoru.
 *
 * `targetMatchEngine.ts`'in KARDEŞİ — aynı felsefe ve iskelet (kurallar SUNUCUDA,
 * client niyet gönderir). Fark: Kadro POZİSYONLU slot-bazlıdır (4-3-3, 11 slot),
 * draft 22 adımdır, kriteri sunucu seçer ve joker = ÖNERİ (`suggestForDraft`).
 *
 * Offline saf mantığı (`@/lib/squadMode`) AYNEN kullanır (tek kaynak) — orada
 * hiçbir şey değiştirilmez, sadece çağrılır.
 *
 * Snake draft SIRA-TABANLIDIR: sunucu `draftStep` tutar, yalnızca o adımın aktif
 * tarafının pick'ini kabul eder (slot + oyuncu doğrular); süre dolunca otomatik
 * pick (offline `autoPickForDraft`). STATE: `match.state` jsonb OPAK
 * (`match.mode='kadro'` ile yorumlanır) — şema/migration yok.
 */
import { createPRNG } from '@futbol-kart/game-engine';
import type { Player } from '@futbol-kart/shared-types';
import { loadGameData } from '@/lib/data';
import {
  FORMATION_433,
  type Formation,
  pruneSquadCriteria,
  emptyAssignment,
  snakeDraftOrder,
  draftedIds,
  candidatesForSlot,
  suggestForDraft,
  autoPickForDraft,
  scoreSquad,
  compareSquads,
  type SquadCriterion,
  type SquadAssignment,
  type DraftSide,
} from '@/lib/squadMode';

/** Online maçta kullanılan tek formasyon (offline varsayılanıyla aynı). */
const FORMATION: Formation = FORMATION_433;

/** Online "Kadro Kur" maç durumu — `match.state` jsonb'ye yazılır (opak). */
export interface SquadMatchState {
  /** Mod imzası (savunma — match.mode ile tutarlı olmalı). */
  kind: 'kadro';
  /** Kriter id'si (metric fonksiyonu serileştirilemez → id'den yeniden bulunur). */
  criterionId: string;
  /** Snake draft sırası (örn. P1,P2,P2,P1,…) — 2×slot adımı. */
  draftOrder: DraftSide[];
  /** Mevcut adım indeksi (0..draftOrder.length). */
  draftStep: number;
  /** İki tarafın kadroları (slotId → playerId | null). */
  p1Assignment: SquadAssignment;
  p2Assignment: SquadAssignment;
  /** Öneri jokeri kullanıldı mı (taraf başına 1×). */
  jokerUsed: { P1: boolean; P2: boolean };
  /** Sunucu-otoriteli sahne. */
  scene: 'CRITERION_REVEAL' | 'DRAFT' | 'RESULT';
  /** Sonuç (RESULT'ta). */
  winner: DraftSide | 'tie' | null;
  /** İsimler (matchmaking'den; gösterim için). */
  p1Name: string;
  p2Name: string;
}

/** Kriter açılış ekranının (her iki tarafa) gösterim süresi (sn). Hedefe ile aynı
 *  gerekçe: eşleşme "found" ekranı gecikmesini telafi eder (yoksa atlanır). */
export const SQUAD_REVEAL_SECONDS = 14;
/** Online draft adımı süresi (sn). Offline SQUAD_DRAFT_SECONDS=40 ile uyumlu. */
export const SQUAD_ONLINE_DRAFT_SECONDS = 40;

/** Bir sahnenin süre limiti (sn) — süresiz sahneler null. */
export function squadSceneDeadlineSeconds(state: SquadMatchState): number | null {
  switch (state.scene) {
    case 'CRITERION_REVEAL':
      return SQUAD_REVEAL_SECONDS;
    case 'DRAFT':
      return SQUAD_ONLINE_DRAFT_SECONDS;
    default:
      return null; // RESULT — süresiz
  }
}

/** Kriteri id'den GÜNCEL havuza göre yeniden çözer (metric'li). */
async function resolveCriterion(
  criterionId: string,
): Promise<{ criterion: SquadCriterion; players: Player[] }> {
  const { players } = await loadGameData();
  const healthy = pruneSquadCriteria(players, FORMATION);
  const criterion = healthy.find((c) => c.id === criterionId);
  if (!criterion) {
    throw new Error(`Kriter bulunamadı veya artık geçersiz: ${criterionId}.`);
  }
  return { criterion, players };
}

/** Aktif taraf = draftOrder[draftStep]. Bitmişse/DRAFT değilse null. */
export function activeSquadSide(state: SquadMatchState): DraftSide | null {
  if (state.scene !== 'DRAFT') return null;
  return state.draftOrder[state.draftStep] ?? null;
}

/** Bir slotun pozisyonu (formasyondan). Geçersiz slot → null. */
function slotPosition(slotId: string): string | null {
  return FORMATION.slots.find((s) => s.id === slotId)?.position ?? null;
}

/**
 * Online "Kadro Kur" için başlangıç state — kriter SEED'den DETERMİNİSTİK seçilir
 * (kullanıcı kararı: sunucu seçer, iki tarafa aynı, kimse avantaj almaz).
 * Kriter açılış ekranıyla başlar.
 */
export async function buildInitialSquadState(
  seed: string,
  p1Name: string,
  p2Name: string,
): Promise<SquadMatchState> {
  const { players } = await loadGameData();
  const healthy = pruneSquadCriteria(players, FORMATION);
  if (healthy.length === 0) {
    throw new Error('Sağlıklı kadro kriteri bulunamadı.');
  }
  const prng = createPRNG(`squad:${seed}:crit`);
  const criterion = healthy[Math.floor(prng.next() * healthy.length)]!;

  return {
    kind: 'kadro',
    criterionId: criterion.id,
    draftOrder: snakeDraftOrder(FORMATION.slots.length, 'P1'),
    draftStep: 0,
    p1Assignment: emptyAssignment(FORMATION),
    p2Assignment: emptyAssignment(FORMATION),
    jokerUsed: { P1: false, P2: false },
    scene: 'CRITERION_REVEAL',
    winner: null,
    p1Name,
    p2Name,
  };
}

/**
 * Kriter açılış ekranı görüldü → DRAFT'a geç. İdempotent (zaten DRAFT/RESULT → no-op).
 */
export function acknowledgeSquadReveal(state: SquadMatchState): SquadMatchState {
  if (state.scene !== 'CRITERION_REVEAL') return state;
  return { ...state, scene: 'DRAFT' };
}

/** Skorları hesaplayıp kazananı belirler (RESULT'a geçerken). */
async function finalizeSquad(state: SquadMatchState): Promise<SquadMatchState> {
  const { criterion, players } = await resolveCriterion(state.criterionId);
  const playersById = new Map(players.map((p) => [p.id, p]));
  const p1 = scoreSquad(state.p1Assignment, FORMATION, criterion, playersById);
  const p2 = scoreSquad(state.p2Assignment, FORMATION, criterion, playersById);
  const winner = compareSquads(p1, p2, criterion);
  return { ...state, scene: 'RESULT', winner };
}

/**
 * Bir tarafın draft pick'ini (slota oyuncu seç) SUNUCUDA doğrular ve uygular.
 * Sıra-tabanlı: yalnızca AKTİF tarafın pick'i kabul edilir.
 *
 * Doğrulamalar (sunucu otoritesi):
 *  - Sahne DRAFT, side AKTİF taraf olmalı.
 *  - slotId formasyonda olmalı + AKTİF tarafta BOŞ olmalı.
 *  - playerId güncel veride + slotun POZİSYONUNDA + kriter metriği/filtresini
 *    geçmeli + iki tarafın hiçbirinde seçili OLMAMALI (çapraz-dışlama).
 *
 * Son slot dolunca (tüm draft bitince) RESULT'a finalize edilir.
 */
export async function applySquadDraftPick(
  state: SquadMatchState,
  side: DraftSide,
  slotId: string,
  playerId: string,
): Promise<SquadMatchState> {
  if (state.scene !== 'DRAFT') {
    throw new Error(`Seçim yapılamaz: sahne DRAFT değil (${state.scene}).`);
  }
  if (activeSquadSide(state) !== side) {
    throw new Error('Sıra sende değil.');
  }
  const pos = slotPosition(slotId);
  if (!pos) {
    throw new Error(`Geçersiz slot: ${slotId}.`);
  }
  const myAssign = side === 'P1' ? state.p1Assignment : state.p2Assignment;
  if (myAssign[slotId] != null) {
    throw new Error('Bu mevki zaten dolu.');
  }
  const { criterion, players } = await resolveCriterion(state.criterionId);
  const player = players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`Geçersiz oyuncu: ${playerId} (güncel veride yok).`);
  }
  if (player.position !== pos) {
    throw new Error(`Bu oyuncu ${pos} mevkisine uygun değil.`);
  }
  if (criterion.metric(player) === null) {
    throw new Error('Bu oyuncunun bu kriterde değeri yok.');
  }
  if (criterion.poolFilter && !criterion.poolFilter(player)) {
    throw new Error('Bu oyuncu kriter filtresine uymuyor.');
  }
  if (draftedIds(state.p1Assignment, state.p2Assignment).has(playerId)) {
    throw new Error('Bu oyuncu zaten seçilmiş.');
  }

  return placeSquadPick(state, side, slotId, playerId);
}

/** Oyuncuyu slota koyar + adımı ilerletir (bittiyse finalize). */
async function placeSquadPick(
  state: SquadMatchState,
  side: DraftSide,
  slotId: string,
  playerId: string,
): Promise<SquadMatchState> {
  const assign: SquadAssignment = {
    ...(side === 'P1' ? state.p1Assignment : state.p2Assignment),
    [slotId]: playerId,
  };
  const next: SquadMatchState =
    side === 'P1'
      ? { ...state, p1Assignment: assign }
      : { ...state, p2Assignment: assign };
  return advanceSquadStep(next);
}

/** draftStep++ → bittiyse RESULT'a finalize. */
async function advanceSquadStep(state: SquadMatchState): Promise<SquadMatchState> {
  const draftStep = state.draftStep + 1;
  const stepped: SquadMatchState = { ...state, draftStep };
  if (draftStep >= state.draftOrder.length) {
    return finalizeSquad(stepped);
  }
  return stepped;
}

/** Öneri jokeri sonucu — client'a dönülecek (yalnız isteyene). */
export interface SquadSuggestionResult {
  slotId: string;
  playerId: string;
  value: number;
}

/**
 * Öneri jokeri — aktif tarafın kalan boş mevkilerinden birine kritere göre
 * iyi-mükemmel arası bir oyuncu önerir (offline `suggestForDraft`). YALNIZCA
 * isteği yapan tarafa döner; state'te joker "kullanıldı" işaretlenir (1×/taraf).
 * Öneriyi kabul = ayrı bir `draft-pick` (client kararı).
 */
export async function applySquadJoker(
  state: SquadMatchState,
  side: DraftSide,
): Promise<{ nextState: SquadMatchState; suggestion: SquadSuggestionResult | null }> {
  if (state.scene !== 'DRAFT') {
    throw new Error(`Öneri kullanılamaz: sahne DRAFT değil (${state.scene}).`);
  }
  if (state.jokerUsed[side]) {
    throw new Error('Öneri jokerini bu maçta zaten kullandın.');
  }
  if (activeSquadSide(state) !== side) {
    throw new Error('Öneri yalnızca kendi sıranda kullanılabilir.');
  }
  const { criterion, players } = await resolveCriterion(state.criterionId);
  const myAssign = side === 'P1' ? state.p1Assignment : state.p2Assignment;
  const excluded = draftedIds(state.p1Assignment, state.p2Assignment);
  // Deterministik öneri (deadline'a bağlı sözde-rastgele; PRNG akışı yok bu modda).
  let s = state.draftStep * 2654435761;
  const rng = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s % 1_000_000) / 1_000_000;
  };
  const sug = suggestForDraft(myAssign, FORMATION, criterion, players, excluded, rng);

  const nextState: SquadMatchState = {
    ...state,
    jokerUsed: { ...state.jokerUsed, [side]: true },
  };
  return {
    nextState,
    suggestion: sug
      ? { slotId: sug.slotId, playerId: sug.playerId, value: sug.value }
      : null,
  };
}

/**
 * Süre dolumunu uygular (sunucu-otoriteli). `nowMs >= deadlineMs` ise:
 *  - CRITERION_REVEAL: süre dolunca DRAFT'a geç.
 *  - DRAFT: aktif tarafın sırası dolduysa onun adına RASTGELE uygun slota
 *    rastgele oyuncu (offline `autoPickForDraft`). Sıra ilerler.
 *
 * Rastgelelik deadline'a bağlı (deterministik tekrar).
 */
export async function applySquadTimeout(
  state: SquadMatchState,
  deadlineMs: number | null,
  nowMs: number,
): Promise<{ state: SquadMatchState; changed: boolean }> {
  if (deadlineMs === null || nowMs < deadlineMs) {
    return { state, changed: false };
  }

  if (state.scene === 'CRITERION_REVEAL') {
    return { state: { ...state, scene: 'DRAFT' }, changed: true };
  }

  if (state.scene === 'DRAFT') {
    const side = activeSquadSide(state);
    if (!side) return { state, changed: false };
    const { criterion, players } = await resolveCriterion(state.criterionId);
    const myAssign = side === 'P1' ? state.p1Assignment : state.p2Assignment;
    const excluded = draftedIds(state.p1Assignment, state.p2Assignment);
    let pickSeed = Math.floor(deadlineMs / 1000);
    const rng = () => {
      pickSeed = (pickSeed * 1103515245 + 12345) & 0x7fffffff;
      return (pickSeed % 1_000_000) / 1_000_000;
    };
    const auto = autoPickForDraft(myAssign, FORMATION, criterion, players, excluded, rng);
    if (auto) {
      const next = await placeSquadPick(state, side, auto.slotId, auto.playerId);
      return { state: next, changed: true };
    }
    // Aday yoksa (nadir) sırayı yine ilerlet ki maç donmasın.
    const next = await advanceSquadStep(state);
    return { state: next, changed: true };
  }

  return { state, changed: false };
}

/** Client'a gönderilecek güvenli kriter özeti (metric'siz). */
export interface SquadCriterionView {
  id: string;
  title: string;
  unit: string;
  direction: 'max' | 'min';
}

export async function squadCriterionView(
  criterionId: string,
): Promise<SquadCriterionView | null> {
  try {
    const { criterion } = await resolveCriterion(criterionId);
    return {
      id: criterion.id,
      title: criterion.title,
      unit: criterion.unit,
      direction: criterion.direction,
    };
  } catch {
    return null;
  }
}

/** Bir slotun aday oyuncularını (id listesi) döner — client doğrulama/öneri için
 *  gerek olursa. Şimdilik client kendi havuzundan süzüyor; ileride lazım olabilir. */
export async function squadSlotCandidates(
  criterionId: string,
  slotId: string,
  excludeIds: string[],
): Promise<string[]> {
  const slot = FORMATION.slots.find((s) => s.id === slotId);
  if (!slot) return [];
  const { criterion, players } = await resolveCriterion(criterionId);
  return candidatesForSlot(slot, criterion, players, new Set(excludeIds)).map(
    (p) => p.id,
  );
}

export { FORMATION as SQUAD_FORMATION };
