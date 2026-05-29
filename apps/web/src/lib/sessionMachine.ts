import type { GameMode, PlayerSide } from '@futbol-kart/shared-types';
import {
  EXTRA_HAND_SIZE,
  EXTRA_ROUNDS,
  HAND_SIZE,
  SUDDEN_HAND_SIZE,
  SUDDEN_ROUNDS,
  TOTAL_ROUNDS,
} from './gameConstants';

/**
 * Oyun fazı. Aynı sahne enum'unu farklı fazlarda yeniden kullanırız.
 * Faz değişimi: ana maç (7 tur) sonunda eşitlik -> extra (4 kart, 3 tur),
 * yine eşitlik -> sudden (1 kart, 1 tur), yine eşitlik -> kabul edilen berabere.
 */
export type GamePhase = 'main' | 'extra' | 'sudden';

export type Scene =
  | 'MODE_SELECT'
  | 'CARD_PICK_P1'
  | 'HANDOFF'
  | 'CARD_PICK_P2'
  | 'ROUND_INTRO'
  | 'ROUND_PLAY'
  | 'ROUND_REVEAL'
  | 'ROUND_RESULT'
  | 'PHASE_TRANSITION'
  | 'FINAL';

export interface RoundLog {
  /** Hangi fazda oynandı */
  phase: GamePhase;
  questionId: string;
  questionTitle: string;
  p1CardId: string;
  p2CardId: string;
  p1Value: number | boolean | null;
  p2Value: number | boolean | null;
  winner: PlayerSide | 'tie';
  tiebreakerUsed?: string;
}

export interface SessionState {
  gameId: string;
  seed: string;
  scene: Scene;
  phase: GamePhase;
  mode: GameMode | null;
  /** Bu faz için tur sayısı */
  totalRounds: number;
  /** Bu faz için kart sayısı */
  handSize: number;
  roundIndex: number;
  p1Hand: string[];
  p2Hand: string[];
  /** Faz başına skor (ana maç + uzatma + sudden ayrı) */
  p1Score: number;
  p2Score: number;
  /** Birikmiş ana maç + uzatma skoru — final ekranı için */
  cumulativeP1: number;
  cumulativeP2: number;
  /** Oyuncu isimleri (modal ile alınır) */
  p1Name: string;
  p2Name: string;
  currentQuestionId: string | null;
  currentP1Card: string | null;
  currentP2Card: string | null;
  history: RoundLog[];
  /** Hangi oyuncular daha önce ele alındı (uzatmada havuzdan çıkarılır) */
  usedCardIds: string[];
}

export type SessionEvent =
  | { type: 'MODE_CHOSEN'; mode: GameMode }
  | { type: 'NAMES_SET'; p1Name: string; p2Name: string }
  | { type: 'HAND_SUBMITTED'; side: PlayerSide; cards: string[] }
  | { type: 'HANDOFF_CONTINUED' }
  | { type: 'ROUND_STARTED'; questionId: string }
  | { type: 'CARD_PLAYED'; side: PlayerSide; cardId: string }
  | {
      type: 'ROUND_RESOLVED';
      questionTitle: string;
      p1Value: number | boolean | null;
      p2Value: number | boolean | null;
      winner: PlayerSide | 'tie';
      tiebreakerUsed?: string;
    }
  | { type: 'ROUND_ACK' }
  | { type: 'PHASE_TRANSITION_ACK' }
  | { type: 'GAME_RESET' };

export function initialSession(gameId: string, seed: string): SessionState {
  return {
    gameId,
    seed,
    scene: 'MODE_SELECT',
    phase: 'main',
    mode: null,
    totalRounds: TOTAL_ROUNDS,
    handSize: HAND_SIZE,
    roundIndex: 0,
    p1Hand: [],
    p2Hand: [],
    p1Score: 0,
    p2Score: 0,
    cumulativeP1: 0,
    cumulativeP2: 0,
    p1Name: '',
    p2Name: '',
    currentQuestionId: null,
    currentP1Card: null,
    currentP2Card: null,
    history: [],
    usedCardIds: [],
  };
}

/**
 * Faz başına toplam puan ve eşitlik durumuna göre bir sonraki fazı belirler.
 * Eşitlik yoksa: FINAL.
 * Eşitlik varsa: main -> extra, extra -> sudden, sudden -> FINAL (berabere kabul).
 */
function nextPhaseAfter(state: SessionState): GamePhase | 'final' {
  if (state.p1Score !== state.p2Score) return 'final';
  if (state.phase === 'main') return 'extra';
  if (state.phase === 'extra') return 'sudden';
  return 'final'; // sudden death sonrası beraberse berabere kabul
}

function phaseConfig(phase: GamePhase): { rounds: number; hand: number } {
  if (phase === 'extra') return { rounds: EXTRA_ROUNDS, hand: EXTRA_HAND_SIZE };
  if (phase === 'sudden')
    return { rounds: SUDDEN_ROUNDS, hand: SUDDEN_HAND_SIZE };
  return { rounds: TOTAL_ROUNDS, hand: HAND_SIZE };
}

export function reduceSession(
  state: SessionState,
  event: SessionEvent,
): SessionState {
  switch (event.type) {
    case 'MODE_CHOSEN':
      return { ...state, mode: event.mode, scene: 'CARD_PICK_P1' };

    case 'NAMES_SET':
      return { ...state, p1Name: event.p1Name, p2Name: event.p2Name };

    case 'HAND_SUBMITTED': {
      if (event.side === 'P1') {
        if (state.mode === 'vs-bot') {
          return { ...state, p1Hand: event.cards, scene: 'ROUND_INTRO' };
        }
        return { ...state, p1Hand: event.cards, scene: 'HANDOFF' };
      }
      return { ...state, p2Hand: event.cards, scene: 'ROUND_INTRO' };
    }

    case 'HANDOFF_CONTINUED':
      return { ...state, scene: 'CARD_PICK_P2' };

    case 'ROUND_STARTED':
      return {
        ...state,
        currentQuestionId: event.questionId,
        currentP1Card: null,
        currentP2Card: null,
        scene: 'ROUND_PLAY',
      };

    case 'CARD_PLAYED': {
      if (event.side === 'P1') {
        return { ...state, currentP1Card: event.cardId };
      }
      return { ...state, currentP2Card: event.cardId };
    }

    case 'ROUND_RESOLVED': {
      const winnerSide = event.winner;
      const log: RoundLog = {
        phase: state.phase,
        questionId: state.currentQuestionId!,
        questionTitle: event.questionTitle,
        p1CardId: state.currentP1Card!,
        p2CardId: state.currentP2Card!,
        p1Value: event.p1Value,
        p2Value: event.p2Value,
        winner: winnerSide,
        tiebreakerUsed: event.tiebreakerUsed,
      };
      return {
        ...state,
        p1Hand: state.p1Hand.filter((c) => c !== state.currentP1Card),
        p2Hand: state.p2Hand.filter((c) => c !== state.currentP2Card),
        p1Score: state.p1Score + (winnerSide === 'P1' ? 1 : 0),
        p2Score: state.p2Score + (winnerSide === 'P2' ? 1 : 0),
        history: [...state.history, log],
        scene: 'ROUND_REVEAL',
      };
    }

    case 'ROUND_ACK': {
      const nextRound = state.roundIndex + 1;
      const phaseRoundsDone = nextRound >= state.totalRounds;
      const handsEmpty =
        state.p1Hand.length === 0 || state.p2Hand.length === 0;

      if (phaseRoundsDone || handsEmpty) {
        // Bu fazın skorunu cumulative'a ekle
        const cumulativeP1 = state.cumulativeP1 + state.p1Score;
        const cumulativeP2 = state.cumulativeP2 + state.p2Score;
        // Faz bitti — sonraki fazı belirle
        const next = nextPhaseAfter(state);
        if (next === 'final') {
          return {
            ...state,
            scene: 'FINAL',
            cumulativeP1,
            cumulativeP2,
          };
        }
        // Geçiş sahnesi: "Uzatma" / "Sudden death" duyurusu
        const cfg = phaseConfig(next);
        const usedCardIds = [
          ...state.usedCardIds,
          ...state.history.flatMap((r) => [r.p1CardId, r.p2CardId]),
        ];
        return {
          ...state,
          scene: 'PHASE_TRANSITION',
          phase: next,
          totalRounds: cfg.rounds,
          handSize: cfg.hand,
          roundIndex: 0,
          p1Hand: [],
          p2Hand: [],
          p1Score: 0,
          p2Score: 0,
          cumulativeP1,
          cumulativeP2,
          currentQuestionId: null,
          currentP1Card: null,
          currentP2Card: null,
          usedCardIds,
        };
      }

      return {
        ...state,
        roundIndex: nextRound,
        currentQuestionId: null,
        currentP1Card: null,
        currentP2Card: null,
        scene: 'ROUND_INTRO',
      };
    }

    case 'PHASE_TRANSITION_ACK':
      return { ...state, scene: 'CARD_PICK_P1' };

    case 'GAME_RESET':
      return initialSession(state.gameId, state.seed);

    default:
      return state;
  }
}
