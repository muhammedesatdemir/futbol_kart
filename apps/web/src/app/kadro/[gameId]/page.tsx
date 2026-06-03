'use client';

import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { HomeIcon } from '@/components/icons';
import { SceneShell } from '@/components/scenes/SceneShell';
import { SceneBackground } from '@/components/SceneBackground';
import { OpponentSelectScene, type Opponent } from '@/components/scenes/OpponentSelectScene';
import { SquadCriterionSelectScene } from '@/components/scenes/SquadCriterionSelectScene';
import { SquadBuildScene } from '@/components/scenes/SquadBuildScene';
import { SquadDraftScene } from '@/components/scenes/SquadDraftScene';
import { SquadResultScene } from '@/components/scenes/SquadResultScene';
import { SoundToggle } from '@/components/SoundToggle';
import { UserMenu } from '@/components/UserMenu';
import { NameModal } from '@/components/NameModal';
import { useGameSession } from '@/lib/GameSessionProvider';
import { useProfileStore } from '@/lib/profileStore';
import { createPRNG } from '@futbol-kart/game-engine';
import { SQUAD_DRAFT_SECONDS } from '@/lib/gameConstants';
import {
  FORMATION_433,
  SQUAD_CRITERIA,
  CRITERION_TALLEST,
  criterionById,
  emptyAssignment,
  buildAutoSquad,
  scoreSquad,
  compareSquads,
  snakeDraftOrder,
  suggestForDraft,
  autoPickForDraft,
  draftedIds,
  type SquadAssignment,
  type SquadCriterion,
  type Suggestion,
} from '@/lib/squadMode';

type Phase = 'opponent' | 'select' | 'build' | 'draft' | 'result';

/**
 * "Kadro Kur" modu — ince dikey dilim (vs-bot, "en uzun kadro").
 * VS düello sayfasından bağımsız: kendi hafif faz makinesi + saf squadMode mantığı.
 */
export default function SquadGamePage() {
  const params = useParams<{ gameId: string }>();
  const session = useGameSession();

  const formation = FORMATION_433;

  const playersById = useMemo(() => {
    const m = new Map(session.players.map((p) => [p.id, p]));
    return m;
  }, [session.players]);

  const [phase, setPhase] = useState<Phase>('opponent');
  const [opponent, setOpponent] = useState<Opponent>('vs-bot');
  const [criterion, setCriterion] = useState<SquadCriterion>(CRITERION_TALLEST);
  // Havuz karıştırma seed'i — her oyun/yeniden-oyna farklı rastgele sıra.
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [p1Assignment, setP1Assignment] = useState<SquadAssignment>(() =>
    emptyAssignment(formation),
  );
  const [p2Assignment, setP2Assignment] = useState<SquadAssignment>(() =>
    emptyAssignment(formation),
  );

  // -------- Hot-seat snake draft state'i --------
  // İsimler (NameModal ile alınır; vs-bot'ta gerekmez).
  const profileP1 = useProfileStore((s) => s.p1Name);
  const profileP2 = useProfileStore((s) => s.p2Name);
  const setProfileNames = useProfileStore((s) => s.setNames);
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');
  // Snake sırası (22 adım = 11 slot × 2). draftStep = mevcut adım indeksi.
  const draftOrder = useMemo(
    () => snakeDraftOrder(formation.slots.length, 'P1'),
    [formation.slots.length],
  );
  const [draftStep, setDraftStep] = useState(0);
  // Öneri jokeri: her taraf maçta 1×.
  const [draftJokerUsed, setDraftJokerUsed] = useState<{ P1: boolean; P2: boolean }>({
    P1: false,
    P2: false,
  });
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  // Rakip seçildi. Bota karşı → kriteri OYUNCU seçer (select fazı). Arkadaşa
  // karşı → kriter GİZLİ/RASTGELE (iki taraf da seçemez, adalet); doğrudan
  // build'e geçilir (madde 1).
  const onPickOpponent = useCallback(
    (opp: Opponent) => {
      setOpponent(opp);
      if (opp === 'hotseat') {
        // Arkadaşa karşı: kriter gizli/rastgele (iki taraf da seçemez) → snake draft.
        const prng = createPRNG(`${params.gameId}-crit-${Date.now()}`);
        setCriterion(SQUAD_CRITERIA[Math.floor(prng.next() * SQUAD_CRITERIA.length)]);
        setP1Assignment(emptyAssignment(formation));
        setP2Assignment(emptyAssignment(formation));
        setDraftStep(0);
        setDraftJokerUsed({ P1: false, P2: false });
        setSuggestion(null);
        setPhase('draft');
      } else {
        setPhase('select');
      }
    },
    [params.gameId, formation],
  );

  const onPickCriterion = useCallback((criterionId: string) => {
    const c = criterionById(criterionId);
    if (c) setCriterion(c);
    setShuffleSeed(Math.floor(Math.random() * 1e9));
    setPhase('build');
  }, []);

  const onRandomCriterion = useCallback(() => {
    const prng = createPRNG(`${params.gameId}-crit-${Date.now()}`);
    const idx = Math.floor(prng.next() * SQUAD_CRITERIA.length);
    setCriterion(SQUAD_CRITERIA[idx]);
    setShuffleSeed(Math.floor(prng.next() * 1e9));
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

  // ============ Hot-seat snake draft handler'ları ============
  // Aktif taraf = snake sırasındaki mevcut adım. Süre sayacı için draftStep kullanılır.
  const draftActiveSide = draftOrder[draftStep] ?? 'P1';

  // Bir seçim uygula (slotId + playerId) → ilgili tarafın kadrosuna koy + adım ilerlet.
  // Son adımda result'a geç.
  const applyDraftPick = useCallback(
    (side: 'P1' | 'P2', slotId: string, playerId: string) => {
      const setter = side === 'P1' ? setP1Assignment : setP2Assignment;
      setter((prev) => ({ ...prev, [slotId]: playerId }));
      setSuggestion(null);
      setDraftStep((s) => {
        const next = s + 1;
        if (next >= draftOrder.length) {
          // Tüm seçimler bitti → sonuç.
          setPhase('result');
        }
        return next;
      });
    },
    [draftOrder.length],
  );

  // Kullanıcı seçimi (aktif taraf adına).
  const onDraftSelect = useCallback(
    (slotId: string, playerId: string) => {
      applyDraftPick(draftActiveSide, slotId, playerId);
    },
    [applyDraftPick, draftActiveSide],
  );

  // Süre doldu → rastgele boş mevkiye rastgele uygun oyuncu (aktif taraf).
  const onDraftTimeout = useCallback(() => {
    const prng = createPRNG(`${params.gameId}-auto-${draftStep}`);
    const myAssign = draftActiveSide === 'P1' ? p1Assignment : p2Assignment;
    const excluded = draftedIds(p1Assignment, p2Assignment);
    const auto = autoPickForDraft(
      myAssign,
      formation,
      criterion,
      session.players,
      excluded,
      () => prng.next(),
    );
    if (auto) applyDraftPick(draftActiveSide, auto.slotId, auto.playerId);
    else applyDraftPick(draftActiveSide, '', ''); // aday yoksa boş geç (nadir)
  }, [params.gameId, draftStep, draftActiveSide, p1Assignment, p2Assignment, formation, criterion, session.players, applyDraftPick]);

  // Öneri jokeri: kalan boş mevkiye iyi-mükemmel bir oyuncu öner (aktif taraf).
  const onDraftJoker = useCallback(() => {
    if (draftJokerUsed[draftActiveSide]) return;
    const prng = createPRNG(`${params.gameId}-sug-${draftStep}`);
    const myAssign = draftActiveSide === 'P1' ? p1Assignment : p2Assignment;
    const excluded = draftedIds(p1Assignment, p2Assignment);
    const sug = suggestForDraft(
      myAssign,
      formation,
      criterion,
      session.players,
      excluded,
      () => prng.next(),
    );
    if (sug) {
      setSuggestion(sug);
      setDraftJokerUsed((u) => ({ ...u, [draftActiveSide]: true }));
    }
  }, [draftJokerUsed, draftActiveSide, params.gameId, draftStep, p1Assignment, p2Assignment, formation, criterion, session.players]);

  // Öneriyi kabul et → o slota öneriyi koy + adım ilerlet.
  const onAcceptSuggestion = useCallback(() => {
    if (!suggestion) return;
    applyDraftPick(draftActiveSide, suggestion.slotId, suggestion.playerId);
  }, [suggestion, draftActiveSide, applyDraftPick]);

  const onDismissSuggestion = useCallback(() => setSuggestion(null), []);

  // İsim modalı onayı (hot-seat).
  const onNamesSubmit = useCallback(
    (n1: string, n2: string) => {
      setP1Name(n1);
      setP2Name(n2);
      setProfileNames(n1, n2);
    },
    [setProfileNames],
  );

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

  // Yeniden oyna: rakip aynı kalır. Bota karşı → kriter seçimine dön; arkadaşa
  // karşı → yeni rastgele kriterle doğrudan build. Kadrolar + havuz sırası sıfırlanır.
  const onRematch = useCallback(() => {
    setP1Assignment(emptyAssignment(formation));
    setP2Assignment(emptyAssignment(formation));
    if (opponent === 'hotseat') {
      // Arkadaşa karşı → yeni rastgele kriterle yeni snake draft.
      const prng = createPRNG(`${params.gameId}-crit-${Date.now()}`);
      setCriterion(SQUAD_CRITERIA[Math.floor(prng.next() * SQUAD_CRITERIA.length)]);
      setDraftStep(0);
      setDraftJokerUsed({ P1: false, P2: false });
      setSuggestion(null);
      setPhase('draft');
    } else {
      setShuffleSeed(Math.floor(Math.random() * 1e9));
      setPhase('select');
    }
  }, [formation, opponent, params.gameId]);

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

  // Faza göre kart-kapışma arka planı (madde 8): rakip/kriter = mode/pick havası,
  // build = pick, result = final (kazanma atmosferi).
  const bgKey =
    phase === 'opponent'
      ? 'mode'
      : phase === 'select'
        ? 'handoff'
        : phase === 'build' || phase === 'draft'
          ? 'pick'
          : 'final';

  // Hot-seat draft başında isim modalı (isimler boşken).
  const draftNameModalOpen = phase === 'draft' && p1Name === '';

  return (
    <>
      <SceneBackground bgKey={bgKey} />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="btn-ghost">
          <HomeIcon size={16} />
          Ana sayfa
        </Link>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-accent-gold/40 bg-accent-gold/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-goldHi">
            Kadro Kur · {opponent === 'hotseat' ? 'Arkadaşa karşı' : 'Bota karşı'}
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
              available={{ hotseat: true, vsBot: true }}
              onPick={onPickOpponent}
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
              shuffleSeed={shuffleSeed}
              onAssign={onAssign}
              onSubmit={onSubmit}
            />
          </SceneShell>
        )}

        {phase === 'draft' && !draftNameModalOpen && (
          <SceneShell sceneKey="squad-draft" key="squad-draft">
            <SquadDraftScene
              formation={formation}
              criterion={criterion}
              pool={session.players}
              p1Name={p1Name || 'Oyuncu 1'}
              p2Name={p2Name || 'Oyuncu 2'}
              p1Assignment={p1Assignment}
              p2Assignment={p2Assignment}
              activeSide={draftActiveSide}
              stepIndex={draftStep}
              seconds={SQUAD_DRAFT_SECONDS}
              jokerAvailable={!draftJokerUsed[draftActiveSide]}
              suggestion={suggestion}
              onSelect={onDraftSelect}
              onTimeout={onDraftTimeout}
              onUseJoker={onDraftJoker}
              onAcceptSuggestion={onAcceptSuggestion}
              onDismissSuggestion={onDismissSuggestion}
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

      {/* Hot-seat draft isim modalı */}
      <NameModal
        open={draftNameModalOpen}
        mode="hotseat"
        initialP1={profileP1}
        initialP2={profileP2}
        onSubmit={onNamesSubmit}
      />
    </>
  );
}
