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
  | 'BONUS_ASSIGN'
  | 'ROUND_INTRO'
  | 'ROUND_TRANSFER'
  | 'ROUND_PLAY'
  | 'ROUND_REVEAL'
  | 'ROUND_RESULT'
  | 'PHASE_TRANSITION'
  | 'FINAL';

/** "3 Zorunlu Kategori" bonus koşulu — UI/state için hafif gösterim. */
export interface BonusConditionLite {
  id: string;
  label: string;
}

/**
 * Bir tarafın joker kullanım durumu. Her joker maçta 1×/taraf — kullanıldıysa
 * bayrak true olur ve bir daha kullanılamaz (faz fark etmez, maç boyu kalıcı).
 */
export interface JokerState {
  /** Çarpan jokeri (×2 / ÷2) kullanıldı mı? */
  multiplierUsed: boolean;
  /** "İstatistiği Gör" jokeri kullanıldı mı? */
  revealUsed: boolean;
  /** "Transfer Hamlesi" jokeri kullanıldı mı? */
  transferUsed: boolean;
}

function freshJokers(): JokerState {
  return { multiplierUsed: false, revealUsed: false, transferUsed: false };
}

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
  /** Bu turda oynanan kart bonus kartıysa, ilgili tarafın bonusu (kazanınca +2). */
  p1Bonus?: boolean;
  p2Bonus?: boolean;
  /** Bonus kazanıldı mı (kazanan tarafın kartı bonus kartıydı). */
  bonusAwarded?: boolean;
  /** Bu turda çarpan jokeri kullanıldıysa: hangi taraf + yön. */
  multiplier?: { side: PlayerSide; dir: 'x2' | 'half' };
  /** Bu turda "İstatistiği Gör" jokerini kullanan taraf(lar). */
  revealUsedBy?: PlayerSide[];
  /** Bu turun başında transfer yapan taraf (varsa). */
  transferBy?: PlayerSide;
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

  /**
   * "3 Zorunlu Kategori" bonus mekaniği (yalnızca ana maç).
   * Boş dizi = bonus aktif değil (uzatma/sudden veya fizibil set bulunamadı).
   */
  bonusConditions: BonusConditionLite[];
  /** P1/P2 için condIndex → cardId ataması (3 slot). null = boş. */
  p1BonusCards: Array<string | null>;
  p2BonusCards: Array<string | null>;
  /** BONUS_ASSIGN sahnesinde atama yapan aktif taraf. */
  bonusAssignSide: PlayerSide;
  /** Bu fazın bonus kararı verildi mi (tek-sefer tetikleme guard'ı). */
  bonusResolved: boolean;

  /** Joker kullanım durumu (maç boyu kalıcı, taraf bazlı). */
  p1Jokers: JokerState;
  p2Jokers: JokerState;
  /**
   * Transfer edilmiş kart id'leri — bir daha transfer edilemez (ikisi de geri
   * alamaz). Maç boyu birikir.
   */
  transferLockedIds: string[];
  /**
   * Bu turda transfer jokerini açan taraf (ROUND_TRANSFER sahnesinde). null =
   * transfer akışı aktif değil. TRANSFER_EXECUTE/SKIP sonrası null'a döner.
   */
  transferOpenSide: PlayerSide | null;
  /**
   * Bu turda fiilen transfer YAPAN taraf (tur sonu özeti için). Yeni tur
   * başında temizlenir. SKIP'te set edilmez.
   */
  transferThisRound: PlayerSide | null;
  /**
   * Bu tur için çarpan jokerini AKTİF EDEN taraf (resolve'dan önce). Resolve
   * sırasında bu tarafın değeri soru yönüne göre çarpılır. Her tur başında
   * null'a döner.
   */
  pendingMultiplier: PlayerSide | null;
  /**
   * "İstatistiği Gör" jokerinin bu turda görsel olarak AKTİF olduğu taraf(lar).
   * Saf UI bayrağı (kartların değer rozetini göster). Her tur başında temizlenir.
   * Hot-seat'te P1 ve P2 ayrı ayrı kullanabildiği için iki bayrak.
   */
  p1RevealActive: boolean;
  p2RevealActive: boolean;
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
      /** Çarpan jokeri uygulandıysa hangi taraf + yön (log + reveal için). */
      multiplier?: { side: PlayerSide; dir: 'x2' | 'half' };
    }
  | {
      /** Çarpan jokerini aktif et (resolve'dan önce). Tek kullanım/taraf. */
      type: 'JOKER_MULTIPLIER';
      side: PlayerSide;
    }
  | {
      /** "İstatistiği Gör" jokerini aktif et (kart seçmeden önce, görsel). */
      type: 'JOKER_REVEAL';
      side: PlayerSide;
    }
  | {
      /** "Transfer Hamlesi" jokerini aç → ROUND_TRANSFER sahnesine geç. */
      type: 'JOKER_TRANSFER_OPEN';
      side: PlayerSide;
    }
  | {
      /**
       * Transfer'i uygula: aktif taraf `give` kartını verir, rakibin `take`
       * kartını alır (swap). İki kart da transferLockedIds'e eklenir.
       */
      type: 'TRANSFER_EXECUTE';
      side: PlayerSide;
      give: string;
      take: string;
    }
  | {
      /** Transfer'den vazgeç / süre doldu (değişim yapılmadı; hak yine de yandı). */
      type: 'TRANSFER_SKIP';
      side: PlayerSide;
    }
  | { type: 'ROUND_ACK' }
  | { type: 'PHASE_TRANSITION_ACK' }
  | {
      /** Maç başında 3 bonus koşulu belirlendi → BONUS_ASSIGN sahnesine geç. */
      type: 'BONUS_CONDITIONS_SET';
      conditions: BonusConditionLite[];
      /** Bot için P2 ataması önceden hesaplanmış olabilir. */
      p2Cards?: Array<string | null>;
    }
  | {
      /** Aktif taraf bir kartı bir bonus slotuna atadı (veya temizledi: cardId=null). */
      type: 'BONUS_CARD_ASSIGNED';
      side: PlayerSide;
      slot: number;
      cardId: string | null;
    }
  | {
      /** Aktif taraf 3 slotu doldurup onayladı. */
      type: 'BONUS_CONFIRMED';
      side: PlayerSide;
    }
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
    bonusConditions: [],
    p1BonusCards: [null, null, null],
    p2BonusCards: [null, null, null],
    bonusAssignSide: 'P1',
    bonusResolved: false,
    p1Jokers: freshJokers(),
    p2Jokers: freshJokers(),
    transferLockedIds: [],
    transferOpenSide: null,
    transferThisRound: null,
    pendingMultiplier: null,
    p1RevealActive: false,
    p2RevealActive: false,
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
      // Online: el seçimi EŞZAMANLI ve ayrı cihazlarda. Reducer her eli bağımsız
      // set eder; sahne geçişini (iki el de gelince ROUND_INTRO) SUNUCU yönetir
      // (cihaz devri/HANDOFF yok). Bkz ONLINE-YOL-HARITASI.md.
      if (state.mode === 'online') {
        const key = event.side === 'P1' ? 'p1Hand' : 'p2Hand';
        return { ...state, [key]: event.cards };
      }
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
        // Yeni tur: çarpan beklentisi + reveal görseli sıfırlanır
        // (joker KULLANILDI bayrakları kalıcı — sıfırlanmaz).
        // transferThisRound KORUNUR: transfer ROUND_INTRO'da (bu event'ten önce)
        // yapılır; log için resolve'a kadar taşınmalı. ROUND_ACK'te temizlenir.
        pendingMultiplier: null,
        p1RevealActive: false,
        p2RevealActive: false,
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
      // Oynanan kart, ilgili tarafın bonus kartlarından biri mi?
      const p1Bonus = state.currentP1Card !== null && state.p1BonusCards.includes(state.currentP1Card);
      const p2Bonus = state.currentP2Card !== null && state.p2BonusCards.includes(state.currentP2Card);
      // Kazanan tarafın kartı bonus kartıysa puan 2, değilse 1.
      const winnerBonus =
        (winnerSide === 'P1' && p1Bonus) || (winnerSide === 'P2' && p2Bonus);
      const points = winnerBonus ? 2 : 1;
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
        p1Bonus,
        p2Bonus,
        bonusAwarded: winnerBonus,
        multiplier: event.multiplier,
        revealUsedBy: [
          ...(state.p1RevealActive ? (['P1'] as PlayerSide[]) : []),
          ...(state.p2RevealActive ? (['P2'] as PlayerSide[]) : []),
        ],
        transferBy: state.transferThisRound ?? undefined,
      };
      return {
        ...state,
        p1Hand: state.p1Hand.filter((c) => c !== state.currentP1Card),
        p2Hand: state.p2Hand.filter((c) => c !== state.currentP2Card),
        p1Score: state.p1Score + (winnerSide === 'P1' ? points : 0),
        p2Score: state.p2Score + (winnerSide === 'P2' ? points : 0),
        history: [...state.history, log],
        // Çarpan beklentisi tüketildi; reveal görseli reveal sahnesinde gereksiz.
        pendingMultiplier: null,
        p1RevealActive: false,
        p2RevealActive: false,
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
          // Bonus yalnızca ana maçta; uzatma/sudden'da sıfırla + tekrar tetikleme.
          bonusConditions: [],
          p1BonusCards: [null, null, null],
          p2BonusCards: [null, null, null],
          bonusResolved: true,
          // Tur-içi joker görselleri sıfırlanır (KULLANILDI bayrakları kalıcı).
          pendingMultiplier: null,
          p1RevealActive: false,
          p2RevealActive: false,
          transferThisRound: null,
        };
      }

      return {
        ...state,
        roundIndex: nextRound,
        currentQuestionId: null,
        currentP1Card: null,
        currentP2Card: null,
        transferThisRound: null,
        scene: 'ROUND_INTRO',
      };
    }

    case 'PHASE_TRANSITION_ACK':
      return { ...state, scene: 'CARD_PICK_P1' };

    case 'BONUS_CONDITIONS_SET': {
      // Fizibil 3 koşul yoksa bonus atlanır → doğrudan tur akışına gir.
      if (event.conditions.length < 3) {
        return { ...state, bonusConditions: [], bonusResolved: true, scene: 'ROUND_INTRO' };
      }
      return {
        ...state,
        bonusConditions: event.conditions,
        p1BonusCards: [null, null, null],
        p2BonusCards: event.p2Cards ?? [null, null, null],
        bonusAssignSide: 'P1',
        bonusResolved: true,
        scene: 'BONUS_ASSIGN',
      };
    }

    case 'BONUS_CARD_ASSIGNED': {
      const key = event.side === 'P1' ? 'p1BonusCards' : 'p2BonusCards';
      const next = [...state[key]];
      // Aynı kart başka slota atanmışsa oradan kaldır (tek kart tek slot).
      if (event.cardId !== null) {
        for (let i = 0; i < next.length; i++) {
          if (next[i] === event.cardId) next[i] = null;
        }
      }
      next[event.slot] = event.cardId;
      return { ...state, [key]: next };
    }

    case 'BONUS_CONFIRMED': {
      // Hotseat: P1 onaylayınca P2'ye geç; P2 onaylayınca tura başla.
      // Vs-bot: P1 onaylayınca (P2 zaten otomatik atanmış) tura başla.
      // Online: bonus atama EŞZAMANLI; reducer onayı kaydeder, iki taraf da
      // onaylayınca ROUND_INTRO'ya geçişi SUNUCU yapar (sahne değiştirmez).
      if (state.mode === 'online') {
        return state;
      }
      if (event.side === 'P1' && state.mode === 'hotseat') {
        return { ...state, bonusAssignSide: 'P2' };
      }
      return { ...state, scene: 'ROUND_INTRO' };
    }

    case 'JOKER_MULTIPLIER': {
      // Tek kullanım/taraf + tur başına tek aktivasyon. Guard'lar UI'da da var
      // ama reducer son sözü söyler (idempotent koruma).
      const used =
        event.side === 'P1'
          ? state.p1Jokers.multiplierUsed
          : state.p2Jokers.multiplierUsed;
      if (used || state.pendingMultiplier !== null) return state;
      const key = event.side === 'P1' ? 'p1Jokers' : 'p2Jokers';
      return {
        ...state,
        [key]: { ...state[key], multiplierUsed: true },
        pendingMultiplier: event.side,
      };
    }

    case 'JOKER_REVEAL': {
      const used =
        event.side === 'P1'
          ? state.p1Jokers.revealUsed
          : state.p2Jokers.revealUsed;
      if (used) return state;
      const jokerKey = event.side === 'P1' ? 'p1Jokers' : 'p2Jokers';
      const activeKey = event.side === 'P1' ? 'p1RevealActive' : 'p2RevealActive';
      return {
        ...state,
        [jokerKey]: { ...state[jokerKey], revealUsed: true },
        [activeKey]: true,
      };
    }

    case 'JOKER_TRANSFER_OPEN': {
      const used =
        event.side === 'P1'
          ? state.p1Jokers.transferUsed
          : state.p2Jokers.transferUsed;
      if (used || state.transferOpenSide !== null) return state;
      // Hak tüketilir (açar açmaz). Değişim yapmasa da yanar (kaos kuralı).
      const key = event.side === 'P1' ? 'p1Jokers' : 'p2Jokers';
      return {
        ...state,
        [key]: { ...state[key], transferUsed: true },
        transferOpenSide: event.side,
        scene: 'ROUND_TRANSFER',
      };
    }

    case 'TRANSFER_EXECUTE': {
      const giverKey = event.side === 'P1' ? 'p1Hand' : 'p2Hand';
      const takerKey = event.side === 'P1' ? 'p2Hand' : 'p1Hand';
      // give: aktif tarafın elinden çıkar, rakibe ekle.
      // take: rakibin elinden çıkar, aktif tarafa ekle.
      const giverHand = state[giverKey]
        .filter((c) => c !== event.give)
        .concat(event.take);
      const takerHand = state[takerKey]
        .filter((c) => c !== event.take)
        .concat(event.give);
      return {
        ...state,
        [giverKey]: giverHand,
        [takerKey]: takerHand,
        transferLockedIds: [
          ...state.transferLockedIds,
          event.give,
          event.take,
        ],
        transferOpenSide: null,
        transferThisRound: event.side,
        scene: 'ROUND_INTRO',
      };
    }

    case 'TRANSFER_SKIP':
      return { ...state, transferOpenSide: null, scene: 'ROUND_INTRO' };

    case 'GAME_RESET':
      return initialSession(state.gameId, state.seed);

    default:
      return state;
  }
}
