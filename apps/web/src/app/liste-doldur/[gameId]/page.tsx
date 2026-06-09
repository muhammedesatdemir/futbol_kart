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

  // ── ONLINE tahmin akışı: pendingGuess + RESULT-HOLD ──
  // Sorun: tahmin POST'u (DB) ~1-3sn sürer + sunucu sırayı ANINDA karşı tarafa
  // geçirir → ses/görsel/kalp animasyonu yarım kalır, uyarı karşı tarafa taşar.
  // ÇÖZÜM (resultHold): POST yanıtı (outcome = SUNUCU hesabı) gelince ~2.8sn'lik
  // bir "sonuç gösterme penceresi" açılır. Bu pencerede sıra geçişi GÖRSEL olarak
  // ERTELENİR: panel/uyarı/kalp/rozet TAHMİNİ YAPAN tarafta net görünür (karşıya
  // taşmaz). Pencere bitince gerçek sunucu state'i (karşı taraf) gösterilir.
  // Sunucu otoritesi değişmez (sıra zaten geçti) — yalnız client görsel geçişi geciktirir.
  const [pendingGuess, setPendingGuess] = useState<string | null>(null);
  const [resultHold, setResultHold] = useState<{
    /** Tahmini yapan taraf — hold boyunca panel/rozet burada gösterilir. */
    side: ListSide;
    kind: 'hit' | 'miss';
    /** hit: açılan sıra (anlık göster); miss: yok. */
    fill?: { rank: number; playerId: string; value: number };
    /** Bu tahmin sonrası canlar (kalp animasyonu + panel). */
    lives: { P1: number; P2: number };
    /** hit puanı (rozet). */
    points?: number;
    /** Bu hamleyle elenme: 'first' (rakip devam) | 'last' (maç bitti) | null. */
    eliminated: 'first' | 'last' | null;
  } | null>(null);
  const HOLD_MS = 2800;

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

  // ── Maç başı / sonu hakem düdüğü — maçta YALNIZ BİRER kez (ref'le garanti) ──
  // Başlangıç: kriter/liste ekranı (reveal) ilk göründüğünde.
  // Bitiş: son seçimle result fazına geçişte (sonuç ekranı GÖRÜNMEDEN).
  // Tur arası / tahmin / süre dolumu gibi anlarda ASLA çalmaz.
  const whistleStartedRef = useRef(false);
  const whistleEndedRef = useRef(false);
  const activeListScene = isOnline ? onlineState?.scene : phase;
  useEffect(() => {
    const isReveal = activeListScene === (isOnline ? 'REVEAL_LIST' : 'reveal-list');
    const isResult = activeListScene === (isOnline ? 'RESULT' : 'result');
    if (isReveal && !whistleStartedRef.current) {
      whistleStartedRef.current = true;
      playSfx('whistleStart');
    }
    if (isResult && !whistleEndedRef.current) {
      whistleEndedRef.current = true;
      playSfx('whistleEnd');
    }
  }, [activeListScene, isOnline, playSfx]);

  // RESULT-HOLD süresi dolunca temizle → gerçek sunucu state (karşı taraf) görünür.
  useEffect(() => {
    if (!resultHold) return;
    const t = setTimeout(() => {
      setResultHold(null);
      void online.refresh(); // hold sonrası en güncel state'i çek (sıra karşıda)
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, [resultHold, online]);
  // Maç RESULT'a geçince hold'u hemen bırak (sonuç ekranı gelsin).
  useEffect(() => {
    if (onlineState?.scene === 'RESULT' && resultHold) setResultHold(null);
  }, [onlineState?.scene, resultHold]);

  // ONLINE açılmış sıralar: Record → Map (+ hold'daki hit'in açtığı sıra anlık).
  const onlineFilledBy = useMemo(() => {
    const m = new Map<number, ListSide>();
    if (onlineState) {
      for (const [rank, side] of Object.entries(onlineState.filledBy)) {
        m.set(Number(rank), side);
      }
    }
    if (resultHold?.fill && !m.has(resultHold.fill.rank)) {
      m.set(resultHold.fill.rank, resultHold.side);
    }
    return m;
  }, [onlineState, resultHold]);
  const onlineFilledPlayer = useMemo(() => {
    const m = new Map<number, string>();
    if (onlineState) {
      for (const [rank, pid] of Object.entries(onlineState.filledPlayer)) {
        m.set(Number(rank), pid);
      }
    }
    if (resultHold?.fill && !m.has(resultHold.fill.rank)) {
      m.set(resultHold.fill.rank, resultHold.fill.playerId);
    }
    return m;
  }, [onlineState, resultHold]);
  // ONLINE açık sıra değerleri (+ hold) — ListPlayScene valueByRank için.
  const onlineValueByRank = useMemo(() => {
    const out: Record<number, number> = { ...(onlineState?.filledValue ?? {}) };
    if (resultHold?.fill && out[resultHold.fill.rank] == null) {
      out[resultHold.fill.rank] = resultHold.fill.value;
    }
    return out;
  }, [onlineState, resultHold]);
  // ONLINE canlar — hold varsa hold'un (azalmış) canlarını göster, yoksa sunucu.
  const onlineLives = resultHold?.lives ?? onlineState?.lives ?? { P1: LIST_LIVES, P2: LIST_LIVES };
  // Görsel aktif taraf — HOLD sırasında tahmini YAPAN tarafta kal (karşıya taşma);
  // hold yoksa gerçek sunucu sırası.
  const displayActiveSide: ListSide =
    resultHold?.side ?? onlineState?.activeSide ?? 'P1';

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

  // ONLINE tahmin — ANLIK SENKRON feedback (Hedefe/Kadro optimistic deseninin
  // liste karşılığı). Tıklama anında "kontrol ediliyor" + kilit; POST yanıtı
  // (outcome = SUNUCU hesabı) gelince ses + görsel (sıra açılma / can azalma)
  // AYNI ANDA oynar — refresh beklenmez. Optimistic, sunucu state'i gelince temizlenir.
  const onGuessOnline = useCallback(
    (playerId: string) => {
      if (!onlineState || pendingGuess || resultHold) return; // çift/hold engeli
      const side = onlineState.activeSide;
      setPendingGuess(playerId);
      void online.guess(playerId).then((outcome) => {
        setPendingGuess(null);
        if (!outcome) {
          // 409/422 yutuldu (örn. sıra geçti) → sessizce tazele.
          void online.refresh();
          return;
        }
        // RESULT-HOLD aç: sonuç ~2.8sn TAHMİNİ YAPAN tarafta net gösterilir
        // (sıra görsel olarak geçmez). Ses bu anla senkron. Hold bitince effect
        // temizler + refresh → gerçek sıra (karşı taraf).
        // ELENME türü: tahmini yapan elendiyse → rakip de 0 ise 'last' (maç bitti,
        // sonuçlara geçilir), rakip canlıysa 'first' (rakip tek başına devam).
        const other: ListSide = side === 'P1' ? 'P2' : 'P1';
        const meEliminated = !outcome.hit && outcome.lives[side] <= 0;
        const eliminated: 'first' | 'last' | null = meEliminated
          ? outcome.lives[other] <= 0
            ? 'last'
            : 'first'
          : null;
        setResultHold({
          side,
          kind: outcome.hit ? 'hit' : 'miss',
          fill:
            outcome.hit && outcome.rank != null
              ? { rank: outcome.rank, playerId, value: outcome.value ?? 0 }
              : undefined,
          lives: outcome.lives,
          points: outcome.hit ? (outcome.rank ?? 0) : undefined,
          eliminated,
        });
        playSfx(outcome.hit ? 'win' : 'heartbreak');
        scrollTop();
      });
    },
    [online, onlineState, pendingGuess, resultHold, playSfx, scrollTop],
  );

  // ONLINE süre dolumu — yanlış tahminle SİMETRİK (kullanıcı isteği): süre bitince
  // de heartbreak sesi + kalp kırılma animasyonu + "Listede yok / Elendin" rozeti +
  // kısa bekleme (resultHold) gösterilir, sonra sıra geçer. Eskiden yalnız refresh
  // edildiği için hiçbir görsel/ses olmadan hızlıca rakibe geçiyordu.
  //
  // Sunucu pas'ı LAZY işler (deadline geçince aktif tarafın canı −1, sıra geçer) —
  // bu KURAL DETERMİNİSTİK olduğundan client, sunucu teyidini beklemeden hold'u
  // güvenle kurar (can −1). Hold bitince effect (RESULT-HOLD) refresh çağırır →
  // gerçek sunucu state'i (sıra karşıda) gelir; sunucu aynı sonucu üretir.
  const onTimeoutOnline = useCallback(() => {
    if (!onlineState || pendingGuess || resultHold) return; // çift/erken tetik engeli
    const side = onlineState.activeSide;
    const curLives = onlineState.lives;
    const nextLives = { ...curLives, [side]: Math.max(0, curLives[side] - 1) };
    const other: ListSide = side === 'P1' ? 'P2' : 'P1';
    const meEliminated = nextLives[side] <= 0;
    const eliminated: 'first' | 'last' | null = meEliminated
      ? nextLives[other] <= 0
        ? 'last'
        : 'first'
      : null;
    setResultHold({
      side,
      kind: 'miss',
      lives: nextLives,
      eliminated,
    });
    playSfx('heartbreak');
    scrollTop();
  }, [onlineState, pendingGuess, resultHold, playSfx, scrollTop]);

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
                  // Hold dahil — sıra anında açılır (refresh beklenmez).
                  filledBy={onlineFilledBy}
                  filledPlayer={onlineFilledPlayer}
                  valueByRank={onlineValueByRank}
                  seconds={LIST_TURN_SECONDS}
                  // Hold sırasında timerKey'i sabit tut (sayaç sıçramasın); hold yokken
                  // gerçek sıra/dolum. deadlineMs hold'da null → sayaç durur (sonuç süresi).
                  timerKey={`online-${displayActiveSide}-${onlineFilledPlayer.size}-${resultHold ? 'hold' : 'live'}`}
                  deadlineMs={resultHold ? null : onlineDeadlineMs}
                  // Tahmin: yalnız sıram + hold/pending yokken. Aksi halde kilit.
                  onGuess={isMyTurn && !pendingGuess && !resultHold ? onGuessOnline : () => {}}
                  onTimeout={onTimeoutOnline}
                  hotseat
                  // GÖRSEL aktif taraf: hold'da tahmini YAPAN tarafta kalır (karşıya taşmaz).
                  activeSide={displayActiveSide}
                  // Can — hold'da azalmış (kalp animasyonu senkron), yoksa sunucu.
                  lives={onlineLives}
                  p1Name={onP1Name}
                  p2Name={onP2Name}
                  poolCols={5}
                  compactPanel
                  // Hold süresince sayacı gizle → "35'ten sayma + sıçrama" biter.
                  hideTimer={!!resultHold}
                  // SONUÇ ROZETİ (hold süresi) — hit/miss + opsiyonel elenme, tahmini
                  // yapan tarafta net. Hold bitince kaybolur, sıra karşıya geçer.
                  resultBadge={
                    resultHold
                      ? {
                          kind: resultHold.kind,
                          points: resultHold.points,
                          eliminated: resultHold.eliminated
                            ? {
                                // 'first' → rakip tek başına devam; 'last' → maç bitti.
                                kind: resultHold.eliminated,
                                other: resultHold.side === 'P1' ? onP2Name : onP1Name,
                              }
                            : null,
                        }
                      : null
                  }
                  // Sıra bende değilse / tahmin gönderiliyor / hold sürüyorsa kilit.
                  locked={!isMyTurn || !!pendingGuess || !!resultHold}
                  waitingLabel={
                    resultHold
                      ? null // rozet zaten gösteriliyor
                      : pendingGuess
                        ? '✓ Tahminin kontrol ediliyor…'
                        : !isMyTurn
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

        {/* NOT: Elenme duyurusu artık ListPlayScene'in ResultBadge'inin ALT-ROZETİ
            (tahmini yapan tarafta, hold süresince) — ayrı üst-banner kaldırıldı
            (kötü konum + karşı tarafa taşma sorunu, kullanıcı geri bildirimi). */}

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
