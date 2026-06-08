/**
 * Sunucu-otoriteli "Hedefe Yaklaş" online motoru.
 *
 * VS Düello'nun `matchEngine.ts`'inin KARDEŞİ — aynı felsefe: kuralları SUNUCU
 * işletir, client yalnızca "niyet" gönderir (şu slota şu oyuncuyu seçtim).
 * Sunucu doğrular, state'i ilerletir, DB'ye yazar, Ably ile yayar.
 *
 * Bu modül auth/HTTP'den BAĞIMSIZDIR — saf girdi/çıktı, test edilebilir.
 * Offline saf mantığı (`@/lib/targetMode`) AYNEN kullanır (tek kaynak) — orada
 * hiçbir şey değiştirilmez, sadece çağrılır.
 *
 * Snake draft SIRA-TABANLIDIR (kullanıcı kararı): sunucu `draftStep` tutar,
 * yalnızca o adımın aktif tarafının pick'ini kabul eder; süre dolunca otomatik
 * pick yapar (VS Düello'daki `applyTimeout` deseni).
 *
 * STATE SAKLAMA (kullanıcı kararı): `match.state` jsonb OPAK kullanılır.
 * `match.mode='hedef'` ise `match.state` = TargetMatchState. VS Düello'nun
 * SessionState'ine HİÇ dokunulmaz — şema/migration yok.
 */
import { createPRNG } from '@futbol-kart/game-engine';
import type { Player } from '@futbol-kart/shared-types';
import { loadGameData } from '@/lib/data';
import {
  SLOT_COUNT,
  resolveTargetBands,
  pickTarget,
  emptyPicks,
  snakeDraftOrder,
  draftedTargetIds,
  firstEmptySlot,
  autoPickForTargetDraft,
  scoreTarget,
  compareToTarget,
  type TargetCriterion,
  type TargetPicks,
  type DraftSide,
} from '@/lib/targetMode';

/** Online "Hedefe Yaklaş" maç durumu — `match.state` jsonb'ye yazılır (opak). */
export interface TargetMatchState {
  /** Mod imzası — savunma amaçlı (match.mode ile tutarlı olmalı). */
  kind: 'hedef';
  /** Kriter id'si (metric fonksiyonu serileştirilemez → id'den yeniden bulunur). */
  criterionId: string;
  /** Sunucunun seed'den deterministik seçtiği hedef değer (iki tarafa aynı). */
  target: number;
  /** Snake draft sırası (örn. P1,P2,P2,P1,…) — 2×SLOT_COUNT adım. */
  draftOrder: DraftSide[];
  /** Mevcut adım indeksi (0..draftOrder.length). */
  draftStep: number;
  /** İki tarafın seçtikleri (5'er slot). */
  p1Picks: TargetPicks;
  p2Picks: TargetPicks;
  /** Röntgen jokeri kullanıldı mı (taraf başına 1×). */
  xrayUsed: { P1: boolean; P2: boolean };
  /** Sunucu-otoriteli sahne. */
  scene: 'REVEAL_TARGET' | 'DRAFT' | 'RESULT';
  /** Sonuç (RESULT'ta). */
  winner: DraftSide | 'tie' | null;
  /** İsimler (matchmaking'den; gösterim için). */
  p1Name: string;
  p2Name: string;
}

/** Reveal-target ekranının (her iki tarafa) gösterim süresi (sn). */
export const TARGET_REVEAL_SECONDS = 6;
/** Online draft adımı süresi (sn) — süre dolunca otomatik pick. */
export const TARGET_ONLINE_DRAFT_SECONDS = 40;

/**
 * Bir sahnenin SÜRE LİMİTİ (saniye). Sunucu-otoriteli geri sayım bununla başlar;
 * süre dolunca sunucu otomatik işlem yapar. Süresiz sahneler için null.
 */
export function targetSceneDeadlineSeconds(state: TargetMatchState): number | null {
  switch (state.scene) {
    case 'REVEAL_TARGET':
      return TARGET_REVEAL_SECONDS;
    case 'DRAFT':
      return TARGET_ONLINE_DRAFT_SECONDS;
    default:
      return null; // RESULT — süresiz
  }
}

/** Kriteri id'den GÜNCEL havuza göre yeniden çözer (metric + bant). */
async function resolveCriterion(
  criterionId: string,
): Promise<{ criterion: TargetCriterion; players: Player[] }> {
  const { players } = await loadGameData();
  const all = resolveTargetBands(players);
  const criterion = all.find((c) => c.id === criterionId);
  if (!criterion) {
    throw new Error(`Kriter bulunamadı veya artık geçersiz: ${criterionId}.`);
  }
  return { criterion, players };
}

/** Aktif taraf = draftOrder[draftStep]. Bitmişse null. */
export function activeDraftSide(state: TargetMatchState): DraftSide | null {
  if (state.scene !== 'DRAFT') return null;
  return state.draftOrder[state.draftStep] ?? null;
}

/**
 * Online "Hedefe Yaklaş" için başlangıç state — kriter + hedef SEED'den
 * DETERMİNİSTİK seçilir (kullanıcı kararı: sunucu seçer, iki tarafa aynı, kimse
 * avantaj almaz). Reveal-target ekranıyla başlar.
 */
export async function buildInitialTargetState(
  seed: string,
  p1Name: string,
  p2Name: string,
): Promise<TargetMatchState> {
  const { players } = await loadGameData();
  const healthy = resolveTargetBands(players);
  if (healthy.length === 0) {
    throw new Error('Sağlıklı hedef kriteri bulunamadı.');
  }
  // Kriter seçimi seed'e bağlı deterministik (offline roundSeed deseninin
  // online karşılığı — burada seed maç id'sinden gelir, iki taraf eş görür).
  const critPrng = createPRNG(`target:${seed}:crit`);
  const criterion = healthy[Math.floor(critPrng.next() * healthy.length)]!;
  // Hedef değer ayrı PRNG akışı (offline'daki ':tgt' deseni).
  const tgtPrng = createPRNG(`${seed}:tgt`);
  const target = pickTarget(criterion, () => tgtPrng.next());

  return {
    kind: 'hedef',
    criterionId: criterion.id,
    target,
    draftOrder: snakeDraftOrder('P1'),
    draftStep: 0,
    p1Picks: emptyPicks(),
    p2Picks: emptyPicks(),
    xrayUsed: { P1: false, P2: false },
    scene: 'REVEAL_TARGET',
    winner: null,
    p1Name,
    p2Name,
  };
}

/**
 * Reveal-target ekranı görüldü → DRAFT'a geç. İdempotent: zaten DRAFT/RESULT ise
 * no-op (iki taraf da ack gönderebilir veya süre dolabilir).
 */
export function acknowledgeTargetReveal(state: TargetMatchState): TargetMatchState {
  if (state.scene !== 'REVEAL_TARGET') return state;
  return { ...state, scene: 'DRAFT' };
}

/** Skorları hesaplayıp kazananı belirler (RESULT'a geçerken). */
async function finalizeTarget(state: TargetMatchState): Promise<TargetMatchState> {
  const { criterion, players } = await resolveCriterion(state.criterionId);
  const playersById = new Map(players.map((p) => [p.id, p]));
  const p1 = scoreTarget(state.p1Picks, criterion, playersById);
  const p2 = scoreTarget(state.p2Picks, criterion, playersById);
  const winner = compareToTarget(p1.total, p2.total, state.target);
  return { ...state, scene: 'RESULT', winner };
}

/**
 * Bir tarafın draft pick'ini (slota oyuncu seç) SUNUCUDA doğrular ve uygular.
 * Sıra-tabanlı: yalnızca AKTİF tarafın pick'i kabul edilir.
 *
 * Doğrulamalar (sunucu otoritesi):
 *  - Sahne DRAFT olmalı.
 *  - side AKTİF taraf olmalı (sıra ondaysa).
 *  - playerId güncel veride OLMALI + kriter metriğine sahip + kriter filtresini
 *    geçmeli + iki tarafın hiçbirinde zaten seçili OLMAMALI (çapraz-dışlama).
 *
 * Pick aktif tarafın İLK BOŞ slotuna konur (offline applyDraftPick deseni).
 * Son adımdan sonra RESULT'a geçilir.
 */
export async function applyTargetDraftPick(
  state: TargetMatchState,
  side: DraftSide,
  playerId: string,
): Promise<TargetMatchState> {
  if (state.scene !== 'DRAFT') {
    throw new Error(`Seçim yapılamaz: sahne DRAFT değil (${state.scene}).`);
  }
  const active = activeDraftSide(state);
  if (active !== side) {
    throw new Error(`Sıra sende değil (aktif: ${active ?? 'yok'}).`);
  }
  const { criterion, players } = await resolveCriterion(state.criterionId);
  const player = players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`Geçersiz oyuncu: ${playerId} (güncel veride yok).`);
  }
  if (criterion.metric(player) === null) {
    throw new Error('Bu oyuncunun bu kriterde değeri yok.');
  }
  if (criterion.poolFilter && !criterion.poolFilter(player)) {
    throw new Error('Bu oyuncu kriter filtresine uymuyor.');
  }
  const drafted = draftedTargetIds(state.p1Picks, state.p2Picks);
  if (drafted.has(playerId)) {
    throw new Error('Bu oyuncu zaten seçilmiş.');
  }

  return placePick(state, side, playerId);
}

/** Bir oyuncuyu aktif tarafın ilk boş slotuna koyar + adımı ilerletir. */
async function placePick(
  state: TargetMatchState,
  side: DraftSide,
  playerId: string,
): Promise<TargetMatchState> {
  const picks: TargetPicks = [...(side === 'P1' ? state.p1Picks : state.p2Picks)];
  const slot = firstEmptySlot(picks);
  if (slot < 0) {
    // Tarafın tüm slotları dolu — sıra tutarsızlığı; adımı yine de ilerlet.
    return advanceStep(state);
  }
  picks[slot] = playerId;
  const next: TargetMatchState =
    side === 'P1' ? { ...state, p1Picks: picks } : { ...state, p2Picks: picks };
  return advanceStep(next);
}

/** draftStep++ → bittiyse RESULT'a finalize et. */
async function advanceStep(state: TargetMatchState): Promise<TargetMatchState> {
  const draftStep = state.draftStep + 1;
  const stepped: TargetMatchState = { ...state, draftStep };
  if (draftStep >= state.draftOrder.length) {
    return finalizeTarget(stepped);
  }
  return stepped;
}

/**
 * Röntgen jokeri — bir oyuncunun bu kriterdeki gizli değerini SUNUCUDA hesaplar
 * ve YALNIZCA isteği yapan tarafa döner (rakip görmez). Taraf başına 1×.
 * Aktif tarafın hakkıdır (sırası geldiğinde kullanır).
 */
export async function applyTargetXray(
  state: TargetMatchState,
  side: DraftSide,
  playerId: string,
): Promise<{ nextState: TargetMatchState; value: number }> {
  if (state.scene !== 'DRAFT') {
    throw new Error(`Röntgen kullanılamaz: sahne DRAFT değil (${state.scene}).`);
  }
  if (state.xrayUsed[side]) {
    throw new Error('Röntgen jokerini bu maçta zaten kullandın.');
  }
  // Yalnızca sırası gelen taraf röntgenleyebilir (offline: xraySideNow = aktif).
  const active = activeDraftSide(state);
  if (active !== side) {
    throw new Error('Röntgen yalnızca kendi sıranda kullanılabilir.');
  }
  const { criterion, players } = await resolveCriterion(state.criterionId);
  const player = players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`Geçersiz oyuncu: ${playerId}.`);
  }
  const value = criterion.metric(player) ?? 0;
  const nextState: TargetMatchState = {
    ...state,
    xrayUsed: { ...state.xrayUsed, [side]: true },
  };
  return { nextState, value };
}

/**
 * Süre dolumunu uygular (sunucu-otoriteli). `nowMs >= deadlineMs` ise:
 *  - REVEAL_TARGET: süre dolunca DRAFT'a geç (her iki taraf da görmüş kabul).
 *  - DRAFT: aktif tarafın sırası dolduysa onun adına RASTGELE uygun oyuncu seç
 *    (offline autoPickForTargetDraft). Sıra ilerler.
 *
 * Değişiklik olduysa changed=true (DB'ye yaz + Ably publish).
 * Rastgelelik deadline'a bağlı (PRNG'den bağımsız, deterministik tekrar).
 */
export async function applyTargetTimeout(
  state: TargetMatchState,
  deadlineMs: number | null,
  nowMs: number,
): Promise<{ state: TargetMatchState; changed: boolean }> {
  if (deadlineMs === null || nowMs < deadlineMs) {
    return { state, changed: false };
  }

  if (state.scene === 'REVEAL_TARGET') {
    return { state: { ...state, scene: 'DRAFT' }, changed: true };
  }

  if (state.scene === 'DRAFT') {
    const side = activeDraftSide(state);
    if (!side) return { state, changed: false };
    const { criterion, players } = await resolveCriterion(state.criterionId);
    const myPicks = side === 'P1' ? state.p1Picks : state.p2Picks;
    const excluded = draftedTargetIds(state.p1Picks, state.p2Picks);
    // Deadline'a bağlı sözde-rastgele (PRNG akışını bozmaz).
    let pickSeed = Math.floor(deadlineMs / 1000);
    const rng = () => {
      pickSeed = (pickSeed * 1103515245 + 12345) & 0x7fffffff;
      return (pickSeed % 1_000_000) / 1_000_000;
    };
    const auto = autoPickForTargetDraft(myPicks, criterion, players, excluded, rng);
    if (auto) {
      const next = await placePick(state, side, auto.playerId);
      return { state: next, changed: true };
    }
    // Aday yoksa (nadir) sırayı yine ilerlet ki maç donmasın.
    const next = await advanceStep(state);
    return { state: next, changed: true };
  }

  return { state, changed: false };
}

/** Reveal/draft için client'a gönderilecek güvenli kriter özeti (metric'siz). */
export interface TargetCriterionView {
  id: string;
  title: string;
  unit: string;
}

/** Client'a kriter metaverisini döner (metric fonksiyonu serileştirilemez). */
export async function targetCriterionView(
  criterionId: string,
): Promise<TargetCriterionView | null> {
  try {
    const { criterion } = await resolveCriterion(criterionId);
    return { id: criterion.id, title: criterion.title, unit: criterion.unit };
  } catch {
    return null;
  }
}

/** Sabit yeniden-export (route/hook'ta kullanılır). */
export { SLOT_COUNT };
