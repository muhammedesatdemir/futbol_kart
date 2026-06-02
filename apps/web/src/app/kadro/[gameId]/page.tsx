'use client';

import { useCallback, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { HomeIcon } from '@/components/icons';
import { SceneShell } from '@/components/scenes/SceneShell';
import { OpponentSelectScene } from '@/components/scenes/OpponentSelectScene';
import { SquadCriterionSelectScene } from '@/components/scenes/SquadCriterionSelectScene';
import { SquadBuildScene } from '@/components/scenes/SquadBuildScene';
import { SquadResultScene } from '@/components/scenes/SquadResultScene';
import { SoundToggle } from '@/components/SoundToggle';
import { UserMenu } from '@/components/UserMenu';
import { useGameSession } from '@/lib/GameSessionProvider';
import { createPRNG } from '@futbol-kart/game-engine';
import {
  FORMATION_6,
  SQUAD_CRITERIA,
  CRITERION_TALLEST,
  criterionById,
  emptyAssignment,
  buildAutoSquad,
  scoreSquad,
  compareSquads,
  type SquadAssignment,
  type SquadCriterion,
} from '@/lib/squadMode';

type Phase = 'opponent' | 'select' | 'build' | 'result';

/**
 * "Kadro Kur" modu — ince dikey dilim (vs-bot, "en uzun kadro").
 * VS düello sayfasından bağımsız: kendi hafif faz makinesi + saf squadMode mantığı.
 */
export default function SquadGamePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const session = useGameSession();

  const formation = FORMATION_6;

  const playersById = useMemo(() => {
    const m = new Map(session.players.map((p) => [p.id, p]));
    return m;
  }, [session.players]);

  const [phase, setPhase] = useState<Phase>('opponent');
  const [criterion, setCriterion] = useState<SquadCriterion>(CRITERION_TALLEST);
  const [p1Assignment, setP1Assignment] = useState<SquadAssignment>(() =>
    emptyAssignment(formation),
  );
  const [p2Assignment, setP2Assignment] = useState<SquadAssignment>(() =>
    emptyAssignment(formation),
  );

  const onPickCriterion = useCallback((criterionId: string) => {
    const c = criterionById(criterionId);
    if (c) setCriterion(c);
    setPhase('build');
  }, []);

  const onRandomCriterion = useCallback(() => {
    const prng = createPRNG(`${params.gameId}-crit`);
    const idx = Math.floor(prng.next() * SQUAD_CRITERIA.length);
    setCriterion(SQUAD_CRITERIA[idx]);
    setPhase('build');
  }, [params.gameId]);

  const onAssign = useCallback((slotId: string, playerId: string | null) => {
    setP1Assignment((prev) => {
      const next = { ...prev };
      // Aynı oyuncu başka slotta varsa temizle (tek oyuncu tek slot).
      if (playerId) {
        for (const k of Object.keys(next)) {
          if (next[k] === playerId) next[k] = null;
        }
      }
      next[slotId] = playerId;
      return next;
    });
  }, []);

  const onSubmit = useCallback(() => {
    // P1 kilitlendi → bot kadrosunu kur (P1'in seçtiklerini havuzdan çıkar).
    const prng = createPRNG(`${params.gameId}-squad`);
    const excludeIds = new Set(
      Object.values(p1Assignment).filter((v): v is string => v !== null),
    );
    const botSquad = buildAutoSquad(
      formation,
      criterion,
      session.players,
      excludeIds,
      () => prng.next(),
    );
    setP2Assignment(botSquad);
    setPhase('result');
  }, [params.gameId, p1Assignment, formation, criterion, session.players]);

  // Yeniden oyna: rakip aynı kalır (tekrar sorulmaz), kriter seçimine dön +
  // kadroları sıfırla. Aynı sayfada — yeni route gerekmez.
  const onRematch = useCallback(() => {
    setP1Assignment(emptyAssignment(formation));
    setP2Assignment(emptyAssignment(formation));
    setPhase('select');
  }, [formation]);

  const winner = useMemo(() => {
    if (phase !== 'result') return 'tie' as const;
    const p1 = scoreSquad(p1Assignment, formation, criterion, playersById);
    const p2 = scoreSquad(p2Assignment, formation, criterion, playersById);
    return compareSquads(p1, p2, criterion);
  }, [phase, p1Assignment, p2Assignment, formation, criterion, playersById]);

  const usedByBotOrP1 = useMemo(
    () =>
      new Set(
        Object.values(p2Assignment).filter((v): v is string => v !== null),
      ),
    [p2Assignment],
  );

  return (
    <main className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="btn-ghost">
          <HomeIcon size={16} />
          Ana sayfa
        </Link>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-accent-gold/40 bg-accent-gold/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-goldHi">
            Kadro Kur · Bota karşı
          </span>
          <SoundToggle />
          <UserMenu />
        </div>
      </header>

      <AnimatePresence mode="wait">
        {phase === 'opponent' && (
          <SceneShell sceneKey="squad-opponent" key="squad-opponent">
            <OpponentSelectScene
              modeName="Kadro Kur"
              available={{ hotseat: false, vsBot: true }}
              onPick={() => setPhase('select')}
            />
          </SceneShell>
        )}

        {phase === 'select' && (
          <SceneShell sceneKey="squad-select" key="squad-select">
            <SquadCriterionSelectScene
              onPick={onPickCriterion}
              onRandom={onRandomCriterion}
            />
          </SceneShell>
        )}

        {phase === 'build' && (
          <SceneShell sceneKey="squad-build" key="squad-build">
            <SquadBuildScene
              formation={formation}
              criterion={criterion}
              pool={session.players}
              assignment={p1Assignment}
              excludeIds={usedByBotOrP1}
              onAssign={onAssign}
              onSubmit={onSubmit}
            />
          </SceneShell>
        )}

        {phase === 'result' && (
          <SceneShell sceneKey="squad-result" key="squad-result">
            <SquadResultScene
              formation={formation}
              criterion={criterion}
              p1Assignment={p1Assignment}
              p2Assignment={p2Assignment}
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
  );
}
