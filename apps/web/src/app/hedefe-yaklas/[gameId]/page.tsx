'use client';

import { useCallback, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { HomeIcon, ArrowLeftIcon } from '@/components/icons';
import { SceneShell } from '@/components/scenes/SceneShell';
import { SceneBackground } from '@/components/SceneBackground';
import { OpponentSelectScene, type Opponent } from '@/components/scenes/OpponentSelectScene';
import { TargetRevealScene } from '@/components/scenes/TargetRevealScene';
import { TargetBuildScene } from '@/components/scenes/TargetBuildScene';
import { TargetResultScene } from '@/components/scenes/TargetResultScene';
import { SoundToggle } from '@/components/SoundToggle';
import { UserMenu } from '@/components/UserMenu';
import { useGameSession } from '@/lib/GameSessionProvider';
import { createPRNG } from '@futbol-kart/game-engine';
import { TARGET_PICK_SECONDS } from '@/lib/gameConstants';
import {
  CRITERION_WORLD_CUP_APPS,
  pickTarget,
  emptyPicks,
  buildAutoTarget,
  autoFillTarget,
  scoreTarget,
  compareToTarget,
  type TargetPicks,
  type TargetCriterion,
} from '@/lib/targetMode';

type Phase = 'opponent' | 'reveal-target' | 'build' | 'result';

/**
 * "Hedefe Yaklaş" modu — ince dikey dilim (vs-bot, "Dünya Kupası maçı", hedef
 * 60–80). 5 oyuncu kör seç, toplamı hedefe yaklaştır; en yakın kazanır.
 * VS/Kadro sayfalarından bağımsız: kendi hafif faz makinesi + saf targetMode.
 */
export default function TargetGamePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const session = useGameSession();

  // İlk dilim: tek kriter sabit.
  const criterion: TargetCriterion = CRITERION_WORLD_CUP_APPS;

  const playersById = useMemo(
    () => new Map(session.players.map((p) => [p.id, p])),
    [session.players],
  );

  const [phase, setPhase] = useState<Phase>('opponent');
  const [target, setTarget] = useState<number>(70);
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [p1Picks, setP1Picks] = useState<TargetPicks>(() => emptyPicks());
  const [p2Picks, setP2Picks] = useState<TargetPicks>(() => emptyPicks());

  // Rakip seçildi (bu dilimde yalnız vs-bot). Hedef çarkı için yeni hedef üret,
  // havuzu karıştır, kadroları sıfırla → reveal-target.
  const onPickOpponent = useCallback(
    (_opp: Opponent) => {
      const prng = createPRNG(`${params.gameId}-tg-${Date.now()}`);
      setTarget(pickTarget(criterion, () => prng.next()));
      setShuffleSeed(Math.floor(prng.next() * 1e9));
      setP1Picks(emptyPicks());
      setP2Picks(emptyPicks());
      setPhase('reveal-target');
    },
    [params.gameId, criterion],
  );

  const onTargetRevealed = useCallback(() => setPhase('build'), []);

  // Bir slota oyuncu ata/kaldır. Aynı oyuncu başka slotta varsa önce temizle.
  const onPick = useCallback((slotIdx: number, playerId: string | null) => {
    setP1Picks((prev) => {
      const next = [...prev];
      if (playerId) {
        for (let i = 0; i < next.length; i++) if (next[i] === playerId) next[i] = null;
      }
      next[slotIdx] = playerId;
      return next;
    });
  }, []);

  // Süre doldu → boşları rastgele tamamla, sonra kapıştır.
  const onTimeout = useCallback(() => {
    const prng = createPRNG(`${params.gameId}-tg-auto`);
    const excluded = new Set<string>(); // build'te rakip henüz seçilmedi
    const filled = autoFillTarget(
      p1Picks,
      criterion,
      session.players,
      excluded,
      () => prng.next(),
    );
    setP1Picks(filled);
    submitWith(filled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.gameId, p1Picks, criterion, session.players]);

  // Kadroyu kilitle → bot kadrosunu kur (P1'in seçtiklerini havuzdan çıkar) → result.
  const submitWith = useCallback(
    (finalP1: TargetPicks) => {
      const prng = createPRNG(`${params.gameId}-tg-bot`);
      const excludeIds = new Set(
        finalP1.filter((v): v is string => v !== null),
      );
      const botPicks = buildAutoTarget(
        criterion,
        session.players,
        excludeIds,
        target,
        () => prng.next(),
      );
      setP2Picks(botPicks);
      setPhase('result');
    },
    [params.gameId, criterion, session.players, target],
  );

  const onSubmit = useCallback(() => submitWith(p1Picks), [submitWith, p1Picks]);

  // Yeniden oyna: yeni hedef çarkı + sıfır picks.
  const onRematch = useCallback(() => {
    const prng = createPRNG(`${params.gameId}-tg-${Date.now()}`);
    setTarget(pickTarget(criterion, () => prng.next()));
    setShuffleSeed(Math.floor(prng.next() * 1e9));
    setP1Picks(emptyPicks());
    setP2Picks(emptyPicks());
    setPhase('reveal-target');
  }, [params.gameId, criterion]);

  // Faz-bilinçli "← Geri" (Kadro Kur deseni).
  const onBack = useCallback(() => {
    switch (phase) {
      case 'opponent':
        router.push(`/oyna/${params.gameId}`);
        break;
      case 'reveal-target':
        setPhase('opponent');
        break;
      case 'build':
        setP1Picks(emptyPicks());
        setPhase('opponent');
        break;
      case 'result':
        setPhase('opponent');
        break;
    }
  }, [phase, router, params.gameId]);

  const winner = useMemo(() => {
    if (phase !== 'result') return 'tie' as const;
    const p1 = scoreTarget(p1Picks, criterion, playersById);
    const p2 = scoreTarget(p2Picks, criterion, playersById);
    return compareToTarget(p1.total, p2.total, target);
  }, [phase, p1Picks, p2Picks, criterion, playersById, target]);

  // Rakip (bot) seçtikleri → build havuzundan çıkarılır (result'tan önce boş).
  const usedByBot = useMemo(
    () => new Set(p2Picks.filter((v): v is string => v !== null)),
    [p2Picks],
  );

  const bgKey =
    phase === 'opponent'
      ? 'mode'
      : phase === 'reveal-target'
        ? 'handoff'
        : phase === 'build'
          ? 'pick'
          : 'final';

  return (
    <>
      <SceneBackground bgKey={bgKey} />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
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
              Hedefe Yaklaş · Bota karşı
            </span>
            <SoundToggle />
            <UserMenu />
          </div>
        </header>

        <AnimatePresence mode="wait">
          {phase === 'opponent' && (
            <SceneShell sceneKey="target-opponent" key="target-opponent">
              <OpponentSelectScene
                modeName="Hedefe Yaklaş"
                available={{ hotseat: false, vsBot: true }}
                onPick={onPickOpponent}
              />
            </SceneShell>
          )}

          {phase === 'reveal-target' && (
            <SceneShell sceneKey="target-reveal" key="target-reveal">
              <TargetRevealScene
                target={target}
                criterion={criterion}
                onDone={onTargetRevealed}
              />
            </SceneShell>
          )}

          {phase === 'build' && (
            <SceneShell sceneKey="target-build" key="target-build">
              <TargetBuildScene
                criterion={criterion}
                target={target}
                pool={session.players}
                picks={p1Picks}
                excludeIds={usedByBot}
                shuffleSeed={shuffleSeed}
                seconds={TARGET_PICK_SECONDS}
                onPick={onPick}
                onSubmit={onSubmit}
                onTimeout={onTimeout}
              />
            </SceneShell>
          )}

          {phase === 'result' && (
            <SceneShell sceneKey="target-result" key="target-result">
              <TargetResultScene
                criterion={criterion}
                target={target}
                p1Picks={p1Picks}
                p2Picks={p2Picks}
                p1Name="Sen"
                p2Name="Bot"
                winner={winner}
                playersById={playersById}
                onRematch={onRematch}
              />
            </SceneShell>
          )}
        </AnimatePresence>
      </main>
    </>
  );
}
