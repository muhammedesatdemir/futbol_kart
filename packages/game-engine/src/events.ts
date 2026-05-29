import type { GameMode, PlayerSide } from '@futbol-kart/shared-types';

export type GameEvent =
  | {
      type: 'GAME_STARTED';
      gameId: string;
      seed: string;
      mode: GameMode;
      p1Hand: string[];
      p2Hand: string[];
      totalRounds: number;
    }
  | { type: 'ROUND_STARTED'; roundIndex: number }
  | { type: 'QUESTION_REVEALED'; questionId: string }
  | { type: 'CARD_PLAYED'; side: PlayerSide; cardId: string }
  | {
      type: 'ROUND_RESOLVED';
      winner: PlayerSide | 'tie';
      p1Value: number | boolean;
      p2Value: number | boolean;
      tiebreakerUsed?: string;
    }
  | { type: 'GAME_FINISHED' };
