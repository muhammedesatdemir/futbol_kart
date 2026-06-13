'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { HomeIcon, ArrowLeftIcon } from '@/components/icons';
import { SceneShell } from '@/components/scenes/SceneShell';
import { SceneBackground } from '@/components/SceneBackground';
import { BallLoader } from '@/components/BallLoader';
import { OpponentSelectScene, type Opponent } from '@/components/scenes/OpponentSelectScene';
import { CommonRevealScene } from '@/components/scenes/CommonRevealScene';
import { CommonSelectScene } from '@/components/scenes/CommonSelectScene';
import { CommonRoundRevealScene } from '@/components/scenes/CommonRoundRevealScene';
import { CommonResultScene, type CommonRoundSummary } from '@/components/scenes/CommonResultScene';
import { SoundToggle } from '@/components/SoundToggle';
import { UserMenu } from '@/components/UserMenu';
import { NameModal } from '@/components/NameModal';
import { useGameSession } from '@/lib/GameSessionProvider';
import { useProfileStore } from '@/lib/profileStore';
import { useSfx } from '@/lib/useSfx';
import { createPRNG } from '@futbol-kart/game-engine';
import { fetchClubPool } from '@/lib/clubPoolClient';
import { fetchClubPairs } from '@/lib/clubPairsClient';
import { useOnlineCommonMatch } from '@/lib/useOnlineCommonMatch';
import {
  curatePairs,
  toRoundPair,
  evaluateSelection,
  decideWinner,
  buildHint,
  botSelect,
  COMMON_ROUNDS,
  type ClubPair,
  type CommonRoundPair,
  type CommonHint,
  type CommonSide,
} from '@/lib/commonMode';

/** Offline tur içi alt-faz. */
type OffSub = 'reveal' | 'select-p1' | 'handoff' | 'select-p2' | 'round-reveal';
type Phase = 'opponent' | 'playing' | 'result';

/** Offline seçim süresi (sn) — tek ekran, taraf başına. */
const OFFLINE_SELECT_SECONDS = 20;
/** Tur sonucu otomatik gösterim (ms). */
const ROUND_REVEAL_MS = 5000;

interface OffSelection {
  playerId: string | null;
  correct: boolean;
  points: number;
}
const EMPTY: OffSelection = { playerId: null, correct: false, points: 0 };

/**
 * "Ortak Bul" — her tur 2 kulüp gelir; her iki kulüpte de oynamış bir futbolcuyu
 * bul. Az bilinen ortak = çok puan (nadirlik). 5 tur, en çok puan kazanır.
 * Bota + arkadaşa karşı (handoff'lu) + ONLINE (sunucu-otoriteli, eşzamanlı).
 *
 * Mevcut modlara dokunulmaz — VS Düello/Zincir deseninin uyarlaması (yeni dosyalar).
 */
export default function CommonGamePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useGameSession();
  const playSfx = useSfx();

  // ── ONLINE TESPİTİ ──
  const isOnline = searchParams.get('online') === '1';
  const matchId = isOnline ? params.gameId : null;
  const online = useOnlineCommonMatch(matchId);

  // OFFLINE veri: clubPool (logo) + clubPairs (çiftler+cevaplar).
  const [pool, setPool] = useState<Awaited<ReturnType<typeof fetchClubPool>> | null>(null);
  const [pairsFile, setPairsFile] = useState<Awaited<ReturnType<typeof fetchClubPairs>> | null>(null);
  useEffect(() => {
    if (isOnline) {
      setPool([]);
      setPairsFile({ generatedAt: '', minAnswers: 0, clubCount: 0, pairCount: 0, pairs: [] });
      return;
    }
    fetchClubPool().then(setPool).catch(() => setPool([]));
    fetchClubPairs().then(setPairsFile).catch(() =>
      setPairsFile({ generatedAt: '', minAnswers: 0, clubCount: 0, pairCount: 0, pairs: [] }),
    );
  }, [isOnline]);

  const [roundSeed, setRoundSeed] = useState(() => Math.random().toString(36).slice(2));

  const playersById = useMemo(
    () => new Map(session.players.map((p) => [p.id, p])),
    [session.players],
  );

  // OFFLINE kürate edilmiş çiftler (logolu).
  const offlinePairs: ClubPair[] | null = useMemo(() => {
    if (isOnline) return null;
    if (!pairsFile || pairsFile.pairs.length === 0) return null;
    return curatePairs(`${params.gameId}:${roundSeed}`, pairsFile);
  }, [isOnline, pairsFile, params.gameId, roundSeed]);

  const offlineRoundPairs: CommonRoundPair[] = useMemo(() => {
    if (!offlinePairs || !pool) return [];
    const poolById = new Map(pool.map((c) => [c.id, c]));
    return offlinePairs.map((p) => toRoundPair(p, poolById));
  }, [offlinePairs, pool]);

  const [phase, setPhase] = useState<Phase>('opponent');
  const [opponent, setOpponent] = useState<Opponent>('vs-bot');

  // ── OFFLINE tur state ──
  const [roundIdx, setRoundIdx] = useState(0);
  const [offSub, setOffSub] = useState<OffSub>('reveal');
  const [picks, setPicks] = useState<Array<{ P1: OffSelection; P2: OffSelection }>>([]);
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [jokerUsed, setJokerUsed] = useState<{ P1: boolean; P2: boolean }>({ P1: false, P2: false });
  const [offHint, setOffHint] = useState<CommonHint | null>(null);

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
    setJokerUsed({ P1: false, P2: false });
    setOffHint(null);
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
    router.push('/online?mode=ortak');
  }, [router]);

  const scrollTop = useCallback(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ── OFFLINE: bir tarafın seçimini değerlendir + kaydet ──
  const recordPick = useCallback(
    (side: CommonSide, playerId: string | null) => {
      const pair = offlinePairs?.[roundIdx];
      if (!pair) return EMPTY;
      const result = playerId ? evaluateSelection(pair, playerId) : { correct: false, points: 0, playerId: '__pass' };
      const sel: OffSelection = { playerId: result.playerId ?? '__pass', correct: result.correct, points: result.points };
      setPicks((prev) => {
        const next = [...prev];
        const row = next[roundIdx] ?? { P1: { ...EMPTY }, P2: { ...EMPTY } };
        next[roundIdx] = { ...row, [side]: sel } as { P1: OffSelection; P2: OffSelection };
        return next;
      });
      return sel;
    },
    [offlinePairs, roundIdx],
  );

  /** Tur sonunda skorları işle (iki seçim de hazır) ve round-reveal'e geç. */
  const resolveOfflineRound = useCallback(
    (p1Sel: OffSelection, p2Sel: OffSelection) => {
      setP1Score((s) => s + p1Sel.points);
      setP2Score((s) => s + p2Sel.points);
      setOffHint(null);
      setOffSub('round-reveal');
      playSfx(p1Sel.correct || p2Sel.correct ? 'win' : 'heartbreak');
      scrollTop();
    },
    [playSfx, scrollTop],
  );

  // ── BOT seçimi (bota karşı): P1 seçince bot da seçer ──
  const runBotPick = useCallback(
    (p1Sel: OffSelection) => {
      const pair = offlinePairs?.[roundIdx];
      if (!pair) return;
      const prng = createPRNG(`${params.gameId}:bot:${roundIdx}`);
      const botId = botSelect(pair, () => prng.next(), 0.6);
      const botSel = recordPick('P2', botId);
      // recordPick async setState; skor için doğrudan hesapla.
      resolveOfflineRound(p1Sel, botSel);
    },
    [offlinePairs, roundIdx, params.gameId, recordPick, resolveOfflineRound],
  );

  // ── OFFLINE seçim handler (aktif taraf) ──
  const onSelectOffline = useCallback(
    (playerId: string) => {
      if (phase !== 'playing') return;
      if (offSub === 'select-p1') {
        const p1Sel = recordPick('P1', playerId);
        if (opponent === 'vs-bot') {
          runBotPick(p1Sel);
        } else {
          // hotseat → P2'ye devret
          setOffHint(null);
          setOffSub('handoff');
          scrollTop();
        }
      } else if (offSub === 'select-p2') {
        const p2Sel = recordPick('P2', playerId);
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
        setOffHint(null);
        setOffSub('handoff');
      }
    } else if (offSub === 'select-p2') {
      const p2Sel = recordPick('P2', null);
      const p1Sel = picks[roundIdx]?.P1 ?? EMPTY;
      resolveOfflineRound(p1Sel, p2Sel);
    }
  }, [phase, offSub, opponent, recordPick, runBotPick, picks, roundIdx, resolveOfflineRound]);

  // ── OFFLINE ipucu jokeri (aktif taraf) ──
  const offActiveSide: CommonSide = offSub === 'select-p2' ? 'P2' : 'P1';
  const onHintOffline = useCallback(() => {
    const pair = offlinePairs?.[roundIdx];
    if (!pair || jokerUsed[offActiveSide]) return;
    const exclude = new Set<string>();
    const row = picks[roundIdx];
    if (row?.P1.playerId && row.P1.playerId !== '__pass') exclude.add(row.P1.playerId);
    if (row?.P2.playerId && row.P2.playerId !== '__pass') exclude.add(row.P2.playerId);
    const hint = buildHint(pair, playersById, exclude, roundIdx + 1);
    if (hint) {
      setOffHint(hint);
      setJokerUsed((prev) => ({ ...prev, [offActiveSide]: true }));
    }
  }, [offlinePairs, roundIdx, jokerUsed, offActiveSide, picks, playersById]);

  // ── OFFLINE round-reveal sonrası: sonraki tur / sonuç ──
  const onOfflineRoundDone = useCallback(() => {
    const next = roundIdx + 1;
    if (next >= (offlinePairs?.length ?? 0)) {
      setPhase('result');
      return;
    }
    setRoundIdx(next);
    setOffSub('reveal');
    setOffHint(null);
    scrollTop();
  }, [roundIdx, offlinePairs, scrollTop]);

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
  const mySideOnline: CommonSide = online.yourSide ?? 'P1';
  const oppSideOnline: CommonSide = mySideOnline === 'P1' ? 'P2' : 'P1';

  // Maç başlama düdüğü — İLK açılış göründüğünde bir kez (offline + online).
  // Online: ilk REVEAL_PAIR (round 0). Offline: oyun başlayıp ilk 'reveal' alt-fazı.
  const whistleRef = useRef(false);
  useEffect(() => {
    const atOpening = isOnline
      ? onlineState?.scene === 'REVEAL_PAIR' && onlineState.round === 0
      : phase === 'playing' && offSub === 'reveal' && roundIdx === 0;
    if (atOpening && !whistleRef.current) {
      whistleRef.current = true;
      playSfx('whistleStart');
    }
  }, [isOnline, onlineState?.scene, onlineState?.round, phase, offSub, roundIdx, playSfx]);

  // ONLINE seçim: pendingGuess (tıklama→yanıt kilidi) + outcome (correct; puan gizli).
  const [pendingGuess, setPendingGuess] = useState(false);
  const [myOutcome, setMyOutcome] = useState<{ playerId: string; correct: boolean } | null>(null);
  const [onlineHint, setOnlineHint] = useState<CommonHint | null>(null);

  // Yeni tur / sahne değişince yerel seçim durumunu temizle.
  const onlineRound = onlineState?.round ?? 0;
  const onlineScene = onlineState?.scene;
  useEffect(() => {
    setMyOutcome(null);
    setPendingGuess(false);
    setOnlineHint(null);
  }, [onlineRound, onlineScene]);

  const onSelectOnline = useCallback(
    (playerId: string) => {
      if (!onlineState || pendingGuess || myOutcome) return;
      setPendingGuess(true);
      void online.select(playerId).then((outcome) => {
        setPendingGuess(false);
        if (!outcome) {
          void online.refresh();
          return;
        }
        setMyOutcome({ playerId: outcome.playerId, correct: outcome.correct });
        playSfx(outcome.correct ? 'win' : 'heartbreak');
        scrollTop();
      });
    },
    [online, onlineState, pendingGuess, myOutcome, playSfx, scrollTop],
  );

  const onHintOnline = useCallback(() => {
    if (!onlineState || onlineState.jokerUsed[mySideOnline]) return;
    void online.useHint().then((r) => {
      if (r) setOnlineHint(r.hint);
      void online.refresh();
    });
  }, [online, onlineState, mySideOnline]);

  const onTimeoutOnline = useCallback(() => {
    void online.refresh();
  }, [online]);

  const onRematch = useCallback(() => {
    if (isOnline) {
      router.push('/online?mode=ortak');
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

  if (!isOnline && (!session.ready || pool === null || pairsFile === null)) {
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

  // Online sahne için aktif çift + maskelenmiş seçimler.
  const onlinePair = onlineState?.roundPairs[onlineState.round] ?? null;
  const onlineSel = onlineState?.selections[onlineState.round] ?? null;
  // Rakip hazır mı? (maskeli state'te rakip seçimi '__hidden' olur)
  const opponentReadyOnline = !!(onlineSel && onlineSel[oppSideOnline].playerId !== null);

  // Online final dökümü.
  const onlineSummaries: CommonRoundSummary[] =
    onlineState?.scene === 'RESULT'
      ? onlineState.roundPairs.map((rp, i) => ({
          pair: rp,
          p1: onlineState.selections[i]?.P1 ?? { playerId: null, correct: false, points: 0 },
          p2: onlineState.selections[i]?.P2 ?? { playerId: null, correct: false, points: 0 },
        }))
      : [];

  // Offline final dökümü.
  const offlineSummaries: CommonRoundSummary[] =
    phase === 'result'
      ? offlineRoundPairs.map((rp, i) => ({
          pair: rp,
          p1: picks[i]?.P1 ?? { playerId: null, correct: false, points: 0 },
          p2: picks[i]?.P2 ?? { playerId: null, correct: false, points: 0 },
        }))
      : [];
  const offlineWinner = decideWinner(p1Score, p2Score);

  const offPair = offlineRoundPairs[roundIdx] ?? null;
  const offRow = picks[roundIdx] ?? { P1: { ...EMPTY }, P2: { ...EMPTY } };

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
              Ortak Bul · {isOnline ? '🌐 Online' : opponent === 'hotseat' ? 'Arkadaşa karşı' : 'Bota karşı'}
            </span>
            <SoundToggle />
            <UserMenu />
          </div>
        </header>

        {/* ====================== ONLINE RENDER ====================== */}
        {isOnline && onlineState && onlinePair && (
          <AnimatePresence mode="wait">
            {onlineState.scene === 'REVEAL_PAIR' && (
              <SceneShell sceneKey="common-online-reveal" key={`common-online-reveal-${onlineState.round}`}>
                <CommonRevealScene
                  pair={onlinePair}
                  roundNo={onlineState.round + 1}
                  totalRounds={COMMON_ROUNDS}
                  onDone={online.ackReveal}
                />
              </SceneShell>
            )}

            {onlineState.scene === 'SELECT' && (
              <SceneShell sceneKey="common-online-select" key="common-online-select">
                <CommonSelectScene
                  pair={onlinePair}
                  pool={session.players}
                  roundNo={onlineState.round + 1}
                  totalRounds={COMMON_ROUNDS}
                  seconds={30}
                  timerKey={`online-${onlineState.round}`}
                  deadlineMs={onlineDeadlineMs}
                  onSelect={onSelectOnline}
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
                      ? '✓ Kontrol ediliyor…'
                      : myOutcome
                        ? 'Rakip seçimini bekliyoruz…'
                        : null
                  }
                  jokerUsed={onlineState.jokerUsed[mySideOnline]}
                  onHint={onHintOnline}
                  hint={onlineHint}
                />
              </SceneShell>
            )}

            {onlineState.scene === 'ROUND_REVEAL' && onlineSel && (
              <SceneShell sceneKey="common-online-roundreveal" key={`common-online-rr-${onlineState.round}`}>
                <CommonRoundRevealScene
                  pair={onlinePair}
                  roundNo={onlineState.round + 1}
                  totalRounds={COMMON_ROUNDS}
                  p1={onlineSel.P1}
                  p2={onlineSel.P2}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  p1Score={onlineState.p1Score}
                  p2Score={onlineState.p2Score}
                  playersById={playersById}
                  autoMs={ROUND_REVEAL_MS}
                  onDone={online.ackRound}
                />
              </SceneShell>
            )}

            {onlineState.scene === 'RESULT' && (
              <SceneShell sceneKey="common-online-result" key="common-online-result">
                <CommonResultScene
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
              <SceneShell sceneKey="common-opponent" key="common-opponent">
                <OpponentSelectScene
                  modeName="Ortak Bul"
                  available={{ hotseat: true, vsBot: true }}
                  onPick={onPickOpponent}
                  onOnline={onOnline}
                />
              </SceneShell>
            )}

            {phase === 'playing' && offPair && !nameModalOpen && offSub === 'reveal' && (
              <SceneShell sceneKey="common-reveal" key={`common-reveal-${roundIdx}`}>
                <CommonRevealScene
                  pair={offPair}
                  roundNo={roundIdx + 1}
                  totalRounds={offlineRoundPairs.length}
                  onDone={() => setOffSub('select-p1')}
                />
              </SceneShell>
            )}

            {phase === 'playing' && offPair && !nameModalOpen && (offSub === 'select-p1' || offSub === 'select-p2') && (
              <SceneShell sceneKey="common-select" key={`common-select-${roundIdx}-${offSub}`}>
                <CommonSelectScene
                  pair={offPair}
                  pool={session.players}
                  roundNo={roundIdx + 1}
                  totalRounds={offlineRoundPairs.length}
                  seconds={OFFLINE_SELECT_SECONDS}
                  timerKey={`off-${roundIdx}-${offSub}`}
                  onSelect={onSelectOffline}
                  onTimeout={onTimeoutOffline}
                  mySide={offActiveSide}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  p1Score={p1Score}
                  p2Score={p2Score}
                  myPick={
                    offSub === 'select-p2' && offRow.P2.playerId
                      ? { playerId: offRow.P2.playerId, correct: offRow.P2.correct }
                      : null
                  }
                  jokerUsed={jokerUsed[offActiveSide]}
                  onHint={onHintOffline}
                  hint={offHint}
                />
              </SceneShell>
            )}

            {phase === 'playing' && offSub === 'handoff' && (
              <SceneShell sceneKey="common-handoff" key={`common-handoff-${roundIdx}`}>
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
                      setOffHint(null);
                      setJokerUsed((prev) => ({ ...prev })); // joker P2 için ayrı (zaten ayrı tutuluyor)
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

            {phase === 'playing' && offPair && offSub === 'round-reveal' && (
              <SceneShell sceneKey="common-roundreveal" key={`common-rr-${roundIdx}`}>
                <CommonRoundRevealScene
                  pair={offPair}
                  roundNo={roundIdx + 1}
                  totalRounds={offlineRoundPairs.length}
                  p1={offRow.P1}
                  p2={offRow.P2}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  p1Score={p1Score}
                  p2Score={p2Score}
                  playersById={playersById}
                  autoMs={opponent === 'vs-bot' ? ROUND_REVEAL_MS : undefined}
                  onDone={onOfflineRoundDone}
                />
              </SceneShell>
            )}

            {phase === 'result' && (
              <SceneShell sceneKey="common-result" key="common-result">
                <CommonResultScene
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
