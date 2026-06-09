'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { HomeIcon, ArrowLeftIcon } from '@/components/icons';
import { SceneShell } from '@/components/scenes/SceneShell';
import { SceneBackground } from '@/components/SceneBackground';
import { BallLoader } from '@/components/BallLoader';
import { OpponentSelectScene, type Opponent } from '@/components/scenes/OpponentSelectScene';
import { TargetRevealScene } from '@/components/scenes/TargetRevealScene';
import { TargetBuildScene } from '@/components/scenes/TargetBuildScene';
import { TargetDraftScene } from '@/components/scenes/TargetDraftScene';
import { TargetResultScene } from '@/components/scenes/TargetResultScene';
import { TargetXrayOverlay } from '@/components/scenes/TargetXrayOverlay';
import { SoundToggle } from '@/components/SoundToggle';
import { UserMenu } from '@/components/UserMenu';
import { NameModal } from '@/components/NameModal';
import { useSfx } from '@/lib/useSfx';
import { useGameSession } from '@/lib/GameSessionProvider';
import { useProfileStore } from '@/lib/profileStore';
import { createPRNG } from '@futbol-kart/game-engine';
import { TARGET_PICK_SECONDS, TARGET_DRAFT_SECONDS } from '@futbol-kart/game-engine';
import { useOnlineTargetMatch } from '@/lib/useOnlineTargetMatch';
import {
  pruneTargetCriteria,
  pickTarget,
  emptyPicks,
  buildAutoTarget,
  autoFillTarget,
  scoreTarget,
  compareToTarget,
  snakeDraftOrder,
  draftedTargetIds,
  firstEmptySlot,
  autoPickForTargetDraft,
  type TargetPicks,
  type TargetCriterion,
} from '@/lib/targetMode';

type Phase = 'opponent' | 'reveal-target' | 'build' | 'draft' | 'result';

/**
 * "Hedefe Yaklaş" modu — Bota karşı (kör build) + Arkadaşa karşı (snake draft)
 * + ONLINE (sunucu-otoriteli, gerçek rakip). 5 oyuncu seç, toplamı hedefe
 * (60–80) yaklaştır; en yakın kazanır.
 *
 * Online entegrasyonu VS Düello desenini izler (`?online=1` → matchId →
 * `useOnlineTargetMatch`). Offline akış (bota/arkadaşa karşı) tamamen korunur;
 * tüm online kod `isOnline` ile gate'lidir. Bkz PLAN.md §19.
 */
export default function TargetGamePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useGameSession();

  // ── ONLINE TESPİTİ (VS Düello deseni) ──────────────────────────────────────
  // ?online=1 ise gameId aslında matchId'dir. matchId null → useOnlineTargetMatch
  // fetch yapmaz, offline yerel akış çalışır.
  const isOnline = searchParams.get('online') === '1';
  const matchId = isOnline ? params.gameId : null;
  const online = useOnlineTargetMatch(matchId);

  // Her oyun OTURUMUNDA değişen tohum — kriter seçimi buna bağlı (OFFLINE).
  const [roundSeed, setRoundSeed] = useState(() => Math.random().toString(36).slice(2));

  // OFFLINE kriter (roundSeed'e bağlı deterministik rastgele).
  const offlineCriterion: TargetCriterion = useMemo(() => {
    const healthy = pruneTargetCriteria(session.players);
    const prng = createPRNG(`target:${params.gameId}:${roundSeed}`);
    return healthy[Math.floor(prng.next() * healthy.length)] ?? healthy[0]!;
  }, [session.players, params.gameId, roundSeed]);

  // ONLINE kriter: sunucu state'indeki criterionId'den TAM kriteri (metric'li)
  // client havuzundan yeniden çöz (sahneler metric fonksiyonu bekliyor).
  const onlineCriterion: TargetCriterion | null = useMemo(() => {
    const cid = online.state?.criterionId;
    if (!cid) return null;
    const healthy = pruneTargetCriteria(session.players);
    return healthy.find((c) => c.id === cid) ?? null;
  }, [online.state?.criterionId, session.players]);

  // Etkin kriter: online'da sunucununki, offline'da yerel. Online'da henüz
  // çözülmediyse offline'a düşme (loading guard zaten render'ı engeller).
  const criterion = isOnline ? (onlineCriterion ?? offlineCriterion) : offlineCriterion;

  const playersById = useMemo(
    () => new Map(session.players.map((p) => [p.id, p])),
    [session.players],
  );

  const playSfx = useSfx();
  const [phase, setPhase] = useState<Phase>('opponent');
  const [opponent, setOpponent] = useState<Opponent>('vs-bot');
  const [target, setTarget] = useState<number>(70);
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [p1Picks, setP1Picks] = useState<TargetPicks>(() => emptyPicks());
  const [p2Picks, setP2Picks] = useState<TargetPicks>(() => emptyPicks());

  // -------- Hot-seat isim + snake draft state'i (OFFLINE) --------
  const profileP1 = useProfileStore((s) => s.p1Name);
  const profileP2 = useProfileStore((s) => s.p2Name);
  const setProfileNames = useProfileStore((s) => s.setNames);
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');
  // Snake sırası (10 adım = 5 slot × 2). draftStep = mevcut adım indeksi.
  const draftOrder = useMemo(() => snakeDraftOrder('P1'), []);
  const [draftStep, setDraftStep] = useState(0);
  const draftActiveSide = draftOrder[draftStep] ?? 'P1';

  // -------- Röntgen jokeri state'i --------
  // OFFLINE: maç başına 1×/taraf. ONLINE: hak sunucuda; overlay için değer tutulur.
  const [xrayUsed, setXrayUsed] = useState<{ P1: boolean; P2: boolean }>({
    P1: false,
    P2: false,
  });
  const [xrayArmed, setXrayArmed] = useState(false);
  const [xrayPlayerId, setXrayPlayerId] = useState<string | null>(null);
  // Röntgenlenen oyuncu hangi tarafça açıldı (hak düşürme + kabulde slot için).
  const [xraySide, setXraySide] = useState<'P1' | 'P2'>('P1');
  // ONLINE: sunucudan dönen röntgen değeri (overlay'de gösterilir).
  const [onlineXrayValue, setOnlineXrayValue] = useState<number | null>(null);

  // -------- ONLINE optimistic pick --------
  // Online'da seçim sunucuya POST edilir; state ~1-2sn sonra geri gelir. O ana
  // kadar slot boş kalırsa kart "bir anda ışınlanıyor" gibi takılma hissi olur.
  // ÇÖZÜM: tıklama anında seçilen kartı OPTIMISTIC olarak kendi tarafının ilk
  // boş slotuna yerleştir (anında dolu görünür + havuzdan çıkar). Sunucudan yeni
  // draftStep gelince (pick işlendi) optimistic temizlenir. `pendingStep` =
  // optimistic'i koyduğumuz andaki draftStep; sunucu bunu geçince temizle.
  const [optimisticPick, setOptimisticPick] = useState<{
    side: 'P1' | 'P2';
    playerId: string;
    pendingStep: number;
    /** Seçim anında açılan optimistic yeni-tur deadline'ı (epoch ms). Sayaç buna
     *  kilitlenir → "1sn sonra süre refreshledi" sıçraması olmaz. */
    deadline: number;
  } | null>(null);

  // Joker hakları sıfırla (yeni maç / yeniden oyna / geri).
  const resetXray = useCallback(() => {
    setXrayUsed({ P1: false, P2: false });
    setXrayArmed(false);
    setXrayPlayerId(null);
    setOnlineXrayValue(null);
  }, []);

  // Yeni maç / yeniden oyna (OFFLINE): yeni kriter (roundSeed) + havuz seed.
  const freshTarget = useCallback(() => {
    setRoundSeed(Math.random().toString(36).slice(2));
    setShuffleSeed(Math.floor(Math.random() * 1e9));
    setP1Picks(emptyPicks());
    setP2Picks(emptyPicks());
    setDraftStep(0);
    resetXray();
  }, [resetXray]);

  // Hedef değeri DAİMA güncel criterion'a göre (OFFLINE).
  useEffect(() => {
    if (isOnline) return; // online'da hedef sunucudan gelir
    const prng = createPRNG(`${params.gameId}:${roundSeed}:tgt`);
    setTarget(pickTarget(offlineCriterion, () => prng.next()));
  }, [offlineCriterion, params.gameId, roundSeed, isOnline]);

  // Rakip seçildi → hedef çarkına geç (OFFLINE; online'da bu ekran gösterilmez).
  const onPickOpponent = useCallback(
    (opp: Opponent) => {
      setOpponent(opp);
      freshTarget();
      setPhase('reveal-target');
    },
    [freshTarget],
  );

  // Online eşleşmeye git (mod-özel kuyruk).
  const onOnline = useCallback(() => {
    router.push('/online?mode=hedef');
  }, [router]);

  // Hedef çarkı bitti → bota karşı build, arkadaşa karşı snake draft (OFFLINE).
  const onTargetRevealed = useCallback(() => {
    setPhase(opponent === 'hotseat' ? 'draft' : 'build');
  }, [opponent]);

  // ---- Bota karşı (build) ---- (OFFLINE)
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

  const submitWith = useCallback(
    (finalP1: TargetPicks) => {
      const prng = createPRNG(`${params.gameId}-tg-bot`);
      const excludeIds = new Set(finalP1.filter((v): v is string => v !== null));
      const botPicks = buildAutoTarget(
        offlineCriterion,
        session.players,
        excludeIds,
        target,
        () => prng.next(),
      );
      setP2Picks(botPicks);
      setPhase('result');
    },
    [params.gameId, offlineCriterion, session.players, target],
  );

  const onSubmit = useCallback(() => submitWith(p1Picks), [submitWith, p1Picks]);

  const onBuildTimeout = useCallback(() => {
    const prng = createPRNG(`${params.gameId}-tg-auto`);
    const filled = autoFillTarget(
      p1Picks,
      offlineCriterion,
      session.players,
      new Set<string>(),
      () => prng.next(),
    );
    setP1Picks(filled);
    submitWith(filled);
  }, [params.gameId, p1Picks, offlineCriterion, session.players, submitWith]);

  // ---- Arkadaşa karşı (snake draft) ---- (OFFLINE)
  const applyDraftPick = useCallback(
    (side: 'P1' | 'P2', playerId: string) => {
      const setter = side === 'P1' ? setP1Picks : setP2Picks;
      setter((prev) => {
        const next = [...prev];
        const slot = firstEmptySlot(next);
        if (slot >= 0) next[slot] = playerId;
        return next;
      });
      setDraftStep((s) => {
        const nextStep = s + 1;
        if (nextStep >= draftOrder.length) setPhase('result');
        return nextStep;
      });
    },
    [draftOrder.length],
  );

  const onDraftSelectOffline = useCallback(
    (playerId: string) => applyDraftPick(draftActiveSide, playerId),
    [applyDraftPick, draftActiveSide],
  );

  const onDraftTimeoutOffline = useCallback(() => {
    const prng = createPRNG(`${params.gameId}-tg-draft-${draftStep}`);
    const myPicks = draftActiveSide === 'P1' ? p1Picks : p2Picks;
    const excluded = draftedTargetIds(p1Picks, p2Picks);
    const auto = autoPickForTargetDraft(
      myPicks,
      offlineCriterion,
      session.players,
      excluded,
      () => prng.next(),
    );
    if (auto) applyDraftPick(draftActiveSide, auto.playerId);
  }, [params.gameId, draftStep, draftActiveSide, p1Picks, p2Picks, offlineCriterion, session.players, applyDraftPick]);

  // ============================================================================
  // ONLINE türev değerler (sunucu state'inden) — render'da kullanılır.
  // ============================================================================
  const onlineState = online.state;
  const onlineActiveSide: 'P1' | 'P2' =
    onlineState && onlineState.scene === 'DRAFT'
      ? (onlineState.draftOrder[onlineState.draftStep] ?? 'P1')
      : 'P1';
  const isMyTurn = isOnline ? online.yourSide === onlineActiveSide : true;
  // Online draft sayacı SUNUCU DEADLINE'ına kilitlenir (CountdownRing deadlineMs).
  // `seconds` yalnız halka tam-oranı referansı (sabit TARGET_DRAFT_SECONDS); kalan
  // süre `deadline - now`'dan gelir → iki tarafta EŞ akar + optimistic seçimde
  // "süre 40'a sıçradı" sorunu biter (sunucu yeni deadline yazınca pürüzsüz geçer).
  const onlineDeadlineMs = useMemo(
    () => (online.turnDeadline ? new Date(online.turnDeadline).getTime() : null),
    [online.turnDeadline],
  );
  // Optimistic seçim sırasında sayacın kilitleneceği optimistic deadline.
  const optimisticDeadlineMs = optimisticPick?.deadline ?? null;

  // Online draft seçim: OPTIMISTIC anında slota koy + sunucuya yolla. Sunucu
  // aktif tarafı + kart geçerliliğini doğrular; reddederse (422) bir sonraki
  // refresh optimistic'i geri alır (state aynı kalır → optimistic temizlenir).
  const onDraftSelectOnline = useCallback(
    (playerId: string) => {
      if (!onlineState) return;
      setOptimisticPick({
        side: onlineActiveSide,
        playerId,
        pendingStep: onlineState.draftStep,
        // Optimistic yeni-tur deadline'ı: sayaç anında taze süreyle başlar.
        deadline: Date.now() + TARGET_DRAFT_SECONDS * 1000,
      });
      void online.draftPick(playerId);
    },
    [online, onlineState, onlineActiveSide],
  );

  // Sunucu state'i ilerleyince (draftStep değişti) VEYA sahne değişince optimistic
  // pick'i temizle — gerçek state artık seçimi içeriyor. RESULT'a geçince de temizle.
  useEffect(() => {
    if (!optimisticPick || !onlineState) return;
    if (
      onlineState.draftStep !== optimisticPick.pendingStep ||
      onlineState.scene !== 'DRAFT'
    ) {
      setOptimisticPick(null);
    }
  }, [onlineState, optimisticPick]);

  // Optimistic pick'i sunucu pick dizilerine giydir (TargetDraftScene'e böyle
  // augment edilmiş diziler geçer → kart anında dolu görünür, sahne değişmez).
  const optimisticPicks = useMemo((): {
    p1: TargetPicks;
    p2: TargetPicks;
  } => {
    if (!onlineState) return { p1: emptyPicks(), p2: emptyPicks() };
    const p1 = [...onlineState.p1Picks];
    const p2 = [...onlineState.p2Picks];
    if (optimisticPick) {
      const arr = optimisticPick.side === 'P1' ? p1 : p2;
      // Zaten sunucuda yoksa ilk boş slota optimistic koy (çift yerleşme önle).
      const already = arr.includes(optimisticPick.playerId);
      const slot = firstEmptySlot(arr);
      if (!already && slot >= 0) arr[slot] = optimisticPick.playerId;
    }
    return { p1, p2 };
  }, [onlineState, optimisticPick]);

  // Online röntgen: jokeri kullan (sunucudan değer al → overlay).
  const onXrayPickOnline = useCallback(
    (playerId: string) => {
      setXrayPlayerId(playerId);
      setXrayArmed(false);
      playSfx('joker'); // röntgen jokeri power-up sesi
      void online.useXray(playerId).then((v) => setOnlineXrayValue(v));
    },
    [online, playSfx],
  );

  // ---- Röntgen jokeri (OFFLINE) ----
  const xraySideNow: 'P1' | 'P2' = phase === 'draft' ? draftActiveSide : 'P1';
  // Online'da kendi tarafımın hakkı sunucuda; basitçe sıram + henüz kullanmadıysam.
  const xrayAvailable = isOnline
    ? !!onlineState &&
      onlineState.scene === 'DRAFT' &&
      isMyTurn &&
      !onlineState.xrayUsed[online.yourSide ?? 'P1']
    : !xrayUsed[xraySideNow];

  const onToggleXray = useCallback(() => {
    setXrayArmed((a) => {
      if (a) return false;
      return xrayAvailable ? true : false;
    });
  }, [xrayAvailable]);

  // OFFLINE armed iken karta dokunma.
  const onXrayPickOffline = useCallback(
    (playerId: string) => {
      setXrayPlayerId(playerId);
      setXraySide(xraySideNow);
      setXrayArmed(false);
      setXrayUsed((u) => ({ ...u, [xraySideNow]: true }));
      playSfx('joker'); // röntgen jokeri power-up sesi
    },
    [xraySideNow, playSfx],
  );

  // Overlay "Kadroya kat".
  const onXrayAccept = useCallback(() => {
    if (!xrayPlayerId) return;
    if (isOnline) {
      // Online: röntgenlenen kartı normal draft pick olarak gönder (OPTIMISTIC).
      onDraftSelectOnline(xrayPlayerId);
      setXrayPlayerId(null);
      setOnlineXrayValue(null);
      return;
    }
    if (xraySide === 'P1' && phase === 'build') {
      setP1Picks((prev) => {
        const next = [...prev];
        const slot = firstEmptySlot(next);
        if (slot >= 0) next[slot] = xrayPlayerId;
        return next;
      });
    } else {
      applyDraftPick(xraySide, xrayPlayerId);
    }
    setXrayPlayerId(null);
  }, [xrayPlayerId, xraySide, phase, applyDraftPick, isOnline, onDraftSelectOnline]);

  const onXrayDismiss = useCallback(() => {
    setXrayPlayerId(null);
    setOnlineXrayValue(null);
  }, []);

  const xrayPlayer = useMemo(
    () => (xrayPlayerId ? playersById.get(xrayPlayerId) ?? null : null),
    [xrayPlayerId, playersById],
  );

  // İsim modalı onayı (hot-seat).
  const onNamesSubmit = useCallback(
    (n1: string, n2: string) => {
      setP1Name(n1);
      setP2Name(n2);
      setProfileNames(n1, n2);
    },
    [setProfileNames],
  );

  // Yeniden oyna: OFFLINE yeni hedef çarkı; ONLINE yeni eşleşme (VS Düello deseni).
  const onRematch = useCallback(() => {
    if (isOnline) {
      router.push('/online?mode=hedef');
      return;
    }
    freshTarget();
    setPhase('reveal-target');
  }, [isOnline, router, freshTarget]);

  // Faz-bilinçli "← Geri" (OFFLINE). ONLINE'da maçtan çıkış = ana sayfa.
  const onBack = useCallback(() => {
    if (isOnline) {
      router.push('/');
      return;
    }
    switch (phase) {
      case 'opponent':
        router.push(`/oyna/${params.gameId}`);
        break;
      case 'reveal-target':
      case 'build':
      case 'draft':
      case 'result':
        setP1Picks(emptyPicks());
        setP2Picks(emptyPicks());
        setDraftStep(0);
        resetXray();
        setPhase('opponent');
        break;
    }
  }, [isOnline, phase, router, params.gameId, resetXray]);

  // OFFLINE kazanan.
  const offlineWinner = useMemo(() => {
    if (phase !== 'result') return 'tie' as const;
    const p1 = scoreTarget(p1Picks, offlineCriterion, playersById);
    const p2 = scoreTarget(p2Picks, offlineCriterion, playersById);
    return compareToTarget(p1.total, p2.total, target);
  }, [phase, p1Picks, p2Picks, offlineCriterion, playersById, target]);

  const usedByBot = useMemo(
    () => new Set(p2Picks.filter((v): v is string => v !== null)),
    [p2Picks],
  );

  // ── BG anahtarı (online: sunucu sahnesine göre) ──
  const onlineBg =
    onlineState?.scene === 'REVEAL_TARGET'
      ? 'handoff'
      : onlineState?.scene === 'DRAFT'
        ? 'pick'
        : 'final';
  const offlineBg =
    phase === 'opponent'
      ? 'mode'
      : phase === 'reveal-target'
        ? 'handoff'
        : phase === 'build' || phase === 'draft'
          ? 'pick'
          : 'final';
  const bgKey = isOnline ? onlineBg : offlineBg;

  // Hot-seat draft başında isim modalı (isimler boşken) — OFFLINE.
  const draftNameModalOpen = !isOnline && phase === 'draft' && p1Name === '';

  // ── ONLINE LOADING / ERROR GUARD (VS Düello deseni) ──
  // State yüklenene + oyuncu verisi gelene kadar BallLoader. Online'da yerel
  // "opponent" sahnesi ASLA görünmez (sunucu otoriter).
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

  // Online isimler (sunucu state'inden).
  const onP1Name = onlineState?.p1Name ?? 'Oyuncu 1';
  const onP2Name = onlineState?.p2Name ?? 'Oyuncu 2';

  return (
    <>
      <SceneBackground bgKey={bgKey} />
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
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
              Hedefe Yaklaş ·{' '}
              {isOnline ? '🌐 Online' : opponent === 'hotseat' ? 'Arkadaşa karşı' : 'Bota karşı'}
            </span>
            <SoundToggle />
            <UserMenu />
          </div>
        </header>

        {/* ====================== ONLINE RENDER ====================== */}
        {isOnline && onlineState && (
          <AnimatePresence mode="wait">
            {onlineState.scene === 'REVEAL_TARGET' && (
              <SceneShell sceneKey="target-online-reveal" key="target-online-reveal">
                <TargetRevealScene
                  target={onlineState.target}
                  criterion={criterion}
                  onDone={online.ackReveal}
                />
              </SceneShell>
            )}

            {onlineState.scene === 'DRAFT' && (
              <SceneShell sceneKey="target-online-draft" key="target-online-draft">
                <TargetDraftScene
                  criterion={criterion}
                  target={onlineState.target}
                  pool={session.players}
                  p1Name={onP1Name}
                  p2Name={onP2Name}
                  // OPTIMISTIC: seçilen kart sunucu yanıtını beklemeden slotta
                  // görünür (ışınlanma/takılma hissi yok). Sunucu pick'i işleyince
                  // (draftStep ilerler) optimistic temizlenir, gerçek state oturur.
                  p1Picks={optimisticPicks.p1}
                  p2Picks={optimisticPicks.p2}
                  activeSide={onlineActiveSide}
                  stepIndex={onlineState.draftStep}
                  seconds={TARGET_DRAFT_SECONDS}
                  // Sayaç sunucu deadline'ına kilitli. Optimistic seçimde (sunucu
                  // henüz yeni turu açmadı) deadline'ı YENİ tura OPTIMISTIC kaydır
                  // (now + tam süre) → sayaç anında yeni tura geçmiş gibi pürüzsüz
                  // başlar; sunucu gerçek deadline'ı gelince ~aynı değerde olduğu
                  // için sıçrama/"1sn sonra refresh" hissi gitmiş olur.
                  deadlineMs={
                    optimisticPick ? optimisticDeadlineMs : onlineDeadlineMs
                  }
                  // Sıra-tabanlı: yalnız BENİM sıramda + optimistic beklemiyorken
                  // seçim aktif. Aksi halde sahne `locked` ile uyarı verir.
                  onSelect={
                    isMyTurn && !optimisticPick ? onDraftSelectOnline : () => {}
                  }
                  // Sıra bende değil VEYA optimistic gönderiliyor → kilitli (kart
                  // tıklaması uyarı verir, seçim gitmez). waitingLabel joker barında.
                  locked={!isMyTurn || !!optimisticPick}
                  waitingLabel={
                    optimisticPick
                      ? '✓ Seçimin gönderiliyor…'
                      : !isMyTurn
                        ? `Rakip seçiyor… (sıra ${onlineActiveSide === 'P1' ? onP1Name : onP2Name})`
                        : null
                  }
                  // Süre dolumunu SUNUCU yönetir (lazy timeout). Client onTimeout
                  // tetiklerse sadece tazele — sunucu otomatik pick'i uygular.
                  onTimeout={() => void online.refresh()}
                  xrayAvailable={xrayAvailable}
                  xrayArmed={xrayArmed && isMyTurn}
                  onToggleXray={onToggleXray}
                  onXrayPick={onXrayPickOnline}
                />
              </SceneShell>
            )}

            {onlineState.scene === 'RESULT' && (
              <SceneShell sceneKey="target-online-result" key="target-online-result">
                <TargetResultScene
                  criterion={criterion}
                  target={onlineState.target}
                  p1Picks={onlineState.p1Picks}
                  p2Picks={onlineState.p2Picks}
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
              <SceneShell sceneKey="target-opponent" key="target-opponent">
                <OpponentSelectScene
                  modeName="Hedefe Yaklaş"
                  available={{ hotseat: true, vsBot: true }}
                  onPick={onPickOpponent}
                  onOnline={onOnline}
                />
              </SceneShell>
            )}

            {phase === 'reveal-target' && (
              <SceneShell sceneKey="target-reveal" key="target-reveal">
                <TargetRevealScene
                  target={target}
                  criterion={offlineCriterion}
                  onDone={onTargetRevealed}
                />
              </SceneShell>
            )}

            {phase === 'build' && (
              <SceneShell sceneKey="target-build" key="target-build">
                <TargetBuildScene
                  criterion={offlineCriterion}
                  target={target}
                  pool={session.players}
                  picks={p1Picks}
                  excludeIds={usedByBot}
                  shuffleSeed={shuffleSeed}
                  seconds={TARGET_PICK_SECONDS}
                  onPick={onPick}
                  onSubmit={onSubmit}
                  onTimeout={onBuildTimeout}
                  xrayAvailable={xrayAvailable}
                  xrayArmed={xrayArmed}
                  onToggleXray={onToggleXray}
                  onXrayPick={onXrayPickOffline}
                />
              </SceneShell>
            )}

            {phase === 'draft' && !draftNameModalOpen && (
              <SceneShell sceneKey="target-draft" key="target-draft">
                <TargetDraftScene
                  criterion={offlineCriterion}
                  target={target}
                  pool={session.players}
                  p1Name={p1Name || 'Oyuncu 1'}
                  p2Name={p2Name || 'Oyuncu 2'}
                  p1Picks={p1Picks}
                  p2Picks={p2Picks}
                  activeSide={draftActiveSide}
                  stepIndex={draftStep}
                  seconds={TARGET_DRAFT_SECONDS}
                  onSelect={onDraftSelectOffline}
                  onTimeout={onDraftTimeoutOffline}
                  xrayAvailable={xrayAvailable}
                  xrayArmed={xrayArmed}
                  onToggleXray={onToggleXray}
                  onXrayPick={onXrayPickOffline}
                />
              </SceneShell>
            )}

            {phase === 'result' && (
              <SceneShell sceneKey="target-result" key="target-result">
                <TargetResultScene
                  criterion={offlineCriterion}
                  target={target}
                  p1Picks={p1Picks}
                  p2Picks={p2Picks}
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

      {/* Röntgen jokeri overlay'i — bir kartın gizli değerini açar.
          ONLINE: değer sunucudan gelir; overlay'i DEĞER HAZIR OLUNCA aç (yoksa
          önce "0" görünüp ~1sn sonra düzeliyordu). Değer beklenirken jokere
          basılan karta küçük "hesaplanıyor" rozeti gösterilir (aşağıda). */}
      <AnimatePresence>
        {xrayPlayer && (!isOnline || onlineXrayValue !== null) && (
          <TargetXrayOverlay
            player={xrayPlayer}
            value={
              isOnline
                ? (onlineXrayValue ?? 0)
                : (criterion.metric(xrayPlayer) ?? 0)
            }
            unit={criterion.unit}
            onAccept={onXrayAccept}
            onDismiss={onXrayDismiss}
          />
        )}
      </AnimatePresence>

      {/* ONLINE röntgen "hesaplanıyor" göstergesi — değer gelene kadar (overlay
          henüz açılmadan) kullanıcıya jokerin çalıştığını bildirir (0 yanıp sönmesi
          yerine net bekleme). Değer gelince yukarıdaki overlay açılır, bu kaybolur. */}
      <AnimatePresence>
        {isOnline && xrayPlayer && onlineXrayValue === null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-accent-gold/40 bg-zinc-900/90 px-8 py-6 shadow-glow-gold">
              <span className="text-3xl animate-pulse">🔍</span>
              <span className="text-sm font-bold text-accent-goldHi">
                Değer açılıyor…
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hot-seat draft isim modalı (OFFLINE) */}
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
