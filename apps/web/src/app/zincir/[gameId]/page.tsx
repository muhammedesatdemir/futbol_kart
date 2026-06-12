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
import {
  curateClubs,
  matchedClubs,
  decideWinner,
  chainSnakeOrder,
  botPick,
  CHAIN_PICKS_PER_SIDE,
  CHAIN_TOTAL_STEPS,
  type ChainClub,
  type ChainPick,
  type ChainSide,
  type PoolClub,
} from '@/lib/chainMode';

type Phase = 'opponent' | 'reveal' | 'play' | 'result';

/** Tahmin süresi (sn). Diğer modlarla aynı ton. */
const CHAIN_TURN_SECONDS = 35;

/**
 * "Zincir Kur" — 7 kulüp (4+3, bitişiklik yok); bir futbolcu seç, bu kulüplerden
 * kaçında oynadıysa o kadar puan. Her taraf 5 pick (snake A-B-B-A-A-B-B-A-A-B).
 * Bota + arkadaşa karşı. ONLINE sonra (yapı hazır).
 *
 * Mevcut modlara dokunulmaz — Kareleri Kap deseninin uyarlaması (yeni dosyalar).
 */
export default function ChainGamePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const session = useGameSession();
  const playSfx = useSfx();

  const [pool, setPool] = useState<PoolClub[] | null>(null);
  useEffect(() => {
    fetchClubPool().then(setPool).catch(() => setPool([]));
  }, []);

  const [roundSeed, setRoundSeed] = useState(() => Math.random().toString(36).slice(2));

  // Kürasyonlu 7 kulüp — havuz + oyuncular hazır olunca.
  const clubs0: ChainClub[] | null = useMemo(() => {
    if (!pool || pool.length === 0 || !session.ready || session.players.length === 0) return null;
    return curateClubs(`${params.gameId}:${roundSeed}`, pool, session.players);
  }, [pool, session.ready, session.players, params.gameId, roundSeed]);

  const [phase, setPhase] = useState<Phase>('opponent');
  const [opponent, setOpponent] = useState<Opponent>('vs-bot');
  const [clubs, setClubs] = useState<ChainClub[] | null>(null);

  // Snake sırası (sabit, P1 başlar) + adım indeksi.
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

  // Bir pick uygula (insan + bot ortak).
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
      // Sonraki adıma geç (veya bitir).
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

  // Süre dolumu: o tarafın hakkını "0 puanlık pas" olarak yak (sıra ilerler).
  const onTimeout = useCallback(() => {
    if (phase !== 'play') return;
    const side = activeSide;
    setMissTick((t) => t + 1);
    setHighlight(null);
    playSfx('heartbreak');
    // Boş pick (0 puan) ekle ki adım sayısı tutarlı kalsın.
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

  // BOT hamlesi (bota karşı): aktif taraf P2 olunca otomatik pick.
  const botActingRef = useRef(false);
  useEffect(() => {
    if (phase !== 'play' || opponent !== 'vs-bot' || activeSide !== 'P2' || !clubs) return;
    if (botActingRef.current) return;
    botActingRef.current = true;
    const used = new Set([...p1Picks, ...p2Picks].map((p) => p.playerId));
    const prng = createPRNG(`${params.gameId}:bot:${step}`);
    const t = setTimeout(() => {
      const pick = botPick(clubIds, session.players, used, () => prng.next(), 0.6);
      if (pick) applyPick('P2', pick.player.id);
      else {
        // Uygun oyuncu yok → boş pas.
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
  }, [phase, opponent, activeSide, step, clubs]);

  const onNamesSubmit = useCallback(
    (n1: string, n2: string) => {
      setP1Name(n1);
      setP2Name(n2);
      setProfileNames(n1, n2);
    },
    [setProfileNames],
  );

  const winner = useMemo(
    () => (phase === 'result' ? decideWinner(p1Picks, p2Picks) : 'tie'),
    [phase, p1Picks, p2Picks],
  );

  const onRematch = useCallback(() => {
    resetRound();
    setClubs(null);
    setPhase('reveal');
  }, [resetRound]);

  const onBack = useCallback(() => {
    if (phase === 'opponent') router.push(`/oyna/${params.gameId}`);
    else {
      resetRound();
      setClubs(null);
      setPhase('opponent');
    }
  }, [phase, router, params.gameId, resetRound]);

  const bgKey =
    phase === 'opponent' ? 'mode' : phase === 'reveal' ? 'handoff' : phase === 'play' ? 'pick' : 'final';
  const nameModalOpen = opponent === 'hotseat' && phase !== 'opponent' && p1Name === '';

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
  // Bota karşı: bot sırası (P2) → tahmin kilitli.
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
              Zincir Kur · {opponent === 'hotseat' ? 'Arkadaşa karşı' : 'Bota karşı'}
            </span>
            <SoundToggle />
            <UserMenu />
          </div>
        </header>

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
      </main>

      <NameModal open={nameModalOpen} mode="hotseat" initialP1={profileP1} initialP2={profileP2} onSubmit={onNamesSubmit} />
    </>
  );
}
