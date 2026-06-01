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
import { createPRNG, type PRNG } from '@futbol-kart/game-engine';

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

export function resolveCards(
  template: Template,
  p1CardId: string,
  p2CardId: string,
  ctx: FlowContext,
) {
  const p1 = ctx.playersById.get(p1CardId);
  const p2 = ctx.playersById.get(p2CardId);
  if (!p1 || !p2) {
    throw new Error('resolveCards: player not found');
  }
  // Bu tur için üretilmiş parametreleri resolver'a geçir (proximity hedefi vb.).
  ctx.resolver.params = ctx.paramsByQuestion.get(template.id);
  return resolveRound(template, p1, p2, ctx.resolver);
}

export function botPickCard(ctx: FlowContext, hand: string[]): string {
  if (hand.length === 0) throw new Error('botPickCard: empty hand');
  return hand[Math.floor(ctx.prng.next() * hand.length)]!;
}
