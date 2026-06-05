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
import { useSfx } from '@/lib/useSfx';
import { createPRNG } from '@futbol-kart/game-engine';
import { LIST_TURN_SECONDS, LIST_LIVES } from '@/lib/gameConstants';
import {
  pruneListCriteria,
  buildList,
  evaluateGuess,
  scoreFilled,
  compareScores,
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
  const playSfx = useSfx();

  // Kriter — gameId'den seed'lenen PRNG ile sağlıklı havuzdan rastgele seçilir.
  // Böylece her oyun farklı bir liste sorusu (235 kriterden biri) gelir; aynı
  // gameId aynı kriteri verir (deterministik, yeniden yüklemede tutarlı).
  const criterion: ListCriterion = useMemo(() => {
    const healthy = pruneListCriteria(session.players);
    const prng = createPRNG(`list:${params.gameId}`);
    return healthy[Math.floor(prng.next() * healthy.length)] ?? healthy[0]!;
  }, [session.players, params.gameId]);

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
  // Yanlış tahmin animasyonu tetikleyici (artarsa "listede yok" + can yanıp söner).
  const [missTick, setMissTick] = useState(0);

  // Can: her taraf LIST_LIVES (3). Yanlış/pas can götürür; biten taraf tahmin edemez.
  // Bota karşı: P1 oynar, P2 (bot) can kullanmaz (P1 bitince bot tamamlar).
  const [lives, setLives] = useState<{ P1: number; P2: number }>({
    P1: LIST_LIVES,
    P2: LIST_LIVES,
  });
  // Aktif taraf (hot-seat'te alternasyon; canı biten atlanır). Bota karşı hep P1.
  const [activeSide, setActiveSide] = useState<ListSide>('P1');

  // -------- Hot-seat --------
  const profileP1 = useProfileStore((s) => s.p1Name);
  const profileP2 = useProfileStore((s) => s.p2Name);
  const setProfileNames = useProfileStore((s) => s.setNames);
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');
  // Süre sayacını her sıra/tahminde sıfırlamak için artan anahtar.
  const [turnKey, setTurnKey] = useState(0);

  const resetRound = useCallback(() => {
    setFilledBy(new Map());
    setFilledPlayer(new Map());
    setMissTick(0);
    setLives({ P1: LIST_LIVES, P2: LIST_LIVES });
    setActiveSide('P1');
    setTurnKey(0);
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

  // Bota karşı: P1'in canı bitince (veya liste dolunca) bot bildiklerini açar → result.
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

  // Sıra geçişi (hot-seat): canı olan KARŞI tarafa geç. İki tarafın da canı 0 → result.
  // Bota karşı: P1 devam (canı varsa), bitince finishVsBot.
  const passTurnAfter = useCallback(
    (nextLives: { P1: number; P2: number }, justActed: ListSide) => {
      if (opponent === 'vs-bot') {
        if (nextLives.P1 <= 0) finishVsBot();
        else setTurnKey((k) => k + 1); // P1 devam, süre sıfırla
        return;
      }
      // Hot-seat: iki tarafın da canı bittiyse result.
      if (nextLives.P1 <= 0 && nextLives.P2 <= 0) {
        setPhase('result');
        return;
      }
      // Karşı tarafa geç; onun canı yoksa aynı tarafta kal.
      const other: ListSide = justActed === 'P1' ? 'P2' : 'P1';
      const nextSide = nextLives[other] > 0 ? other : justActed;
      setActiveSide(nextSide);
      setTurnKey((k) => k + 1);
    },
    [opponent, finishVsBot],
  );

  // Her tahmin/sıra sonrası ekranı yumuşak animasyonla en üste al (madde 3) —
  // oyuncu listenin tepesini + sıra panelini görsün, havuzun dibinde kalmasın.
  const scrollTop = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  // Tahmin (aktif taraf adına). Doğru → sıraya otur (can gitmez). Yanlış → can -1.
  const onGuess = useCallback(
    (playerId: string) => {
      const side = activeSide;
      const filledRanks = new Set(filledPlayer.keys());
      const res = evaluateGuess(playerId, list, filledRanks);
      if (res.hit && !res.alreadyFilled) {
        fillRank(res.entry.rank, playerId, side);
        playSfx('win'); // doğru tahmin geri bildirimi
        // Doğru: can gitmez. Bota karşı P1 devam; hot-seat sıra karşıya geçer.
        passTurnAfter(lives, side);
      } else {
        // Yanlış / zaten dolu: can -1 + animasyon + cam kırılma sesi, sonra sıra geç.
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

  // Süre doldu → pas (yanlış gibi: can -1 + cam kırılma + sıra geç).
  const onTimeout = useCallback(() => {
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
                seconds={LIST_TURN_SECONDS}
                timerKey={`turn-${turnKey}`}
                onGuess={onGuess}
                onTimeout={onTimeout}
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
