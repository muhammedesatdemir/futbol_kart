'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import type { Player } from '@futbol-kart/shared-types';
import { HomeIcon, ArrowLeftIcon } from '@/components/icons';
import { SceneShell } from '@/components/scenes/SceneShell';
import { SceneBackground } from '@/components/SceneBackground';
import { BallLoader } from '@/components/BallLoader';
import { OpponentSelectScene, type Opponent } from '@/components/scenes/OpponentSelectScene';
import { QuizRevealScene } from '@/components/scenes/QuizRevealScene';
import { QuizSelectScene } from '@/components/scenes/QuizSelectScene';
import { QuizRoundRevealScene } from '@/components/scenes/QuizRoundRevealScene';
import { QuizResultScene, type QuizRoundSummary } from '@/components/scenes/QuizResultScene';
import { SoundToggle } from '@/components/SoundToggle';
import { UserMenu } from '@/components/UserMenu';
import { NameModal } from '@/components/NameModal';
import { useGameSession } from '@/lib/GameSessionProvider';
import { useProfileStore } from '@/lib/profileStore';
import { useSfx } from '@/lib/useSfx';
import { createPRNG } from '@futbol-kart/game-engine';
import { useOnlineQuizMatch } from '@/lib/useOnlineQuizMatch';
import {
  buildQuizRounds,
  evaluateQuizPick,
  decideQuizWinner,
  botPick,
  metricByKey,
  quizPhrase,
  positionGroupLabel,
  QUIZ_ROUNDS,
  type QuizRound,
  type QuizSide,
  type QuizJoker,
} from '@/lib/quizMode';

/** Offline tur içi alt-faz. */
type OffSub = 'reveal' | 'select-p1' | 'handoff' | 'select-p2' | 'round-reveal';
type Phase = 'opponent' | 'playing' | 'result';

/** Offline seçim süresi (sn) — tek ekran, taraf başına. */
const OFFLINE_SELECT_SECONDS = 25;
/** Tur sonucu otomatik gösterim (ms). */
const ROUND_REVEAL_MS = 6000;

interface OffSelection {
  indexes: number[] | null;
  correct: boolean;
  points: number;
}
const EMPTY: OffSelection = { indexes: null, correct: false, points: 0 };
type JokerState = { fifty: boolean; double: boolean };
const NO_JOKERS: JokerState = { fifty: false, double: false };

/**
 * "4'lü Kıyas" — her tur 4 futbolcu + 1 metrik; hangisinin değeri en yüksek?
 * İki oyuncu eşzamanlı seçer, reveal'da değerler + doğru cevap açılır. 7 tur.
 * Bota + arkadaşa karşı (handoff'lu) + ONLINE (sunucu-otoriteli, eşzamanlı).
 * 2 joker (her biri 1×/maç): %50 (2 şık ele) + x2 (çift işaret).
 *
 * Mevcut modlara dokunulmaz — Ortak Bul deseninin uyarlaması (yeni dosyalar).
 */
export default function QuizGamePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useGameSession();
  const playSfx = useSfx();

  // ── ONLINE TESPİTİ ──
  const isOnline = searchParams.get('online') === '1';
  const matchId = isOnline ? params.gameId : null;
  const online = useOnlineQuizMatch(matchId);

  const [roundSeed, setRoundSeed] = useState(() => Math.random().toString(36).slice(2));

  const playersById = useMemo(
    () => new Map(session.players.map((p) => [p.id, p])),
    [session.players],
  );

  // OFFLINE turlar (seed'den deterministik).
  const offlineRounds: QuizRound[] | null = useMemo(() => {
    if (isOnline) return null;
    if (!session.ready || session.players.length === 0) return null;
    return buildQuizRounds(`${params.gameId}:${roundSeed}`, session.players as Player[]);
  }, [isOnline, session.ready, session.players, params.gameId, roundSeed]);

  const [phase, setPhase] = useState<Phase>('opponent');
  const [opponent, setOpponent] = useState<Opponent>('vs-bot');

  // ── OFFLINE tur state ──
  const [roundIdx, setRoundIdx] = useState(0);
  const [offSub, setOffSub] = useState<OffSub>('reveal');
  const [picks, setPicks] = useState<Array<{ P1: OffSelection; P2: OffSelection }>>([]);
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  // Jokerler taraf başına 1×/maç. Bu turda aktif (eleme/çift) durumları ayrı.
  const [jokersP1, setJokersP1] = useState<JokerState>(NO_JOKERS);
  const [jokersP2, setJokersP2] = useState<JokerState>(NO_JOKERS);
  // Aktif tarafın BU TUR joker etkileri: %50 eleme index'leri + x2 çift-işaret modu.
  // (jokersP1/P2 maç-seviyesi "kullanıldı"yı tutar; bunlar yalnız o turda aktiftir.)
  const [activeFifty, setActiveFifty] = useState<number[]>([]);
  const [activeDouble, setActiveDouble] = useState(false);

  const profileP1 = useProfileStore((s) => s.p1Name);
  const profileP2 = useProfileStore((s) => s.p2Name);
  const setProfileNames = useProfileStore((s) => s.setNames);
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');

  const resetGame = useCallback(() => {
    setRoundIdx(0);
    setOffSub('reveal');
    setPicks([]);
    setP1Score(0);
    setP2Score(0);
    setJokersP1(NO_JOKERS);
    setJokersP2(NO_JOKERS);
    setActiveFifty([]);
    setActiveDouble(false);
    setRoundSeed(Math.random().toString(36).slice(2));
  }, []);

  const onPickOpponent = useCallback(
    (opp: Opponent) => {
      setOpponent(opp);
      resetGame();
      setPhase('playing');
    },
    [resetGame],
  );

  const onOnline = useCallback(() => {
    router.push('/online?mode=kiyas');
  }, [router]);

  const scrollTop = useCallback(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const offActiveSide: QuizSide = offSub === 'select-p2' ? 'P2' : 'P1';
  const offActiveJokers = offActiveSide === 'P1' ? jokersP1 : jokersP2;

  // ── OFFLINE: bir tarafın seçimini değerlendir + kaydet ──
  const recordPick = useCallback(
    (side: QuizSide, indexes: number[] | null): OffSelection => {
      const round = offlineRounds?.[roundIdx];
      if (!round) return EMPTY;
      const clean = indexes && indexes.length > 0 ? indexes : null;
      const result = clean ? evaluateQuizPick(round, clean) : { correct: false, points: 0 };
      const sel: OffSelection = { indexes: clean ?? [-1], correct: result.correct, points: result.points };
      setPicks((prev) => {
        const next = [...prev];
        const row = next[roundIdx] ?? { P1: { ...EMPTY }, P2: { ...EMPTY } };
        next[roundIdx] = { ...row, [side]: sel } as { P1: OffSelection; P2: OffSelection };
        return next;
      });
      return sel;
    },
    [offlineRounds, roundIdx],
  );

  const resolveOfflineRound = useCallback(
    (p1Sel: OffSelection, p2Sel: OffSelection) => {
      setP1Score((s) => s + p1Sel.points);
      setP2Score((s) => s + p2Sel.points);
      setActiveFifty([]);
      setActiveDouble(false);
      setOffSub('round-reveal');
      playSfx(p1Sel.correct || p2Sel.correct ? 'win' : 'heartbreak');
      scrollTop();
    },
    [playSfx, scrollTop],
  );

  // ── BOT seçimi (bota karşı): P1 seçince bot da seçer ──
  const runBotPick = useCallback(
    (p1Sel: OffSelection) => {
      const round = offlineRounds?.[roundIdx];
      if (!round) return;
      const prng = createPRNG(`${params.gameId}:bot:${roundIdx}`);
      const botIdx = botPick(round, () => prng.next(), 0.62);
      const botSel = recordPick('P2', [botIdx]);
      resolveOfflineRound(p1Sel, botSel);
    },
    [offlineRounds, roundIdx, params.gameId, recordPick, resolveOfflineRound],
  );

  // ── OFFLINE seçim handler (aktif taraf) ──
  const onSubmitOffline = useCallback(
    (indexes: number[]) => {
      if (phase !== 'playing') return;
      if (offSub === 'select-p1') {
        const p1Sel = recordPick('P1', indexes);
        if (opponent === 'vs-bot') {
          runBotPick(p1Sel);
        } else {
          setActiveFifty([]);
          setActiveDouble(false);
          setOffSub('handoff');
          scrollTop();
        }
      } else if (offSub === 'select-p2') {
        const p2Sel = recordPick('P2', indexes);
        const p1Sel = picks[roundIdx]?.P1 ?? EMPTY;
        resolveOfflineRound(p1Sel, p2Sel);
      }
    },
    [phase, offSub, opponent, recordPick, runBotPick, picks, roundIdx, resolveOfflineRound, scrollTop],
  );

  const onTimeoutOffline = useCallback(() => {
    if (phase !== 'playing') return;
    if (offSub === 'select-p1') {
      const p1Sel = recordPick('P1', null);
      if (opponent === 'vs-bot') runBotPick(p1Sel);
      else {
        setActiveFifty([]);
        setActiveDouble(false);
        setOffSub('handoff');
      }
    } else if (offSub === 'select-p2') {
      const p2Sel = recordPick('P2', null);
      const p1Sel = picks[roundIdx]?.P1 ?? EMPTY;
      resolveOfflineRound(p1Sel, p2Sel);
    }
  }, [phase, offSub, opponent, recordPick, runBotPick, picks, roundIdx, resolveOfflineRound]);

  // ── OFFLINE joker (aktif taraf) ──
  const onJokerOffline = useCallback(
    (joker: QuizJoker) => {
      const round = offlineRounds?.[roundIdx];
      if (!round || offActiveJokers[joker]) return;
      playSfx('joker');
      if (joker === 'fifty') {
        setActiveFifty(
          round.choiceIds.map((_, i) => i).filter((i) => !round.fiftyKeepIndexes.includes(i)),
        );
      } else {
        setActiveDouble(true);
      }
      const setter = offActiveSide === 'P1' ? setJokersP1 : setJokersP2;
      setter((prev) => ({ ...prev, [joker]: true }));
    },
    [offlineRounds, roundIdx, offActiveJokers, offActiveSide, playSfx],
  );

  // ── OFFLINE round-reveal sonrası ──
  const onOfflineRoundDone = useCallback(() => {
    const next = roundIdx + 1;
    if (next >= (offlineRounds?.length ?? 0)) {
      setPhase('result');
      return;
    }
    setRoundIdx(next);
    setOffSub('reveal');
    setActiveFifty([]);
    setActiveDouble(false);
    scrollTop();
  }, [roundIdx, offlineRounds, scrollTop]);

  const onNamesSubmit = useCallback(
    (n1: string, n2: string) => {
      setP1Name(n1);
      setP2Name(n2);
      setProfileNames(n1, n2);
    },
    [setProfileNames],
  );

  // ============================================================================
  // ONLINE türev değerler + handler'lar
  // ============================================================================
  const onlineState = online.state;
  const onlineDeadlineMs = useMemo(
    () => (online.turnDeadline ? new Date(online.turnDeadline).getTime() : null),
    [online.turnDeadline],
  );
  const mySideOnline: QuizSide = online.yourSide ?? 'P1';
  const oppSideOnline: QuizSide = mySideOnline === 'P1' ? 'P2' : 'P1';

  // Maç başlama düdüğü — İLK açılışta bir kez (offline + online).
  const whistleRef = useRef(false);
  useEffect(() => {
    const atOpening = isOnline
      ? onlineState?.scene === 'REVEAL_METRIC' && onlineState.round === 0
      : phase === 'playing' && offSub === 'reveal' && roundIdx === 0;
    if (atOpening && !whistleRef.current) {
      whistleRef.current = true;
      playSfx('whistleStart');
    }
  }, [isOnline, onlineState?.scene, onlineState?.round, phase, offSub, roundIdx, playSfx]);

  // ONLINE seçim/joker yerel durumu.
  const [pendingGuess, setPendingGuess] = useState(false);
  const [myOutcome, setMyOutcome] = useState<{ correct: boolean } | null>(null);
  const [onlineFifty, setOnlineFifty] = useState<number[]>([]);
  // x2 BU TUR aktif mi (çift-işaret modu) — turda 1×, tur değişince temizlenir.
  const [onlineDouble, setOnlineDouble] = useState(false);

  const onlineRound = onlineState?.round ?? 0;
  const onlineScene = onlineState?.scene;
  useEffect(() => {
    setMyOutcome(null);
    setPendingGuess(false);
    setOnlineFifty([]);
    setOnlineDouble(false);
  }, [onlineRound, onlineScene]);

  const onSubmitOnline = useCallback(
    (indexes: number[]) => {
      if (!onlineState || pendingGuess || myOutcome) return;
      setPendingGuess(true);
      void online.select(indexes).then((outcome) => {
        setPendingGuess(false);
        if (!outcome) {
          void online.refresh();
          return;
        }
        setMyOutcome({ correct: outcome.correct });
        scrollTop();
      });
    },
    [online, onlineState, pendingGuess, myOutcome, scrollTop],
  );

  const onJokerOnline = useCallback(
    (joker: QuizJoker) => {
      if (!onlineState || onlineState.jokers[mySideOnline][joker]) return;
      playSfx('joker');
      void online.useJoker(joker).then((r) => {
        if (r?.joker === 'fifty' && r.keepIndexes) {
          const keep = new Set(r.keepIndexes);
          const elim = (onlineState.rounds[onlineState.round]?.choiceIds ?? []).map((_, i) => i).filter((i) => !keep.has(i));
          setOnlineFifty(elim);
        } else if (r?.joker === 'double') {
          setOnlineDouble(true);
        }
        void online.refresh();
      });
    },
    [online, onlineState, mySideOnline, playSfx],
  );

  const onTimeoutOnline = useCallback(() => {
    void online.refresh();
  }, [online]);

  // ONLINE tur sonucu sesi: ROUND_REVEAL'e geçince bir kez (offline'daki gibi).
  // Tur reveal'inde tarafların doğru/yanlışına göre win/heartbreak (offline ile aynı kural).
  const roundSfxRef = useRef(-1);
  useEffect(() => {
    if (!isOnline || onlineState?.scene !== 'ROUND_REVEAL') return;
    if (roundSfxRef.current === onlineState.round) return;
    roundSfxRef.current = onlineState.round;
    const sel = onlineState.selections[onlineState.round];
    const anyCorrect = !!(sel && (sel.P1.correct || sel.P2.correct));
    playSfx(anyCorrect ? 'win' : 'heartbreak');
  }, [isOnline, onlineState?.scene, onlineState?.round, onlineState?.selections, playSfx]);

  const onRematch = useCallback(() => {
    if (isOnline) {
      router.push('/online?mode=kiyas');
      return;
    }
    resetGame();
    setPhase('playing');
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

  // Arka plan anahtarı.
  const onlineBg =
    onlineState?.scene === 'SELECT'
      ? 'pick'
      : onlineState?.scene === 'RESULT'
        ? 'final'
        : 'handoff';
  const offlineBg =
    phase === 'opponent'
      ? 'mode'
      : phase === 'result'
        ? 'final'
        : offSub === 'select-p1' || offSub === 'select-p2'
          ? 'pick'
          : 'handoff';
  const bgKey = isOnline ? onlineBg : offlineBg;

  const nameModalOpen =
    !isOnline && opponent === 'hotseat' && phase === 'playing' && p1Name === '';

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

  if (!isOnline && (!session.ready || !offlineRounds)) {
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
    ? onlineState?.p1Name ?? 'Oyuncu 1'
    : opponent === 'hotseat'
      ? p1Name || 'Oyuncu 1'
      : 'Sen';
  const displayP2 = isOnline
    ? onlineState?.p2Name ?? 'Oyuncu 2'
    : opponent === 'hotseat'
      ? p2Name || 'Oyuncu 2'
      : 'Bot';

  // ── ONLINE sahne türevleri ──
  const onlineRoundData = onlineState?.rounds[onlineState.round] ?? null;
  const onlineMetric = onlineRoundData ? metricByKey(onlineRoundData.metricKey) : null;
  const onlineMetricLabel = onlineMetric?.shortLabel ?? onlineRoundData?.metricKey ?? '';
  const onlineMetricUnit = onlineMetric?.unit ?? '';
  const onlinePhrase = quizPhrase(onlineRoundData?.metricKey ?? '');
  const onlinePosCtx = positionGroupLabel(onlineRoundData?.positionGroup ?? null);
  const onlineChoices: Player[] = (onlineRoundData?.choiceIds ?? [])
    .map((id) => playersById.get(id))
    .filter((p): p is Player => !!p);
  const onlineSel = onlineState?.selections[onlineState.round] ?? null;
  const opponentReadyOnline = !!(onlineSel && onlineSel[oppSideOnline].indexes !== null);

  const onlineSummaries: QuizRoundSummary[] =
    onlineState?.scene === 'RESULT'
      ? onlineState.rounds.map((r, i) => {
          const f = metricByKey(r.metricKey);
          const sel = onlineState.selections[i];
          return {
            metricLabel: f?.shortLabel ?? r.metricKey,
            metricUnit: f?.unit ?? '',
            choiceIds: r.choiceIds,
            values: r.values,
            correctIndex: r.correctIndex,
            p1Indexes: sel?.P1.indexes ?? null,
            p2Indexes: sel?.P2.indexes ?? null,
            p1Correct: sel?.P1.correct ?? false,
            p2Correct: sel?.P2.correct ?? false,
          };
        })
      : [];

  // ── OFFLINE sahne türevleri ──
  const offRound = offlineRounds?.[roundIdx] ?? null;
  const offMetric = offRound ? metricByKey(offRound.metricKey) : null;
  const offMetricLabel = offMetric?.shortLabel ?? offRound?.metricKey ?? '';
  const offMetricUnit = offMetric?.unit ?? '';
  const offPhrase = quizPhrase(offRound?.metricKey ?? '');
  const offPosCtx = positionGroupLabel(offRound?.positionGroup ?? null);
  const offChoices: Player[] = (offRound?.choiceIds ?? [])
    .map((id) => playersById.get(id))
    .filter((p): p is Player => !!p);
  const offRow = picks[roundIdx] ?? { P1: { ...EMPTY }, P2: { ...EMPTY } };

  const offlineSummaries: QuizRoundSummary[] =
    phase === 'result' && offlineRounds
      ? offlineRounds.map((r, i) => {
          const f = metricByKey(r.metricKey);
          return {
            metricLabel: f?.shortLabel ?? r.metricKey,
            metricUnit: f?.unit ?? '',
            choiceIds: r.choiceIds,
            values: r.values,
            correctIndex: r.correctIndex,
            p1Indexes: picks[i]?.P1.indexes ?? null,
            p2Indexes: picks[i]?.P2.indexes ?? null,
            p1Correct: picks[i]?.P1.correct ?? false,
            p2Correct: picks[i]?.P2.correct ?? false,
          };
        })
      : [];
  const offlineWinner = decideQuizWinner(p1Score, p2Score);

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
              4&apos;lü Kıyas · {isOnline ? '🌐 Online' : opponent === 'hotseat' ? 'Arkadaşa karşı' : 'Bota karşı'}
            </span>
            <SoundToggle />
            <UserMenu />
          </div>
        </header>

        {/* ====================== ONLINE RENDER ====================== */}
        {isOnline && onlineState && onlineRoundData && (
          <AnimatePresence mode="wait">
            {onlineState.scene === 'REVEAL_METRIC' && (
              <SceneShell sceneKey="quiz-online-reveal" key={`quiz-online-reveal-${onlineState.round}`}>
                <QuizRevealScene
                  metricLabel={onlineMetricLabel}
                  metricQuestion={onlinePhrase.question}
                  metricMost={onlinePhrase.most}
                  positionContext={onlinePosCtx}
                  roundNo={onlineState.round + 1}
                  totalRounds={QUIZ_ROUNDS}
                  autoMs={5000}
                  onDone={online.ackReveal}
                />
              </SceneShell>
            )}

            {onlineState.scene === 'SELECT' && (
              <SceneShell sceneKey="quiz-online-select" key="quiz-online-select">
                <QuizSelectScene
                  choices={onlineChoices}
                  metricQuestion={onlinePhrase.question}
                  metricMost={onlinePhrase.most}
                  positionContext={onlinePosCtx}
                  roundNo={onlineState.round + 1}
                  totalRounds={QUIZ_ROUNDS}
                  seconds={30}
                  timerKey={`online-${onlineState.round}`}
                  deadlineMs={onlineDeadlineMs}
                  onSubmit={onSubmitOnline}
                  onTimeout={onTimeoutOnline}
                  mySide={mySideOnline}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  p1Score={onlineState.p1Score}
                  p2Score={onlineState.p2Score}
                  myPick={myOutcome}
                  opponentReady={opponentReadyOnline}
                  locked={!!myOutcome || pendingGuess}
                  waitingLabel={
                    pendingGuess
                      ? '✓ Gönderiliyor…'
                      : myOutcome
                        ? 'Rakip seçimini bekliyoruz…'
                        : null
                  }
                  fiftyUsed={onlineState.jokers[mySideOnline].fifty}
                  doubleUsed={onlineState.jokers[mySideOnline].double}
                  doubleActive={onlineDouble}
                  onJoker={onJokerOnline}
                  eliminatedIndexes={onlineFifty}
                />
              </SceneShell>
            )}

            {onlineState.scene === 'ROUND_REVEAL' && onlineSel && (
              <SceneShell sceneKey="quiz-online-roundreveal" key={`quiz-online-rr-${onlineState.round}`}>
                <QuizRoundRevealScene
                  choices={onlineChoices}
                  values={onlineRoundData.values}
                  correctIndex={onlineRoundData.correctIndex}
                  metricReveal={onlinePhrase.reveal}
                  metricMost={onlinePhrase.most}
                  metricUnit={onlineMetricUnit}
                  roundNo={onlineState.round + 1}
                  totalRounds={QUIZ_ROUNDS}
                  p1Indexes={onlineSel.P1.indexes}
                  p2Indexes={onlineSel.P2.indexes}
                  p1Correct={onlineSel.P1.correct}
                  p2Correct={onlineSel.P2.correct}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  p1Score={onlineState.p1Score}
                  p2Score={onlineState.p2Score}
                  autoMs={ROUND_REVEAL_MS}
                  onDone={online.ackRound}
                />
              </SceneShell>
            )}

            {onlineState.scene === 'RESULT' && (
              <SceneShell sceneKey="quiz-online-result" key="quiz-online-result">
                <QuizResultScene
                  rounds={onlineSummaries}
                  p1Score={onlineState.p1Score}
                  p2Score={onlineState.p2Score}
                  winner={onlineState.winner ?? 'tie'}
                  p1Name={displayP1}
                  p2Name={displayP2}
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
              <SceneShell sceneKey="quiz-opponent" key="quiz-opponent">
                <OpponentSelectScene
                  modeName="4'lü Kıyas"
                  available={{ hotseat: true, vsBot: true }}
                  onPick={onPickOpponent}
                  onOnline={onOnline}
                />
              </SceneShell>
            )}

            {phase === 'playing' && offRound && !nameModalOpen && offSub === 'reveal' && (
              <SceneShell sceneKey="quiz-reveal" key={`quiz-reveal-${roundIdx}`}>
                <QuizRevealScene
                  metricLabel={offMetricLabel}
                  metricQuestion={offPhrase.question}
                  metricMost={offPhrase.most}
                  positionContext={offPosCtx}
                  roundNo={roundIdx + 1}
                  totalRounds={offlineRounds?.length ?? QUIZ_ROUNDS}
                  onDone={() => setOffSub('select-p1')}
                />
              </SceneShell>
            )}

            {phase === 'playing' && offRound && !nameModalOpen && (offSub === 'select-p1' || offSub === 'select-p2') && (
              <SceneShell sceneKey="quiz-select" key={`quiz-select-${roundIdx}-${offSub}`}>
                <QuizSelectScene
                  choices={offChoices}
                  metricQuestion={offPhrase.question}
                  metricMost={offPhrase.most}
                  positionContext={offPosCtx}
                  roundNo={roundIdx + 1}
                  totalRounds={offlineRounds?.length ?? QUIZ_ROUNDS}
                  seconds={OFFLINE_SELECT_SECONDS}
                  timerKey={`off-${roundIdx}-${offSub}`}
                  onSubmit={onSubmitOffline}
                  onTimeout={onTimeoutOffline}
                  mySide={offActiveSide}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  p1Score={p1Score}
                  p2Score={p2Score}
                  fiftyUsed={offActiveJokers.fifty}
                  doubleUsed={offActiveJokers.double}
                  doubleActive={activeDouble}
                  onJoker={onJokerOffline}
                  eliminatedIndexes={activeFifty}
                />
              </SceneShell>
            )}

            {phase === 'playing' && offSub === 'handoff' && (
              <SceneShell sceneKey="quiz-handoff" key={`quiz-handoff-${roundIdx}`}>
                <section className="glass-panel-strong mt-12 flex flex-col items-center gap-6 p-10 text-center">
                  <div className="rounded-full bg-accent-gold/20 px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent-goldHi">
                    Sıra değişiyor
                  </div>
                  <h2 className="text-2xl font-black">{displayP1} seçti</h2>
                  <p className="max-w-md text-white/65">
                    Cihazı <span className="font-semibold text-white/90">{displayP2}</span>’ye ver — sıra onda.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFifty([]);
                      setActiveDouble(false);
                      setOffSub('select-p2');
                      scrollTop();
                    }}
                    className="btn-primary"
                  >
                    {displayP2} — hazırım →
                  </button>
                </section>
              </SceneShell>
            )}

            {phase === 'playing' && offRound && offSub === 'round-reveal' && (
              <SceneShell sceneKey="quiz-roundreveal" key={`quiz-rr-${roundIdx}`}>
                <QuizRoundRevealScene
                  choices={offChoices}
                  values={offRound.values}
                  correctIndex={offRound.correctIndex}
                  metricReveal={offPhrase.reveal}
                  metricMost={offPhrase.most}
                  metricUnit={offMetricUnit}
                  roundNo={roundIdx + 1}
                  totalRounds={offlineRounds?.length ?? QUIZ_ROUNDS}
                  p1Indexes={offRow.P1.indexes}
                  p2Indexes={offRow.P2.indexes}
                  p1Correct={offRow.P1.correct}
                  p2Correct={offRow.P2.correct}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  p1Score={p1Score}
                  p2Score={p2Score}
                  autoMs={opponent === 'vs-bot' ? ROUND_REVEAL_MS : undefined}
                  onDone={onOfflineRoundDone}
                />
              </SceneShell>
            )}

            {phase === 'result' && (
              <SceneShell sceneKey="quiz-result" key="quiz-result">
                <QuizResultScene
                  rounds={offlineSummaries}
                  p1Score={p1Score}
                  p2Score={p2Score}
                  winner={offlineWinner}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  playersById={playersById}
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
