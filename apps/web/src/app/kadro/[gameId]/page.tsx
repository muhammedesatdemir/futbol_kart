'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { HomeIcon, ArrowLeftIcon } from '@/components/icons';
import { SceneShell } from '@/components/scenes/SceneShell';
import { SceneBackground } from '@/components/SceneBackground';
import { BallLoader } from '@/components/BallLoader';
import { OpponentSelectScene, type Opponent } from '@/components/scenes/OpponentSelectScene';
import { SquadCriterionSelectScene } from '@/components/scenes/SquadCriterionSelectScene';
import { SquadBuildScene } from '@/components/scenes/SquadBuildScene';
import { SquadDraftScene } from '@/components/scenes/SquadDraftScene';
import { SquadResultScene } from '@/components/scenes/SquadResultScene';
import { SoundToggle } from '@/components/SoundToggle';
import { UserMenu } from '@/components/UserMenu';
import { NameModal } from '@/components/NameModal';
import { useGameSession } from '@/lib/GameSessionProvider';
import { useProfileStore } from '@/lib/profileStore';
import { createPRNG } from '@futbol-kart/game-engine';
import { SQUAD_DRAFT_SECONDS } from '@futbol-kart/game-engine';
import { useOnlineSquadMatch } from '@/lib/useOnlineSquadMatch';
import {
  FORMATION_433,
  CRITERION_TALLEST,
  pruneSquadCriteria,
  criterionById,
  emptyAssignment,
  buildAutoSquad,
  scoreSquad,
  compareSquads,
  snakeDraftOrder,
  suggestForDraft,
  autoPickForDraft,
  draftedIds,
  type SquadAssignment,
  type SquadCriterion,
  type Suggestion,
} from '@/lib/squadMode';

type Phase = 'opponent' | 'select' | 'build' | 'draft' | 'result';

/**
 * "Kadro Kur" modu — Bota karşı (kör build) + Arkadaşa karşı (snake draft)
 * + ONLINE (sunucu-otoriteli, gerçek rakip). 4-3-3 formasyonunu doldur,
 * seçilen kriterin toplamını kapıştır.
 *
 * Online entegrasyonu Hedefe Yaklaş desenini izler (`?online=1` → matchId →
 * `useOnlineSquadMatch`). Offline akış tamamen korunur; tüm online kod `isOnline`
 * ile gate'lidir. Bkz PLAN.md §19.
 */
export default function SquadGamePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useGameSession();

  const formation = FORMATION_433;

  // ── ONLINE TESPİTİ (Hedefe deseni) ──
  const isOnline = searchParams.get('online') === '1';
  const matchId = isOnline ? params.gameId : null;
  const online = useOnlineSquadMatch(matchId);

  const playersById = useMemo(() => {
    const m = new Map(session.players.map((p) => [p.id, p]));
    return m;
  }, [session.players]);

  const squadCriteria = useMemo(
    () => pruneSquadCriteria(session.players, formation),
    [session.players, formation],
  );

  // OFFLINE roundSeed (kriter vitrini + rastgele seçim).
  const [roundSeed, setRoundSeed] = useState(() => Math.random().toString(36).slice(2));

  const selectChoices = useMemo(() => {
    const prng = createPRNG(`squad-choices:${params.gameId}:${roundSeed}`);
    return prng.shuffle(squadCriteria).slice(0, 12);
  }, [squadCriteria, params.gameId, roundSeed]);

  const [phase, setPhase] = useState<Phase>('opponent');
  const [opponent, setOpponent] = useState<Opponent>('vs-bot');
  const [criterion, setCriterion] = useState<SquadCriterion>(CRITERION_TALLEST);
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [p1Assignment, setP1Assignment] = useState<SquadAssignment>(() =>
    emptyAssignment(formation),
  );
  const [p2Assignment, setP2Assignment] = useState<SquadAssignment>(() =>
    emptyAssignment(formation),
  );

  // -------- Hot-seat snake draft state'i (OFFLINE) --------
  const profileP1 = useProfileStore((s) => s.p1Name);
  const profileP2 = useProfileStore((s) => s.p2Name);
  const setProfileNames = useProfileStore((s) => s.setNames);
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');
  const draftOrder = useMemo(
    () => snakeDraftOrder(formation.slots.length, 'P1'),
    [formation.slots.length],
  );
  const [draftStep, setDraftStep] = useState(0);
  const [draftJokerUsed, setDraftJokerUsed] = useState<{ P1: boolean; P2: boolean }>({
    P1: false,
    P2: false,
  });
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  // ============================================================================
  // ONLINE optimistic pick (slot-bazlı — Hedefe'den fark). Tıklama anında slota
  // koy + sunucuya yolla; sunucu draftStep'i ilerletince temizle.
  // ============================================================================
  const [optimisticPick, setOptimisticPick] = useState<{
    side: 'P1' | 'P2';
    slotId: string;
    playerId: string;
    pendingStep: number;
    deadline: number;
  } | null>(null);
  // ONLINE öneri jokeri sonucu (sunucudan; overlay'de gösterilir).
  const [onlineSuggestion, setOnlineSuggestion] = useState<Suggestion | null>(null);

  // ---- OFFLINE handler'lar (değişmedi) ----
  const onPickOpponent = useCallback(
    (opp: Opponent) => {
      setOpponent(opp);
      if (opp === 'hotseat') {
        setCriterion(squadCriteria[Math.floor(Math.random() * squadCriteria.length)]!);
        setP1Assignment(emptyAssignment(formation));
        setP2Assignment(emptyAssignment(formation));
        setDraftStep(0);
        setDraftJokerUsed({ P1: false, P2: false });
        setSuggestion(null);
        setPhase('draft');
      } else {
        setPhase('select');
      }
    },
    [formation, squadCriteria],
  );

  const onOnline = useCallback(() => {
    router.push('/online?mode=kadro');
  }, [router]);

  const onPickCriterion = useCallback((criterionId: string) => {
    const c = criterionById(criterionId);
    if (c) setCriterion(c);
    setShuffleSeed(Math.floor(Math.random() * 1e9));
    setPhase('build');
  }, []);

  const onRandomCriterion = useCallback(() => {
    setCriterion(squadCriteria[Math.floor(Math.random() * squadCriteria.length)]!);
    setShuffleSeed(Math.floor(Math.random() * 1e9));
    setPhase('build');
  }, [squadCriteria]);

  const onAssign = useCallback((slotId: string, playerId: string | null) => {
    setP1Assignment((prev) => {
      const next = { ...prev };
      if (playerId) {
        for (const k of Object.keys(next)) {
          if (next[k] === playerId) next[k] = null;
        }
      }
      next[slotId] = playerId;
      return next;
    });
  }, []);

  const draftActiveSide = draftOrder[draftStep] ?? 'P1';

  const applyDraftPick = useCallback(
    (side: 'P1' | 'P2', slotId: string, playerId: string) => {
      const setter = side === 'P1' ? setP1Assignment : setP2Assignment;
      setter((prev) => ({ ...prev, [slotId]: playerId }));
      setSuggestion(null);
      setDraftStep((s) => {
        const next = s + 1;
        if (next >= draftOrder.length) setPhase('result');
        return next;
      });
    },
    [draftOrder.length],
  );

  const onDraftSelectOffline = useCallback(
    (slotId: string, playerId: string) => {
      applyDraftPick(draftActiveSide, slotId, playerId);
    },
    [applyDraftPick, draftActiveSide],
  );

  const onDraftTimeoutOffline = useCallback(() => {
    const prng = createPRNG(`${params.gameId}-auto-${draftStep}`);
    const myAssign = draftActiveSide === 'P1' ? p1Assignment : p2Assignment;
    const excluded = draftedIds(p1Assignment, p2Assignment);
    const auto = autoPickForDraft(
      myAssign,
      formation,
      criterion,
      session.players,
      excluded,
      () => prng.next(),
    );
    if (auto) applyDraftPick(draftActiveSide, auto.slotId, auto.playerId);
    else applyDraftPick(draftActiveSide, '', '');
  }, [params.gameId, draftStep, draftActiveSide, p1Assignment, p2Assignment, formation, criterion, session.players, applyDraftPick]);

  const onDraftJokerOffline = useCallback(() => {
    if (draftJokerUsed[draftActiveSide]) return;
    const prng = createPRNG(`${params.gameId}-sug-${draftStep}`);
    const myAssign = draftActiveSide === 'P1' ? p1Assignment : p2Assignment;
    const excluded = draftedIds(p1Assignment, p2Assignment);
    const sug = suggestForDraft(
      myAssign,
      formation,
      criterion,
      session.players,
      excluded,
      () => prng.next(),
    );
    if (sug) {
      setSuggestion(sug);
      setDraftJokerUsed((u) => ({ ...u, [draftActiveSide]: true }));
    }
  }, [draftJokerUsed, draftActiveSide, params.gameId, draftStep, p1Assignment, p2Assignment, formation, criterion, session.players]);

  const onAcceptSuggestionOffline = useCallback(() => {
    if (!suggestion) return;
    applyDraftPick(draftActiveSide, suggestion.slotId, suggestion.playerId);
  }, [suggestion, draftActiveSide, applyDraftPick]);

  const onDismissSuggestion = useCallback(() => setSuggestion(null), []);

  const onNamesSubmit = useCallback(
    (n1: string, n2: string) => {
      setP1Name(n1);
      setP2Name(n2);
      setProfileNames(n1, n2);
    },
    [setProfileNames],
  );

  const onSubmit = useCallback(() => {
    const prng = createPRNG(`${params.gameId}-squad`);
    const excludeIds = new Set(
      Object.values(p1Assignment).filter((v): v is string => v !== null),
    );
    const botSquad = buildAutoSquad(
      formation,
      criterion,
      session.players,
      excludeIds,
      () => prng.next(),
    );
    setP2Assignment(botSquad);
    setPhase('result');
  }, [params.gameId, p1Assignment, formation, criterion, session.players]);

  // ============================================================================
  // ONLINE türev değerler + handler'lar
  // ============================================================================
  const onlineState = online.state;
  // Online'da kriteri sunucu criterionId'sinden client havuzunda yeniden çöz
  // (sahneler metric'li SquadCriterion bekler).
  const onlineCriterion: SquadCriterion | null = useMemo(() => {
    const cid = onlineState?.criterionId;
    if (!cid) return null;
    return squadCriteria.find((c) => c.id === cid) ?? null;
  }, [onlineState?.criterionId, squadCriteria]);
  // Etkin kriter: online'da sunucununki (çözülemezse offline'a düşme — guard zaten render'ı durdurur).
  const effectiveCriterion = isOnline ? (onlineCriterion ?? criterion) : criterion;

  const onlineActiveSide: 'P1' | 'P2' =
    onlineState && onlineState.scene === 'DRAFT'
      ? (onlineState.draftOrder[onlineState.draftStep] ?? 'P1')
      : 'P1';
  const isMyTurn = isOnline ? online.yourSide === onlineActiveSide : true;
  const onlineDeadlineMs = useMemo(
    () => (online.turnDeadline ? new Date(online.turnDeadline).getTime() : null),
    [online.turnDeadline],
  );
  const optimisticDeadlineMs = optimisticPick?.deadline ?? null;

  // Online optimistic kadro dizileri (sunucu + optimistic pick).
  const optimisticAssign = useMemo((): {
    p1: SquadAssignment;
    p2: SquadAssignment;
  } => {
    if (!onlineState) {
      return { p1: emptyAssignment(formation), p2: emptyAssignment(formation) };
    }
    const p1 = { ...onlineState.p1Assignment };
    const p2 = { ...onlineState.p2Assignment };
    if (optimisticPick) {
      const arr = optimisticPick.side === 'P1' ? p1 : p2;
      if (arr[optimisticPick.slotId] == null) arr[optimisticPick.slotId] = optimisticPick.playerId;
    }
    return { p1, p2 };
  }, [onlineState, optimisticPick, formation]);

  // Sunucu state ilerleyince optimistic temizle.
  useEffect(() => {
    if (!optimisticPick || !onlineState) return;
    if (
      onlineState.draftStep !== optimisticPick.pendingStep ||
      onlineState.scene !== 'DRAFT'
    ) {
      setOptimisticPick(null);
    }
  }, [onlineState, optimisticPick]);

  const onDraftSelectOnline = useCallback(
    (slotId: string, playerId: string) => {
      if (!onlineState) return;
      setOptimisticPick({
        side: onlineActiveSide,
        slotId,
        playerId,
        pendingStep: onlineState.draftStep,
        deadline: Date.now() + SQUAD_DRAFT_SECONDS * 1000,
      });
      void online.draftPick(slotId, playerId);
    },
    [online, onlineState, onlineActiveSide],
  );

  // Online öneri jokeri: sunucudan slot+oyuncu önerisi al → overlay.
  const onUseJokerOnline = useCallback(() => {
    void online.useJoker().then((sug) => {
      if (sug) setOnlineSuggestion(sug);
    });
  }, [online]);

  const onAcceptSuggestionOnline = useCallback(() => {
    if (!onlineSuggestion) return;
    onDraftSelectOnline(onlineSuggestion.slotId, onlineSuggestion.playerId);
    setOnlineSuggestion(null);
  }, [onlineSuggestion, onDraftSelectOnline]);

  const onDismissSuggestionOnline = useCallback(() => setOnlineSuggestion(null), []);

  // Online öneri jokeri hakkı (sunucuda; basitçe sıram + henüz kullanmadıysam).
  const onlineJokerAvailable =
    !!onlineState &&
    onlineState.scene === 'DRAFT' &&
    isMyTurn &&
    !onlineState.jokerUsed[online.yourSide ?? 'P1'];

  // Rematch: OFFLINE yeni maç; ONLINE yeni eşleşme.
  const onRematch = useCallback(() => {
    if (isOnline) {
      router.push('/online?mode=kadro');
      return;
    }
    setP1Assignment(emptyAssignment(formation));
    setP2Assignment(emptyAssignment(formation));
    setRoundSeed(Math.random().toString(36).slice(2));
    if (opponent === 'hotseat') {
      setCriterion(squadCriteria[Math.floor(Math.random() * squadCriteria.length)]!);
      setDraftStep(0);
      setDraftJokerUsed({ P1: false, P2: false });
      setSuggestion(null);
      setPhase('draft');
    } else {
      setShuffleSeed(Math.floor(Math.random() * 1e9));
      setPhase('select');
    }
  }, [isOnline, router, formation, opponent, squadCriteria]);

  const onBack = useCallback(() => {
    if (isOnline) {
      router.push('/');
      return;
    }
    switch (phase) {
      case 'opponent':
        router.push(`/oyna/${params.gameId}`);
        break;
      case 'select':
        setPhase('opponent');
        break;
      case 'build':
        setP1Assignment(emptyAssignment(formation));
        setPhase(opponent === 'hotseat' ? 'draft' : 'select');
        break;
      case 'draft':
        setP1Assignment(emptyAssignment(formation));
        setP2Assignment(emptyAssignment(formation));
        setDraftStep(0);
        setSuggestion(null);
        setPhase('opponent');
        break;
      case 'result':
        setPhase('opponent');
        break;
    }
  }, [isOnline, phase, opponent, formation, router, params.gameId]);

  const offlineWinner = useMemo(() => {
    if (phase !== 'result') return 'tie' as const;
    const p1 = scoreSquad(p1Assignment, formation, criterion, playersById);
    const p2 = scoreSquad(p2Assignment, formation, criterion, playersById);
    return compareSquads(p1, p2, criterion);
  }, [phase, p1Assignment, p2Assignment, formation, criterion, playersById]);

  const usedByBotOrP1 = useMemo(
    () =>
      new Set(
        Object.values(p2Assignment).filter((v): v is string => v !== null),
      ),
    [p2Assignment],
  );

  const onlineBg =
    onlineState?.scene === 'CRITERION_REVEAL'
      ? 'handoff'
      : onlineState?.scene === 'DRAFT'
        ? 'pick'
        : 'final';
  const offlineBg =
    phase === 'opponent'
      ? 'mode'
      : phase === 'select'
        ? 'handoff'
        : phase === 'build' || phase === 'draft'
          ? 'pick'
          : 'final';
  const bgKey = isOnline ? onlineBg : offlineBg;

  const draftNameModalOpen = !isOnline && phase === 'draft' && p1Name === '';

  // ── ONLINE LOADING / ERROR GUARD ──
  if (isOnline) {
    if (online.error) {
      return (
        <>
          <SceneBackground bgKey="mode" />
          <main className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-5 text-center">
            <h2 className="text-2xl font-black text-side-red">Maç hatası</h2>
            <p className="text-sm text-white/65">{online.error}</p>
            <button type="button" onClick={() => router.push('/')} className="btn-ghost">
              Ana sayfa
            </button>
          </main>
        </>
      );
    }
    if (online.loading || !onlineState || !session.ready) {
      return (
        <>
          <SceneBackground bgKey="handoff" />
          <main className="relative z-10 mx-auto flex min-h-screen flex-col items-center justify-center px-5">
            <BallLoader size={64} label="Maç yükleniyor…" />
          </main>
        </>
      );
    }
  }

  const onP1Name = onlineState?.p1Name ?? 'Oyuncu 1';
  const onP2Name = onlineState?.p2Name ?? 'Oyuncu 2';

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
              Kadro Kur ·{' '}
              {isOnline ? '🌐 Online' : opponent === 'hotseat' ? 'Arkadaşa karşı' : 'Bota karşı'}
            </span>
            <SoundToggle />
            <UserMenu />
          </div>
        </header>

        {/* ====================== ONLINE RENDER ====================== */}
        {isOnline && onlineState && (
          <AnimatePresence mode="wait">
            {onlineState.scene === 'CRITERION_REVEAL' && (
              <SceneShell sceneKey="squad-online-reveal" key="squad-online-reveal">
                <SquadCriterionReveal
                  title={effectiveCriterion.title}
                  onDone={online.ackReveal}
                />
              </SceneShell>
            )}

            {onlineState.scene === 'DRAFT' && (
              <SceneShell sceneKey="squad-online-draft" key="squad-online-draft">
                <SquadDraftScene
                  formation={formation}
                  criterion={effectiveCriterion}
                  pool={session.players}
                  p1Name={onP1Name}
                  p2Name={onP2Name}
                  p1Assignment={optimisticAssign.p1}
                  p2Assignment={optimisticAssign.p2}
                  activeSide={onlineActiveSide}
                  stepIndex={onlineState.draftStep}
                  seconds={SQUAD_DRAFT_SECONDS}
                  deadlineMs={optimisticPick ? optimisticDeadlineMs : onlineDeadlineMs}
                  locked={!isMyTurn || !!optimisticPick}
                  waitingLabel={
                    optimisticPick
                      ? '✓ Seçimin gönderiliyor…'
                      : !isMyTurn
                        ? `Rakip seçiyor… (sıra ${onlineActiveSide === 'P1' ? onP1Name : onP2Name})`
                        : null
                  }
                  jokerAvailable={onlineJokerAvailable}
                  suggestion={onlineSuggestion}
                  onSelect={isMyTurn && !optimisticPick ? onDraftSelectOnline : () => {}}
                  onTimeout={() => void online.refresh()}
                  onUseJoker={onUseJokerOnline}
                  onAcceptSuggestion={onAcceptSuggestionOnline}
                  onDismissSuggestion={onDismissSuggestionOnline}
                />
              </SceneShell>
            )}

            {onlineState.scene === 'RESULT' && (
              <SceneShell sceneKey="squad-online-result" key="squad-online-result">
                <SquadResultScene
                  formation={formation}
                  criterion={effectiveCriterion}
                  p1Assignment={onlineState.p1Assignment}
                  p2Assignment={onlineState.p2Assignment}
                  p1Name={onP1Name}
                  p2Name={onP2Name}
                  winner={onlineState.winner ?? 'tie'}
                  playersById={playersById}
                  onRematch={onRematch}
                />
              </SceneShell>
            )}
          </AnimatePresence>
        )}

        {/* ====================== OFFLINE RENDER ====================== */}
        {!isOnline && (
          <AnimatePresence mode="wait">
            {phase === 'opponent' && (
              <SceneShell sceneKey="squad-opponent" key="squad-opponent">
                <OpponentSelectScene
                  modeName="Kadro Kur"
                  available={{ hotseat: true, vsBot: true }}
                  onPick={onPickOpponent}
                  onOnline={onOnline}
                />
              </SceneShell>
            )}

            {phase === 'select' && (
              <SceneShell sceneKey="squad-select" key="squad-select">
                <SquadCriterionSelectScene
                  criteria={selectChoices}
                  onPick={onPickCriterion}
                  onRandom={onRandomCriterion}
                />
              </SceneShell>
            )}

            {phase === 'build' && (
              <SceneShell sceneKey="squad-build" key="squad-build">
                <SquadBuildScene
                  formation={formation}
                  criterion={criterion}
                  pool={session.players}
                  assignment={p1Assignment}
                  excludeIds={usedByBotOrP1}
                  shuffleSeed={shuffleSeed}
                  onAssign={onAssign}
                  onSubmit={onSubmit}
                />
              </SceneShell>
            )}

            {phase === 'draft' && !draftNameModalOpen && (
              <SceneShell sceneKey="squad-draft" key="squad-draft">
                <SquadDraftScene
                  formation={formation}
                  criterion={criterion}
                  pool={session.players}
                  p1Name={p1Name || 'Oyuncu 1'}
                  p2Name={p2Name || 'Oyuncu 2'}
                  p1Assignment={p1Assignment}
                  p2Assignment={p2Assignment}
                  activeSide={draftActiveSide}
                  stepIndex={draftStep}
                  seconds={SQUAD_DRAFT_SECONDS}
                  jokerAvailable={!draftJokerUsed[draftActiveSide]}
                  suggestion={suggestion}
                  onSelect={onDraftSelectOffline}
                  onTimeout={onDraftTimeoutOffline}
                  onUseJoker={onDraftJokerOffline}
                  onAcceptSuggestion={onAcceptSuggestionOffline}
                  onDismissSuggestion={onDismissSuggestion}
                />
              </SceneShell>
            )}

            {phase === 'result' && (
              <SceneShell sceneKey="squad-result" key="squad-result">
                <SquadResultScene
                  formation={formation}
                  criterion={criterion}
                  p1Assignment={p1Assignment}
                  p2Assignment={p2Assignment}
                  p1Name={opponent === 'hotseat' ? p1Name || 'Oyuncu 1' : 'Sen'}
                  p2Name={opponent === 'hotseat' ? p2Name || 'Oyuncu 2' : 'Bot'}
                  winner={offlineWinner}
                  playersById={playersById}
                  onRematch={onRematch}
                />
              </SceneShell>
            )}
          </AnimatePresence>
        )}
      </main>

      {/* Hot-seat draft isim modalı (OFFLINE) */}
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

/**
 * ONLINE kriter açılış ekranı — kriteri büyük gösterir, "Kadro kur" ile draft'a
 * geçer (sunucu deadline'ı da ~5sn sonra otomatik geçirir). Hedefe'nin hedef
 * çarkının sade kadro karşılığı (kriter metin olduğu için çark yok).
 */
function SquadCriterionReveal({
  title,
  onDone,
}: {
  title: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center"
      >
        <span className="inline-block rounded-full border border-side-red/40 bg-side-red/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-side-red">
          ⚽ Kadro Kur
        </span>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-white/85 sm:text-3xl">
          Kriter belli!
        </h1>
      </motion.div>

      <motion.div
        animate={{ scale: [1, 1.06, 1], boxShadow: '0 0 60px rgba(255,213,74,0.45)' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-3xl border-2 border-accent-gold/40 bg-gradient-to-b from-zinc-900 to-black px-10 py-8 text-center shadow-2xl sm:px-16 sm:py-10"
      >
        <div className="text-3xl font-black text-accent-goldHi drop-shadow-[0_0_30px_rgba(255,213,74,0.5)] sm:text-4xl">
          {title}
        </div>
      </motion.div>

      <p className="max-w-sm text-center text-sm leading-relaxed text-white/55">
        4-3-3 formasyonunu sırayla doldurun; bu kritere göre toplamı{' '}
        <span className="font-semibold text-accent-goldHi">daha iyi</span> olan kazanır.
        Rakibin seçtiği oyuncu kapanır.
      </p>

      <motion.button
        type="button"
        onClick={onDone}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="btn-primary animate-cta-pulse motion-reduce:animate-none shadow-glow-gold"
      >
        ⚽ Kadromu kurmaya başla
      </motion.button>
    </section>
  );
}
