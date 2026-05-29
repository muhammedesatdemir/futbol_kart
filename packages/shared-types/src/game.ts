export type GamePhase =
  | 'IDLE'
  | 'MODE_SELECT'
  | 'CARD_PICK'
  | 'ROUND_INTRO'
  | 'QUESTION_REVEAL'
  | 'CARD_PLAY'
  | 'COMPARE_REVEAL'
  | 'ROUND_RESULT'
  | 'FINAL';

export type GameMode = 'hotseat' | 'vs-bot';

export type PlayerSide = 'P1' | 'P2';

export interface RoundResult {
  questionId: string;
  p1CardId: string;
  p2CardId: string;
  p1Value: number | boolean;
  p2Value: number | boolean;
  winner: PlayerSide | 'tie';
  tiebreakerUsed?: string;
}

export interface GameState {
  gameId: string;
  seed: string;
  mode: GameMode;
  phase: GamePhase;
  roundIndex: number;
  totalRounds: number;
  p1Hand: string[];
  p2Hand: string[];
  p1Played: string[];
  p2Played: string[];
  p1Score: number;
  p2Score: number;
  currentQuestionId?: string;
  currentP1Card?: string;
  currentP2Card?: string;
  rounds: RoundResult[];
}
