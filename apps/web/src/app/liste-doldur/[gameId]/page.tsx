'use client';

import { useCallback, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { HomeIcon, ArrowLeftIcon } from '@/components/icons';
import { SceneShell } from '@/components/scenes/SceneShell';
import { SceneBackground } from '@/components/SceneBackground';
import { OpponentSelectScene, type Opponent } from '@/components/scenes/OpponentSelectScene';
import { ListRevealScene } from '@/components/scenes/ListRevealScene';
import { ListPlayScene } from '@/components/scenes/ListPlayScene';
import { ListResultScene } from '@/components/scenes/ListResultScene';
import { SoundToggle } from '@/components/SoundToggle';
import { UserMenu } from '@/components/UserMenu';
import { NameModal } from '@/components/NameModal';
import { useGameSession } from '@/lib/GameSessionProvider';
import { useProfileStore } from '@/lib/profileStore';
import { createPRNG } from '@futbol-kart/game-engine';
import { LIST_PLAY_SECONDS, LIST_TURN_SECONDS } from '@/lib/gameConstants';
import {
  CRITERION_MOST_CAPS,
  buildList,
  evaluateGuess,
  scoreFilled,
  compareScores,
  listSnakeOrder,
  botKnownRanks,
  type ListCriterion,
  type ListSide,
} from '@/lib/listMode';

type Phase = 'opponent' | 'reveal-list' | 'play' | 'result';

/**
 * "Liste Doldur" modu — Bota karşı + Arkadaşa karşı (snake). Sıralı top-10
 * listesini havuzdan isim tahmin ederek doldur; doğru tahmin gerçek sırasına
 * oturur + puan (düz: rank = puan). En çok puan kazanır. Saf listMode mantığı.
 */
export default function ListGamePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const session = useGameSession();

  const criterion: ListCriterion = CRITERION_MOST_CAPS;

  const playersById = useMemo(
    () => new Map(session.players.map((p) => [p.id, p])),
    [session.players],
  );

  const [phase, setPhase] = useState<Phase>('opponent');
  const [opponent, setOpponent] = useState<Opponent>('vs-bot');
  // Liste — oyun başında havuzdan türetilir (sabit kalır).
  const list = useMemo(
    () => buildList(criterion, session.players),
    [criterion, session.players],
  );

  // Açılan sıralar: rank → taraf, rank → playerId.
  const [filledBy, setFilledBy] = useState<Map<number, ListSide>>(new Map());
  const [filledPlayer, setFilledPlayer] = useState<Map<number, string>>(new Map());
  const [missTick, setMissTick] = useState(0);

  // -------- Hot-seat --------
  const profileP1 = useProfileStore((s) => s.p1Name);
  const profileP2 = useProfileStore((s) => s.p2Name);
  const setProfileNames = useProfileStore((s) => s.setNames);
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');
  // Snake sırası — liste×2 adım yeter (yanlışlar da sayılır; liste dolunca biter).
  const snakeOrder = useMemo(() => listSnakeOrder(list.length * 3, 'P1'), [list.length]);
  const [turnStep, setTurnStep] = useState(0);
  const activeSide: ListSide = snakeOrder[turnStep] ?? 'P1';

  const resetRound = useCallback(() => {
    setFilledBy(new Map());
    setFilledPlayer(new Map());
    setMissTick(0);
    setTurnStep(0);
  }, []);

  const onPickOpponent = useCallback(
    (opp: Opponent) => {
      setOpponent(opp);
      resetRound();
      setPhase('reveal-list');
    },
    [resetRound],
  );

  const onListRevealed = useCallback(() => setPhase('play'), []);

  // Bir sırayı aç (taraf adına). Tüm liste dolunca result.
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

  // ---- Bota karşı: oyuncu serbest tahmin (P1) ----
  const onGuessVsBot = useCallback(
    (playerId: string) => {
      const filledRanks = new Set(filledPlayer.keys());
      const res = evaluateGuess(playerId, list, filledRanks);
      if (!res.hit || res.alreadyFilled) {
        setMissTick((t) => t + 1);
        return;
      }
      fillRank(res.entry.rank, playerId, 'P1');
    },
    [filledPlayer, list, fillRank],
  );

  // Bota karşı: süre dolunca bot bildiği sıraları açar → result.
  const finishVsBot = useCallback(() => {
    const prng = createPRNG(`${params.gameId}-list-bot`);
    const known = botKnownRanks(list, () => prng.next(), 0.6);
    setFilledBy((prev) => {
      const next = new Map(prev);
      for (const e of list) {
        // P1 zaten açtıysa dokunma; değilse bot bildiklerini açar.
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

  // ---- Arkadaşa karşı: snake, her tur 1 tahmin ----
  const advanceTurn = useCallback(() => {
    setTurnStep((s) => {
      const next = s + 1;
      if (next >= snakeOrder.length) setPhase('result');
      return next;
    });
  }, [snakeOrder.length]);

  const onGuessHotseat = useCallback(
    (playerId: string) => {
      const filledRanks = new Set(filledPlayer.keys());
      const res = evaluateGuess(playerId, list, filledRanks);
      if (res.hit && !res.alreadyFilled) {
        fillRank(res.entry.rank, playerId, activeSide);
      } else {
        setMissTick((t) => t + 1);
      }
      // Doğru ya da yanlış: sıra geçer (saf snake, tur başına 1 tahmin).
      advanceTurn();
    },
    [filledPlayer, list, activeSide, fillRank, advanceTurn],
  );

  // Süre doldu.
  const onTimeout = useCallback(() => {
    if (opponent === 'hotseat') {
      // Pas → sıra geçer.
      setMissTick((t) => t + 1);
      advanceTurn();
    } else {
      finishVsBot();
    }
  }, [opponent, advanceTurn, finishVsBot]);

  const onGuess = opponent === 'hotseat' ? onGuessHotseat : onGuessVsBot;

  // İsim modalı (hot-seat).
  const onNamesSubmit = useCallback(
    (n1: string, n2: string) => {
      setP1Name(n1);
      setP2Name(n2);
      setProfileNames(n1, n2);
    },
    [setProfileNames],
  );

  const onRematch = useCallback(() => {
    resetRound();
    setPhase('reveal-list');
  }, [resetRound]);

  const onBack = useCallback(() => {
    if (phase === 'opponent') {
      router.push(`/oyna/${params.gameId}`);
    } else {
      resetRound();
      setPhase('opponent');
    }
  }, [phase, router, params.gameId, resetRound]);

  // Skorlar (taraf bazlı açılan sıralar).
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

  const winner = useMemo(
    () => (phase === 'result' ? compareScores(p1Score, p2Score) : 'tie'),
    [phase, p1Score, p2Score],
  );

  const bgKey =
    phase === 'opponent'
      ? 'mode'
      : phase === 'reveal-list'
        ? 'handoff'
        : phase === 'play'
          ? 'pick'
          : 'final';

  const playNameModalOpen = opponent === 'hotseat' && phase !== 'opponent' && p1Name === '';

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
              Liste Doldur · {opponent === 'hotseat' ? 'Arkadaşa karşı' : 'Bota karşı'}
            </span>
            <SoundToggle />
            <UserMenu />
          </div>
        </header>

        <AnimatePresence mode="wait">
          {phase === 'opponent' && (
            <SceneShell sceneKey="list-opponent" key="list-opponent">
              <OpponentSelectScene
                modeName="Liste Doldur"
                available={{ hotseat: true, vsBot: true }}
                onPick={onPickOpponent}
              />
            </SceneShell>
          )}

          {phase === 'reveal-list' && !playNameModalOpen && (
            <SceneShell sceneKey="list-reveal" key="list-reveal">
              <ListRevealScene criterion={criterion} onDone={onListRevealed} />
            </SceneShell>
          )}

          {phase === 'play' && !playNameModalOpen && (
            <SceneShell sceneKey="list-play" key="list-play">
              <ListPlayScene
                criterion={criterion}
                list={list}
                pool={session.players}
                filledBy={filledBy}
                filledPlayer={filledPlayer}
                seconds={opponent === 'hotseat' ? LIST_TURN_SECONDS : LIST_PLAY_SECONDS}
                timerKey={opponent === 'hotseat' ? `turn-${turnStep}` : 'list-play'}
                onGuess={onGuess}
                onTimeout={onTimeout}
                hotseat={opponent === 'hotseat'}
                activeSide={activeSide}
                p1Name={opponent === 'hotseat' ? p1Name || 'Oyuncu 1' : 'Sen'}
                p2Name={opponent === 'hotseat' ? p2Name || 'Oyuncu 2' : 'Bot'}
                missTick={missTick}
              />
            </SceneShell>
          )}

          {phase === 'result' && (
            <SceneShell sceneKey="list-result" key="list-result">
              <ListResultScene
                criterion={criterion}
                list={list}
                filledBy={filledBy}
                p1Score={p1Score}
                p2Score={p2Score}
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
