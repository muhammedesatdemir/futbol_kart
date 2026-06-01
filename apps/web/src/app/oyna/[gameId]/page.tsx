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
import { SoundToggle } from '@/components/SoundToggle';
import { useSfx } from '@/lib/useSfx';
import { useProfileStore } from '@/lib/profileStore';
import { useGameSession } from '@/lib/GameSessionProvider';
import { useSessionStore } from '@/lib/sessionStore';
import { useSessionHydration } from '@/lib/useSessionHydration';
import {
  botPickCard,
  pickQuestion,
  resolveCards,
  resolvedTitle,
  pickBonus,
  autoAssignBonus,
  bonusConditionContext,
} from '@/lib/gameFlow';
import { BonusAssignScene } from '@/components/scenes/BonusAssignScene';
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
  const playSfx = useSfx();

  useEffect(() => {
    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
  }, []);

  // Kart flip sesi — ikinci kart oynandığı anda (ROUND_PLAY içinde),
  // REVEAL'e geçmeden ~0.5sn önce. Böylece flip ile win sesi arasındaki
  // boşluk yarım saniye daha açılır (win sabit kalır).
  useEffect(() => {
    if (state.scene !== 'ROUND_PLAY') return;
    if (!state.currentP1Card || !state.currentP2Card) return;
    playSfx('flip');
    // İki kart da oynandığı tek ana bağlı — sahne içinde bir kez tetiklenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.scene, state.currentP1Card, state.currentP2Card]);

  // Kazanma / beraberlik / final sesleri — sahne GEÇİŞİNE bağlı.
  // prevScene ile, mount/remount sırasında (rematch sonrası yeni sayfa hâlâ
  // 'FINAL' state'iyle açılırken) sesin tekrar çalmasını engelle: ses yalnızca
  // önceki sahne farklıyken, gerçek bir geçişte çalar.
  const prevSceneRef = useRef<typeof state.scene | null>(null);
  useEffect(() => {
    const prev = prevSceneRef.current;
    prevSceneRef.current = state.scene;
    if (prev === state.scene) return; // değişim yok
    if (state.scene === 'ROUND_RESULT') {
      const last = state.history[state.history.length - 1];
      if (last && last.winner !== 'tie') playSfx('win');
      else playSfx('tie');
    } else if (state.scene === 'FINAL' && prev !== null) {
      // prev === null → ilk mount (muhtemelen rematch sonrası eski state); çalma.
      playSfx('final');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.scene]);

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

  const onBonusAssign = useCallback(
    (side: 'P1' | 'P2', slot: number, cardId: string | null) =>
      dispatch({ type: 'BONUS_CARD_ASSIGNED', side, slot, cardId }),
    [dispatch],
  );

  const onBonusConfirm = useCallback(
    (side: 'P1' | 'P2') => dispatch({ type: 'BONUS_CONFIRMED', side }),
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

  // Bonus tur: ana maç ilk turundan ÖNCE 3 kategori koşulu belirle.
  // Eller hazır + henüz karar verilmemişse hesapla ve dispatch et
  // (BONUS_CONDITIONS_SET → fizibilse BONUS_ASSIGN, değilse ROUND_INTRO'da kalır).
  useEffect(() => {
    if (state.scene !== 'ROUND_INTRO') return;
    if (state.phase !== 'main' || state.roundIndex !== 0) return;
    if (state.bonusResolved) return;
    if (state.p1Hand.length === 0 || state.p2Hand.length === 0) return;
    const conditions = pickBonus(flow, state.p1Hand, state.p2Hand);
    // Vs-bot: P2 (bot) atamasını önceden hesapla.
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

  // ROUND_INTRO -> soru sec -> ROUND_STARTED (stinger animasyonu için ~750ms bekle)
  useEffect(() => {
    if (state.scene !== 'ROUND_INTRO') return;
    if (state.p1Hand.length === 0 || state.p2Hand.length === 0) return;
    // Bonus kararı verilmeden soru seçme (ana maç ilk turunda BONUS_ASSIGN'a gidilecek).
    if (state.phase === 'main' && state.roundIndex === 0 && !state.bonusResolved) return;
    const q = pickQuestion(flow, state.p1Hand, state.p2Hand);
    if (!q) return;
    const t = setTimeout(
      () => dispatch({ type: 'ROUND_STARTED', questionId: q.id }),
      750,
    );
    return () => clearTimeout(t);
  }, [state.scene, state.p1Hand, state.p2Hand, state.phase, state.roundIndex, state.bonusResolved, flow, dispatch]);

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
    state.scene !== 'BONUS_ASSIGN' &&
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

  // BONUS_ASSIGN sahnesi için: aktif taraf + eli + atamaları.
  const bonusSide = state.bonusAssignSide;
  const bonusHandIds = bonusSide === 'P1' ? state.p1Hand : state.p2Hand;
  const bonusAssigned = bonusSide === 'P1' ? state.p1BonusCards : state.p2BonusCards;
  const bonusHandPlayers = bonusHandIds
    .map((id) => session.players.find((p) => p.id === id))
    .filter(Boolean) as typeof session.players;
  const bonusCtxValue = bonusConditionContext(flow);

  // Momentum: önde olan taraf + güncel galibiyet serisi (üst üste kaç tur).
  // history'den türetilir — yeni state gerekmez. Skor eşitse lider yok.
  const leadingSide: 'P1' | 'P2' | null =
    state.p1Score > state.p2Score
      ? 'P1'
      : state.p2Score > state.p1Score
        ? 'P2'
        : null;
  const streak = (() => {
    let n = 0;
    let who: 'P1' | 'P2' | null = null;
    for (let i = state.history.length - 1; i >= 0; i--) {
      const w = state.history[i].winner;
      if (w === 'tie') break;
      if (who === null) who = w;
      if (w === who) n++;
      else break;
    }
    return { side: who, count: n };
  })();

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
          <SoundToggle />
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
          leadingSide={leadingSide}
          streakSide={streak.side}
          streakCount={streak.count}
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

        {state.scene === 'BONUS_ASSIGN' && state.bonusConditions.length === 3 && (
          <SceneShell sceneKey={`bonus-${bonusSide}`} key={`bonus-${bonusSide}`}>
            <BonusAssignScene
              sideName={bonusSide === 'P1' ? p1Display : p2Display}
              conditions={state.bonusConditions}
              hand={bonusHandPlayers}
              assigned={bonusAssigned}
              ctx={bonusCtxValue}
              onAssign={(slot, cardId) => onBonusAssign(bonusSide, slot, cardId)}
              onConfirm={() => onBonusConfirm(bonusSide)}
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
              p1BonusCards={state.p1BonusCards}
              p2BonusCards={state.p2BonusCards}
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
