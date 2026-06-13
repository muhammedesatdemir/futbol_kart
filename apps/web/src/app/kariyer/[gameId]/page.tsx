'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { HomeIcon, ArrowLeftIcon } from '@/components/icons';
import { SceneShell } from '@/components/scenes/SceneShell';
import { SceneBackground } from '@/components/SceneBackground';
import { BallLoader } from '@/components/BallLoader';
import { OpponentSelectScene, type Opponent } from '@/components/scenes/OpponentSelectScene';
import { CareerGuessScene } from '@/components/scenes/CareerGuessScene';
import { CareerRoundRevealScene } from '@/components/scenes/CareerRoundRevealScene';
import { CareerResultScene } from '@/components/scenes/CareerResultScene';
import { SoundToggle } from '@/components/SoundToggle';
import { UserMenu } from '@/components/UserMenu';
import { NameModal } from '@/components/NameModal';
import { useGameSession } from '@/lib/GameSessionProvider';
import { useProfileStore } from '@/lib/profileStore';
import { useSfx } from '@/lib/useSfx';
import { createPRNG } from '@futbol-kart/game-engine';
import { fetchClubInfoMap } from '@/lib/clubsClient';
import { fetchCareerPools } from '@/lib/careerPoolsClient';
import { useOnlineCareerMatch } from '@/lib/useOnlineCareerMatch';
import {
  curateCareers,
  clueForTier,
  isCorrectGuess,
  pointsForTier,
  decideWinner,
  botDecision,
  CAREER_ROUNDS,
  CAREER_TIERS,
  type CareerPuzzle,
  type ClubInfo,
  type CareerSide,
  type CareerPools,
} from '@/lib/careerMode';
import type {
  CareerReveal,
  CareerRoundSummary,
} from '@/lib/server/careerMatchEngine';

type Phase = 'opponent' | 'intro' | 'guess' | 'round-reveal' | 'result';
/** Offline'da bir tarafın tur-içi ilerlemesi. */
interface OffProgress {
  tier: number;
  locked: boolean;
  points: number;
  guessedId: string | null;
  correct: boolean;
}
const FRESH: OffProgress = { tier: 0, locked: false, points: 0, guessedId: null, correct: false };

const OFFLINE_TIER_SECONDS = 25;
const INTRO_MS = 3500;
const ROUND_REVEAL_MS = 6000;

/**
 * "Kariyer Yolu" — her tur 1 kariyer, 4 kademeli ipucu (5/3/2/1 puan). İki oyuncu
 * eşzamanlı tahmin eder; doğru bilen kilitlenir, yanlış sonraki kademeye düşer.
 * 3 tur. Bota + arkadaşa karşı (kademeli handoff) + ONLINE (sunucu-otoriteli).
 *
 * Mevcut modlara dokunulmaz — Ortak Bul/VS Düello deseninin uyarlaması (yeni dosyalar).
 */
export default function CareerGamePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useGameSession();
  const playSfx = useSfx();

  const isOnline = searchParams.get('online') === '1';
  const matchId = isOnline ? params.gameId : null;
  const online = useOnlineCareerMatch(matchId);

  // OFFLINE: tam kulüp verisi (ad + logo) + kürate havuz (careerPools.json).
  const [clubsById, setClubsById] = useState<Map<string, ClubInfo> | null>(null);
  const [pools, setPools] = useState<CareerPools | null>(null);
  useEffect(() => {
    if (isOnline) {
      setClubsById(new Map());
      return;
    }
    fetchClubInfoMap().then(setClubsById).catch(() => setClubsById(new Map()));
    fetchCareerPools().then(setPools).catch(() => setPools(null));
  }, [isOnline]);

  const [roundSeed, setRoundSeed] = useState(() => Math.random().toString(36).slice(2));

  const playersById = useMemo(
    () => new Map(session.players.map((p) => [p.id, p])),
    [session.players],
  );

  // OFFLINE kürate edilmiş 3 kariyer (careerPools ağırlığıyla: 2 high + 1 low).
  const offCareers: CareerPuzzle[] | null = useMemo(() => {
    if (isOnline) return null;
    if (!clubsById || clubsById.size === 0 || !session.ready || session.players.length === 0) return null;
    return curateCareers(`${params.gameId}:${roundSeed}`, session.players, clubsById, pools);
  }, [isOnline, clubsById, pools, session.ready, session.players, params.gameId, roundSeed]);

  const [phase, setPhase] = useState<Phase>('opponent');
  const [opponent, setOpponent] = useState<Opponent>('vs-bot');

  // OFFLINE tur state.
  const [roundIdx, setRoundIdx] = useState(0);
  const [prog, setProg] = useState<{ P1: OffProgress; P2: OffProgress }>({ P1: { ...FRESH }, P2: { ...FRESH } });
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  // Hotseat alt-faz: hangi taraf bu kademede tahmin ediyor.
  const [hsActive, setHsActive] = useState<CareerSide>('P1');
  // Tamamlanan turların özeti (final dökümü için — prog her tur sıfırlanır).
  const [offSummaries, setOffSummaries] = useState<CareerRoundSummary[]>([]);

  const profileP1 = useProfileStore((s) => s.p1Name);
  const profileP2 = useProfileStore((s) => s.p2Name);
  const setProfileNames = useProfileStore((s) => s.setNames);
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');

  const seedStr = `${params.gameId}:${roundSeed}`;

  const resetGame = useCallback(() => {
    setRoundIdx(0);
    setProg({ P1: { ...FRESH }, P2: { ...FRESH } });
    setP1Score(0);
    setP2Score(0);
    setHsActive('P1');
    setOffSummaries([]);
    setRoundSeed(Math.random().toString(36).slice(2));
  }, []);

  const onPickOpponent = useCallback(
    (opp: Opponent) => {
      setOpponent(opp);
      resetGame();
      setPhase('intro');
    },
    [resetGame],
  );

  const onOnline = useCallback(() => {
    router.push('/online?mode=kariyer');
  }, [router]);

  const scrollTop = useCallback(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ── OFFLINE kademe çözümü (sunucu resolveTierIfReady eşleniği) ──
  const resolveTier = useCallback(
    (next: { P1: OffProgress; P2: OffProgress }) => {
      let s1 = p1Score, s2 = p2Score;
      for (const side of ['P1', 'P2'] as CareerSide[]) {
        const sp = next[side];
        if (sp.locked || sp.tier >= CAREER_TIERS) continue;
        if (sp.correct) {
          sp.locked = true;
          sp.points = pointsForTier(sp.tier);
          if (side === 'P1') s1 += sp.points; else s2 += sp.points;
        } else {
          sp.tier += 1;
          sp.guessedId = null;
        }
      }
      setP1Score(s1);
      setP2Score(s2);
      setProg(next);
      const done = (sp: OffProgress) => sp.locked || sp.tier >= CAREER_TIERS;
      if (done(next.P1) && done(next.P2)) {
        // Tur bitti → final dökümü için özet biriktir (prog sonraki turda sıfırlanır).
        const career = offCareers?.[roundIdx];
        if (career) {
          setOffSummaries((prev) => [
            ...prev,
            {
              answerName: career.playerName,
              p1: { tier: next.P1.tier, correct: next.P1.locked, points: next.P1.points },
              p2: { tier: next.P2.tier, correct: next.P2.locked, points: next.P2.points },
            },
          ]);
        }
        // Tur sonu sesi REVEAL sahnesinde tek sefer çalar (çift ses önlendi) →
        // burada çalmıyoruz. Yanlış tahmin "anlık" sesi guess handler'larında.
        setPhase('round-reveal');
      } else {
        setHsActive('P1'); // yeni kademe → hotseat tekrar P1'den
      }
      scrollTop();
    },
    [p1Score, p2Score, scrollTop, offCareers, roundIdx],
  );

  // ── BOTA KARŞI: P1 tahmin → bot karar → çöz ──
  const guessBot = useCallback(
    (playerId: string | null) => {
      const career = offCareers?.[roundIdx];
      if (!career) return;
      const next = { P1: { ...prog.P1 }, P2: { ...prog.P2 } };
      // P1 (insan)
      if (!next.P1.locked && next.P1.tier < CAREER_TIERS) {
        const correct = playerId ? isCorrectGuess(career, playerId) : false;
        next.P1 = { ...next.P1, guessedId: playerId, correct };
        // Anlık geri bildirim: YANLIŞ tahminde kalp kırıklığı (doğru sesi reveal'da).
        if (playerId && !correct) playSfx('heartbreak');
      }
      // P2 (bot) — kendi kademesinde karar verir
      if (!next.P2.locked && next.P2.tier < CAREER_TIERS) {
        const prng = createPRNG(`${seedStr}:bot:${roundIdx}:${next.P2.tier}`);
        const dec = botDecision(next.P2.tier, () => prng.next(), 0.6);
        next.P2 = { ...next.P2, guessedId: dec.guess ? career.playerId : null, correct: dec.guess && dec.correct };
      }
      resolveTier(next);
    },
    [offCareers, roundIdx, prog, seedStr, resolveTier, playSfx],
  );

  // ── ARKADAŞA KARŞI: sırayla P1 → P2, sonra çöz ──
  const guessHotseat = useCallback(
    (playerId: string | null) => {
      const career = offCareers?.[roundIdx];
      if (!career) return;
      const side = hsActive;
      const correct = playerId ? isCorrectGuess(career, playerId) : false;
      const next = { P1: { ...prog.P1 }, P2: { ...prog.P2 } };
      if (!next[side].locked && next[side].tier < CAREER_TIERS) {
        next[side] = { ...next[side], guessedId: playerId, correct };
        // Anlık geri bildirim: YANLIŞ tahminde kalp kırıklığı (doğru sesi reveal'da).
        if (playerId && !correct) playSfx('heartbreak');
      }
      setProg(next);
      // İki aktif taraf da bu kademede tahmin etti mi?
      const active = (['P1', 'P2'] as CareerSide[]).filter((s) => !next[s].locked && next[s].tier < CAREER_TIERS);
      const pending = active.find((s) => s !== side && next[s].guessedId === null && !next[s].correct);
      // Basit: side P1 ise ve P2 hâlâ aktif+seçmemişse → sıra P2'ye.
      if (side === 'P1' && active.includes('P2') && next.P2.guessedId === null && !next.P2.correct) {
        setHsActive('P2');
        scrollTop();
        return;
      }
      // Aksi halde kademe çöz (P2 da seçti ya da P1 tek aktif).
      void pending;
      resolveTier(next);
    },
    [offCareers, roundIdx, prog, hsActive, resolveTier, scrollTop, playSfx],
  );

  const onGuessOffline = useCallback(
    (playerId: string) => {
      if (phase !== 'guess') return;
      if (opponent === 'vs-bot') guessBot(playerId);
      else guessHotseat(playerId);
    },
    [phase, opponent, guessBot, guessHotseat],
  );

  const onTimeoutOffline = useCallback(() => {
    if (phase !== 'guess') return;
    if (opponent === 'vs-bot') guessBot(null);
    else guessHotseat(null);
  }, [phase, opponent, guessBot, guessHotseat]);

  const onOfflineRoundDone = useCallback(() => {
    const next = roundIdx + 1;
    if (next >= (offCareers?.length ?? 0)) {
      setPhase('result');
      return;
    }
    setRoundIdx(next);
    setProg({ P1: { ...FRESH }, P2: { ...FRESH } });
    setHsActive('P1');
    setPhase('intro');
    scrollTop();
  }, [roundIdx, offCareers, scrollTop]);

  const onNamesSubmit = useCallback(
    (n1: string, n2: string) => {
      setP1Name(n1);
      setP2Name(n2);
      setProfileNames(n1, n2);
    },
    [setProfileNames],
  );

  // ============================================================================
  // ONLINE türev + handler
  // ============================================================================
  const view = online.view;
  const onlineDeadlineMs = useMemo(
    () => (online.turnDeadline ? new Date(online.turnDeadline).getTime() : null),
    [online.turnDeadline],
  );
  const mySideOnline: CareerSide = online.yourSide ?? 'P1';

  // Maç başlama düdüğü — ilk açılışta bir kez (offline + online).
  const whistleRef = useRef(false);
  useEffect(() => {
    const atOpening = isOnline
      ? view?.scene === 'REVEAL_INTRO' && view.round === 0
      : phase === 'intro' && roundIdx === 0;
    if (atOpening && !whistleRef.current) {
      whistleRef.current = true;
      playSfx('whistleStart');
    }
  }, [isOnline, view?.scene, view?.round, phase, roundIdx, playSfx]);

  const [pendingGuess, setPendingGuess] = useState(false);
  const [myOutcome, setMyOutcome] = useState<{ correct: boolean } | null>(null);

  // Kademe/tur/sahne değişince yerel tahmin durumunu temizle.
  const onlineTier = view?.myProgress?.tier ?? 0;
  const onlineRound = view?.round ?? 0;
  const onlineScene = view?.scene;
  useEffect(() => {
    setMyOutcome(null);
    setPendingGuess(false);
  }, [onlineTier, onlineRound, onlineScene]);

  const onGuessOnline = useCallback(
    (playerId: string) => {
      if (!view || pendingGuess || myOutcome) return;
      setPendingGuess(true);
      void online.guess(playerId).then((outcome) => {
        setPendingGuess(false);
        if (!outcome) {
          void online.refresh();
          return;
        }
        setMyOutcome({ correct: outcome.correct });
        // Anlık geri bildirim: YANLIŞ tahminde kalp kırıklığı; doğru/tur sonu sesi
        // REVEAL sahnesinde tek sefer (çift gol sesi önlendi).
        if (!outcome.correct) playSfx('heartbreak');
        scrollTop();
      });
    },
    [online, view, pendingGuess, myOutcome, playSfx, scrollTop],
  );

  const onTimeoutOnline = useCallback(() => {
    void online.refresh();
  }, [online]);

  const onRematch = useCallback(() => {
    if (isOnline) {
      router.push('/online?mode=kariyer');
      return;
    }
    resetGame();
    setPhase('intro');
  }, [isOnline, router, resetGame]);

  const onBack = useCallback(() => {
    if (isOnline) {
      router.push('/');
      return;
    }
    if (phase === 'opponent') router.push(`/oyna/${params.gameId}`);
    else {
      resetGame();
      setPhase('opponent');
    }
  }, [isOnline, phase, router, params.gameId, resetGame]);

  const onlineBg =
    view?.scene === 'GUESS' ? 'pick' : view?.scene === 'RESULT' ? 'final' : 'handoff';
  const offlineBg =
    phase === 'opponent' ? 'mode' : phase === 'result' ? 'final' : phase === 'guess' ? 'pick' : 'handoff';
  const bgKey = isOnline ? onlineBg : offlineBg;

  const nameModalOpen = !isOnline && opponent === 'hotseat' && phase !== 'opponent' && p1Name === '';

  // ── GUARD ──
  if (isOnline) {
    if (online.error) {
      return (
        <>
          <SceneBackground bgKey="mode" />
          <main className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-5 text-center">
            <h2 className="text-2xl font-black text-side-red">Maç hatası</h2>
            <p className="text-sm text-white/65">{online.error}</p>
            <button type="button" onClick={() => router.push('/')} className="btn-ghost">Ana sayfa</button>
          </main>
        </>
      );
    }
    if (online.loading || !view || !session.ready) {
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

  if (!isOnline && (!session.ready || clubsById === null)) {
    return (
      <>
        <SceneBackground bgKey="mode" />
        <main className="relative z-10 mx-auto flex min-h-screen flex-col items-center justify-center px-5">
          <BallLoader size={64} label="Yükleniyor…" />
        </main>
      </>
    );
  }

  const displayP1 = isOnline
    ? view?.p1Name ?? 'Oyuncu 1'
    : opponent === 'hotseat' ? p1Name || 'Oyuncu 1' : 'Sen';
  const displayP2 = isOnline
    ? view?.p2Name ?? 'Oyuncu 2'
    : opponent === 'hotseat' ? p2Name || 'Oyuncu 2' : 'Bot';

  // Offline aktif kariyer + clue (hotseat aktif tarafın kademesi / bot P1'in kademesi).
  const offCareer = offCareers?.[roundIdx] ?? null;
  const offGuessSide: CareerSide = opponent === 'hotseat' ? hsActive : 'P1';
  const offMyProg = prog[offGuessSide];
  const offClue =
    offCareer && phase === 'guess' ? clueForTier(offCareer, offMyProg.tier, seedStr) : null;

  // Offline reveal verisi.
  const offReveal: CareerReveal | null =
    phase === 'round-reveal' && offCareer
      ? {
          answerName: offCareer.playerName,
          answerInitial: offCareer.initial,
          nationality: offCareer.nationality,
          stops: offCareer.stops,
          p1: { tier: prog.P1.tier, correct: prog.P1.locked, points: prog.P1.points },
          p2: { tier: prog.P2.tier, correct: prog.P2.locked, points: prog.P2.points },
        }
      : null;

  const offWinner = decideWinner(p1Score, p2Score);

  return (
    <>
      <SceneBackground bgKey={bgKey} />
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
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
              Kariyer Yolu · {isOnline ? '🌐 Online' : opponent === 'hotseat' ? 'Arkadaşa karşı' : 'Bota karşı'}
            </span>
            <SoundToggle />
            <UserMenu />
          </div>
        </header>

        {/* ====================== ONLINE RENDER ====================== */}
        {isOnline && view && (
          <AnimatePresence mode="wait">
            {view.scene === 'REVEAL_INTRO' && (
              <SceneShell sceneKey="career-online-intro" key={`career-online-intro-${view.round}`}>
                <CareerIntro roundNo={view.round + 1} total={CAREER_ROUNDS} autoMs={INTRO_MS} onDone={online.ackIntro} />
              </SceneShell>
            )}

            {view.scene === 'GUESS' && view.myClue && view.myProgress && (
              <SceneShell sceneKey="career-online-guess" key="career-online-guess">
                <CareerGuessScene
                  clue={view.myClue}
                  pool={session.players}
                  roundNo={view.round + 1}
                  totalRounds={CAREER_ROUNDS}
                  seconds={30}
                  timerKey={`online-${view.round}-${view.myProgress.tier}`}
                  deadlineMs={onlineDeadlineMs}
                  onGuess={onGuessOnline}
                  onTimeout={onTimeoutOnline}
                  mySide={mySideOnline}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  p1Score={view.p1Score}
                  p2Score={view.p2Score}
                  myGuess={myOutcome}
                  myLocked={view.myProgress.locked}
                  myPoints={view.myProgress.points}
                  oppSignal={view.oppSignal}
                  locked={view.myProgress.locked || pendingGuess || !!myOutcome}
                  waitingLabel={
                    pendingGuess
                      ? '✓ Kontrol ediliyor…'
                      : view.myProgress.locked
                        ? 'Rakip bekleniyor…'
                        : myOutcome
                          ? myOutcome.correct ? 'Doğru! kademe çözülüyor…' : 'Sonraki ipucu açılıyor…'
                          : null
                  }
                />
              </SceneShell>
            )}

            {view.scene === 'ROUND_REVEAL' && view.reveal && (
              <SceneShell sceneKey="career-online-rr" key={`career-online-rr-${view.round}`}>
                <CareerRoundRevealScene
                  reveal={view.reveal}
                  roundNo={view.round + 1}
                  totalRounds={CAREER_ROUNDS}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  p1Score={view.p1Score}
                  p2Score={view.p2Score}
                  playersById={playersById}
                  autoMs={ROUND_REVEAL_MS}
                  onDone={online.ackRound}
                />
              </SceneShell>
            )}

            {view.scene === 'RESULT' && view.summaries && (
              <SceneShell sceneKey="career-online-result" key="career-online-result">
                <CareerResultScene
                  summaries={view.summaries}
                  p1Score={view.p1Score}
                  p2Score={view.p2Score}
                  winner={view.winner ?? 'tie'}
                  p1Name={displayP1}
                  p2Name={displayP2}
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
              <SceneShell sceneKey="career-opponent" key="career-opponent">
                <OpponentSelectScene
                  modeName="Kariyer Yolu"
                  available={{ hotseat: true, vsBot: true }}
                  onPick={onPickOpponent}
                  onOnline={onOnline}
                />
              </SceneShell>
            )}

            {phase === 'intro' && offCareer && !nameModalOpen && (
              <SceneShell sceneKey="career-intro" key={`career-intro-${roundIdx}`}>
                <CareerIntro
                  roundNo={roundIdx + 1}
                  total={offCareers?.length ?? CAREER_ROUNDS}
                  autoMs={INTRO_MS}
                  onDone={() => setPhase('guess')}
                />
              </SceneShell>
            )}

            {phase === 'guess' && offClue && !nameModalOpen && (
              <SceneShell sceneKey="career-guess" key={`career-guess-${roundIdx}-${offGuessSide}-${offMyProg.tier}`}>
                <CareerGuessScene
                  clue={offClue}
                  pool={session.players}
                  roundNo={roundIdx + 1}
                  totalRounds={offCareers?.length ?? CAREER_ROUNDS}
                  seconds={OFFLINE_TIER_SECONDS}
                  timerKey={`off-${roundIdx}-${offGuessSide}-${offMyProg.tier}`}
                  onGuess={onGuessOffline}
                  onTimeout={onTimeoutOffline}
                  mySide={offGuessSide}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  p1Score={p1Score}
                  p2Score={p2Score}
                  oppSignal={
                    opponent === 'hotseat'
                      ? null
                      : { tier: prog.P2.tier, locked: prog.P2.locked, submitted: false }
                  }
                />
              </SceneShell>
            )}

            {phase === 'round-reveal' && offReveal && (
              <SceneShell sceneKey="career-rr" key={`career-rr-${roundIdx}`}>
                <CareerRoundRevealScene
                  reveal={offReveal}
                  roundNo={roundIdx + 1}
                  totalRounds={offCareers?.length ?? CAREER_ROUNDS}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  p1Score={p1Score}
                  p2Score={p2Score}
                  playersById={playersById}
                  answerId={offCareer?.playerId ?? null}
                  autoMs={ROUND_REVEAL_MS}
                  onDone={onOfflineRoundDone}
                />
              </SceneShell>
            )}

            {phase === 'result' && (
              <SceneShell sceneKey="career-result" key="career-result">
                <CareerResultScene
                  summaries={offSummaries}
                  p1Score={p1Score}
                  p2Score={p2Score}
                  winner={offWinner}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  onRematch={onRematch}
                />
              </SceneShell>
            )}
          </AnimatePresence>
        )}
      </main>

      <NameModal open={nameModalOpen} mode="hotseat" initialP1={profileP1} initialP2={profileP2} onSubmit={onNamesSubmit} />
    </>
  );
}

/** Tur açılış ekranı — "kariyer geliyor". */
function CareerIntro({
  roundNo,
  total,
  autoMs,
  onDone,
}: {
  roundNo: number;
  total: number;
  autoMs?: number;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!autoMs) return;
    const t = setTimeout(onDone, autoMs);
    return () => clearTimeout(t);
  }, [autoMs, onDone]);

  return (
    <section className="flex min-h-[50vh] flex-col items-center justify-center gap-5 py-4 text-center">
      <motion.span
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-2 rounded-full border border-accent-gold/40 bg-accent-gold/15 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-accent-goldHi"
      >
        🎽 Kariyer Yolu · Tur {roundNo}/{total}
      </motion.span>
      <motion.h1
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 18 }}
        className="text-3xl font-black tracking-tight sm:text-4xl"
      >
        Bu kariyer kimin?
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="max-w-md text-sm text-white/65"
      >
        Kulüpler kademe kademe açılacak. <span className="font-semibold text-accent-goldHi">Ne kadar erken bilirsen o kadar çok puan</span> (5 → 3 → 2 → 1).
      </motion.p>
    </section>
  );
}
