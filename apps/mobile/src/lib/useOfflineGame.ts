import { useCallback, useEffect, useRef } from 'react';
import {
  pickQuestion,
  resolveCards,
  resolvedTitle,
  botPickCard,
  botMultiplierDecision,
  pickBonus,
  autoAssignBonus,
  transferableCards,
  botTransferChoice,
  type SessionState,
} from '@futbol-kart/game-engine';
import { templateById } from '@futbol-kart/question-templates';
import { useSessionStore } from './stores';
import { useGameSession } from './GameSessionProvider';

/**
 * Offline VS Düello orkestratörü (mobil). Web karşılığı: apps/web/src/app/oyna/
 * [gameId]/page.tsx içindeki ~10 useEffect'in toplandığı tek hook.
 *
 * SORUMLULUK: oyun mantığı game-engine'de; bu hook YALNIZCA otomatik geçişleri
 * (bot hamleleri, async soru seçimi, reveal→result) zamanlar ve dispatch eder.
 *
 * NOT: İlk sürüm — bonus (3 kategori) ve transfer jokeri henüz YOK. Çekirdek
 * akış: mod → el seç → tur (çarpan/reveal jokerleri dahil) → final. Bonus/transfer
 * sonra eklenecek (MOBIL-YOL-HARITASI Faz 3).
 */
export function useOfflineGame() {
  const state = useSessionStore((s) => s.state);
  const dispatch = useSessionStore((s) => s.dispatch);
  const session = useGameSession();
  const flow = session.ready ? session.getFlow(state.seed) : null;

  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botTransferHandledRef = useRef<string | null>(null);

  // ── Bot el seçimi (vs-bot): P1 elini verince bota rastgele handSize kart ─────
  useEffect(() => {
    if (
      state.mode === 'vs-bot' &&
      state.scene === 'ROUND_INTRO' &&
      state.p2Hand.length === 0 &&
      session.ready
    ) {
      const exclude = new Set([...state.usedCardIds, ...state.p1Hand]);
      const pool = session.players.map((p) => p.id).filter((id) => !exclude.has(id));
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      dispatch({ type: 'HAND_SUBMITTED', side: 'P2', cards: shuffled.slice(0, state.handSize) });
    }
  }, [
    state.mode,
    state.scene,
    state.p1Hand,
    state.p2Hand.length,
    state.usedCardIds,
    state.handSize,
    session.players,
    session.ready,
    dispatch,
  ]);

  // ── Bonus tur: ana maç ilk turundan ÖNCE 3 kategori koşulu belirle ──────────
  // Eller hazır + henüz çözülmemişse → koşulları seç, BONUS_CONDITIONS_SET dispatch
  // (fizibilse BONUS_ASSIGN'a, değilse ROUND_INTRO'da kalır). Web page.tsx mantığı.
  useEffect(() => {
    if (!flow) return;
    if (state.scene !== 'ROUND_INTRO') return;
    if (state.phase !== 'main' || state.roundIndex !== 0) return;
    if (state.bonusResolved) return;
    if (state.p1Hand.length === 0 || state.p2Hand.length === 0) return;
    const conditions = pickBonus(flow, state.p1Hand, state.p2Hand);
    const p2Cards =
      conditions.length === 3 && state.mode === 'vs-bot'
        ? autoAssignBonus(flow, conditions.map((c) => c.id), state.p2Hand)
        : undefined;
    dispatch({ type: 'BONUS_CONDITIONS_SET', conditions, p2Cards });
  }, [
    state.scene,
    state.phase,
    state.roundIndex,
    state.bonusResolved,
    state.p1Hand,
    state.p2Hand,
    state.mode,
    flow,
    dispatch,
  ]);

  // ── ROUND_INTRO bot transfer kararı (vs-bot) — ~%25 kör değiş-tokuş ──────────
  useEffect(() => {
    if (!flow) return;
    if (state.mode !== 'vs-bot') return;
    if (state.scene !== 'ROUND_INTRO') return;
    if (state.p1Hand.length === 0 || state.p2Hand.length === 0) return;
    if (state.phase === 'main' && state.roundIndex === 0 && !state.bonusResolved) return;
    const roundKey = `${state.phase}-${state.roundIndex}`;
    if (botTransferHandledRef.current === roundKey) return;
    botTransferHandledRef.current = roundKey;

    const isLast = state.roundIndex + 1 >= state.totalRounds;
    const botPool = transferableCards(state.p2Hand, state.p2BonusCards, state.transferLockedIds);
    const p1Pool = transferableCards(state.p1Hand, state.p1BonusCards, state.transferLockedIds);
    const choice = botTransferChoice(
      state.p2Jokers.transferUsed,
      isLast,
      botPool,
      p1Pool,
      () => flow.prng.next(),
    );
    if (choice) {
      dispatch({ type: 'JOKER_TRANSFER_OPEN', side: 'P2' });
      dispatch({ type: 'TRANSFER_EXECUTE', side: 'P2', give: choice.give, take: choice.take });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mode, state.scene, state.phase, state.roundIndex, state.bonusResolved]);

  // ── ROUND_INTRO → soru seç → ROUND_STARTED (stinger için ~750ms) ─────────────
  useEffect(() => {
    if (!flow) return;
    if (state.scene !== 'ROUND_INTRO') return;
    if (state.p1Hand.length === 0 || state.p2Hand.length === 0) return;
    // Bonus kararı verilmeden soru seçme (ana maç ilk turunda BONUS_ASSIGN'a gidilir).
    if (state.phase === 'main' && state.roundIndex === 0 && !state.bonusResolved) return;
    const q = pickQuestion(flow, state.p1Hand, state.p2Hand);
    if (!q) return;
    const t = setTimeout(() => dispatch({ type: 'ROUND_STARTED', questionId: q.id }), 750);
    return () => clearTimeout(t);
  }, [state.scene, state.p1Hand, state.p2Hand, state.phase, state.roundIndex, state.bonusResolved, flow, dispatch]);

  // ── ROUND_PLAY: P1 oynadıysa bot oynar (çarpan kararı + kart) ─────────────────
  useEffect(() => {
    if (!flow) return;
    if (state.scene !== 'ROUND_PLAY') return;
    if (state.mode !== 'vs-bot') return;
    if (!state.currentP1Card || state.currentP2Card) return;
    botTimerRef.current = setTimeout(() => {
      const template = state.currentQuestionId
        ? templateById(state.currentQuestionId) ?? null
        : null;
      if (botMultiplierDecision(flow, template, state.p2Jokers.multiplierUsed)) {
        dispatch({ type: 'JOKER_MULTIPLIER', side: 'P2' });
      }
      const cardId = botPickCard(flow, state.p2Hand);
      dispatch({ type: 'CARD_PLAYED', side: 'P2', cardId });
    }, 600);
    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
  }, [
    state.scene,
    state.mode,
    state.currentP1Card,
    state.currentP2Card,
    state.currentQuestionId,
    state.p2Hand,
    state.p2Jokers.multiplierUsed,
    flow,
    dispatch,
  ]);

  // ── ROUND_PLAY: iki kart oynandı → resolve (350ms) ───────────────────────────
  useEffect(() => {
    if (!flow) return;
    if (state.scene !== 'ROUND_PLAY') return;
    if (!state.currentP1Card || !state.currentP2Card || !state.currentQuestionId) return;
    const template = templateById(state.currentQuestionId);
    if (!template) return;
    const t = setTimeout(() => {
      const outcome = resolveCards(
        template,
        state.currentP1Card!,
        state.currentP2Card!,
        flow,
        state.pendingMultiplier,
      );
      dispatch({
        type: 'ROUND_RESOLVED',
        questionTitle: resolvedTitle(flow, template) || template.id,
        p1Value: outcome.p1Value,
        p2Value: outcome.p2Value,
        winner: outcome.winner,
        tiebreakerUsed: outcome.tiebreakerUsed,
        multiplier: 'multiplier' in outcome ? outcome.multiplier : undefined,
      });
    }, 350);
    return () => clearTimeout(t);
  }, [
    state.scene,
    state.currentP1Card,
    state.currentP2Card,
    state.currentQuestionId,
    state.pendingMultiplier,
    flow,
    dispatch,
  ]);

  // ── ROUND_REVEAL → ROUND_RESULT (flip + count-up + buffer ~1450ms) ───────────
  useEffect(() => {
    if (state.scene !== 'ROUND_REVEAL') return;
    const t = setTimeout(() => {
      useSessionStore.setState((s) => ({ state: { ...s.state, scene: 'ROUND_RESULT' } }));
    }, 1450);
    return () => clearTimeout(t);
  }, [state.scene]);

  // ── Eylem callback'leri (sahnelerden çağrılır) ───────────────────────────────
  const actions = {
    chooseMode: useCallback((mode: SessionState['mode']) => {
      if (mode) dispatch({ type: 'MODE_CHOSEN', mode });
    }, [dispatch]),
    setNames: useCallback((p1Name: string, p2Name: string) => {
      dispatch({ type: 'NAMES_SET', p1Name, p2Name });
    }, [dispatch]),
    submitHand: useCallback((side: 'P1' | 'P2', cards: string[]) => {
      dispatch({ type: 'HAND_SUBMITTED', side, cards });
    }, [dispatch]),
    handoffContinue: useCallback(() => dispatch({ type: 'HANDOFF_CONTINUED' }), [dispatch]),
    playCard: useCallback((side: 'P1' | 'P2', cardId: string) => {
      dispatch({ type: 'CARD_PLAYED', side, cardId });
    }, [dispatch]),
    useMultiplier: useCallback((side: 'P1' | 'P2') => {
      dispatch({ type: 'JOKER_MULTIPLIER', side });
    }, [dispatch]),
    useReveal: useCallback((side: 'P1' | 'P2') => {
      dispatch({ type: 'JOKER_REVEAL', side });
    }, [dispatch]),
    assignBonus: useCallback((side: 'P1' | 'P2', slot: number, cardId: string | null) => {
      dispatch({ type: 'BONUS_CARD_ASSIGNED', side, slot, cardId });
    }, [dispatch]),
    confirmBonus: useCallback((side: 'P1' | 'P2') => {
      dispatch({ type: 'BONUS_CONFIRMED', side });
    }, [dispatch]),
    openTransfer: useCallback((side: 'P1' | 'P2') => {
      dispatch({ type: 'JOKER_TRANSFER_OPEN', side });
    }, [dispatch]),
    executeTransfer: useCallback((side: 'P1' | 'P2', give: string, take: string) => {
      dispatch({ type: 'TRANSFER_EXECUTE', side, give, take });
    }, [dispatch]),
    skipTransfer: useCallback((side: 'P1' | 'P2') => {
      dispatch({ type: 'TRANSFER_SKIP', side });
    }, [dispatch]),
    ackRound: useCallback(() => dispatch({ type: 'ROUND_ACK' }), [dispatch]),
    ackPhaseTransition: useCallback(() => dispatch({ type: 'PHASE_TRANSITION_ACK' }), [dispatch]),
    reset: useCallback(() => dispatch({ type: 'GAME_RESET' }), [dispatch]),
  };

  return { state, flow, actions, ready: session.ready };
}

export type OfflineGame = ReturnType<typeof useOfflineGame>;
export type GameActions = OfflineGame['actions'];
