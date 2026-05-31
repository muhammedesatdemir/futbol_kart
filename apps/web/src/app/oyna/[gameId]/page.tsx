'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import type { GameMode } from '@futbol-kart/shared-types';
import { Scoreboard } from '@/components/Scoreboard';
import { HomeIcon } from '@/components/icons';
import { SceneShell } from '@/components/scenes/SceneShell';
import { ModeSelectScene } from '@/components/scenes/ModeSelectScene';
import { CardPickScene } from '@/components/scenes/CardPickScene';
import { HandoffScene } from '@/components/scenes/HandoffScene';
import { RoundScene } from '@/components/scenes/RoundScene';
import { FinalScene } from '@/components/scenes/FinalScene';
import { PhaseTransitionScene } from '@/components/scenes/PhaseTransitionScene';
import { NameModal } from '@/components/NameModal';
import { RoundStinger } from '@/components/RoundStinger';
import { SceneBackground } from '@/components/SceneBackground';
import { UserMenu } from '@/components/UserMenu';
import { useProfileStore } from '@/lib/profileStore';
import { useGameSession } from '@/lib/GameSessionProvider';
import { useSessionStore } from '@/lib/sessionStore';
import { useSessionHydration } from '@/lib/useSessionHydration';
import {
  botPickCard,
  pickQuestion,
  resolveCards,
  resolvedTitle,
} from '@/lib/gameFlow';
import { templateById } from '@futbol-kart/question-templates';

export default function GameSessionPage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const session = useGameSession();
  const hydrated = useSessionHydration();
  const state = useSessionStore((s) => s.state);
  const dispatch = useSessionStore((s) => s.dispatch);
  const init = useSessionStore((s) => s.init);
  const profileP1 = useProfileStore((s) => s.p1Name);
  const profileP2 = useProfileStore((s) => s.p2Name);
  const setProfileNames = useProfileStore((s) => s.setNames);

  // localStorage'taki profili client'ta hydrate et
  useEffect(() => {
    useProfileStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (state.gameId !== params.gameId) {
      const seed = `${params.gameId}-${Date.now()}`;
      init(params.gameId, seed);
    }
  }, [hydrated, params.gameId, state.gameId, init]);

  const flow = useMemo(
    () => session.getFlow(state.seed || params.gameId),
    [session, state.seed, params.gameId],
  );

  const botTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
  }, []);

  const onModeChosen = useCallback(
    (mode: GameMode) => dispatch({ type: 'MODE_CHOSEN', mode }),
    [dispatch],
  );

  const onP1Hand = useCallback(
    (cards: string[]) => dispatch({ type: 'HAND_SUBMITTED', side: 'P1', cards }),
    [dispatch],
  );

  const onP2Hand = useCallback(
    (cards: string[]) => dispatch({ type: 'HAND_SUBMITTED', side: 'P2', cards }),
    [dispatch],
  );

  const onHandoffContinue = useCallback(
    () => dispatch({ type: 'HANDOFF_CONTINUED' }),
    [dispatch],
  );

  const onAck = useCallback(() => dispatch({ type: 'ROUND_ACK' }), [dispatch]);

  const onPhaseTransitionAck = useCallback(
    () => dispatch({ type: 'PHASE_TRANSITION_ACK' }),
    [dispatch],
  );

  const onNamesSubmit = useCallback(
    (p1Name: string, p2Name: string) => {
      dispatch({ type: 'NAMES_SET', p1Name, p2Name });
      // Bot adını profile yazmayalım
      if (state.mode === 'hotseat') {
        setProfileNames(p1Name, p2Name);
      } else {
        setProfileNames(p1Name, profileP2);
      }
    },
    [dispatch, setProfileNames, state.mode, profileP2],
  );

  // Vs-bot icin: HAND_SUBMITTED sonrasi bot'a handSize kart ata
  // (usedCardIds + p1Hand havuzdan çıkarılır)
  useEffect(() => {
    if (
      state.mode === 'vs-bot' &&
      state.scene === 'ROUND_INTRO' &&
      state.p2Hand.length === 0
    ) {
      const exclude = new Set([...state.usedCardIds, ...state.p1Hand]);
      const pool = session.players
        .map((p) => p.id)
        .filter((id) => !exclude.has(id));
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      dispatch({
        type: 'HAND_SUBMITTED',
        side: 'P2',
        cards: shuffled.slice(0, state.handSize),
      });
    }
  }, [
    state.mode,
    state.scene,
    state.p1Hand,
    state.p2Hand.length,
    state.usedCardIds,
    state.handSize,
    session.players,
    dispatch,
  ]);

  // ROUND_INTRO -> soru sec -> ROUND_STARTED (stinger animasyonu için ~750ms bekle)
  useEffect(() => {
    if (state.scene !== 'ROUND_INTRO') return;
    if (state.p1Hand.length === 0 || state.p2Hand.length === 0) return;
    const q = pickQuestion(flow, state.p1Hand, state.p2Hand);
    if (!q) return;
    const t = setTimeout(
      () => dispatch({ type: 'ROUND_STARTED', questionId: q.id }),
      750,
    );
    return () => clearTimeout(t);
  }, [state.scene, state.p1Hand, state.p2Hand, flow, dispatch]);

  // ROUND_PLAY: vs-bot ve P1 oynadi -> bot oynar
  useEffect(() => {
    if (state.scene !== 'ROUND_PLAY') return;
    if (state.mode !== 'vs-bot') return;
    if (!state.currentP1Card || state.currentP2Card) return;
    botTimerRef.current = setTimeout(() => {
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
    state.p2Hand,
    flow,
    dispatch,
  ]);

  // ROUND_PLAY: iki kart oynandi -> resolve
  useEffect(() => {
    if (state.scene !== 'ROUND_PLAY') return;
    if (!state.currentP1Card || !state.currentP2Card) return;
    if (!state.currentQuestionId) return;
    const template = templateById(state.currentQuestionId);
    if (!template) return;
    const t = setTimeout(() => {
      const outcome = resolveCards(
        template,
        state.currentP1Card!,
        state.currentP2Card!,
        flow,
      );
      dispatch({
        type: 'ROUND_RESOLVED',
        questionTitle: resolvedTitle(flow, template) || template.id,
        p1Value: outcome.p1Value,
        p2Value: outcome.p2Value,
        winner: outcome.winner,
        tiebreakerUsed: outcome.tiebreakerUsed,
      });
    }, 350);
    return () => clearTimeout(t);
  }, [
    state.scene,
    state.currentP1Card,
    state.currentP2Card,
    state.currentQuestionId,
    flow,
    dispatch,
  ]);

  // ROUND_REVEAL -> ROUND_RESULT (flip 550ms + count-up 700ms + buffer)
  useEffect(() => {
    if (state.scene !== 'ROUND_REVEAL') return;
    const t = setTimeout(() => {
      useSessionStore.setState((s) => ({
        state: { ...s.state, scene: 'ROUND_RESULT' },
      }));
    }, 1450);
    return () => clearTimeout(t);
  }, [state.scene]);

  const onRematch = useCallback(() => {
    const newId = Math.random().toString(36).slice(2, 10);
    router.push(`/oyna/${newId}`);
  }, [router]);

  const onP1CardPlay = useCallback(
    (cardId: string) => dispatch({ type: 'CARD_PLAYED', side: 'P1', cardId }),
    [dispatch],
  );

  const onP2CardPlay = useCallback(
    (cardId: string) => dispatch({ type: 'CARD_PLAYED', side: 'P2', cardId }),
    [dispatch],
  );

  if (!hydrated || state.gameId !== params.gameId) return null;

  const botMode = state.mode === 'vs-bot';
  const nameModalOpen = state.mode !== null && state.p1Name === '';
  const showScoreboard =
    state.scene !== 'MODE_SELECT' &&
    state.scene !== 'CARD_PICK_P1' &&
    state.scene !== 'HANDOFF' &&
    state.scene !== 'CARD_PICK_P2' &&
    state.scene !== 'PHASE_TRANSITION' &&
    state.scene !== 'FINAL';

  // Faz bandı (Ana maç / Uzatma / Penaltı)
  const phaseLabel =
    state.phase === 'main'
      ? null
      : state.phase === 'extra'
        ? 'Uzatma'
        : 'Penaltı';

  // Uzatmada P1 seçimi: usedCardIds dışında kalan havuz
  // P2 seçimi: usedCardIds + p1Hand dışında
  const p1Excluded = state.usedCardIds;
  const p2Excluded = [...state.usedCardIds, ...state.p1Hand];

  const currentTemplate = state.currentQuestionId
    ? templateById(state.currentQuestionId) ?? null
    : null;
  const currentQuestionTitle = currentTemplate
    ? resolvedTitle(flow, currentTemplate)
    : null;

  const activeSide: 'P1' | 'P2' =
    state.currentP1Card === null ? 'P1' : 'P2';
  const activeHand = activeSide === 'P1' ? state.p1Hand : state.p2Hand;
  const onCardPlay = activeSide === 'P1' ? onP1CardPlay : onP2CardPlay;

  const p1Display = state.p1Name || 'Oyuncu 1';
  const p2Display = botMode ? 'Bot' : state.p2Name || 'Oyuncu 2';

  return (
    <>
      {/* Sahneye göre fixed arka plan + overlay (PitchBackground'ın üstüne biner) */}
      <SceneBackground scene={state.scene} phase={state.phase} />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
        <NameModal
          open={nameModalOpen}
          mode={state.mode ?? 'hotseat'}
          initialP1={profileP1}
          initialP2={profileP2}
          onSubmit={onNamesSubmit}
        />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="btn-ghost">
          <HomeIcon size={16} />
          Ana sayfa
        </Link>
        <div className="flex items-center gap-2">
          {phaseLabel && (
            <span className="rounded-full border border-accent-gold/40 bg-accent-gold/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-goldHi">
              {phaseLabel}
            </span>
          )}
          {state.mode && (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/55">
              {botMode ? 'Bota karşı' : 'Arkadaşına karşı'}
            </span>
          )}
          <UserMenu />
        </div>
      </header>

      {showScoreboard && (
        <Scoreboard
          p1Name={p1Display}
          p2Name={p2Display}
          p1Score={state.p1Score}
          p2Score={state.p2Score}
          round={Math.min(state.roundIndex + 1, state.totalRounds)}
          totalRounds={state.totalRounds}
        />
      )}

      {/* Round intro stinger — sahne shell'i dışında, overlay olarak */}
      <AnimatePresence>
        {state.scene === 'ROUND_INTRO' && (
          <RoundStinger
            key={`stinger-${state.phase}-${state.roundIndex}`}
            round={state.roundIndex + 1}
            totalRounds={state.totalRounds}
            phaseChip={
              state.phase === 'extra'
                ? 'Uzatma'
                : state.phase === 'sudden'
                  ? 'Penaltı'
                  : undefined
            }
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {state.scene === 'MODE_SELECT' && (
          <SceneShell sceneKey="mode" key="mode">
            <ModeSelectScene onPick={onModeChosen} />
          </SceneShell>
        )}

        {state.scene === 'CARD_PICK_P1' && (
          <SceneShell sceneKey={`pick-p1-${state.phase}`} key={`pick-p1-${state.phase}`}>
            <CardPickScene
              side="P1"
              players={session.players}
              excludedCards={p1Excluded}
              handSize={state.handSize}
              playerName={state.p1Name}
              onSubmit={onP1Hand}
              ctaLabel={state.mode === 'vs-bot' ? 'Maçı başlat' : 'Hazırım'}
            />
          </SceneShell>
        )}

        {state.scene === 'HANDOFF' && (
          <SceneShell sceneKey="handoff" key="handoff">
            <HandoffScene onContinue={onHandoffContinue} />
          </SceneShell>
        )}

        {state.scene === 'CARD_PICK_P2' && (
          <SceneShell sceneKey={`pick-p2-${state.phase}`} key={`pick-p2-${state.phase}`}>
            <CardPickScene
              side="P2"
              players={session.players}
              excludedCards={p2Excluded}
              handSize={state.handSize}
              playerName={state.p2Name}
              onSubmit={onP2Hand}
              ctaLabel="Maçı başlat"
            />
          </SceneShell>
        )}

        {state.scene === 'PHASE_TRANSITION' && (
          <SceneShell sceneKey={`transition-${state.phase}`} key={`transition-${state.phase}`}>
            <PhaseTransitionScene
              phase={state.phase}
              handSize={state.handSize}
              rounds={state.totalRounds}
              onContinue={onPhaseTransitionAck}
            />
          </SceneShell>
        )}

        {(state.scene === 'ROUND_INTRO' ||
          state.scene === 'ROUND_PLAY' ||
          state.scene === 'ROUND_REVEAL' ||
          state.scene === 'ROUND_RESULT') && (
          <SceneShell sceneKey="round" key="round">
            <RoundScene
              scene={state.scene}
              question={currentTemplate}
              questionTitle={currentQuestionTitle}
              activeSide={activeSide}
              botMode={botMode}
              p1Name={p1Display}
              p2Name={p2Display}
              hand={activeHand}
              players={session.players}
              currentP1Card={state.currentP1Card}
              currentP2Card={state.currentP2Card}
              lastLog={state.history[state.history.length - 1]}
              isLastRound={state.roundIndex + 1 >= state.totalRounds}
              onCardPlay={onCardPlay}
              onAck={onAck}
            />
          </SceneShell>
        )}

        {state.scene === 'FINAL' && state.mode && (
          <SceneShell sceneKey="final" key="final">
            <FinalScene
              p1Score={state.cumulativeP1}
              p2Score={state.cumulativeP2}
              p1Name={p1Display}
              p2Name={p2Display}
              botMode={botMode}
              history={state.history}
              players={session.players}
              onRematch={onRematch}
              mode={state.mode}
              snapshot={state}
            />
          </SceneShell>
        )}
      </AnimatePresence>
      </main>
    </>
  );
}
