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
import { SquaresRevealScene } from '@/components/scenes/SquaresRevealScene';
import { SquaresPlayScene } from '@/components/scenes/SquaresPlayScene';
import { SquaresResultScene } from '@/components/scenes/SquaresResultScene';
import { SoundToggle } from '@/components/SoundToggle';
import { UserMenu } from '@/components/UserMenu';
import { NameModal } from '@/components/NameModal';
import { useGameSession } from '@/lib/GameSessionProvider';
import { useProfileStore } from '@/lib/profileStore';
import { useSfx } from '@/lib/useSfx';
import { createPRNG } from '@futbol-kart/game-engine';
import { fetchClubPool } from '@/lib/clubPoolClient';
import { useOnlineSquaresMatch } from '@/lib/useOnlineSquaresMatch';
import {
  generateGrid,
  evaluateGuess,
  captureCells,
  sideScore,
  emptyCount,
  decideWinner,
  botPickGuess,
  SQUARES_LIVES,
  type SquaresGrid as GridData,
  type SquaresSide,
  type PoolClub,
} from '@/lib/squaresMode';

type Phase = 'opponent' | 'reveal' | 'play' | 'result';

/** Tahmin süresi (sn). Liste Doldur LIST_TURN_SECONDS=35 ile aynı ton. */
const SQUARES_TURN_SECONDS = 35;
/** Online sonuç-gösterme penceresi (ms) — tahmin sonucu net görünür, sıra hemen taşmaz. */
const HOLD_MS = 2400;

/**
 * "Kareleri Kap" — 5×5 kulüp matrisi; futbolcu adı yaz, bitişik kulüplerinden
 * en büyük grup kapanır. En çok kare kapatan kazanır. Bota karşı + arkadaşa
 * karşı (hot-seat) + ONLINE (sunucu-otoriteli, sıra-tabanlı, gerçek rakip).
 *
 * Mevcut modlara dokunulmaz — Liste Doldur deseninin uyarlaması (yeni dosyalar).
 * Matris AÇIK (maskeleme yok) → online entegrasyonu Liste'den daha sade.
 */
export default function SquaresGamePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useGameSession();
  const playSfx = useSfx();

  // ── ONLINE TESPİTİ ──
  const isOnline = searchParams.get('online') === '1';
  const matchId = isOnline ? params.gameId : null;
  const online = useOnlineSquaresMatch(matchId);

  // Kulüp havuzu (clubPool.json) — yalnız OFFLINE matris üretimi için (online'da
  // matris sunucudan gelir). Provider'a dokunmadan yüklenir.
  const [pool, setPool] = useState<PoolClub[] | null>(null);
  useEffect(() => {
    if (isOnline) {
      setPool([]); // online'da gerekmez; loader guard'ı geçsin
      return;
    }
    fetchClubPool()
      .then(setPool)
      .catch(() => setPool([]));
  }, [isOnline]);

  const [roundSeed, setRoundSeed] = useState(() =>
    Math.random().toString(36).slice(2),
  );

  // OFFLINE matris — havuz + oyuncular hazır olunca kürasyonlu üret.
  const grid0: GridData | null = useMemo(() => {
    if (isOnline) return null;
    if (!pool || pool.length === 0 || !session.ready || session.players.length === 0) {
      return null;
    }
    return generateGrid(`${params.gameId}:${roundSeed}`, pool, session.players);
  }, [isOnline, pool, session.ready, session.players, params.gameId, roundSeed]);

  const [phase, setPhase] = useState<Phase>('opponent');
  const [opponent, setOpponent] = useState<Opponent>('vs-bot');

  // OFFLINE oyun state'i — mutasyonsuz grid.
  const [grid, setGrid] = useState<GridData | null>(null);
  const [activeSide, setActiveSide] = useState<SquaresSide>('P1');
  const [lives, setLives] = useState<{ P1: number; P2: number }>({
    P1: SQUARES_LIVES,
    P2: SQUARES_LIVES,
  });
  const [turnKey, setTurnKey] = useState(0);
  const [missTick, setMissTick] = useState(0);
  const [highlight, setHighlight] = useState<{ cells: number[]; side: SquaresSide } | null>(null);

  // Hot-seat isimleri
  const profileP1 = useProfileStore((s) => s.p1Name);
  const profileP2 = useProfileStore((s) => s.p2Name);
  const setProfileNames = useProfileStore((s) => s.setNames);
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');

  const scores = useMemo(
    () =>
      grid
        ? { P1: sideScore(grid, 'P1'), P2: sideScore(grid, 'P2') }
        : { P1: 0, P2: 0 },
    [grid],
  );

  const resetRound = useCallback(() => {
    setActiveSide('P1');
    setLives({ P1: SQUARES_LIVES, P2: SQUARES_LIVES });
    setTurnKey(0);
    setMissTick(0);
    setHighlight(null);
    setRoundSeed(Math.random().toString(36).slice(2));
  }, []);

  const onPickOpponent = useCallback(
    (opp: Opponent) => {
      setOpponent(opp);
      resetRound();
      setPhase('reveal');
    },
    [resetRound],
  );

  const onOnline = useCallback(() => {
    router.push('/online?mode=kareler');
  }, [router]);

  const onRevealed = useCallback(() => {
    if (grid0) setGrid(grid0);
    setPhase('play');
  }, [grid0]);

  const scrollTop = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const checkEnd = useCallback((g: GridData, lv: { P1: number; P2: number }): boolean => {
    if (emptyCount(g) === 0) return true;
    if (lv.P1 <= 0 && lv.P2 <= 0) return true;
    return false;
  }, []);

  const passTurn = useCallback(
    (g: GridData, lv: { P1: number; P2: number }, justActed: SquaresSide) => {
      if (checkEnd(g, lv)) {
        setPhase('result');
        return;
      }
      const other: SquaresSide = justActed === 'P1' ? 'P2' : 'P1';
      const nextSide = lv[other] > 0 ? other : justActed;
      setActiveSide(nextSide);
      setTurnKey((k) => k + 1);
    },
    [checkEnd],
  );

  const applyGuess = useCallback(
    (g: GridData, side: SquaresSide, playerId: string): { grid: GridData; lives: { P1: number; P2: number } } => {
      const player = session.players.find((p) => p.id === playerId);
      const lv = lives;
      if (!player) return { grid: g, lives: lv };
      const res = evaluateGuess(g, player);
      if (res.hit) {
        const ng = captureCells(g, res.cells, side, playerId);
        setHighlight({ cells: res.cells, side });
        playSfx('win');
        return { grid: ng, lives: lv };
      }
      setMissTick((t) => t + 1);
      setHighlight(null);
      playSfx('heartbreak');
      const nlv = { ...lv, [side]: Math.max(0, lv[side] - 1) };
      return { grid: g, lives: nlv };
    },
    [session.players, lives, playSfx],
  );

  const onGuess = useCallback(
    (playerId: string) => {
      if (!grid) return;
      const side = activeSide;
      const { grid: ng, lives: nlv } = applyGuess(grid, side, playerId);
      setGrid(ng);
      setLives(nlv);
      passTurn(ng, nlv, side);
      scrollTop();
    },
    [grid, activeSide, applyGuess, passTurn, scrollTop],
  );

  const onTimeout = useCallback(() => {
    if (!grid) return;
    const side = activeSide;
    setMissTick((t) => t + 1);
    playSfx('heartbreak');
    const nlv = { ...lives, [side]: Math.max(0, lives[side] - 1) };
    setLives(nlv);
    setHighlight(null);
    passTurn(grid, nlv, side);
    scrollTop();
  }, [grid, activeSide, lives, passTurn, scrollTop, playSfx]);

  // BOT hamlesi (bota karşı)
  const botActingRef = useRef(false);
  useEffect(() => {
    if (isOnline || phase !== 'play' || opponent !== 'vs-bot' || activeSide !== 'P2' || !grid) {
      return;
    }
    if (botActingRef.current) return;
    botActingRef.current = true;
    const prng = createPRNG(`${params.gameId}:bot:${turnKey}`);
    const t = setTimeout(() => {
      const pick = botPickGuess(grid, session.players, () => prng.next(), 0.6);
      if (pick) {
        const { grid: ng, lives: nlv } = applyGuess(grid, 'P2', pick.player.id);
        setGrid(ng);
        setLives(nlv);
        passTurn(ng, nlv, 'P2');
      } else {
        const nlv = { ...lives, P2: Math.max(0, lives.P2 - 1) };
        setLives(nlv);
        passTurn(grid, nlv, 'P2');
      }
      botActingRef.current = false;
    }, 1100);
    return () => {
      clearTimeout(t);
      botActingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, phase, opponent, activeSide, turnKey, grid]);

  const onNamesSubmit = useCallback(
    (n1: string, n2: string) => {
      setP1Name(n1);
      setP2Name(n2);
      setProfileNames(n1, n2);
    },
    [setProfileNames],
  );

  const winner = useMemo(
    () => (phase === 'result' && grid ? decideWinner(grid) : 'tie'),
    [phase, grid],
  );

  // ============================================================================
  // ONLINE türev değerler + handler'lar
  // ============================================================================
  const onlineState = online.state;
  const onlineGrid = onlineState?.grid ?? null;
  const onlineScores = useMemo(
    () =>
      onlineGrid
        ? { P1: sideScore(onlineGrid, 'P1'), P2: sideScore(onlineGrid, 'P2') }
        : { P1: 0, P2: 0 },
    [onlineGrid],
  );
  const onlineDeadlineMs = useMemo(
    () => (online.turnDeadline ? new Date(online.turnDeadline).getTime() : null),
    [online.turnDeadline],
  );
  const isMyTurn = isOnline ? online.yourSide === onlineState?.activeSide : true;

  // Maç başı/sonu düdüğü (birer kez)
  const whistleStartedRef = useRef(false);
  const whistleEndedRef = useRef(false);
  const activeScene = isOnline ? onlineState?.scene : phase;
  useEffect(() => {
    const isReveal = activeScene === (isOnline ? 'REVEAL' : 'reveal');
    const isResult = activeScene === (isOnline ? 'RESULT' : 'result');
    if (isReveal && !whistleStartedRef.current) {
      whistleStartedRef.current = true;
      playSfx('whistleStart');
    }
    if (isResult && !whistleEndedRef.current) {
      whistleEndedRef.current = true;
      playSfx('whistleEnd');
    }
  }, [activeScene, isOnline, playSfx]);

  // ONLINE tahmin akışı: pendingGuess + sonuç-gösterme penceresi (hold).
  const [pendingGuess, setPendingGuess] = useState<string | null>(null);
  const [hold, setHold] = useState<{
    side: SquaresSide;
    cells: number[];
    miss: boolean;
  } | null>(null);
  // Hold süresi dolunca temizle → gerçek sunucu state (sıra karşıda) görünür.
  useEffect(() => {
    if (!hold) return;
    const t = setTimeout(() => {
      setHold(null);
      void online.refresh();
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, [hold, online]);
  useEffect(() => {
    if (onlineState?.scene === 'RESULT' && hold) setHold(null);
  }, [onlineState?.scene, hold]);

  const onGuessOnline = useCallback(
    (playerId: string) => {
      if (!onlineState || pendingGuess || hold) return;
      const side = onlineState.activeSide;
      setPendingGuess(playerId);
      void online.guess(playerId).then((outcome) => {
        setPendingGuess(null);
        if (!outcome) {
          void online.refresh();
          return;
        }
        setHold({
          side,
          cells: outcome.cells ?? [],
          miss: !outcome.hit,
        });
        playSfx(outcome.hit ? 'win' : 'heartbreak');
        scrollTop();
      });
    },
    [online, onlineState, pendingGuess, hold, playSfx, scrollTop],
  );

  const onTimeoutOnline = useCallback(() => {
    // Sunucu pas'ı lazy işler (deadline geçince). Client sadece tazeler.
    if (!onlineState || pendingGuess || hold) return;
    void online.refresh();
  }, [online, onlineState, pendingGuess, hold]);

  // ── Ortak (online/offline) rematch + geri ──
  const onRematch = useCallback(() => {
    if (isOnline) {
      router.push('/online?mode=kareler');
      return;
    }
    resetRound();
    setGrid(null);
    setPhase('reveal');
  }, [isOnline, router, resetRound]);

  const onBack = useCallback(() => {
    if (isOnline) {
      router.push('/');
      return;
    }
    if (phase === 'opponent') {
      router.push(`/oyna/${params.gameId}`);
    } else {
      resetRound();
      setGrid(null);
      setPhase('opponent');
    }
  }, [isOnline, phase, router, params.gameId, resetRound]);

  // Arka plan
  const onlineBg =
    onlineState?.scene === 'REVEAL'
      ? 'handoff'
      : onlineState?.scene === 'PLAY'
        ? 'pick'
        : 'final';
  const offlineBg =
    phase === 'opponent'
      ? 'mode'
      : phase === 'reveal'
        ? 'handoff'
        : phase === 'play'
          ? 'pick'
          : 'final';
  const bgKey = isOnline ? onlineBg : offlineBg;

  const nameModalOpen =
    !isOnline && opponent === 'hotseat' && phase !== 'opponent' && p1Name === '';

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

  // OFFLINE veri yükleme loader.
  if (!isOnline && (!session.ready || pool === null)) {
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
    ? (onlineState?.p1Name ?? 'Oyuncu 1')
    : opponent === 'hotseat'
      ? p1Name || 'Oyuncu 1'
      : 'Sen';
  const displayP2 = isOnline
    ? (onlineState?.p2Name ?? 'Oyuncu 2')
    : opponent === 'hotseat'
      ? p2Name || 'Oyuncu 2'
      : 'Bot';

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
              Kareleri Kap ·{' '}
              {isOnline ? '🌐 Online' : opponent === 'hotseat' ? 'Arkadaşa karşı' : 'Bota karşı'}
            </span>
            <SoundToggle />
            <UserMenu />
          </div>
        </header>

        {/* ====================== ONLINE RENDER ====================== */}
        {isOnline && onlineState && onlineGrid && (
          <AnimatePresence mode="wait">
            {onlineState.scene === 'REVEAL' && (
              <SceneShell sceneKey="squares-online-reveal" key="squares-online-reveal">
                <SquaresRevealScene grid={onlineGrid} onDone={online.ackReveal} />
              </SceneShell>
            )}

            {onlineState.scene === 'PLAY' && (
              <SceneShell sceneKey="squares-online-play" key="squares-online-play">
                <SquaresPlayScene
                  grid={onlineGrid}
                  pool={session.players}
                  seconds={SQUARES_TURN_SECONDS}
                  timerKey={`online-${onlineState.activeSide}-${onlineScores.P1 + onlineScores.P2}-${hold ? 'hold' : 'live'}`}
                  deadlineMs={hold ? null : onlineDeadlineMs}
                  onGuess={isMyTurn && !pendingGuess && !hold ? onGuessOnline : () => {}}
                  onTimeout={onTimeoutOnline}
                  hotseat
                  activeSide={hold?.side ?? onlineState.activeSide}
                  lives={onlineState.lives}
                  scores={onlineScores}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  highlightCells={hold?.cells ?? []}
                  highlightSide={hold?.side ?? null}
                  hideTimer={!!hold}
                  locked={!isMyTurn || !!pendingGuess || !!hold}
                  waitingLabel={
                    pendingGuess
                      ? '✓ Tahminin kontrol ediliyor…'
                      : hold
                        ? hold.miss
                          ? 'Uygun grup yok…'
                          : 'Kareler kapandı!'
                        : !isMyTurn
                          ? `Rakip oynuyor… (sıra ${onlineState.activeSide === 'P1' ? displayP1 : displayP2})`
                          : null
                  }
                />
              </SceneShell>
            )}

            {onlineState.scene === 'RESULT' && (
              <SceneShell sceneKey="squares-online-result" key="squares-online-result">
                <SquaresResultScene
                  grid={onlineGrid}
                  scores={onlineScores}
                  winner={onlineState.winner ?? 'tie'}
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
              <SceneShell sceneKey="squares-opponent" key="squares-opponent">
                <OpponentSelectScene
                  modeName="Kareleri Kap"
                  available={{ hotseat: true, vsBot: true }}
                  onPick={onPickOpponent}
                  onOnline={onOnline}
                />
              </SceneShell>
            )}

            {phase === 'reveal' && grid0 && !nameModalOpen && (
              <SceneShell sceneKey="squares-reveal" key="squares-reveal">
                <SquaresRevealScene grid={grid0} onDone={onRevealed} />
              </SceneShell>
            )}

            {phase === 'play' && grid && !nameModalOpen && (
              <SceneShell sceneKey="squares-play" key="squares-play">
                <SquaresPlayScene
                  grid={grid}
                  pool={session.players}
                  seconds={SQUARES_TURN_SECONDS}
                  timerKey={`turn-${turnKey}`}
                  onGuess={onGuess}
                  onTimeout={onTimeout}
                  hotseat={opponent === 'hotseat'}
                  activeSide={activeSide}
                  lives={lives}
                  scores={scores}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  missTick={missTick}
                  highlightCells={highlight?.cells ?? []}
                  highlightSide={highlight?.side ?? null}
                  locked={opponent === 'vs-bot' && activeSide === 'P2'}
                  waitingLabel={
                    opponent === 'vs-bot' && activeSide === 'P2' ? 'Bot oynuyor…' : null
                  }
                />
              </SceneShell>
            )}

            {phase === 'result' && grid && (
              <SceneShell sceneKey="squares-result" key="squares-result">
                <SquaresResultScene
                  grid={grid}
                  scores={scores}
                  winner={winner}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  onRematch={onRematch}
                />
              </SceneShell>
            )}
          </AnimatePresence>
        )}
      </main>

      <NameModal
        open={nameModalOpen}
        mode="hotseat"
        initialP1={profileP1}
        initialP2={profileP2}
        onSubmit={onNamesSubmit}
      />
    </>
  );
}
