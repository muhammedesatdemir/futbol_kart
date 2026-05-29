import type { GameState, PlayerSide } from '@futbol-kart/shared-types';
import type { GameEvent } from './events';

export function validate(
  state: GameState,
  event: GameEvent,
  actor: PlayerSide | 'system',
): boolean {
  switch (event.type) {
    case 'GAME_STARTED':
      return state.phase === 'IDLE' && actor === 'system';

    case 'ROUND_STARTED':
      return (
        actor === 'system' &&
        (state.phase === 'ROUND_INTRO' || state.phase === 'ROUND_RESULT') &&
        event.roundIndex >= 0 &&
        event.roundIndex < state.totalRounds
      );

    case 'QUESTION_REVEALED':
      return actor === 'system' && state.phase === 'QUESTION_REVEAL';

    case 'CARD_PLAYED': {
      if (state.phase !== 'CARD_PLAY') return false;
      if (event.side !== actor && actor !== 'system') return false;
      const hand = event.side === 'P1' ? state.p1Hand : state.p2Hand;
      return hand.includes(event.cardId);
    }

    case 'ROUND_RESOLVED':
      return (
        actor === 'system' &&
        state.phase === 'CARD_PLAY' &&
        state.currentP1Card !== undefined &&
        state.currentP2Card !== undefined
      );

    case 'GAME_FINISHED':
      return actor === 'system' && state.roundIndex + 1 >= state.totalRounds;

    default:
      return false;
  }
}
