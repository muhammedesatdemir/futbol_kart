'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import type { GameMode, Player } from '@futbol-kart/shared-types';
import { Scoreboard } from '@/components/Scoreboard';
import { HomeIcon, SwapIcon, ArrowLeftIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { SceneShell } from '@/components/scenes/SceneShell';
import { GameModeSelectScene, type PlayableMode } from '@/components/scenes/GameModeSelectScene';
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
import { useGameController } from '@/lib/useGameController';
import { BallLoader } from '@/components/BallLoader';
import {
  botPickCard,
  pickQuestion,
  resolveCards,
  resolvedTitle,
  pickBonus,
  autoAssignBonus,
  completeBonus,
  bonusConditionContext,
  revealHand,
  botMultiplierDecision,
  completeTransfer,
  canUseMultiplier,
  multiplierDirection,
  transferableCards,
  canUseTransfer,
  botTransferChoice,
  CARD_PLAY_SECONDS,
  TRANSFER_SECONDS,
} from '@futbol-kart/game-engine';
import { TransferScene } from '@/components/scenes/TransferScene';
import { BonusAssignScene } from '@/components/scenes/BonusAssignScene';
import { templateById } from '@futbol-kart/question-templates';

export default function GameSessionPage() {
  const params = useParams<{ gameId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const session = useGameSession();
  const hydrated = useSessionHydration();

  // ONLINE MOD: ?online=1 ise gameId aslında bir maç id'sidir. Controller
  // state'i sunucudan besler, dispatch'i sunucuya yönlendirir. Aksi halde
  // (bot/hotseat) yerel store kullanılır. Bkz useGameController.
  const isOnlineRoute = searchParams.get('online') === '1';
  const matchId = isOnlineRoute ? params.gameId : null;
  const controller = useGameController(matchId);
  const state = controller.state;
  const dispatch = controller.dispatch;
  const isOnline = controller.isOnline;
  const yourSide = controller.yourSide;

  const init = useSessionStore((s) => s.init);
  const profileP1 = useProfileStore((s) => s.p1Name);
  const profileP2 = useProfileStore((s) => s.p2Name);
  const setProfileNames = useProfileStore((s) => s.setNames);

  // localStorage'taki profili client'ta hydrate et
  useEffect(() => {
    useProfileStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    // Online'da state sunucudan gelir — yerel init yapma.
    if (isOnline) return;
    if (!hydrated) return;
    if (state.gameId !== params.gameId) {
      const seed = `${params.gameId}-${Date.now()}`;
      init(params.gameId, seed);
    }
  }, [isOnline, hydrated, params.gameId, state.gameId, init]);

  const flow = useMemo(
    () => session.getFlow(state.seed || params.gameId),
    [session, state.seed, params.gameId],
  );

  const botTimerRef = useRef<NodeJS.Timeout | null>(null);
  const playSfx = useSfx();

  // Transfer teklif kapısı. Hot-seat'te her turda İKİ tarafa da sırayla sorulur;
  // bu yüzden "işlendi" durumu artık taraf-bilinçli: `${roundKey}:${side}`.
  // Set, hangi (tur, taraf) kombinasyonlarının çözüldüğünü tutar.
  const transferHandledRef = useRef<Set<string>>(new Set());
  // Transfer teklifi şu an HANGİ insan tarafına gösteriliyor (null = kapalı).
  // vs-bot'ta yalnızca 'P1'; hot-seat'te sırayla 'P1' → 'P2'.
  const [transferOfferSide, setTransferOfferSide] = useState<'P1' | 'P2' | null>(null);
  // Rakip havuzu boşken: "transfer kullanılamadı, hakkın korunuyor" bilgisi.
  const [transferBlockedNote, setTransferBlockedNote] = useState(false);

  useEffect(() => {
    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
  }, []);

  // Kart flip sesi — OFFLINE: ikinci kart oynandığı anda (ROUND_PLAY içinde).
  // ONLINE'da iki kartın ROUND_PLAY'de birlikte görüldüğü an çok kısa (sunucu
  // hemen REVEAL'e geçirir, polling arası kaçar) → flip sesini REVEAL'e
  // geçişte çalarız (aşağıdaki reveal effect'i).
  useEffect(() => {
    if (isOnline) return;
    if (state.scene !== 'ROUND_PLAY') return;
    if (!state.currentP1Card || !state.currentP2Card) return;
    playSfx('flip');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, state.scene, state.currentP1Card, state.currentP2Card]);

  // ONLINE flip sesi: REVEAL sahnesine girince (kartlar açılıyor anı).
  const prevRevealRef = useRef(false);
  useEffect(() => {
    if (!isOnline) return;
    const isReveal = state.scene === 'ROUND_REVEAL';
    if (isReveal && !prevRevealRef.current) {
      playSfx('flip');
    }
    prevRevealRef.current = isReveal;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, state.scene]);

  // Kazanma / beraberlik / final sesleri — sahne GEÇİŞİNE bağlı.
  // prevScene ile, mount/remount sırasında (rematch sonrası yeni sayfa hâlâ
  // 'FINAL' state'iyle açılırken) sesin tekrar çalmasını engelle: ses yalnızca
  // önceki sahne farklıyken, gerçek bir geçişte çalar.
  const prevSceneRef = useRef<typeof state.scene | null>(null);
  useEffect(() => {
    const prev = prevSceneRef.current;
    prevSceneRef.current = state.scene;
    if (prev === state.scene) return; // değişim yok
    // Sonuç sesi: offline ROUND_RESULT'ta, ONLINE ise ROUND_REVEAL'de (online'da
    // ROUND_RESULT sahnesi oluşmaz; reveal = sonuç). İki yolu da kapsa.
    const resultScene = isOnline ? 'ROUND_REVEAL' : 'ROUND_RESULT';
    if (state.scene === resultScene) {
      const last = state.history[state.history.length - 1];
      const sfx = last && last.winner !== 'tie' ? 'win' : 'tie';
      // ONLINE: REVEAL'e girer girmez flip sesi çalıyor; sonuç sesini onun
      // ÜSTÜNE bindirmemek için ~900ms geciktir (flip bitsin, sonra sonuç sesi).
      // Offline'da ROUND_RESULT zaten flip'ten sonra gelir → gecikme gerekmez.
      if (isOnline) {
        const t = setTimeout(() => playSfx(sfx), 900);
        return () => clearTimeout(t);
      }
      playSfx(sfx);
    } else if (state.scene === 'FINAL' && prev !== null) {
      // prev === null → ilk mount (muhtemelen rematch sonrası eski state); çalma.
      playSfx('final');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.scene]);

  // Oyun-modu kapısı: VS state machine'e dokunmadan, MODE_SELECT sahnesinin
  // ÜSTÜNDE bir katman. 'vs' seçilene dek state machine ilerlemez; 'squad'
  // seçilince /kadro'ya yönlenir.
  const [pickedMode, setPickedMode] = useState<PlayableMode | null>(null);

  const onGameModePick = useCallback(
    (mode: PlayableMode) => {
      if (mode === 'squad') {
        router.push(`/kadro/${params.gameId}`);
        return;
      }
      if (mode === 'target') {
        router.push(`/hedefe-yaklas/${params.gameId}`);
        return;
      }
      if (mode === 'list') {
        router.push(`/liste-doldur/${params.gameId}`);
        return;
      }
      setPickedMode('vs');
    },
    [router, params.gameId],
  );

  const onModeChosen = useCallback(
    (mode: GameMode) => dispatch({ type: 'MODE_CHOSEN', mode }),
    [dispatch],
  );

  // Online eşleşme: ayrı /online route'una git (eşleşme akışı izole).
  const onOnline = useCallback(() => router.push('/online'), [router]);

  // Faz-bilinçli "← Geri":
  //  - Oyun-modu seçimi (pickedMode=null): geri yok (önceki sayfa zaten ana sayfa).
  //  - Rakip seçimi (MODE_SELECT + pickedMode='vs'): oyun-modu seçimine dön.
  //  - Oyun başladıktan sonra: rakip seçimine dön (state'i sıfırla, mod kalır).
  const onBack = useCallback(() => {
    if (state.scene === 'MODE_SELECT') {
      // Rakip seçimi → oyun-modu seçimi.
      setPickedMode(null);
    } else {
      // Oyun içi → rakip seçimine dön (state machine sıfırlanır, pickedMode='vs' kalır).
      dispatch({ type: 'GAME_RESET' });
      setPickedMode('vs');
    }
  }, [state.scene, dispatch]);

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
    if (isOnline) return; // online: bonus sunucu tarafında (temel dilimde yok)
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
  // İnsan tarafları için: vs-bot'ta yalnızca P1; hot-seat'te SIRAYLA P1 → P2
  // (her oyuncu kendi hakkını bağımsız kullanır). Her (tur, taraf) bir kez işlenir.
  // Bot tarafı ayrı effect'te (vs-bot P2). Bir teklif açıksa beklenir.
  useEffect(() => {
    if (isOnline) return; // online: transfer'i kullanıcı butonla açar
    if (state.scene !== 'ROUND_INTRO') return;
    if (state.p1Hand.length === 0 || state.p2Hand.length === 0) return;
    if (state.phase === 'main' && state.roundIndex === 0 && !state.bonusResolved)
      return;
    // Bir teklif zaten açıksa (insan kararı bekleniyor) yeni teklif açma.
    if (transferOfferSide !== null) return;

    const roundKey = `${state.phase}-${state.roundIndex}`;
    const isLast = state.roundIndex + 1 >= state.totalRounds;
    // İnsan tarafları: hot-seat'te ikisi de insan; vs-bot'ta sadece P1.
    const humanSides: Array<'P1' | 'P2'> =
      state.mode === 'hotseat' ? ['P1', 'P2'] : ['P1'];

    for (const side of humanSides) {
      const handledKey = `${roundKey}:${side}`;
      if (transferHandledRef.current.has(handledKey)) continue;
      // Bu taraf bu turda zaten transfer yaptıysa (sahneden döndük) → çözülmüş say.
      if (state.transferThisRound === side) {
        transferHandledRef.current.add(handledKey);
        continue;
      }

      const ownHand = side === 'P1' ? state.p1Hand : state.p2Hand;
      const ownBonus = side === 'P1' ? state.p1BonusCards : state.p2BonusCards;
      const oppHand = side === 'P1' ? state.p2Hand : state.p1Hand;
      const oppBonus = side === 'P1' ? state.p2BonusCards : state.p1BonusCards;
      const used =
        side === 'P1'
          ? state.p1Jokers.transferUsed
          : state.p2Jokers.transferUsed;

      const ownPool = transferableCards(ownHand, ownBonus, state.transferLockedIds);
      const oppPool = transferableCards(oppHand, oppBonus, state.transferLockedIds);

      // Hak yok / son tur / kendi havuzu boş → bu tarafı sessizce geç.
      if (!canUseTransfer(used, isLast, ownPool.length)) {
        transferHandledRef.current.add(handledKey);
        continue;
      }
      // Kendi havuzu uygun ama RAKİP havuzu boşsa: teklif gösterme, HAK KORUNUR.
      if (oppPool.length === 0) {
        transferHandledRef.current.add(handledKey);
        setTransferBlockedNote(true);
        continue;
      }
      // Bu insan tarafına teklif aç — karar beklenir (handled burada SET EDİLMEZ).
      setTransferOfferSide(side);
      return;
    }
  }, [
    state.scene,
    state.phase,
    state.roundIndex,
    state.totalRounds,
    state.mode,
    state.bonusResolved,
    state.p1Hand,
    state.p2Hand,
    state.p1BonusCards,
    state.p2BonusCards,
    state.p1Jokers.transferUsed,
    state.p2Jokers.transferUsed,
    state.transferLockedIds,
    state.transferThisRound,
    transferOfferSide,
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
      // Rakip olarak P1'e de bot'un transferini göster (tabela). byBot bayrağı
      // ile: give = bot'un sana verdiği (yeşil), take = bot'un senden aldığı (kırmızı).
      setTransferResult({
        give: choice.give,
        take: choice.take,
        auto: false,
        byBot: true,
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
    // Transfer kapısı çözülmeden soru seçme: bir teklif açıkken bekle + TÜM
    // insan taraflarının teklifi bu turda işlenmiş olmalı (hot-seat'te P1+P2).
    if (transferOfferSide !== null) return;
    const roundKey = `${state.phase}-${state.roundIndex}`;
    const humanSides: Array<'P1' | 'P2'> =
      state.mode === 'hotseat' ? ['P1', 'P2'] : ['P1'];
    const allHandled = humanSides.every((s) =>
      transferHandledRef.current.has(`${roundKey}:${s}`),
    );
    if (!allHandled) return;
    if (isOnline) return; // online: soruyu sunucu deterministik seçer
    const q = pickQuestion(flow, state.p1Hand, state.p2Hand);
    if (!q) return;
    const t = setTimeout(
      () => dispatch({ type: 'ROUND_STARTED', questionId: q.id }),
      750,
    );
    return () => clearTimeout(t);
  }, [state.scene, state.p1Hand, state.p2Hand, state.phase, state.roundIndex, state.mode, state.bonusResolved, transferOfferSide, flow, dispatch]);

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
    if (isOnline) return; // online: turu sunucu çözer (doğru cevap sızmaz)
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
    if (isOnline) return; // online: sahne geçişini sunucu yönetir
    if (state.scene !== 'ROUND_REVEAL') return;
    const t = setTimeout(() => {
      useSessionStore.setState((s) => ({
        state: { ...s.state, scene: 'ROUND_RESULT' },
      }));
    }, 1450);
    return () => clearTimeout(t);
  }, [isOnline, state.scene]);

  // ONLINE: tur sonucu gösterilince (REVEAL/RESULT) reveal animasyonu kadar
  // bekle, sonra OTOMATİK ack gönder → sunucu sonraki tura ilerletir. Böylece
  // "devam" butonuna basmaya gerek kalmaz; iki taraf da otomatik ilerler
  // (sunucu idempotent — ilk ack ilerletir, ikincisi no-op).
  //
  // KRİTİK: dispatch'i ref'te tut. Polling her 1.5sn re-render tetikler;
  // dispatch dependency'de olsaydı effect sürekli sıfırlanır, 3.5sn'lik
  // timeout HİÇ dolmaz → ack gönderilmez → tur ilerlemez (eski bug buydu).
  // Effect yalnızca (scene, roundIndex) değişince yeniden kurulur.
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const ackKey = `${state.phase}-${state.roundIndex}`;
  useEffect(() => {
    if (!isOnline) return;
    if (state.scene !== 'ROUND_REVEAL' && state.scene !== 'ROUND_RESULT') return;
    const t = setTimeout(() => {
      dispatchRef.current({ type: 'ROUND_ACK' });
    }, 3500); // flip + skor say + sonucu okuma payı
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, state.scene, ackKey]);

  // ONLINE: faz-geçiş duyurusu (Uzatma!/Penaltılar!) ~5sn gösterilir, sonra
  // OTOMATİK olarak yeni fazın el seçimine geçilir. Kullanıcı ne olduğunu anlar
  // (berabere → uzatma) — direkt kart seçime atılmaz. dispatch ref'ten (polling
  // re-render'ı 5sn timeout'u iptal etmesin).
  useEffect(() => {
    if (!isOnline) return;
    if (state.scene !== 'PHASE_TRANSITION') return;
    const t = setTimeout(() => {
      dispatchRef.current({ type: 'PHASE_TRANSITION_ACK' });
    }, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, state.scene, state.phase]);

  const onRematch = useCallback(() => {
    if (isOnline) {
      // ONLINE: rastgele bir gameId'ye gitmek YANLIŞ — o id'de maç yok, sayfa
      // ?v=0'da donar ("Oyuncu 1/2" boş isim + kara ekran). Doğrusu: yeni bir
      // eşleşme aramak → /online matchmaking ekranına dön. (Aynı rakiple tekrar
      // maç daveti ileride eklenebilir.)
      router.push('/online');
      return;
    }
    const newId = Math.random().toString(36).slice(2, 10);
    router.push(`/oyna/${newId}`);
  }, [isOnline, router]);

  const onP1CardPlay = useCallback(
    (cardId: string) => dispatch({ type: 'CARD_PLAYED', side: 'P1', cardId }),
    [dispatch],
  );

  const onP2CardPlay = useCallback(
    (cardId: string) => dispatch({ type: 'CARD_PLAYED', side: 'P2', cardId }),
    [dispatch],
  );

  // Tur içi süre dolunca: aktif insan tarafının elinden rastgele kart otomatik oynanır
  // (deterministik PRNG, botPickCard ile aynı). Side + hand çağrı anında geçilir.
  const onCardPlayTimeout = useCallback(
    (side: 'P1' | 'P2', hand: string[]) => {
      if (hand.length === 0) return;
      const cardId = botPickCard(flow, hand);
      dispatch({ type: 'CARD_PLAYED', side, cardId });
    },
    [flow, dispatch],
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
  // P1 transferi: give = senin verdiğin (kırmızı), take = senin aldığın (yeşil).
  // Bot transferi (byBot): give = botun sana verdiği (yeşil, senin kazancın),
  //                        take = botun senden aldığı (kırmızı, senin kaybın).
  // auto = sistem tamamladı mı (yalnızca P1 transferinde anlamlı).
  const [transferResult, setTransferResult] = useState<{
    give: string;
    take: string;
    auto: boolean;
    byBot?: boolean;
  } | null>(null);

  // Transfer sonuçlandırma: kullanıcı seçimleri (give/take null olabilir) →
  // sistem deterministik tamamlar → TRANSFER_EXECUTE. Joker basıldıysa transfer
  // KESİN gerçekleşir.
  const onTransferResolve = useCallback(
    (give: string | null, take: string | null) => {
      // Transferi AÇAN taraf (reducer set etti). Hot-seat'te P1 veya P2 olabilir.
      const side: 'P1' | 'P2' = state.transferOpenSide ?? 'P1';
      const ownHand = side === 'P1' ? state.p1Hand : state.p2Hand;
      const ownBonus = side === 'P1' ? state.p1BonusCards : state.p2BonusCards;
      const oppHand = side === 'P1' ? state.p2Hand : state.p1Hand;
      const oppBonus = side === 'P1' ? state.p2BonusCards : state.p1BonusCards;
      const ownPool = transferableCards(ownHand, ownBonus, state.transferLockedIds);
      const oppPool = transferableCards(oppHand, oppBonus, state.transferLockedIds);
      const choice = completeTransfer(flow, ownPool, oppPool, give, take);
      if (!choice) {
        // Transfer imkansız (rakip havuzu boş) — hak zaten yandı, atla.
        dispatch({ type: 'TRANSFER_SKIP', side });
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
        side,
        give: choice.give,
        take: choice.take,
      });
    },
    [
      dispatch,
      flow,
      state.transferOpenSide,
      state.p1Hand,
      state.p2Hand,
      state.p1BonusCards,
      state.p2BonusCards,
      state.transferLockedIds,
    ],
  );

  // Transfer teklifi: "Kullan" → ROUND_TRANSFER sahnesine geç (hak yanar).
  // Teklif gösterilen tarafı (transferOfferSide) işle; kapat → kapı effect'i
  // sıradaki insan tarafına (hot-seat'te P2) bakar.
  const onTransferOfferUse = useCallback(() => {
    const side = transferOfferSide ?? 'P1';
    transferHandledRef.current.add(`${state.phase}-${state.roundIndex}:${side}`);
    setTransferOfferSide(null);
    dispatch({ type: 'JOKER_TRANSFER_OPEN', side });
  }, [dispatch, transferOfferSide, state.phase, state.roundIndex]);

  // Transfer teklifi: "Geç" → bu tarafın teklifini kapat, hak korunur. Kapı
  // effect'i sıradaki insan tarafına geçer (hot-seat'te P1 geçince P2'ye sorar).
  const onTransferOfferDismiss = useCallback(() => {
    const side = transferOfferSide ?? 'P1';
    transferHandledRef.current.add(`${state.phase}-${state.roundIndex}:${side}`);
    setTransferOfferSide(null);
  }, [transferOfferSide, state.phase, state.roundIndex]);

  // OFFLINE guard: yerel store hydrate olana + doğru oyuna ait olana + OYUNCU
  // VERİSİ (session.players) lazy yüklenene kadar bekle. KRİTİK: session.players
  // boşken bot eli (vs-bot HAND_SUBMITTED P2, satır ~273 session.players'tan
  // kart seçer) BOŞ atanır → bot havuzu boş → transfer teklifi "rakip havuzu
  // boş" diye atlanır (P1'e teklif çıkmaz) + kart seçim/reveal players.find
  // bulamaz. `session.ready` gelene kadar bekleyince bu yarış önlenir.
  // ONLINE'da bu kontrolü YAPMA — online state sunucudan gelir (state.gameId
  // localState'ten gelip matchId'yle uyuşmayabilir) ve `hydrated` offline
  // store'a aittir. Online yükleme durumu aşağıdaki BallLoader guard'ında
  // (controller.online.loading + session.ready) ele alınır.
  if (
    !isOnline &&
    (!hydrated || !session.ready || state.gameId !== params.gameId)
  )
    return null;

  const botMode = state.mode === 'vs-bot';
  // İsim modalı YALNIZCA offline (bot/hotseat) — online'da isimler hesaptan gelir.
  const nameModalOpen = !isOnline && state.mode !== null && state.p1Name === '';
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
  // P2 seçimi: usedCardIds + p1Hand dışında (OFFLINE — iki insan aynı kartı
  // seçmesin; hot-seat'te P1 eli görünür).
  // ONLINE'da p2Excluded'a state.p1Hand'i KATMA: rakip eli maskeli ([]) geldiği
  // için P2'nin client'ında p1Hand boş → iki taraf FARKLI exclusion seti
  // hesaplar → "2 vs 3 kart / bazı kartlar yok" asimetrisi. Sunucu zaten
  // çapraz-exclusion uygulamıyor (eller aynı id içerebilir), online'da bu dışlama
  // anlamsız + zararlı. Online'da yalnızca usedCardIds dışla (her iki taraf eş).
  const p1Excluded = state.usedCardIds;
  const p2Excluded = isOnline
    ? state.usedCardIds
    : [...state.usedCardIds, ...state.p1Hand];

  const currentTemplate = state.currentQuestionId
    ? templateById(state.currentQuestionId) ?? null
    : null;
  // ONLINE: başlığı SUNUCU dolduruyor (parametreler sunucunun flow'unda üretildi;
  // client kendi flow'undan {targetApps} gibi yer tutucuları dolduramaz).
  // OFFLINE: client kendi flow'undan üretir.
  const currentQuestionTitle = isOnline
    ? controller.online?.questionTitle ?? currentTemplate?.title.tr ?? null
    : currentTemplate
      ? resolvedTitle(flow, currentTemplate)
      : null;

  // Aktif taraf: hotseat'te sıraya göre (P1 oynamadıysa P1, sonra P2). Online'da
  // ise HER ZAMAN kendi tarafım (yourSide) — eşzamanlı oynuyoruz, rakibi
  // beklemeden kendi kartımı seçerim.
  const activeSide: 'P1' | 'P2' = isOnline
    ? (yourSide ?? 'P1')
    : state.currentP1Card === null
      ? 'P1'
      : 'P2';
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

  // -------- Transfer jokeri (ROUND_TRANSFER sahnesi) --------
  // Aktif transfer tarafı: reducer JOKER_TRANSFER_OPEN'da set eder
  // (hot-seat'te P1 veya P2). Pool'lar + isimler ona göre hesaplanır.
  const transferSide: 'P1' | 'P2' = state.transferOpenSide ?? 'P1';
  const transferOwnHand = transferSide === 'P1' ? state.p1Hand : state.p2Hand;
  const transferOwnBonus = transferSide === 'P1' ? state.p1BonusCards : state.p2BonusCards;
  const transferOppHand = transferSide === 'P1' ? state.p2Hand : state.p1Hand;
  const transferOppBonus = transferSide === 'P1' ? state.p2BonusCards : state.p1BonusCards;
  const transferOwnPool = transferableCards(
    transferOwnHand,
    transferOwnBonus,
    state.transferLockedIds,
  );
  const transferOppPool = transferableCards(
    transferOppHand,
    transferOppBonus,
    state.transferLockedIds,
  );
  const toPlayers = (ids: string[]) =>
    ids
      .map((id) => session.players.find((p) => p.id === id))
      .filter(Boolean) as typeof session.players;

  // BONUS_ASSIGN sahnesi için: atama yapan taraf. OFFLINE: sıra (bonusAssignSide).
  // ONLINE: her zaman KENDİ tarafım (eşzamanlı atama).
  const bonusSide = isOnline ? (yourSide ?? 'P1') : state.bonusAssignSide;
  // Online'da kendi onayımı verdim mi (verdiysem "rakip bekleniyor" gösterilir).
  const myBonusConfirmed =
    bonusSide === 'P1' ? state.p1BonusConfirmed : state.p2BonusConfirmed;
  const oppBonusConfirmed =
    bonusSide === 'P1' ? state.p2BonusConfirmed : state.p1BonusConfirmed;
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

  // ONLINE: maç sunucudan yüklenene kadar VEYA oyuncu verisi (session.players)
  // henüz lazy yüklenmediyse bekleme ekranı. KRİTİK: players boşken kart/reveal
  // bileşenleri `players.find()` ile kartı bulamaz → kart GÖRÜNMEZ (boş alan).
  // `session.ready` gelene kadar bekleyince bu yarış (bazen sol/sağ kart eksik)
  // tamamen önlenir. Bkz GameSessionProvider (Faz 0 lazy yükleme).
  if (isOnline && (controller.online?.loading || !session.ready)) {
    return (
      <>
        <SceneBackground scene="MODE_SELECT" phase="main" />
        <main className="relative z-10 flex min-h-screen items-center justify-center">
          <BallLoader size={64} label="Maç yükleniyor…" />
        </main>
      </>
    );
  }
  if (isOnline && controller.online?.error) {
    return (
      <>
        <SceneBackground scene="MODE_SELECT" phase="main" />
        <main className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-4 text-center">
          <p className="text-side-red">{controller.online.error}</p>
          <button onClick={() => router.push('/')} className="btn-ghost">
            Ana sayfa
          </button>
        </main>
      </>
    );
  }

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
        <div className="flex items-center gap-2">
          {/* Geri, oyun-modu seçildikten SONRA görünür (rakip seçimi + oyun içi).
              Oyun-modu seçim ekranında geri yok — önceki sayfa zaten ana sayfa. */}
          {pickedMode !== null && (
            <button type="button" onClick={onBack} className="btn-ghost">
              <ArrowLeftIcon size={16} />
              Geri
            </button>
          )}
          <Link href="/" className="btn-ghost" aria-label="Ana sayfa" title="Ana sayfa">
            <HomeIcon size={16} />
            {pickedMode === null && 'Ana sayfa'}
          </Link>
        </div>
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
        {state.scene === 'ROUND_INTRO' && transferOfferSide === null && (
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

      {/* Transfer teklifi — ROUND_INTRO'da, soru açıklanmadan önce. Hot-seat'te
          hangi oyuncuya sorulduğunu (P1/P2 adı) gösterir. */}
      <AnimatePresence>
        {state.scene === 'ROUND_INTRO' && transferOfferSide !== null && (
          <TransferOffer
            playerName={
              transferOfferSide === 'P1' ? p1Display : p2Display
            }
            showName={state.mode === 'hotseat'}
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
            // P1 transferi: take=alınan(yeşil), give=verilen(kırmızı).
            // Bot transferi: give=bot'un sana verdiği(yeşil/kazanç), take=bot'un senden aldığı(kırmızı/kayıp).
            inPlayer={session.players.find(
              (p) =>
                p.id ===
                (transferResult.byBot ? transferResult.give : transferResult.take),
            )}
            outPlayer={session.players.find(
              (p) =>
                p.id ===
                (transferResult.byBot ? transferResult.take : transferResult.give),
            )}
            auto={transferResult.auto}
            byBot={transferResult.byBot ?? false}
            onClose={() => setTransferResult(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {state.scene === 'MODE_SELECT' && pickedMode === null && (
          <SceneShell sceneKey="gamemode" key="gamemode">
            <GameModeSelectScene onPick={onGameModePick} />
          </SceneShell>
        )}

        {state.scene === 'MODE_SELECT' && pickedMode === 'vs' && (
          <SceneShell sceneKey="mode" key="mode">
            <ModeSelectScene onPick={onModeChosen} onOnline={onOnline} />
          </SceneShell>
        )}

        {/* ONLINE el seçimi: eşzamanlı. Sahne CARD_PICK_* iken kendi tarafımın
            elini seçerim (yourSide). Henüz seçtiysem "rakip bekleniyor". */}
        {isOnline &&
          (state.scene === 'CARD_PICK_P1' || state.scene === 'CARD_PICK_P2') &&
          (activeHand.length === 0 ? (
            <SceneShell sceneKey={`pick-online-${state.phase}`} key={`pick-online-${state.phase}`}>
              <CardPickScene
                side={activeSide}
                players={session.players}
                excludedCards={activeSide === 'P1' ? p1Excluded : p2Excluded}
                handSize={state.handSize}
                playerName={activeSide === 'P1' ? state.p1Name : state.p2Name}
                onSubmit={activeSide === 'P1' ? onP1Hand : onP2Hand}
                ctaLabel="Hazırım"
                deadlineMs={
                  controller.online?.turnDeadline
                    ? new Date(controller.online.turnDeadline).getTime()
                    : null
                }
                serverManagedTimeout
              />
            </SceneShell>
          ) : (
            <SceneShell sceneKey="pick-online-wait" key="pick-online-wait">
              <div className="glass-panel flex min-h-[45vh] items-center justify-center p-8">
                <BallLoader
                  size={64}
                  label="Elini seçtin ✓"
                  sub="Rakibin el seçmesi bekleniyor…"
                />
              </div>
            </SceneShell>
          ))}

        {!isOnline && state.scene === 'CARD_PICK_P1' && (
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

        {!isOnline && state.scene === 'HANDOFF' && (
          <SceneShell sceneKey="handoff" key="handoff">
            <HandoffScene onContinue={onHandoffContinue} />
          </SceneShell>
        )}

        {!isOnline && state.scene === 'CARD_PICK_P2' && (
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

        {/* ONLINE: bonusumu onayladıysam rakip bekleniyor ekranı. */}
        {state.scene === 'BONUS_ASSIGN' &&
          state.bonusConditions.length === 3 &&
          isOnline &&
          myBonusConfirmed && (
            <SceneShell sceneKey="bonus-wait" key="bonus-wait">
              <div className="glass-panel flex min-h-[45vh] items-center justify-center p-8">
                <BallLoader
                  size={64}
                  label="Kategorilerini belirledin ✓"
                  sub={
                    oppBonusConfirmed
                      ? 'Tur başlıyor…'
                      : 'Rakibin kategori seçimi bekleniyor…'
                  }
                />
              </div>
            </SceneShell>
          )}

        {state.scene === 'BONUS_ASSIGN' &&
          state.bonusConditions.length === 3 &&
          !(isOnline && myBonusConfirmed) && (
            <SceneShell sceneKey={`bonus-${bonusSide}`} key={`bonus-${bonusSide}`}>
              <BonusAssignScene
                sideName={bonusSide === 'P1' ? p1Display : p2Display}
                conditions={state.bonusConditions}
                hand={bonusHandPlayers}
                assigned={bonusAssigned}
                ctx={bonusCtxValue}
                seconds={isOnline ? 30 : undefined}
                deadlineMs={
                  isOnline && controller.online?.turnDeadline
                    ? new Date(controller.online.turnDeadline).getTime()
                    : null
                }
                onAssign={(slot, cardId) => onBonusAssign(bonusSide, slot, cardId)}
                onConfirm={() => onBonusConfirm(bonusSide)}
                onTimeUp={() => {
                  if (isOnline) {
                    // Online: süre dolumunu SUNUCU yönetir (otomatik tamamla).
                    // Yine de client kendi onayını gönderip hızlandırabilir.
                    onBonusConfirm(bonusSide);
                    return;
                  }
                  // Offline: kullanıcı seçimini koruyarak fizibil tamamla + onayla.
                  const filled = completeBonus(
                    flow,
                    state.bonusConditions.map((c) => c.id),
                    bonusHandIds,
                    bonusAssigned,
                  );
                  filled.forEach((cardId, slot) => {
                    if (cardId !== bonusAssigned[slot]) {
                      onBonusAssign(bonusSide, slot, cardId);
                    }
                  });
                  onBonusConfirm(bonusSide);
                }}
              />
            </SceneShell>
          )}

        {state.scene === 'ROUND_TRANSFER' && (
          <SceneShell sceneKey="transfer" key="transfer">
            <TransferScene
              sideName={transferSide === 'P1' ? p1Display : p2Display}
              oppName={transferSide === 'P1' ? p2Display : p1Display}
              ownCards={toPlayers(transferOwnPool)}
              oppCards={toPlayers(transferOppPool)}
              seconds={TRANSFER_SECONDS}
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
              isOnline={isOnline}
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
              cardPlaySeconds={CARD_PLAY_SECONDS}
              cardTimerKey={`${state.phase}-${state.roundIndex}-${activeSide}`}
              cardDeadlineMs={
                isOnline && controller.online?.turnDeadline
                  ? new Date(controller.online.turnDeadline).getTime()
                  : null
              }
              onCardPlayTimeout={
                isOnline
                  ? () => void 0 // online: süre dolumunu sunucu yönetir (polling)
                  : () => onCardPlayTimeout(activeSide, activeHand)
              }
              transferAvailable={
                isOnline &&
                !state.transferThisRound &&
                state.roundIndex < state.totalRounds - 1
              }
              onFetchTransferOptions={controller.online?.fetchTransferOptions}
              onTransfer={(give, take) =>
                dispatch({
                  type: 'TRANSFER_EXECUTE',
                  side: activeSide,
                  give,
                  take,
                })
              }
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
  playerName,
  showName,
  onUse,
  onDismiss,
}: {
  /** Teklif gösterilen oyuncunun adı (hot-seat netliği için). */
  playerName: string;
  /** İsmi başlıkta göster (yalnızca hot-seat — iki insan ayırt edilsin). */
  showName: boolean;
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
      <h3 className="text-lg font-black">
        {showName
          ? `${playerName}, bu tur transfer kullanmak ister misin?`
          : 'Bu tur transfer kullanmak ister misin?'}
      </h3>
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
  byBot,
  onClose,
}: {
  outPlayer: Player | undefined;
  inPlayer: Player | undefined;
  auto: boolean;
  byBot: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 5200);
    return () => clearTimeout(t);
  }, [onClose]);

  const jersey = (p: Player | undefined) =>
    p && p.jerseyNumbers.length > 0 ? p.jerseyNumbers[0] : '—';

  const headerText = byBot
    ? 'Bot Transfer Yaptı'
    : auto
      ? 'Süre doldu — Sistem Tamamladı'
      : 'Oyuncu Değişikliği';
  const inLabel = byBot ? 'Sana verilen' : 'Alınan';
  const outLabel = byBot ? 'Senden alınan' : 'Verilen';

  return (
    // Dış sabit konum: sağ-dikey orta (skorla/kutularla çakışmaz). Dikey ortalamayı
    // Tailwind transform'u yapar; iç motion.div yalnızca kayma/scale anime eder —
    // böylece framer-motion transform'u dış translate'i ezmez.
    <div className="pointer-events-none fixed right-4 top-1/2 z-50 -translate-y-1/2">
      <motion.div
        initial={{ opacity: 0, x: 40, scale: 0.92 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 40, scale: 0.92 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-auto w-[min(92vw,22rem)] overflow-hidden rounded-2xl border-2 border-zinc-700 bg-gradient-to-b from-zinc-900 to-black shadow-2xl"
      >
        {/* Tabela üst şerit — 4. hakem başlığı */}
        <div className="flex items-center justify-center gap-1.5 border-b border-zinc-700 bg-zinc-800/80 px-3 py-1.5">
          <SwapIcon size={14} className="text-amber-400" />
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-400">
            {headerText}
          </span>
        </div>

        {/* LED panel — giren (yeşil) / çıkan (kırmızı) */}
        <div className="flex flex-col gap-2 p-3">
          <SubRow
            dir="in"
            label={inLabel}
            jersey={jersey(inPlayer)}
            name={inPlayer?.displayName ?? '—'}
            position={inPlayer?.position}
          />
          <SubRow
            dir="out"
            label={outLabel}
            jersey={jersey(outPlayer)}
            name={outPlayer?.displayName ?? '—'}
            position={outPlayer?.position}
          />
        </div>
      </motion.div>
    </div>
  );
}

/** Tabela satırı — bir LED forma numarası kutusu + ok + isim. */
function SubRow({
  dir,
  label,
  jersey,
  name,
  position,
}: {
  dir: 'in' | 'out';
  label: string;
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
          {label}
          {position ? ` · ${position}` : ''}
        </div>
      </div>
    </div>
  );
}
