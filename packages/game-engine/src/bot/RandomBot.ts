import type { BotContext, BotStrategy } from './BotStrategy';

export class RandomBot implements BotStrategy {
  readonly id = 'random';
  pickCard(ctx: BotContext): string {
    if (ctx.hand.length === 0) {
      throw new Error('RandomBot: empty hand');
    }
    return ctx.prng.pick(ctx.hand);
  }
}
