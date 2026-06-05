import type { Player } from '@futbol-kart/shared-types';
import {
  TEMPLATES,
  templateApplicable,
  resolveRound,
  pickParams,
  interpolateTitle,
  type Template,
  type TemplateParams,
  type ResolverContext,
  type ClubLite,
} from '@futbol-kart/question-templates';
import { createPRNG, type PRNG } from './prng';
import {
  applyMultiplier,
  multiplierDirection,
  type MultiplierDirection,
} from './jokers';
import type { PlayerSide } from '@futbol-kart/shared-types';

export interface FlowContext {
  prng: PRNG;
  playersById: Map<string, Player>;
  resolver: ResolverContext;
  usedQuestionIds: Set<string>;
  /** Parametrik şablonlar için tur seçildiğinde üretilen somut değerler. */
  paramsByQuestion: Map<string, TemplateParams>;
  /** Son seçilen sorunun kategorisi — ardışık aynı kategoriyi engellemek için. */
  lastCategory?: string;
}

export function createFlowContext(
  seed: string,
  players: Player[],
  clubsLite: ClubLite[],
): FlowContext {
  const prng = createPRNG(seed);
  const resolver: ResolverContext = {
    clubsById: new Map(clubsLite.map((c) => [c.id, c])),
    rng: () => prng.next(),
  };
  return {
    prng,
    playersById: new Map(players.map((p) => [p.id, p])),
    resolver,
    usedQuestionIds: new Set(),
    paramsByQuestion: new Map(),
  };
}

export function pickQuestion(
  ctx: FlowContext,
  p1CardIds: string[],
  p2CardIds: string[],
): Template | null {
  const p1 = p1CardIds.map((id) => ctx.playersById.get(id)).filter(Boolean) as Player[];
  const p2 = p2CardIds.map((id) => ctx.playersById.get(id)).filter(Boolean) as Player[];

  const candidates = TEMPLATES.filter((t) => {
    if (ctx.usedQuestionIds.has(t.id)) return false;
    const p1Ok = p1.every((p) => templateApplicable(t, p));
    const p2Ok = p2.every((p) => templateApplicable(t, p));
    return p1Ok && p2Ok;
  });

  if (candidates.length === 0) return null;

  // Ardışık aynı kategoriyi engelle: son turla aynı kategoride OLMAYAN adaylar
  // varsa onlardan seç. Başka kategori yoksa (havuz dar) zorunlu olarak aynı
  // kategoriye düşeriz.
  const fresh = ctx.lastCategory
    ? candidates.filter((t) => t.category !== ctx.lastCategory)
    : candidates;
  const pool = fresh.length > 0 ? fresh : candidates;

  const choice = pool[Math.floor(ctx.prng.next() * pool.length)]!;
  ctx.usedQuestionIds.add(choice.id);
  ctx.lastCategory = choice.category;
  // Parametrik şablon ise somut değerleri şimdi üret ve sakla (deterministik).
  if (choice.params?.length && !ctx.paramsByQuestion.has(choice.id)) {
    ctx.paramsByQuestion.set(choice.id, pickParams(choice, () => ctx.prng.next()));
  }
  return choice;
}

/**
 * Bir şablonun başlığını, o tur için üretilmiş parametre değerleriyle
 * doldurarak döndürür ({targetApps} → 500 gibi). Parametre yoksa ham başlık.
 */
export function resolvedTitle(ctx: FlowContext, template: Template): string {
  return interpolateTitle(template.title.tr, ctx.paramsByQuestion.get(template.id));
}

/**
 * Tur sonucunu çözer.
 *
 * @param doubleSide  Çarpan jokerini kullanan taraf (varsa). O tarafın değeri,
 *   soru yönüne göre ×2 (max) veya ÷2 (min) edilir ve kazanan YENİDEN hesaplanır.
 *   Resolver saf kaldığı için çarpanı bu katmanda uygularız: değerleri alır,
 *   ilgili tarafı çarpar, compareValues mantığını burada tekrarlarız.
 *
 * Dönüş, ROUND_RESOLVED için gereken her şeyi içerir; çarpan uygulandığında
 * `p1Value`/`p2Value` çarpılmış (gösterilecek) değerlerdir ve `multiplier`
 * hangi tarafa hangi yönde uygulandığını belirtir.
 */
export function resolveCards(
  template: Template,
  p1CardId: string,
  p2CardId: string,
  ctx: FlowContext,
  doubleSide?: PlayerSide | null,
) {
  const p1 = ctx.playersById.get(p1CardId);
  const p2 = ctx.playersById.get(p2CardId);
  if (!p1 || !p2) {
    throw new Error('resolveCards: player not found');
  }
  // Bu tur için üretilmiş parametreleri resolver'a geçir (proximity hedefi vb.).
  ctx.resolver.params = ctx.paramsByQuestion.get(template.id);
  const base = resolveRound(template, p1, p2, ctx.resolver);

  if (!doubleSide) return base;

  // Çarpan uygula: ilgili tarafın değerini yöne göre değiştir, kazananı yeniden hesapla.
  const dir: MultiplierDirection = multiplierDirection(template);
  const p1Value =
    doubleSide === 'P1' ? applyMultiplier(base.p1Value, dir) : base.p1Value;
  const p2Value =
    doubleSide === 'P2' ? applyMultiplier(base.p2Value, dir) : base.p2Value;
  const winner = compareForWinner(p1Value, p2Value, template.compareOp);
  return {
    ...base,
    p1Value,
    p2Value,
    winner,
    multiplier: { side: doubleSide, dir },
  };
}

/**
 * resolver.ts içindeki compareValues'in aynısı (orada private). Çarpan sonrası
 * kazananı yeniden belirlemek için gerekli. Saf beraberlik mantığı korunur.
 */
function compareForWinner(
  v1: number | boolean | null,
  v2: number | boolean | null,
  op: 'max' | 'min' | 'bool',
): PlayerSide | 'tie' {
  if (v1 === null && v2 === null) return 'tie';
  if (v1 === null) return 'P2';
  if (v2 === null) return 'P1';
  if (op === 'bool') {
    if (v1 === v2) return 'tie';
    return v1 === true ? 'P1' : 'P2';
  }
  const n1 = typeof v1 === 'boolean' ? (v1 ? 1 : 0) : v1;
  const n2 = typeof v2 === 'boolean' ? (v2 ? 1 : 0) : v2;
  if (n1 === n2) return 'tie';
  if (op === 'max') return n1 > n2 ? 'P1' : 'P2';
  return n1 < n2 ? 'P1' : 'P2';
}

// ===========================
// "3 Zorunlu Kategori" bonus mekaniği
// ===========================

import {
  buildConditionLibrary,
  type ConditionContext,
} from './bonusConditions';
import {
  pickBonusConditions,
  autoAssign,
  completeBonusAssignment,
} from './bonusSelection';

const BONUS_LIBRARY = buildConditionLibrary();

/** Flow'un kulüp lookup'ından koşul bağlamı üretir. */
function bonusCtx(ctx: FlowContext): ConditionContext {
  return { clubsById: ctx.resolver.clubsById };
}

/** Bir el (cardId[]) → Player[]. */
function handPlayers(ctx: FlowContext, ids: string[]): Player[] {
  return ids.map((id) => ctx.playersById.get(id)).filter(Boolean) as Player[];
}

/**
 * Maç başı 3 bonus koşulu seç (deterministik, seed'e bağlı). Fizibil değilse boş.
 * Dönüş: { id, label } listesi (state için hafif).
 */
export function pickBonus(
  ctx: FlowContext,
  p1CardIds: string[],
  p2CardIds: string[],
): Array<{ id: string; label: string }> {
  const res = pickBonusConditions(
    BONUS_LIBRARY,
    handPlayers(ctx, p1CardIds),
    handPlayers(ctx, p2CardIds),
    bonusCtx(ctx),
    () => ctx.prng.next(),
  );
  return res.conditions.map((c) => ({ id: c.id, label: c.label }));
}

/**
 * Bir el için verilen koşullara otomatik kart ataması (bot). condIndex → cardId.
 */
export function autoAssignBonus(
  ctx: FlowContext,
  conditionIds: string[],
  handCardIds: string[],
): Array<string | null> {
  const conds = conditionIds
    .map((id) => BONUS_LIBRARY.find((c) => c.id === id))
    .filter(Boolean) as ReturnType<typeof buildConditionLibrary>;
  const result = autoAssign(conds, handPlayers(ctx, handCardIds), bonusCtx(ctx));
  return result ?? [null, null, null];
}

/** Bonus koşul bağlamı — UI sahnesinin predicate testleri için. */
export function bonusConditionContext(ctx: FlowContext): ConditionContext {
  return bonusCtx(ctx);
}

/**
 * Süre dolunca bonus atamasını fizibil tamamla: kullanıcının mevcut seçimlerini
 * koruyarak (gerekirse fizibilite için taşıyarak) 3 slotu da doldurur.
 */
export function completeBonus(
  ctx: FlowContext,
  conditionIds: string[],
  handCardIds: string[],
  assigned: Array<string | null>,
): Array<string | null> {
  const conds = conditionIds
    .map((id) => BONUS_LIBRARY.find((c) => c.id === id))
    .filter(Boolean) as ReturnType<typeof buildConditionLibrary>;
  const result = completeBonusAssignment(
    conds,
    handPlayers(ctx, handCardIds),
    bonusCtx(ctx),
    assigned,
  );
  return result ?? [...assigned];
}

export function botPickCard(ctx: FlowContext, hand: string[]): string {
  if (hand.length === 0) throw new Error('botPickCard: empty hand');
  return hand[Math.floor(ctx.prng.next() * hand.length)]!;
}

// ===========================
// Joker yardımcıları (flow bağlamını saf joker mantığına bağlar)
// ===========================

import {
  revealHandValues,
  botShouldUseMultiplier,
  autoCompleteTransfer,
  type RevealedHandValue,
  type BotTransferChoice,
} from './jokers';

/**
 * "İstatistiği Gör" jokeri için: verilen elin her kartının bu sorudaki değeri.
 * Flow context'inin resolver + param tablosunu kullanır (proximity hedefi vb.).
 */
export function revealHand(
  ctx: FlowContext,
  template: Template,
  handCardIds: string[],
): RevealedHandValue[] {
  return revealHandValues(
    template,
    handCardIds,
    ctx.playersById,
    ctx.resolver,
    ctx.paramsByQuestion.get(template.id),
  );
}

/** Bot çarpan jokerini kullanmalı mı? (PRNG ile deterministik) */
export function botMultiplierDecision(
  ctx: FlowContext,
  template: Template | null,
  alreadyUsed: boolean,
): boolean {
  return botShouldUseMultiplier(template, alreadyUsed, () => ctx.prng.next());
}

/**
 * Transfer'i tamamla (deterministik PRNG): kullanıcı seçimleri korunur, eksikler
 * rastgele doldurulur. Joker'e basıldıysa transfer kesin gerçekleşir.
 */
export function completeTransfer(
  ctx: FlowContext,
  ownPool: string[],
  oppPool: string[],
  give: string | null,
  take: string | null,
): BotTransferChoice | null {
  return autoCompleteTransfer(ownPool, oppPool, give, take, () => ctx.prng.next());
}
