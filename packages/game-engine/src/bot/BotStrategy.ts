import type { Question } from '@futbol-kart/shared-types';
import type { PRNG } from '../prng';

export interface BotContext {
  hand: string[];
  played: string[];
  question: Question;
  prng: PRNG;
}

export interface BotStrategy {
  readonly id: string;
  pickCard(ctx: BotContext): string;
}
