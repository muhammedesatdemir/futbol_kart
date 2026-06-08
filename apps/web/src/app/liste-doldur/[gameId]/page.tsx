'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { HomeIcon, ArrowLeftIcon } from '@/components/icons';
import { SceneShell } from '@/components/scenes/SceneShell';
import { SceneBackground } from '@/components/SceneBackground';
import { BallLoader } from '@/components/BallLoader';
import { OpponentSelectScene, type Opponent } from '@/components/scenes/OpponentSelectScene';
import { ListRevealScene } from '@/components/scenes/ListRevealScene';
import { ListPlayScene } from '@/components/scenes/ListPlayScene';
import { ListResultScene } from '@/components/scenes/ListResultScene';
import { SoundToggle } from '@/components/SoundToggle';
import { UserMenu } from '@/components/UserMenu';
import { NameModal } from '@/components/NameModal';
import { useGameSession } from '@/lib/GameSessionProvider';
import { useProfileStore } from '@/lib/profileStore';
import { useSfx } from '@/lib/useSfx';
import { createPRNG } from '@futbol-kart/game-engine';
import { LIST_TURN_SECONDS, LIST_LIVES } from '@futbol-kart/game-engine';
import { useOnlineListMatch } from '@/lib/useOnlineListMatch';
import {
  pruneListCriteria,
  buildList,
  evaluateGuess,
  scoreFilled,
  compareScores,
  botKnownRanks,
  type ListCriterion,
  type ListEntry,
  type ListSide,
} from '@/lib/listMode';

type Phase = 'opponent' | 'reveal-list' | 'play' | 'result';

/**
 * "Liste Doldur" modu — Bota karşı + Arkadaşa karşı (snake) + ONLINE (sunucu-
 * otoriteli, gerçek rakip). Sıralı top-10 listesini havuzdan isim tahmin ederek
 * doldur; doğru tahmin gerçek sırasına oturur + puan. En çok puan kazanır.
 *
 * 🔒 ONLINE'da liste SUNUCUDA GİZLİ (cevaplar client'a gitmez, F12 korumalı) —
 * yalnız açılmış sıralar + tahmin sonucu gelir. Online entegrasyonu Hedefe/Kadro
 * desenini izler; offline akış tamamen korunur (`isOnline` gate'li). Bkz PLAN §19.
 */
export default function ListGamePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useGameSession();
  const playSfx = useSfx();

  // ── ONLINE TESPİTİ ──
  const isOnline = searchParams.get('online') === '1';
  const matchId = isOnline ? params.gameId : null;
  const online = useOnlineListMatch(matchId);

  const [roundSeed, setRoundSeed] = useState(() => Math.random().toString(36).slice(2));

  // OFFLINE kriter (roundSeed deterministik rastgele).
  const offlineCriterion: ListCriterion = useMemo(() => {
    const healthy = pruneListCriteria(session.players);
    const prng = createPRNG(`list:${params.gameId}:${roundSeed}`);
    return healthy[Math.floor(prng.next() * healthy.length)] ?? healthy[0]!;
  }, [session.players, params.gameId, roundSeed]);

  // ONLINE kriter: sunucu criterionId'sinden client havuzunda yeniden çöz (metric'li).
  const onlineCriterion: ListCriterion | null = useMemo(() => {
    const cid = online.state?.criterionId;
    if (!cid) return null;
    return pruneListCriteria(session.players).find((c) => c.id === cid) ?? null;
  }, [online.state?.criterionId, session.players]);

  const criterion = isOnline ? (onlineCriterion ?? offlineCriterion) : offlineCriterion;

  const playersById = useMemo(
    () => new Map(session.players.map((p) => [p.id, p])),
    [session.players],
  );

  const [phase, setPhase] = useState<Phase>('opponent');
  const [opponent, setOpponent] = useState<Opponent>('vs-bot');
  // OFFLINE liste — oyun başında havuzdan türetilir.
  const list = useMemo(
    () => buildList(offlineCriterion, session.players),
    [offlineCriterion, session.players],
  );

  // OFFLINE state
  const [filledBy, setFilledBy] = useState<Map<number, ListSide>>(new Map());
  const [filledPlayer, setFilledPlayer] = useState<Map<number, string>>(new Map());
  const [missTick, setMissTick] = useState(0);
  const [lives, setLives] = useState<{ P1: number; P2: number }>({
    P1: LIST_LIVES,
    P2: LIST_LIVES,
  });
  const [activeSide, setActiveSide] = useState<ListSide>('P1');

  // -------- Hot-seat --------
  const profileP1 = useProfileStore((s) => s.p1Name);
  const profileP2 = useProfileStore((s) => s.p2Name);
  const setProfileNames = useProfileStore((s) => s.setNames);
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');
  const [turnKey, setTurnKey] = useState(0);

  // ── ONLINE missTick (yanlış tahmin animasyonu — sunucu outcome'una göre) ──
  const [onlineMissTick, setOnlineMissTick] = useState(0);

  const resetRound = useCallback(() => {
    setFilledBy(new Map());
    setFilledPlayer(new Map());
    setMissTick(0);
    setLives({ P1: LIST_LIVES, P2: LIST_LIVES });
    setActiveSide('P1');
    setTurnKey(0);
    setRoundSeed(Math.random().toString(36).slice(2));
  }, []);

  // ---- OFFLINE handler'lar (değişmedi) ----
  const onPickOpponent = useCallback(
    (opp: Opponent) => {
      setOpponent(opp);
      resetRound();
      setPhase('reveal-list');
    },
    [resetRound],
  );

  const onOnline = useCallback(() => {
    router.push('/online?mode=liste');
  }, [router]);

  const onListRevealed = useCallback(() => setPhase('play'), []);

  const fillRank = useCallback(
    (rank: number, playerId: string, side: ListSide) => {
      setFilledBy((prev) => {
        const next = new Map(prev);
        next.set(rank, side);
        if (next.size >= list.length) setPhase('result');
        return next;
      });
      setFilledPlayer((prev) => {
        const next = new Map(prev);
        next.set(rank, playerId);
        return next;
      });
    },
    [list.length],
  );

  const finishVsBot = useCallback(() => {
    const prng = createPRNG(`${params.gameId}-list-bot`);
    const known = botKnownRanks(list, () => prng.next(), 0.6);
    setFilledBy((prev) => {
      const next = new Map(prev);
      for (const e of list) {
        if (!next.has(e.rank) && known.has(e.rank)) next.set(e.rank, 'P2');
      }
      return next;
    });
    setFilledPlayer((prev) => {
      const next = new Map(prev);
      for (const e of list) {
        if (!next.has(e.rank) && known.has(e.rank)) next.set(e.rank, e.playerId);
      }
      return next;
    });
    setPhase('result');
  }, [params.gameId, list]);

  const passTurnAfter = useCallback(
    (nextLives: { P1: number; P2: number }, justActed: ListSide) => {
      if (opponent === 'vs-bot') {
        if (nextLives.P1 <= 0) finishVsBot();
        else setTurnKey((k) => k + 1);
        return;
      }
      if (nextLives.P1 <= 0 && nextLives.P2 <= 0) {
        setPhase('result');
        return;
      }
      const other: ListSide = justActed === 'P1' ? 'P2' : 'P1';
      const nextSide = nextLives[other] > 0 ? other : justActed;
      setActiveSide(nextSide);
      setTurnKey((k) => k + 1);
    },
    [opponent, finishVsBot],
  );

  const scrollTop = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const onGuessOffline = useCallback(
    (playerId: string) => {
      const side = activeSide;
      const filledRanks = new Set(filledPlayer.keys());
      const res = evaluateGuess(playerId, list, filledRanks);
      if (res.hit && !res.alreadyFilled) {
        fillRank(res.entry.rank, playerId, side);
        playSfx('win');
        passTurnAfter(lives, side);
      } else {
        setMissTick((t) => t + 1);
        playSfx('heartbreak');
        setLives((prev) => {
          const next = { ...prev, [side]: Math.max(0, prev[side] - 1) };
          passTurnAfter(next, side);
          return next;
        });
      }
      scrollTop();
    },
    [activeSide, filledPlayer, list, fillRank, lives, passTurnAfter, scrollTop, playSfx],
  );

  const onTimeoutOffline = useCallback(() => {
    const side = activeSide;
    setMissTick((t) => t + 1);
    playSfx('heartbreak');
    setLives((prev) => {
      const next = { ...prev, [side]: Math.max(0, prev[side] - 1) };
      passTurnAfter(next, side);
      return next;
    });
    scrollTop();
  }, [activeSide, passTurnAfter, scrollTop, playSfx]);

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

  // ONLINE açılmış sıralar: Record → Map (ListPlayScene/ListResultScene Map bekler).
  const onlineFilledBy = useMemo(() => {
    const m = new Map<number, ListSide>();
    if (onlineState) {
      for (const [rank, side] of Object.entries(onlineState.filledBy)) {
        m.set(Number(rank), side);
      }
    }
    return m;
  }, [onlineState]);
  const onlineFilledPlayer = useMemo(() => {
    const m = new Map<number, string>();
    if (onlineState) {
      for (const [rank, pid] of Object.entries(onlineState.filledPlayer)) {
        m.set(Number(rank), pid);
      }
    }
    return m;
  }, [onlineState]);

  // ONLINE MASKELİ liste — sahne sadece rank/puan için kullanır; oyuncu/değer
  // açık sıralardan (filledPlayer/valueByRank) gelir. Cevaplar client'a gelmez.
  const onlineMaskedList: ListEntry[] = useMemo(() => {
    const size = online.criterion?.size ?? 10;
    return Array.from({ length: size }, (_, i) => ({
      rank: i + 1,
      playerId: '',
      value: 0,
    }));
  }, [online.criterion?.size]);

  const onlineDeadlineMs = useMemo(
    () => (online.turnDeadline ? new Date(online.turnDeadline).getTime() : null),
    [online.turnDeadline],
  );
  const isMyTurn = isOnline ? online.yourSide === onlineState?.activeSide : true;

  // ONLINE tahmin: sunucuya yolla; miss outcome'da kırmızı animasyon tetikle.
  const onGuessOnline = useCallback(
    (playerId: string) => {
      void online.guess(playerId).then((outcome) => {
        if (outcome && !outcome.hit) {
          setOnlineMissTick((t) => t + 1);
          playSfx('heartbreak');
        } else if (outcome && outcome.hit) {
          playSfx('win');
        }
        scrollTop();
      });
    },
    [online, playSfx, scrollTop],
  );

  // ONLINE süre dolumu: sunucu yönetir (lazy) → sadece tazele.
  const onTimeoutOnline = useCallback(() => {
    void online.refresh();
  }, [online]);

  // Rematch: OFFLINE yeni liste; ONLINE yeni eşleşme.
  const onRematch = useCallback(() => {
    if (isOnline) {
      router.push('/online?mode=liste');
      return;
    }
    resetRound();
    setPhase('reveal-list');
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
      setPhase('opponent');
    }
  }, [isOnline, phase, router, params.gameId, resetRound]);

  // OFFLINE skorlar
  const p1Score = useMemo(() => {
    const ranks = new Set<number>();
    for (const [rank, side] of filledBy) if (side === 'P1') ranks.add(rank);
    return scoreFilled(ranks);
  }, [filledBy]);
  const p2Score = useMemo(() => {
    const ranks = new Set<number>();
    for (const [rank, side] of filledBy) if (side === 'P2') ranks.add(rank);
    return scoreFilled(ranks);
  }, [filledBy]);
  const offlineWinner = useMemo(
    () => (phase === 'result' ? compareScores(p1Score, p2Score) : 'tie'),
    [phase, p1Score, p2Score],
  );

  // ONLINE skorlar (açılmış sıralardan)
  const onP1Score = useMemo(() => {
    const ranks = new Set<number>();
    for (const [rank, side] of onlineFilledBy) if (side === 'P1') ranks.add(rank);
    return scoreFilled(ranks);
  }, [onlineFilledBy]);
  const onP2Score = useMemo(() => {
    const ranks = new Set<number>();
    for (const [rank, side] of onlineFilledBy) if (side === 'P2') ranks.add(rank);
    return scoreFilled(ranks);
  }, [onlineFilledBy]);

  const onlineBg =
    onlineState?.scene === 'REVEAL_LIST'
      ? 'handoff'
      : onlineState?.scene === 'PLAY'
        ? 'pick'
        : 'final';
  const offlineBg =
    phase === 'opponent'
      ? 'mode'
      : phase === 'reveal-list'
        ? 'handoff'
        : phase === 'play'
          ? 'pick'
          : 'final';
  const bgKey = isOnline ? onlineBg : offlineBg;

  const playNameModalOpen =
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

  const onP1Name = onlineState?.p1Name ?? 'Oyuncu 1';
  const onP2Name = onlineState?.p2Name ?? 'Oyuncu 2';

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
              Liste Doldur ·{' '}
              {isOnline ? '🌐 Online' : opponent === 'hotseat' ? 'Arkadaşa karşı' : 'Bota karşı'}
            </span>
            <SoundToggle />
            <UserMenu />
          </div>
        </header>

        {/* ====================== ONLINE RENDER ====================== */}
        {isOnline && onlineState && (
          <AnimatePresence mode="wait">
            {onlineState.scene === 'REVEAL_LIST' && (
              <SceneShell sceneKey="list-online-reveal" key="list-online-reveal">
                <ListRevealScene criterion={criterion} onDone={online.ackReveal} />
              </SceneShell>
            )}

            {onlineState.scene === 'PLAY' && (
              <SceneShell sceneKey="list-online-play" key="list-online-play">
                <ListPlayScene
                  criterion={criterion}
                  // MASKELİ liste (cevaplar gizli) — açık sıralar filledPlayer'dan.
                  list={onlineMaskedList}
                  pool={session.players}
                  filledBy={onlineFilledBy}
                  filledPlayer={onlineFilledPlayer}
                  valueByRank={onlineState.filledValue}
                  seconds={LIST_TURN_SECONDS}
                  timerKey={`online-${onlineState.activeSide}-${Object.keys(onlineState.filledPlayer).length}`}
                  deadlineMs={onlineDeadlineMs}
                  onGuess={isMyTurn ? onGuessOnline : () => {}}
                  onTimeout={onTimeoutOnline}
                  hotseat
                  activeSide={onlineState.activeSide}
                  lives={onlineState.lives}
                  p1Name={onP1Name}
                  p2Name={onP2Name}
                  missTick={onlineMissTick}
                  locked={!isMyTurn}
                  waitingLabel={
                    !isMyTurn
                      ? `Rakip tahmin ediyor… (sıra ${onlineState.activeSide === 'P1' ? onP1Name : onP2Name})`
                      : null
                  }
                />
              </SceneShell>
            )}

            {onlineState.scene === 'RESULT' && (
              <SceneShell sceneKey="list-online-result" key="list-online-result">
                <ListResultScene
                  criterion={criterion}
                  // RESULT'ta tam liste sunucudan gelir (oyun bitti — spoiler değil).
                  list={online.fullList ?? []}
                  filledBy={onlineFilledBy}
                  p1Score={onP1Score}
                  p2Score={onP2Score}
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
              <SceneShell sceneKey="list-opponent" key="list-opponent">
                <OpponentSelectScene
                  modeName="Liste Doldur"
                  available={{ hotseat: true, vsBot: true }}
                  onPick={onPickOpponent}
                  onOnline={onOnline}
                />
              </SceneShell>
            )}

            {phase === 'reveal-list' && !playNameModalOpen && (
              <SceneShell sceneKey="list-reveal" key="list-reveal">
                <ListRevealScene criterion={offlineCriterion} onDone={onListRevealed} />
              </SceneShell>
            )}

            {phase === 'play' && !playNameModalOpen && (
              <SceneShell sceneKey="list-play" key="list-play">
                <ListPlayScene
                  criterion={offlineCriterion}
                  list={list}
                  pool={session.players}
                  filledBy={filledBy}
                  filledPlayer={filledPlayer}
                  seconds={LIST_TURN_SECONDS}
                  timerKey={`turn-${turnKey}`}
                  onGuess={onGuessOffline}
                  onTimeout={onTimeoutOffline}
                  hotseat={opponent === 'hotseat'}
                  activeSide={activeSide}
                  lives={lives}
                  p1Name={opponent === 'hotseat' ? p1Name || 'Oyuncu 1' : 'Sen'}
                  p2Name={opponent === 'hotseat' ? p2Name || 'Oyuncu 2' : 'Bot'}
                  missTick={missTick}
                />
              </SceneShell>
            )}

            {phase === 'result' && (
              <SceneShell sceneKey="list-result" key="list-result">
                <ListResultScene
                  criterion={offlineCriterion}
                  list={list}
                  filledBy={filledBy}
                  p1Score={p1Score}
                  p2Score={p2Score}
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

      <NameModal
        open={playNameModalOpen}
        mode="hotseat"
        initialP1={profileP1}
        initialP2={profileP2}
        onSubmit={onNamesSubmit}
      />
    </>
  );
}
