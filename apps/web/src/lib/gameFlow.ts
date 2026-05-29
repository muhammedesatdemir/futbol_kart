import type { Player } from '@futbol-kart/shared-types';
import {
  TEMPLATES,
  templateApplicable,
  resolveRound,
  type Template,
  type ResolverContext,
  type ClubLite,
} from '@futbol-kart/question-templates';
import { createPRNG, type PRNG } from '@futbol-kart/game-engine';

export interface FlowContext {
  prng: PRNG;
  playersById: Map<string, Player>;
  resolver: ResolverContext;
  usedQuestionIds: Set<string>;
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
  const choice = candidates[Math.floor(ctx.prng.next() * candidates.length)]!;
  ctx.usedQuestionIds.add(choice.id);
  return choice;
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
  return resolveRound(template, p1, p2, ctx.resolver);
}

export function botPickCard(ctx: FlowContext, hand: string[]): string {
  if (hand.length === 0) throw new Error('botPickCard: empty hand');
  return hand[Math.floor(ctx.prng.next() * hand.length)]!;
}
