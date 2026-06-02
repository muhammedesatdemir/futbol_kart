'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import type { GameMode, Player } from '@futbol-kart/shared-types';
import { Scoreboard } from '@/components/Scoreboard';
import { HomeIcon, SwapIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
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
  revealHand,
  botMultiplierDecision,
  completeTransfer,
} from '@/lib/gameFlow';
import {
  canUseMultiplier,
  multiplierDirection,
  transferableCards,
  canUseTransfer,
  botTransferChoice,
} from '@/lib/jokers';
import { TransferScene } from '@/components/scenes/TransferScene';
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

  // Transfer teklif kapısı: her tur (faz+roundIndex) için en fazla bir kez işlenir.
  // Değer = işlenen turun anahtarı; question-pick effect'i bu çözülene dek bekler.
  const transferHandledRef = useRef<string | null>(null);
  // İnsan oyuncuya transfer teklifi gösterilsin mi (ROUND_INTRO overlay).
  const [transferOffer, setTransferOffer] = useState(false);
  // Rakip havuzu boşken: "transfer kullanılamadı, hakkın korunuyor" bilgisi.
  const [transferBlockedNote, setTransferBlockedNote] = useState(false);

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

  // ROUND_INTRO transfer KAPISI — soru seçilmeden önce transfer teklifi.
  // Her tur için bir kez: bot otomatik karar verir; insan için overlay açılır.
  // Çözülünce transferHandledRef o turun anahtarına set edilir.
  useEffect(() => {
    if (state.scene !== 'ROUND_INTRO') return;
    if (state.p1Hand.length === 0 || state.p2Hand.length === 0) return;
    if (state.phase === 'main' && state.roundIndex === 0 && !state.bonusResolved)
      return;
    const roundKey = `${state.phase}-${state.roundIndex}`;
    // P1 bu turda transfer yaptıysa (ROUND_TRANSFER'den döndük) → çözülmüş say.
    // (P2/bot transferi P1'in teklifini engellemez.)
    if (state.transferThisRound === 'P1') {
      transferHandledRef.current = roundKey;
      setTransferOffer(false);
      return;
    }
    if (transferHandledRef.current === roundKey) return;

    // Transfer kullanılabilirliği (effect içinde hesapla — render sırasına bağlı değil).
    const isLast = state.roundIndex + 1 >= state.totalRounds;
    const ownPool = transferableCards(
      state.p1Hand,
      state.p1BonusCards,
      state.transferLockedIds,
    );
    const oppPool = transferableCards(
      state.p2Hand,
      state.p2BonusCards,
      state.transferLockedIds,
    );
    const usable = canUseTransfer(
      state.p1Jokers.transferUsed,
      isLast,
      ownPool.length,
    );

    // Hak yok / son tur / kendi havuzu boş → kapıyı sessizce geç.
    if (!usable) {
      transferHandledRef.current = roundKey;
      return;
    }

    // Kendi havuzu uygun ama RAKİP havuzu boşsa: teklif gösterme, HAK KORUNUR.
    // Kullanıcıya bunun neden olduğunu açıkla (bug değil — kalan kartlar bonus/kilitli).
    if (oppPool.length === 0) {
      transferHandledRef.current = roundKey;
      setTransferBlockedNote(true);
      return;
    }

    // İnsan (P1) için transfer teklifi overlay'i aç (hem hot-seat hem vs-bot).
    // transferHandledRef burada SET EDİLMEZ — insan kararı bekleniyor.
    setTransferOffer(true);
  }, [
    state.scene,
    state.phase,
    state.roundIndex,
    state.totalRounds,
    state.bonusResolved,
    state.p1Hand,
    state.p2Hand,
    state.p1BonusCards,
    state.p2BonusCards,
    state.p1Jokers.transferUsed,
    state.transferLockedIds,
    state.transferThisRound,
  ]);

  // ROUND_INTRO bot transfer kararı (vs-bot) — P1 teklifinden bağımsız, tur başı.
  // ~%25 olasılıkla bot kör değiş-tokuş yapar (kendi havuzundan ver, P1'den al).
  const botTransferHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.mode !== 'vs-bot') return;
    if (state.scene !== 'ROUND_INTRO') return;
    if (state.p1Hand.length === 0 || state.p2Hand.length === 0) return;
    if (state.phase === 'main' && state.roundIndex === 0 && !state.bonusResolved)
      return;
    const roundKey = `${state.phase}-${state.roundIndex}`;
    if (botTransferHandledRef.current === roundKey) return;
    botTransferHandledRef.current = roundKey;

    const isLast = state.roundIndex + 1 >= state.totalRounds;
    const botPool = transferableCards(
      state.p2Hand,
      state.p2BonusCards,
      state.transferLockedIds,
    );
    const p1Pool = transferableCards(
      state.p1Hand,
      state.p1BonusCards,
      state.transferLockedIds,
    );
    const choice = botTransferChoice(
      state.p2Jokers.transferUsed,
      isLast,
      botPool,
      p1Pool,
      () => flow.prng.next(),
    );
    if (choice) {
      dispatch({ type: 'JOKER_TRANSFER_OPEN', side: 'P2' });
      dispatch({
        type: 'TRANSFER_EXECUTE',
        side: 'P2',
        give: choice.give,
        take: choice.take,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mode, state.scene, state.phase, state.roundIndex, state.bonusResolved]);

  // ROUND_INTRO -> soru sec -> ROUND_STARTED (stinger animasyonu için ~750ms bekle)
  useEffect(() => {
    if (state.scene !== 'ROUND_INTRO') return;
    if (state.p1Hand.length === 0 || state.p2Hand.length === 0) return;
    // Bonus kararı verilmeden soru seçme (ana maç ilk turunda BONUS_ASSIGN'a gidilecek).
    if (state.phase === 'main' && state.roundIndex === 0 && !state.bonusResolved) return;
    // Transfer kapısı çözülmeden soru seçme (insan teklifi açıkken bekle).
    const roundKey = `${state.phase}-${state.roundIndex}`;
    if (transferHandledRef.current !== roundKey) return;
    if (transferOffer) return;
    const q = pickQuestion(flow, state.p1Hand, state.p2Hand);
    if (!q) return;
    const t = setTimeout(
      () => dispatch({ type: 'ROUND_STARTED', questionId: q.id }),
      750,
    );
    return () => clearTimeout(t);
  }, [state.scene, state.p1Hand, state.p2Hand, state.phase, state.roundIndex, state.bonusResolved, transferOffer, flow, dispatch]);

  // ROUND_PLAY: vs-bot ve P1 oynadi -> bot oynar
  useEffect(() => {
    if (state.scene !== 'ROUND_PLAY') return;
    if (state.mode !== 'vs-bot') return;
    if (!state.currentP1Card || state.currentP2Card) return;
    botTimerRef.current = setTimeout(() => {
      // Bot çarpan jokeri kararı (kart oynamadan ÖNCE — pendingMultiplier resolve'a girsin).
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

  const onJokerMultiplier = useCallback(
    (side: 'P1' | 'P2') => dispatch({ type: 'JOKER_MULTIPLIER', side }),
    [dispatch],
  );

  const onJokerReveal = useCallback(
    (side: 'P1' | 'P2') => dispatch({ type: 'JOKER_REVEAL', side }),
    [dispatch],
  );

  // Transfer sonuçlandığında gösterilecek "oyuncu değişikliği tabelası" bilgisi.
  // give = çıkan (verilen, kırmızı), take = giren (alınan, yeşil). auto = sistem tamamladı mı.
  const [transferResult, setTransferResult] = useState<{
    give: string;
    take: string;
    auto: boolean;
  } | null>(null);

  // Transfer sonuçlandırma: kullanıcı seçimleri (give/take null olabilir) →
  // sistem deterministik tamamlar → TRANSFER_EXECUTE. Joker basıldıysa transfer
  // KESİN gerçekleşir.
  const onTransferResolve = useCallback(
    (give: string | null, take: string | null) => {
      const ownPool = transferableCards(
        state.p1Hand,
        state.p1BonusCards,
        state.transferLockedIds,
      );
      const oppPool = transferableCards(
        state.p2Hand,
        state.p2BonusCards,
        state.transferLockedIds,
      );
      const choice = completeTransfer(flow, ownPool, oppPool, give, take);
      if (!choice) {
        // Transfer imkansız (rakip havuzu boş) — hak zaten yandı, atla.
        dispatch({ type: 'TRANSFER_SKIP', side: 'P1' });
        return;
      }
      // 4 senaryoda da tabela göster. auto = kullanıcı tam seçim yapmadı (sistem tamamladı).
      setTransferResult({
        give: choice.give,
        take: choice.take,
        auto: give === null || take === null,
      });
      dispatch({
        type: 'TRANSFER_EXECUTE',
        side: 'P1',
        give: choice.give,
        take: choice.take,
      });
    },
    [
      dispatch,
      flow,
      state.p1Hand,
      state.p2Hand,
      state.p1BonusCards,
      state.p2BonusCards,
      state.transferLockedIds,
    ],
  );

  // Transfer teklifi: "Kullan" → ROUND_TRANSFER sahnesine geç (hak yanar).
  const onTransferOfferUse = useCallback(() => {
    transferHandledRef.current = `${state.phase}-${state.roundIndex}`;
    setTransferOffer(false);
    dispatch({ type: 'JOKER_TRANSFER_OPEN', side: 'P1' });
  }, [dispatch, state.phase, state.roundIndex]);

  // Transfer teklifi: "Geç" → teklifi kapat, normal tura devam (hak korunur).
  const onTransferOfferDismiss = useCallback(() => {
    transferHandledRef.current = `${state.phase}-${state.roundIndex}`;
    setTransferOffer(false);
  }, [state.phase, state.roundIndex]);

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

  // -------- Joker durumları (aktif taraf için) --------
  // Bot tarafı (vs-bot + P2) joker barını GÖRMEZ — kararı otomatik.
  const jokerInteractive =
    state.scene === 'ROUND_PLAY' && !(botMode && activeSide === 'P2');
  const activeJokers = activeSide === 'P1' ? state.p1Jokers : state.p2Jokers;
  const activeRevealActive =
    activeSide === 'P1' ? state.p1RevealActive : state.p2RevealActive;
  const multiplierEligible = canUseMultiplier(currentTemplate);
  const multiplierDir = currentTemplate
    ? multiplierDirection(currentTemplate)
    : 'x2';
  // Çarpan bu tur zaten aktive edildi mi (aktif tarafça)?
  const multiplierPendingHere = state.pendingMultiplier === activeSide;

  // "İstatistiği Gör" aktifse: aktif elin her kartı → bu sorudaki değer.
  const revealValues: Map<string, number | boolean | null> | null =
    jokerInteractive && activeRevealActive && currentTemplate
      ? new Map(
          revealHand(flow, currentTemplate, activeHand).map((r) => [
            r.cardId,
            r.value,
          ]),
        )
      : null;

  // -------- Transfer jokeri (ROUND_INTRO/ROUND_TRANSFER) --------
  // Transfer teklifi her turun başında verilir; "sahibi" insan tarafı P1
  // (hot-seat'te tur başı aktörü, vs-bot'ta oyuncu — bot ayrı karar verir).
  const transferOwnPool = transferableCards(
    state.p1Hand,
    state.p1BonusCards,
    state.transferLockedIds,
  );
  const transferOppPool = transferableCards(
    state.p2Hand,
    state.p2BonusCards,
    state.transferLockedIds,
  );
  const toPlayers = (ids: string[]) =>
    ids
      .map((id) => session.players.find((p) => p.id === id))
      .filter(Boolean) as typeof session.players;

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
        {state.scene === 'ROUND_INTRO' && !transferOffer && (
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

      {/* Transfer teklifi — ROUND_INTRO'da, soru açıklanmadan önce. */}
      <AnimatePresence>
        {state.scene === 'ROUND_INTRO' && transferOffer && (
          <TransferOffer
            onUse={onTransferOfferUse}
            onDismiss={onTransferOfferDismiss}
          />
        )}
      </AnimatePresence>

      {/* Rakip havuzu boş: transfer kullanılamadı, hak korunuyor — açıklama. */}
      <AnimatePresence>
        {transferBlockedNote && (
          <TransferBlockedNote onClose={() => setTransferBlockedNote(false)} />
        )}
      </AnimatePresence>

      {/* Transfer sonucu — 4. hakem oyuncu değişikliği tabelası (yeşil giren / kırmızı çıkan). */}
      <AnimatePresence>
        {transferResult && (
          <SubstitutionBoard
            outPlayer={session.players.find((p) => p.id === transferResult.give)}
            inPlayer={session.players.find((p) => p.id === transferResult.take)}
            auto={transferResult.auto}
            onClose={() => setTransferResult(null)}
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

        {state.scene === 'ROUND_TRANSFER' && (
          <SceneShell sceneKey="transfer" key="transfer">
            <TransferScene
              sideName={p1Display}
              oppName={p2Display}
              ownCards={toPlayers(transferOwnPool)}
              oppCards={toPlayers(transferOppPool)}
              seconds={15}
              onResolve={onTransferResolve}
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
              jokerInteractive={jokerInteractive}
              multiplierEligible={multiplierEligible}
              multiplierDir={multiplierDir}
              multiplierUsed={activeJokers.multiplierUsed}
              multiplierPendingHere={multiplierPendingHere}
              revealUsed={activeJokers.revealUsed}
              revealActive={activeRevealActive}
              revealValues={revealValues}
              onJokerMultiplier={() => onJokerMultiplier(activeSide)}
              onJokerReveal={() => onJokerReveal(activeSide)}
              lastMultiplier={state.history[state.history.length - 1]?.multiplier}
              transferUsed={activeJokers.transferUsed}
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

/**
 * Transfer teklif overlay'i — ROUND_INTRO'da, soru açıklanmadan önce.
 * "Transfer kullan?" → ROUND_TRANSFER sahnesi; "Geç" → normal tur.
 * Kompakt, ekranı kaplamaz; stinger'ın yerine geçer.
 */
function TransferOffer({
  onUse,
  onDismiss,
}: {
  onUse: () => void;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="glass-panel-strong mx-auto flex max-w-md flex-col items-center gap-3 p-6 text-center"
    >
      <div className="inline-flex items-center gap-1.5 rounded-full bg-side-red/25 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-side-red ring-1 ring-side-red/40">
        🔄 Transfer Hamlesi — Maçta 1 hak
      </div>
      <h3 className="text-lg font-black">Bu tur transfer kullanmak ister misin?</h3>
      <p className="text-xs leading-relaxed text-white/60">
        Rakibin elinden bir kart al, kendininkinden birini ver. Rakibin kartlarını
        kısa süre <span className="font-semibold text-white/80">açık</span>{' '}
        görürsün. Açarsan transfer mutlaka olur (süre dolarsa sistem tamamlar);
        soru açıklanmadan önce kullanılır.
      </p>
      <div className="mt-1 flex items-center gap-3">
        <button type="button" onClick={onDismiss} className="btn-ghost">
          Geç
        </button>
        <button type="button" onClick={onUse} className="btn-primary">
          🔄 Transfer kullan
        </button>
      </div>
    </motion.div>
  );
}

/**
 * Rakip havuzu boşken gösterilen açıklama — transfer kullanılamadı ama hak
 * KORUNUYOR (bug değil). Birkaç saniye sonra otomatik kapanır.
 */
function TransferBlockedNote({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25 }}
      className="glass-panel-strong fixed left-1/2 top-24 z-50 flex w-[min(92vw,28rem)] -translate-x-1/2 flex-col items-center gap-2 p-5 text-center"
    >
      <div className="text-2xl">🔄</div>
      <h3 className="text-base font-black">Transfer bu tur kullanılamıyor</h3>
      <p className="text-xs leading-relaxed text-white/60">
        Rakibin geriye kalan kartları <span className="font-semibold text-white/80">bonus
        kategori kartları</span> (veya zaten transfer edilmiş) — bunlar değiş-tokuşa kapalı.
        Bu yüzden transfer hakkın <span className="font-semibold text-accent-goldHi">yanmadı</span>,
        korundu. Uzatmaya kalırsa tekrar kullanabilirsin.
      </p>
    </motion.div>
  );
}

/**
 * Transfer sonucu — 4. hakem oyuncu değişikliği tabelası (LED stili).
 *
 * Gerçek hakem ikame tabelası gibi: üstte forma numarası (LED), yeşil ▲ giren
 * (alınan), kırmızı ▼ çıkan (verilen) + altında isimler. Sağ üstte belirir,
 * ~5.2 sn (eski toast'ın 2×) durur, sonra kapanır. Boyut da ~2×.
 *
 * 4 senaryoda da gösterilir (kullanıcı seçti / sistem tamamladı fark etmez).
 * `auto` yalnızca başlık metnini değiştirir.
 */
function SubstitutionBoard({
  outPlayer,
  inPlayer,
  auto,
  onClose,
}: {
  outPlayer: Player | undefined;
  inPlayer: Player | undefined;
  auto: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 5200);
    return () => clearTimeout(t);
  }, [onClose]);

  const jersey = (p: Player | undefined) =>
    p && p.jerseyNumbers.length > 0 ? p.jerseyNumbers[0] : '—';

  return (
    <motion.div
      initial={{ opacity: 0, x: 40, scale: 0.92 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.92 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="fixed right-4 top-20 z-50 w-[min(92vw,22rem)] overflow-hidden rounded-2xl border-2 border-zinc-700 bg-gradient-to-b from-zinc-900 to-black shadow-2xl"
    >
      {/* Tabela üst şerit — 4. hakem başlığı */}
      <div className="flex items-center justify-center gap-1.5 border-b border-zinc-700 bg-zinc-800/80 px-3 py-1.5">
        <SwapIcon size={14} className="text-amber-400" />
        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-400">
          {auto ? 'Süre doldu — Sistem Tamamladı' : 'Oyuncu Değişikliği'}
        </span>
      </div>

      {/* LED panel — giren (yeşil) / çıkan (kırmızı) */}
      <div className="flex flex-col gap-2 p-3">
        <SubRow
          dir="in"
          jersey={jersey(inPlayer)}
          name={inPlayer?.displayName ?? '—'}
          position={inPlayer?.position}
        />
        <SubRow
          dir="out"
          jersey={jersey(outPlayer)}
          name={outPlayer?.displayName ?? '—'}
          position={outPlayer?.position}
        />
      </div>
    </motion.div>
  );
}

/** Tabela satırı — bir LED forma numarası kutusu + ok + isim. */
function SubRow({
  dir,
  jersey,
  name,
  position,
}: {
  dir: 'in' | 'out';
  jersey: number | string;
  name: string;
  position?: string;
}) {
  const isIn = dir === 'in';
  const accent = isIn ? 'text-emerald-400' : 'text-red-500';
  const ring = isIn ? 'border-emerald-500/60' : 'border-red-500/60';
  const glow = isIn
    ? 'shadow-[0_0_14px_rgba(16,185,129,0.45)]'
    : 'shadow-[0_0_14px_rgba(239,68,68,0.45)]';
  return (
    <div className="flex items-center gap-3">
      {/* LED forma numarası kutusu */}
      <div
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-md border-2 bg-black font-black tabular-nums',
          ring,
          glow,
        )}
      >
        <span className={cn('text-xl', accent)} style={{ fontFamily: 'monospace' }}>
          {jersey}
        </span>
      </div>
      {/* Yön oku (giren ▲ / çıkan ▼) */}
      <span className={cn('text-2xl font-black leading-none', accent)}>
        {isIn ? '▲' : '▼'}
      </span>
      {/* İsim + giriş/çıkış etiketi */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-white">{name}</div>
        <div className={cn('text-[10px] font-bold uppercase tracking-wider', accent)}>
          {isIn ? 'Alınan' : 'Verilen'}
          {position ? ` · ${position}` : ''}
        </div>
      </div>
    </div>
  );
}
