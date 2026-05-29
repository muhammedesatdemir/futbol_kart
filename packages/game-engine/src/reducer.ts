import type { GameState } from '@futbol-kart/shared-types';
import type { GameEvent } from './events';

export function initialState(): GameState {
  return {
    gameId: '',
    seed: '',
    mode: 'hotseat',
    phase: 'IDLE',
    roundIndex: 0,
    totalRounds: 7,
    p1Hand: [],
    p2Hand: [],
    p1Played: [],
    p2Played: [],
    p1Score: 0,
    p2Score: 0,
    rounds: [],
  };
}

export function reduce(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'GAME_STARTED':
      return {
        ...initialState(),
        gameId: event.gameId,
        seed: event.seed,
        mode: event.mode,
        p1Hand: event.p1Hand,
        p2Hand: event.p2Hand,
        totalRounds: event.totalRounds,
        phase: 'ROUND_INTRO',
      };

    case 'ROUND_STARTED':
      return {
        ...state,
        roundIndex: event.roundIndex,
        phase: 'QUESTION_REVEAL',
        currentQuestionId: undefined,
        currentP1Card: undefined,
        currentP2Card: undefined,
      };

    case 'QUESTION_REVEALED':
      return {
        ...state,
        currentQuestionId: event.questionId,
        phase: 'CARD_PLAY',
      };

    case 'CARD_PLAYED': {
      if (event.side === 'P1') {
        return {
          ...state,
          currentP1Card: event.cardId,
          p1Hand: state.p1Hand.filter((c) => c !== event.cardId),
          p1Played: [...state.p1Played, event.cardId],
        };
      }
      return {
        ...state,
        currentP2Card: event.cardId,
        p2Hand: state.p2Hand.filter((c) => c !== event.cardId),
        p2Played: [...state.p2Played, event.cardId],
      };
    }

    case 'ROUND_RESOLVED': {
      const p1Inc = event.winner === 'P1' ? 1 : 0;
      const p2Inc = event.winner === 'P2' ? 1 : 0;
      const round = {
        questionId: state.currentQuestionId!,
        p1CardId: state.currentP1Card!,
        p2CardId: state.currentP2Card!,
        p1Value: event.p1Value,
        p2Value: event.p2Value,
        winner: event.winner,
        tiebreakerUsed: event.tiebreakerUsed,
      };
      return {
        ...state,
        p1Score: state.p1Score + p1Inc,
        p2Score: state.p2Score + p2Inc,
        rounds: [...state.rounds, round],
        phase: 'ROUND_RESULT',
      };
    }

    case 'GAME_FINISHED':
      return { ...state, phase: 'FINAL' };

    default:
      return state;
  }
}
