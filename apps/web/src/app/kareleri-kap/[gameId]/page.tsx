'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import {
  generateGrid,
  evaluateGuess,
  captureCells,
  sideScore,
  emptyCount,
  decideWinner,
  botPickGuess,
  playerClubIds,
  SQUARES_LIVES,
  type SquaresGrid as GridData,
  type SquaresSide,
  type PoolClub,
} from '@/lib/squaresMode';

type Phase = 'opponent' | 'reveal' | 'play' | 'result';

/** Tahmin süresi (sn). Liste Doldur LIST_TURN_SECONDS=35 ile aynı ton. */
const SQUARES_TURN_SECONDS = 35;
/** Bota karşı: tek oyuncunun (P1) toplam can'ı; bitince bot kalanı tamamlar. */

/**
 * "Kareleri Kap" — 5×5 kulüp matrisi; futbolcu adı yaz, bitişik kulüplerinden
 * en büyük grup kapanır. En çok kare kapatan kazanır. Bota karşı + arkadaşa
 * karşı (hot-seat, snake sıra). ONLINE sonra eklenecek (yapı hazır).
 *
 * Mevcut modlara dokunulmaz — Liste Doldur deseninin uyarlaması (yeni dosyalar).
 */
export default function SquaresGamePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const session = useGameSession();
  const playSfx = useSfx();

  // Kulüp havuzu (clubPool.json) — bu moda özel, provider'a dokunmadan yüklenir.
  const [pool, setPool] = useState<PoolClub[] | null>(null);
  useEffect(() => {
    fetchClubPool()
      .then(setPool)
      .catch(() => setPool([]));
  }, []);

  const [roundSeed, setRoundSeed] = useState(() =>
    Math.random().toString(36).slice(2),
  );

  // Matris — havuz + oyuncular hazır olunca kürasyonlu üret (deterministik seed).
  const grid0: GridData | null = useMemo(() => {
    if (!pool || pool.length === 0 || !session.ready || session.players.length === 0) {
      return null;
    }
    return generateGrid(
      `${params.gameId}:${roundSeed}`,
      pool,
      session.players,
    );
  }, [pool, session.ready, session.players, params.gameId, roundSeed]);

  const [phase, setPhase] = useState<Phase>('opponent');
  const [opponent, setOpponent] = useState<Opponent>('vs-bot');

  // Oyun state'i — mutasyonsuz grid (kapatma yeni grid üretir).
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
      // grid0 yeni roundSeed'le üretilecek; reveal'da grid'i state'e al.
      setPhase('reveal');
    },
    [resetRound],
  );

  const onOnline = useCallback(() => {
    router.push('/online?mode=kareler');
  }, [router]);

  // Reveal → play: matrisi state'e kopyala (oyun bu kopyada oynanır).
  const onRevealed = useCallback(() => {
    if (grid0) setGrid(grid0);
    setPhase('play');
  }, [grid0]);

  const scrollTop = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  // Bitiş kontrolü: matris dolu VEYA iki tarafın canı bitti → result.
  const checkEnd = useCallback((g: GridData, lv: { P1: number; P2: number }): boolean => {
    if (emptyCount(g) === 0) return true;
    if (lv.P1 <= 0 && lv.P2 <= 0) return true;
    return false;
  }, []);

  // Sıra geç (snake-benzeri basit dönüşüm; canı olan karşı tarafa).
  const passTurn = useCallback(
    (g: GridData, lv: { P1: number; P2: number }, justActed: SquaresSide) => {
      if (checkEnd(g, lv)) {
        setPhase('result');
        return;
      }
      // Bota karşı: P1 oynadıysa bot (P2) hemen oynar; bot oynadıysa P1'e döner.
      const other: SquaresSide = justActed === 'P1' ? 'P2' : 'P1';
      const nextSide = lv[other] > 0 ? other : justActed;
      setActiveSide(nextSide);
      setTurnKey((k) => k + 1);
    },
    [checkEnd],
  );

  // Bir tahmini uygula (hem insan hem bot kullanır).
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
      // Yanlış: can −1.
      setMissTick((t) => t + 1);
      setHighlight(null);
      playSfx('heartbreak');
      const nlv = { ...lv, [side]: Math.max(0, lv[side] - 1) };
      return { grid: g, lives: nlv };
    },
    [session.players, lives, playSfx],
  );

  // İNSAN tahmini (P1 her zaman; hot-seat'te aktif taraf).
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

  // BOT hamlesi (bota karşı): aktif taraf P2 olunca otomatik oyna (kısa gecikme).
  const botActingRef = useRef(false);
  useEffect(() => {
    if (phase !== 'play' || opponent !== 'vs-bot' || activeSide !== 'P2' || !grid) {
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
        // Bot uygun hamle bulamadı → pas (can −1).
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
    // applyGuess/passTurn closure'ları turnKey ile yenilenir; turnKey yeterli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, opponent, activeSide, turnKey, grid]);

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

  const onRematch = useCallback(() => {
    resetRound();
    setGrid(null);
    setPhase('reveal');
  }, [resetRound]);

  const onBack = useCallback(() => {
    if (phase === 'opponent') {
      router.push(`/oyna/${params.gameId}`);
    } else {
      resetRound();
      setGrid(null);
      setPhase('opponent');
    }
  }, [phase, router, params.gameId, resetRound]);

  const bgKey =
    phase === 'opponent'
      ? 'mode'
      : phase === 'reveal'
        ? 'handoff'
        : phase === 'play'
          ? 'pick'
          : 'final';

  const nameModalOpen =
    opponent === 'hotseat' && phase !== 'opponent' && p1Name === '';

  // Veri yüklenirken loader.
  if (!session.ready || pool === null) {
    return (
      <>
        <SceneBackground bgKey="mode" />
        <main className="relative z-10 mx-auto flex min-h-screen flex-col items-center justify-center px-5">
          <BallLoader size={64} label="Yükleniyor…" />
        </main>
      </>
    );
  }

  const displayP1 = opponent === 'hotseat' ? p1Name || 'Oyuncu 1' : 'Sen';
  const displayP2 = opponent === 'hotseat' ? p2Name || 'Oyuncu 2' : 'Bot';

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
              {opponent === 'hotseat' ? 'Arkadaşa karşı' : 'Bota karşı'}
            </span>
            <SoundToggle />
            <UserMenu />
          </div>
        </header>

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
                // Bota karşı: bot sırasında (P2) tahmin kilitli (insan bekler).
                locked={opponent === 'vs-bot' && activeSide === 'P2'}
                waitingLabel={
                  opponent === 'vs-bot' && activeSide === 'P2'
                    ? 'Bot oynuyor…'
                    : null
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
