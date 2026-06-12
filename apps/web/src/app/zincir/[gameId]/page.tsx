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
import { ChainRevealScene } from '@/components/scenes/ChainRevealScene';
import { ChainPlayScene } from '@/components/scenes/ChainPlayScene';
import { ChainResultScene } from '@/components/scenes/ChainResultScene';
import { SoundToggle } from '@/components/SoundToggle';
import { UserMenu } from '@/components/UserMenu';
import { NameModal } from '@/components/NameModal';
import { useGameSession } from '@/lib/GameSessionProvider';
import { useProfileStore } from '@/lib/profileStore';
import { useSfx } from '@/lib/useSfx';
import { createPRNG } from '@futbol-kart/game-engine';
import { fetchClubPool } from '@/lib/clubPoolClient';
import { useOnlineChainMatch } from '@/lib/useOnlineChainMatch';
import {
  curateClubs,
  matchedClubs,
  decideWinner,
  chainSnakeOrder,
  botPick,
  CHAIN_TOTAL_STEPS,
  type ChainClub,
  type ChainPick,
  type ChainSide,
  type PoolClub,
} from '@/lib/chainMode';

type Phase = 'opponent' | 'reveal' | 'play' | 'result';

/** Tahmin süresi (sn). Diğer modlarla aynı ton. */
const CHAIN_TURN_SECONDS = 35;
/** Online sonuç-gösterme penceresi (ms) — pick sonucu net görünür, sıra hemen taşmaz. */
const HOLD_MS = 2400;

/**
 * "Zincir Kur" — 7 kulüp (4+3, bitişiklik yok); bir futbolcu seç, bu kulüplerden
 * kaçında oynadıysa o kadar puan. Her taraf 5 pick (snake A-B-B-A-A-B-B-A-A-B).
 * Bota + arkadaşa karşı + ONLINE (sunucu-otoriteli, gerçek rakip).
 *
 * Mevcut modlara dokunulmaz — Kareleri Kap deseninin uyarlaması (yeni dosyalar).
 */
export default function ChainGamePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useGameSession();
  const playSfx = useSfx();

  // ── ONLINE TESPİTİ ──
  const isOnline = searchParams.get('online') === '1';
  const matchId = isOnline ? params.gameId : null;
  const online = useOnlineChainMatch(matchId);

  const [pool, setPool] = useState<PoolClub[] | null>(null);
  useEffect(() => {
    if (isOnline) {
      setPool([]); // online'da kürasyon sunucuda; loader guard'ı geçsin
      return;
    }
    fetchClubPool().then(setPool).catch(() => setPool([]));
  }, [isOnline]);

  const [roundSeed, setRoundSeed] = useState(() => Math.random().toString(36).slice(2));

  // OFFLINE kürasyonlu 7 kulüp.
  const clubs0: ChainClub[] | null = useMemo(() => {
    if (isOnline) return null;
    if (!pool || pool.length === 0 || !session.ready || session.players.length === 0) return null;
    return curateClubs(`${params.gameId}:${roundSeed}`, pool, session.players);
  }, [isOnline, pool, session.ready, session.players, params.gameId, roundSeed]);

  const [phase, setPhase] = useState<Phase>('opponent');
  const [opponent, setOpponent] = useState<Opponent>('vs-bot');
  const [clubs, setClubs] = useState<ChainClub[] | null>(null);

  const order = useMemo(() => chainSnakeOrder('P1'), []);
  const [step, setStep] = useState(0);
  const activeSide: ChainSide = order[step] ?? 'P1';

  const [p1Picks, setP1Picks] = useState<ChainPick[]>([]);
  const [p2Picks, setP2Picks] = useState<ChainPick[]>([]);
  const [missTick, setMissTick] = useState(0);
  const [highlight, setHighlight] = useState<{ clubIds: string[]; side: ChainSide } | null>(null);

  const profileP1 = useProfileStore((s) => s.p1Name);
  const profileP2 = useProfileStore((s) => s.p2Name);
  const setProfileNames = useProfileStore((s) => s.setNames);
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');

  const clubIds = useMemo(() => new Set((clubs ?? []).map((c) => c.id)), [clubs]);
  const playersById = useMemo(() => new Map(session.players.map((p) => [p.id, p])), [session.players]);

  const resetRound = useCallback(() => {
    setStep(0);
    setP1Picks([]);
    setP2Picks([]);
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
    router.push('/online?mode=zincir');
  }, [router]);

  const onRevealed = useCallback(() => {
    if (clubs0) setClubs(clubs0);
    setPhase('play');
  }, [clubs0]);

  const scrollTop = useCallback(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ── OFFLINE pick mantığı ──
  const applyPick = useCallback(
    (side: ChainSide, playerId: string) => {
      const player = session.players.find((p) => p.id === playerId);
      if (!player) return;
      const matched = matchedClubs(player, clubIds);
      const pick: ChainPick = { playerId, matchedClubIds: matched };
      if (side === 'P1') setP1Picks((prev) => [...prev, pick]);
      else setP2Picks((prev) => [...prev, pick]);
      if (matched.length > 0) {
        setHighlight({ clubIds: matched, side });
        playSfx('win');
      } else {
        setMissTick((t) => t + 1);
        setHighlight(null);
        playSfx('heartbreak');
      }
      setStep((s) => {
        const next = s + 1;
        if (next >= CHAIN_TOTAL_STEPS) setPhase('result');
        return next;
      });
      scrollTop();
    },
    [session.players, clubIds, playSfx, scrollTop],
  );

  const onGuess = useCallback(
    (playerId: string) => {
      if (phase !== 'play') return;
      applyPick(activeSide, playerId);
    },
    [phase, activeSide, applyPick],
  );

  const onTimeout = useCallback(() => {
    if (phase !== 'play') return;
    const side = activeSide;
    setMissTick((t) => t + 1);
    setHighlight(null);
    playSfx('heartbreak');
    const empty: ChainPick = { playerId: `__pass_${step}`, matchedClubIds: [] };
    if (side === 'P1') setP1Picks((prev) => [...prev, empty]);
    else setP2Picks((prev) => [...prev, empty]);
    setStep((s) => {
      const next = s + 1;
      if (next >= CHAIN_TOTAL_STEPS) setPhase('result');
      return next;
    });
    scrollTop();
  }, [phase, activeSide, step, playSfx, scrollTop]);

  // BOT (bota karşı)
  const botActingRef = useRef(false);
  useEffect(() => {
    if (isOnline || phase !== 'play' || opponent !== 'vs-bot' || activeSide !== 'P2' || !clubs) return;
    if (botActingRef.current) return;
    botActingRef.current = true;
    const used = new Set([...p1Picks, ...p2Picks].map((p) => p.playerId));
    const prng = createPRNG(`${params.gameId}:bot:${step}`);
    const t = setTimeout(() => {
      const pick = botPick(clubIds, session.players, used, () => prng.next(), 0.6);
      if (pick) applyPick('P2', pick.player.id);
      else {
        setP2Picks((prev) => [...prev, { playerId: `__pass_${step}`, matchedClubIds: [] }]);
        setStep((s) => {
          const next = s + 1;
          if (next >= CHAIN_TOTAL_STEPS) setPhase('result');
          return next;
        });
      }
      botActingRef.current = false;
    }, 1100);
    return () => {
      clearTimeout(t);
      botActingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, phase, opponent, activeSide, step, clubs]);

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
  const onlineClubs = onlineState?.clubs ?? null;
  const onlineDeadlineMs = useMemo(
    () => (online.turnDeadline ? new Date(online.turnDeadline).getTime() : null),
    [online.turnDeadline],
  );
  const onlineActiveSide: ChainSide = onlineState ? (onlineState.order[onlineState.step] ?? 'P1') : 'P1';
  const isMyTurn = isOnline ? online.yourSide === onlineActiveSide : true;

  // Maç başlama düdüğü — reveal göründüğünde BİR KEZ (offline + online).
  const whistleStartedRef = useRef(false);
  const activeScene = isOnline ? onlineState?.scene : phase;
  useEffect(() => {
    const isReveal = activeScene === (isOnline ? 'REVEAL' : 'reveal');
    if (isReveal && !whistleStartedRef.current) {
      whistleStartedRef.current = true;
      playSfx('whistleStart');
    }
  }, [activeScene, isOnline, playSfx]);

  // ONLINE pick akışı: pendingGuess + sonuç-gösterme penceresi (hold).
  const [pendingGuess, setPendingGuess] = useState<string | null>(null);
  const [hold, setHold] = useState<{ side: ChainSide; clubIds: string[]; miss: boolean } | null>(null);
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
      const side = onlineActiveSide;
      setPendingGuess(playerId);
      void online.guess(playerId).then((outcome) => {
        setPendingGuess(null);
        if (!outcome) {
          void online.refresh();
          return;
        }
        setHold({ side, clubIds: outcome.matchedClubIds, miss: outcome.gained === 0 });
        playSfx(outcome.gained > 0 ? 'win' : 'heartbreak');
        scrollTop();
      });
    },
    [online, onlineState, onlineActiveSide, pendingGuess, hold, playSfx, scrollTop],
  );

  const onTimeoutOnline = useCallback(() => {
    if (!onlineState || pendingGuess || hold) return;
    void online.refresh();
  }, [online, onlineState, pendingGuess, hold]);

  const winner = useMemo(
    () => (phase === 'result' ? decideWinner(p1Picks, p2Picks) : 'tie'),
    [phase, p1Picks, p2Picks],
  );

  const onRematch = useCallback(() => {
    if (isOnline) {
      router.push('/online?mode=zincir');
      return;
    }
    resetRound();
    setClubs(null);
    setPhase('reveal');
  }, [isOnline, router, resetRound]);

  const onBack = useCallback(() => {
    if (isOnline) {
      router.push('/');
      return;
    }
    if (phase === 'opponent') router.push(`/oyna/${params.gameId}`);
    else {
      resetRound();
      setClubs(null);
      setPhase('opponent');
    }
  }, [isOnline, phase, router, params.gameId, resetRound]);

  const onlineBg =
    onlineState?.scene === 'REVEAL' ? 'handoff' : onlineState?.scene === 'PLAY' ? 'pick' : 'final';
  const offlineBg =
    phase === 'opponent' ? 'mode' : phase === 'reveal' ? 'handoff' : phase === 'play' ? 'pick' : 'final';
  const bgKey = isOnline ? onlineBg : offlineBg;

  const nameModalOpen = !isOnline && opponent === 'hotseat' && phase !== 'opponent' && p1Name === '';

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
  const locked = opponent === 'vs-bot' && activeSide === 'P2';

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
              Zincir Kur · {isOnline ? '🌐 Online' : opponent === 'hotseat' ? 'Arkadaşa karşı' : 'Bota karşı'}
            </span>
            <SoundToggle />
            <UserMenu />
          </div>
        </header>

        {/* ====================== ONLINE RENDER ====================== */}
        {isOnline && onlineState && onlineClubs && (
          <AnimatePresence mode="wait">
            {onlineState.scene === 'REVEAL' && (
              <SceneShell sceneKey="chain-online-reveal" key="chain-online-reveal">
                <ChainRevealScene clubs={onlineClubs} onDone={online.ackReveal} />
              </SceneShell>
            )}

            {onlineState.scene === 'PLAY' && (
              <SceneShell sceneKey="chain-online-play" key="chain-online-play">
                <ChainPlayScene
                  clubs={onlineClubs}
                  pool={session.players}
                  seconds={CHAIN_TURN_SECONDS}
                  timerKey={`online-${onlineState.step}-${hold ? 'hold' : 'live'}`}
                  deadlineMs={hold ? null : onlineDeadlineMs}
                  onGuess={isMyTurn && !pendingGuess && !hold ? onGuessOnline : () => {}}
                  onTimeout={onTimeoutOnline}
                  activeSide={hold?.side ?? onlineActiveSide}
                  p1Picks={onlineState.p1Picks}
                  p2Picks={onlineState.p2Picks}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  highlightClubIds={hold?.clubIds ?? []}
                  highlightSide={hold?.side ?? null}
                  hideTimer={!!hold}
                  locked={!isMyTurn || !!pendingGuess || !!hold}
                  waitingLabel={
                    pendingGuess
                      ? '✓ Kontrol ediliyor…'
                      : hold
                        ? hold.miss
                          ? 'Bu kulüplerde oynamamış…'
                          : 'Eklendi!'
                        : !isMyTurn
                          ? `Rakip oynuyor… (sıra ${onlineActiveSide === 'P1' ? displayP1 : displayP2})`
                          : null
                  }
                />
              </SceneShell>
            )}

            {onlineState.scene === 'RESULT' && (
              <SceneShell sceneKey="chain-online-result" key="chain-online-result">
                <ChainResultScene
                  clubs={onlineClubs}
                  p1Picks={onlineState.p1Picks}
                  p2Picks={onlineState.p2Picks}
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
              <SceneShell sceneKey="chain-opponent" key="chain-opponent">
                <OpponentSelectScene
                  modeName="Zincir Kur"
                  available={{ hotseat: true, vsBot: true }}
                  onPick={onPickOpponent}
                  onOnline={onOnline}
                />
              </SceneShell>
            )}

            {phase === 'reveal' && clubs0 && !nameModalOpen && (
              <SceneShell sceneKey="chain-reveal" key="chain-reveal">
                <ChainRevealScene clubs={clubs0} onDone={onRevealed} />
              </SceneShell>
            )}

            {phase === 'play' && clubs && !nameModalOpen && (
              <SceneShell sceneKey="chain-play" key="chain-play">
                <ChainPlayScene
                  clubs={clubs}
                  pool={session.players}
                  seconds={CHAIN_TURN_SECONDS}
                  timerKey={`step-${step}`}
                  onGuess={onGuess}
                  onTimeout={onTimeout}
                  activeSide={activeSide}
                  p1Picks={p1Picks}
                  p2Picks={p2Picks}
                  p1Name={displayP1}
                  p2Name={displayP2}
                  missTick={missTick}
                  highlightClubIds={highlight?.clubIds ?? []}
                  highlightSide={highlight?.side ?? null}
                  locked={locked}
                  waitingLabel={locked ? 'Bot oynuyor…' : null}
                />
              </SceneShell>
            )}

            {phase === 'result' && clubs && (
              <SceneShell sceneKey="chain-result" key="chain-result">
                <ChainResultScene
                  clubs={clubs}
                  p1Picks={p1Picks}
                  p2Picks={p2Picks}
                  winner={winner}
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
