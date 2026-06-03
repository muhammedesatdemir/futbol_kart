'use client';

import { useCallback, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { HomeIcon, ArrowLeftIcon } from '@/components/icons';
import { SceneShell } from '@/components/scenes/SceneShell';
import { SceneBackground } from '@/components/SceneBackground';
import { OpponentSelectScene, type Opponent } from '@/components/scenes/OpponentSelectScene';
import { TargetRevealScene } from '@/components/scenes/TargetRevealScene';
import { TargetBuildScene } from '@/components/scenes/TargetBuildScene';
import { TargetDraftScene } from '@/components/scenes/TargetDraftScene';
import { TargetResultScene } from '@/components/scenes/TargetResultScene';
import { SoundToggle } from '@/components/SoundToggle';
import { UserMenu } from '@/components/UserMenu';
import { NameModal } from '@/components/NameModal';
import { useGameSession } from '@/lib/GameSessionProvider';
import { useProfileStore } from '@/lib/profileStore';
import { createPRNG } from '@futbol-kart/game-engine';
import { TARGET_PICK_SECONDS, TARGET_DRAFT_SECONDS } from '@/lib/gameConstants';
import {
  CRITERION_WORLD_CUP_APPS,
  pickTarget,
  emptyPicks,
  buildAutoTarget,
  autoFillTarget,
  scoreTarget,
  compareToTarget,
  snakeDraftOrder,
  draftedTargetIds,
  firstEmptySlot,
  autoPickForTargetDraft,
  type TargetPicks,
  type TargetCriterion,
} from '@/lib/targetMode';

type Phase = 'opponent' | 'reveal-target' | 'build' | 'draft' | 'result';

/**
 * "Hedefe Yaklaş" modu — Bota karşı (kör build) + Arkadaşa karşı (snake draft).
 * 5 oyuncu seç, toplamı hedefe (60–80) yaklaştır; en yakın kazanır.
 * VS/Kadro sayfalarından bağımsız: kendi hafif faz makinesi + saf targetMode.
 */
export default function TargetGamePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const session = useGameSession();

  // İlk dilim: tek kriter sabit.
  const criterion: TargetCriterion = CRITERION_WORLD_CUP_APPS;

  const playersById = useMemo(
    () => new Map(session.players.map((p) => [p.id, p])),
    [session.players],
  );

  const [phase, setPhase] = useState<Phase>('opponent');
  const [opponent, setOpponent] = useState<Opponent>('vs-bot');
  const [target, setTarget] = useState<number>(70);
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [p1Picks, setP1Picks] = useState<TargetPicks>(() => emptyPicks());
  const [p2Picks, setP2Picks] = useState<TargetPicks>(() => emptyPicks());

  // -------- Hot-seat isim + snake draft state'i --------
  const profileP1 = useProfileStore((s) => s.p1Name);
  const profileP2 = useProfileStore((s) => s.p2Name);
  const setProfileNames = useProfileStore((s) => s.setNames);
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');
  // Snake sırası (10 adım = 5 slot × 2). draftStep = mevcut adım indeksi.
  const draftOrder = useMemo(() => snakeDraftOrder('P1'), []);
  const [draftStep, setDraftStep] = useState(0);
  const draftActiveSide = draftOrder[draftStep] ?? 'P1';

  // Yeni hedef + havuz seed üret (yeni maç / yeniden oyna).
  const freshTarget = useCallback(() => {
    const prng = createPRNG(`${params.gameId}-tg-${Date.now()}`);
    setTarget(pickTarget(criterion, () => prng.next()));
    setShuffleSeed(Math.floor(prng.next() * 1e9));
    setP1Picks(emptyPicks());
    setP2Picks(emptyPicks());
    setDraftStep(0);
  }, [params.gameId, criterion]);

  // Rakip seçildi → hedef çarkına geç (opponent state'i sakla).
  const onPickOpponent = useCallback(
    (opp: Opponent) => {
      setOpponent(opp);
      freshTarget();
      setPhase('reveal-target');
    },
    [freshTarget],
  );

  // Hedef çarkı bitti → bota karşı build, arkadaşa karşı snake draft.
  const onTargetRevealed = useCallback(() => {
    setPhase(opponent === 'hotseat' ? 'draft' : 'build');
  }, [opponent]);

  // ---- Bota karşı (build) ----
  const onPick = useCallback((slotIdx: number, playerId: string | null) => {
    setP1Picks((prev) => {
      const next = [...prev];
      if (playerId) {
        for (let i = 0; i < next.length; i++) if (next[i] === playerId) next[i] = null;
      }
      next[slotIdx] = playerId;
      return next;
    });
  }, []);

  const submitWith = useCallback(
    (finalP1: TargetPicks) => {
      const prng = createPRNG(`${params.gameId}-tg-bot`);
      const excludeIds = new Set(finalP1.filter((v): v is string => v !== null));
      const botPicks = buildAutoTarget(
        criterion,
        session.players,
        excludeIds,
        target,
        () => prng.next(),
      );
      setP2Picks(botPicks);
      setPhase('result');
    },
    [params.gameId, criterion, session.players, target],
  );

  const onSubmit = useCallback(() => submitWith(p1Picks), [submitWith, p1Picks]);

  const onBuildTimeout = useCallback(() => {
    const prng = createPRNG(`${params.gameId}-tg-auto`);
    const filled = autoFillTarget(
      p1Picks,
      criterion,
      session.players,
      new Set<string>(),
      () => prng.next(),
    );
    setP1Picks(filled);
    submitWith(filled);
  }, [params.gameId, p1Picks, criterion, session.players, submitWith]);

  // ---- Arkadaşa karşı (snake draft) ----
  // Bir seçim uygula → aktif tarafın ilk boş slotuna koy + adım ilerlet.
  const applyDraftPick = useCallback(
    (side: 'P1' | 'P2', playerId: string) => {
      const setter = side === 'P1' ? setP1Picks : setP2Picks;
      setter((prev) => {
        const next = [...prev];
        const slot = firstEmptySlot(next);
        if (slot >= 0) next[slot] = playerId;
        return next;
      });
      setDraftStep((s) => {
        const nextStep = s + 1;
        if (nextStep >= draftOrder.length) setPhase('result');
        return nextStep;
      });
    },
    [draftOrder.length],
  );

  const onDraftSelect = useCallback(
    (playerId: string) => applyDraftPick(draftActiveSide, playerId),
    [applyDraftPick, draftActiveSide],
  );

  // Süre doldu → aktif tarafın ilk boş slotuna rastgele uygun oyuncu.
  const onDraftTimeout = useCallback(() => {
    const prng = createPRNG(`${params.gameId}-tg-draft-${draftStep}`);
    const myPicks = draftActiveSide === 'P1' ? p1Picks : p2Picks;
    const excluded = draftedTargetIds(p1Picks, p2Picks);
    const auto = autoPickForTargetDraft(
      myPicks,
      criterion,
      session.players,
      excluded,
      () => prng.next(),
    );
    if (auto) applyDraftPick(draftActiveSide, auto.playerId);
  }, [params.gameId, draftStep, draftActiveSide, p1Picks, p2Picks, criterion, session.players, applyDraftPick]);

  // İsim modalı onayı (hot-seat).
  const onNamesSubmit = useCallback(
    (n1: string, n2: string) => {
      setP1Name(n1);
      setP2Name(n2);
      setProfileNames(n1, n2);
    },
    [setProfileNames],
  );

  // Yeniden oyna: rakip aynı kalır, yeni hedef çarkı.
  const onRematch = useCallback(() => {
    freshTarget();
    setPhase('reveal-target');
  }, [freshTarget]);

  // Faz-bilinçli "← Geri" (Kadro Kur deseni).
  const onBack = useCallback(() => {
    switch (phase) {
      case 'opponent':
        router.push(`/oyna/${params.gameId}`);
        break;
      case 'reveal-target':
      case 'build':
      case 'draft':
      case 'result':
        setP1Picks(emptyPicks());
        setP2Picks(emptyPicks());
        setDraftStep(0);
        setPhase('opponent');
        break;
    }
  }, [phase, router, params.gameId]);

  const winner = useMemo(() => {
    if (phase !== 'result') return 'tie' as const;
    const p1 = scoreTarget(p1Picks, criterion, playersById);
    const p2 = scoreTarget(p2Picks, criterion, playersById);
    return compareToTarget(p1.total, p2.total, target);
  }, [phase, p1Picks, p2Picks, criterion, playersById, target]);

  // Build havuzundan rakip (bot result öncesi boş; hot-seat'te build yok).
  const usedByBot = useMemo(
    () => new Set(p2Picks.filter((v): v is string => v !== null)),
    [p2Picks],
  );

  const bgKey =
    phase === 'opponent'
      ? 'mode'
      : phase === 'reveal-target'
        ? 'handoff'
        : phase === 'build' || phase === 'draft'
          ? 'pick'
          : 'final';

  // Hot-seat draft başında isim modalı (isimler boşken).
  const draftNameModalOpen = phase === 'draft' && p1Name === '';

  return (
    <>
      <SceneBackground bgKey={bgKey} />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onBack} className="btn-ghost">
              <ArrowLeftIcon size={16} />
              Geri
            </button>
            <Link href="/" className="btn-ghost" aria-label="Ana sayfa" title="Ana sayfa">
              <HomeIcon size={16} />
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-accent-gold/40 bg-accent-gold/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-goldHi">
              Hedefe Yaklaş · {opponent === 'hotseat' ? 'Arkadaşa karşı' : 'Bota karşı'}
            </span>
            <SoundToggle />
            <UserMenu />
          </div>
        </header>

        <AnimatePresence mode="wait">
          {phase === 'opponent' && (
            <SceneShell sceneKey="target-opponent" key="target-opponent">
              <OpponentSelectScene
                modeName="Hedefe Yaklaş"
                available={{ hotseat: true, vsBot: true }}
                onPick={onPickOpponent}
              />
            </SceneShell>
          )}

          {phase === 'reveal-target' && (
            <SceneShell sceneKey="target-reveal" key="target-reveal">
              <TargetRevealScene
                target={target}
                criterion={criterion}
                onDone={onTargetRevealed}
              />
            </SceneShell>
          )}

          {phase === 'build' && (
            <SceneShell sceneKey="target-build" key="target-build">
              <TargetBuildScene
                criterion={criterion}
                target={target}
                pool={session.players}
                picks={p1Picks}
                excludeIds={usedByBot}
                shuffleSeed={shuffleSeed}
                seconds={TARGET_PICK_SECONDS}
                onPick={onPick}
                onSubmit={onSubmit}
                onTimeout={onBuildTimeout}
              />
            </SceneShell>
          )}

          {phase === 'draft' && !draftNameModalOpen && (
            <SceneShell sceneKey="target-draft" key="target-draft">
              <TargetDraftScene
                criterion={criterion}
                target={target}
                pool={session.players}
                p1Name={p1Name || 'Oyuncu 1'}
                p2Name={p2Name || 'Oyuncu 2'}
                p1Picks={p1Picks}
                p2Picks={p2Picks}
                activeSide={draftActiveSide}
                stepIndex={draftStep}
                seconds={TARGET_DRAFT_SECONDS}
                onSelect={onDraftSelect}
                onTimeout={onDraftTimeout}
              />
            </SceneShell>
          )}

          {phase === 'result' && (
            <SceneShell sceneKey="target-result" key="target-result">
              <TargetResultScene
                criterion={criterion}
                target={target}
                p1Picks={p1Picks}
                p2Picks={p2Picks}
                p1Name={opponent === 'hotseat' ? p1Name || 'Oyuncu 1' : 'Sen'}
                p2Name={opponent === 'hotseat' ? p2Name || 'Oyuncu 2' : 'Bot'}
                winner={winner}
                playersById={playersById}
                onRematch={onRematch}
              />
            </SceneShell>
          )}
        </AnimatePresence>
      </main>

      {/* Hot-seat draft isim modalı */}
      <NameModal
        open={draftNameModalOpen}
        mode="hotseat"
        initialP1={profileP1}
        initialP2={profileP2}
        onSubmit={onNamesSubmit}
      />
    </>
  );
}
