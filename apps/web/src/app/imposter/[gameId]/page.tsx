'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { HomeIcon, ArrowLeftIcon } from '@/components/icons';
import { SceneShell } from '@/components/scenes/SceneShell';
import { SceneBackground } from '@/components/SceneBackground';
import { BallLoader } from '@/components/BallLoader';
import { CountdownRing } from '@/components/CountdownRing';
import { SoundToggle } from '@/components/SoundToggle';
import { UserMenu } from '@/components/UserMenu';
import { useSfx } from '@/lib/useSfx';
import { cn } from '@/lib/cn';
import { useOnlineImposterMatch } from '@/lib/useOnlineImposterMatch';
import {
  IMPOSTER_ROUNDS,
  IMPOSTER_ROLE_SECONDS,
  IMPOSTER_WORD_SECONDS,
  IMPOSTER_VOTE_SECONDS,
} from '@/lib/imposterMode';

/**
 * "İmposter" — 5 kişilik (3-5) sosyal dedüksiyon. SADECE ONLINE (v1).
 * Eşleşme sonrası: ROLE_REVEAL (rolünü gör) → WORDS (sıra-tabanlı kelime, 3 tur)
 * → VOTE (gizli oy) → RESULT (her şey açılır). İmposter NET en çok oyu almazsa kazanır.
 *
 * Gizli rol: imposter'a ipucu kelimesi, masuma futbolcu adı — her turda kenarda.
 * Tüm gizlilik SUNUCUDA (viewImposterState); client yalnız kendi view'ını alır.
 */
export default function ImposterGamePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const playSfx = useSfx();

  const isOnline = searchParams.get('online') === '1';
  const matchId = isOnline ? params.gameId : null;
  const online = useOnlineImposterMatch(matchId);
  const view = online.view;
  const me = online.yourIndex;

  const deadlineMs = useMemo(
    () => (online.turnDeadline ? new Date(online.turnDeadline).getTime() : null),
    [online.turnDeadline],
  );

  // Başlama düdüğü — ilk ROLE_REVEAL'de bir kez.
  const whistleRef = useRef(false);
  useEffect(() => {
    if (view?.scene === 'ROLE_REVEAL' && !whistleRef.current) {
      whistleRef.current = true;
      playSfx('whistleStart');
    }
  }, [view?.scene, playSfx]);

  // RESULT'ta fanfar (bir kez).
  const resultSfxRef = useRef(false);
  useEffect(() => {
    if (view?.scene === 'RESULT' && !resultSfxRef.current) {
      resultSfxRef.current = true;
      playSfx('final');
    }
  }, [view?.scene, playSfx]);

  // ── Kelime girişi (aktif oyuncu) ──
  const [wordInput, setWordInput] = useState('');
  const [wordError, setWordError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const roundScene = `${view?.scene}-${view?.round}-${view?.activeIndex}`;
  useEffect(() => {
    setWordInput('');
    setWordError(null);
  }, [roundScene]);

  const onSubmitWord = useCallback(() => {
    const w = wordInput.trim();
    if (!w || submitting) return;
    setSubmitting(true);
    setWordError(null);
    void online.submitWord(w).then((outcome) => {
      setSubmitting(false);
      if (outcome && !outcome.accepted) {
        setWordError(outcome.reason ?? 'Kelime reddedildi.');
        playSfx('heartbreak');
      } else {
        setWordInput('');
      }
    });
  }, [wordInput, submitting, online, playSfx]);

  // ── Oylama ── (yourVote null hem çekimser hem "vermedi" → yerel bayrak tut)
  const [voting, setVoting] = useState(false);
  const [myVoteCast, setMyVoteCast] = useState(false);
  // VOTE sahnesinden çıkınca (RESULT) bayrağı sıfırla (rematch için).
  useEffect(() => {
    if (view?.scene !== 'VOTE') setMyVoteCast(false);
  }, [view?.scene]);
  const onVote = useCallback(
    (target: number | null) => {
      if (voting || myVoteCast || (view && view.yourVote !== null)) return;
      playSfx('joker'); // aksiyon sesi (VS Düello joker sesi) — oy/çekimser anında
      setVoting(true);
      setMyVoteCast(true);
      void online.vote(target).then(() => setVoting(false));
    },
    [voting, myVoteCast, view, online, playSfx],
  );

  const onBack = useCallback(() => router.push('/'), [router]);
  const onRematch = useCallback(() => router.push('/online?mode=imposter'), [router]);

  // ── Guard ──
  if (!isOnline) {
    return (
      <>
        <SceneBackground bgKey="mode" />
        <main className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
          <h2 className="text-2xl font-black">İmposter yalnızca online</h2>
          <p className="text-sm text-white/65">Bu mod 3-5 oyuncuyla online oynanır.</p>
          <button type="button" onClick={() => router.push('/online?mode=imposter')} className="btn-primary">
            Online eşleş
          </button>
        </main>
      </>
    );
  }
  if (online.error) {
    return (
      <>
        <SceneBackground bgKey="mode" />
        <main className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-5 text-center">
          <h2 className="text-2xl font-black text-side-red">Maç hatası</h2>
          <p className="text-sm text-white/65">{online.error}</p>
          <button type="button" onClick={onBack} className="btn-ghost">Ana sayfa</button>
        </main>
      </>
    );
  }
  if (online.loading || !view || me === null) {
    return (
      <>
        <SceneBackground bgKey="handoff" />
        <main className="relative z-10 mx-auto flex min-h-screen flex-col items-center justify-center px-5">
          <BallLoader size={64} label="Maç yükleniyor…" />
        </main>
      </>
    );
  }

  const bgKey = view.scene === 'RESULT' ? 'final' : view.scene === 'VOTE' ? 'handoff' : 'pick';

  return (
    <>
      <SceneBackground bgKey={bgKey} />
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-8 sm:py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onBack} className="btn-ghost">
              <ArrowLeftIcon size={16} /> Geri
            </button>
            <Link href="/" className="btn-ghost" aria-label="Ana sayfa" title="Ana sayfa">
              <HomeIcon size={16} />
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-accent-gold/40 bg-accent-gold/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-goldHi">
              🕵️ İmposter · 🌐 Online
            </span>
            <SoundToggle />
            <UserMenu />
          </div>
        </header>

        {/* Kenar bilgi şeridi — kendi rolün + ipucu/futbolcu (RESULT hariç her sahnede). */}
        {view.scene !== 'RESULT' && (
          <RoleStrip
            youAreImposter={view.youAreImposter}
            clueWord={view.clueWord}
            secretPlayerName={view.secretPlayerName}
          />
        )}

        <AnimatePresence mode="wait">
          {view.scene === 'ROLE_REVEAL' && (
            <SceneShell sceneKey="imp-role" key="imp-role">
              <RoleRevealScene
                youAreImposter={view.youAreImposter}
                clueWord={view.clueWord}
                secretPlayerName={view.secretPlayerName}
                ackedCount={view.roleAcks.filter(Boolean).length}
                total={view.playerNames.length}
                acked={view.roleAcks[me] ?? false}
                onAck={() => void online.ackRole()}
                deadlineMs={deadlineMs}
              />
            </SceneShell>
          )}

          {view.scene === 'WORDS' && (
            <SceneShell sceneKey="imp-words" key="imp-words">
              <WordsScene
                view={view}
                me={me}
                wordInput={wordInput}
                setWordInput={setWordInput}
                wordError={wordError}
                submitting={submitting}
                onSubmit={onSubmitWord}
                onTimeout={() => void online.refresh()}
                deadlineMs={deadlineMs}
              />
            </SceneShell>
          )}

          {view.scene === 'VOTE' && (
            <SceneShell sceneKey="imp-vote" key="imp-vote">
              <VoteScene
                view={view}
                me={me}
                voting={voting}
                myVoteCast={myVoteCast}
                onVote={onVote}
                onTimeout={() => void online.refresh()}
                deadlineMs={deadlineMs}
              />
            </SceneShell>
          )}

          {view.scene === 'RESULT' && (
            <SceneShell sceneKey="imp-result" key="imp-result">
              <ResultScene view={view} me={me} onRematch={onRematch} />
            </SceneShell>
          )}
        </AnimatePresence>
      </main>
    </>
  );
}

/* ─── Sessiz ilerleme halkası (rol açılışı) — sayı YOK, tik-tak YOK, sadece dolan yay ─── */
function SilentProgressRing({
  deadlineMs,
  totalSeconds,
  size = 40,
}: {
  deadlineMs: number | null;
  totalSeconds: number;
  size?: number;
}) {
  const [ratio, setRatio] = useState(1); // 1 = tam dolu, 0 = bitti
  useEffect(() => {
    const totalMs = totalSeconds * 1000;
    let raf = 0;
    const tick = () => {
      const now = Date.now();
      // deadlineMs varsa ona kilitle (sunucu-otoriteli); yoksa salt görsel.
      const remainMs = deadlineMs !== null ? deadlineMs - now : totalMs;
      const r = Math.max(0, Math.min(1, remainMs / totalMs));
      setRatio(r);
      if (r > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [deadlineMs, totalSeconds]);

  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const color = '#f0c14b';
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - ratio)}
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      </svg>
    </span>
  );
}

/* ─────────────────────────── Kenar rol şeridi ─────────────────────────── */
function RoleStrip({
  youAreImposter,
  clueWord,
  secretPlayerName,
}: {
  youAreImposter: boolean;
  clueWord: string | null;
  secretPlayerName: string | null;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-2xl border px-4 py-2 text-sm',
        youAreImposter ? 'border-side-red/50 bg-side-red/10' : 'border-emerald-400/40 bg-emerald-400/10',
      )}
    >
      <span className={cn('text-xs font-bold uppercase tracking-wider', youAreImposter ? 'text-side-red' : 'text-emerald-300')}>
        {youAreImposter ? '🕵️ İmposter — sensin' : '⚽ Masum'}
      </span>
      <span className="font-black">
        {youAreImposter ? (
          <>İpucun: <span className="text-accent-goldHi">{clueWord ?? '—'}</span></>
        ) : (
          <>Futbolcu: <span className="text-emerald-300">{secretPlayerName ?? '—'}</span></>
        )}
      </span>
    </div>
  );
}

/* ─────────────────────────── ROLE_REVEAL ─────────────────────────── */
function RoleRevealScene({
  youAreImposter,
  clueWord,
  secretPlayerName,
  ackedCount,
  total,
  acked,
  onAck,
  deadlineMs,
}: {
  youAreImposter: boolean;
  clueWord: string | null;
  secretPlayerName: string | null;
  ackedCount: number;
  total: number;
  acked: boolean;
  onAck: () => void;
  deadlineMs: number | null;
}) {
  // Rol açılışı: herkes "Hazırım"a basınca HEMEN, basmasa bile ~5sn sonra başlar.
  // SESSİZ + SAYISIZ ilerleme halkası (tik-tak/sayı yok — sadece dolan yay) oyunun
  // başlamak üzere olduğunu gösterir. Asıl ilerletme sunucuda (applyImposterTimeout).
  return (
    <section className="flex flex-col items-center gap-5 py-6 text-center">
      <SilentProgressRing deadlineMs={deadlineMs} totalSeconds={IMPOSTER_ROLE_SECONDS} size={40} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          'flex w-full max-w-md flex-col items-center gap-3 rounded-3xl border-2 p-8',
          youAreImposter ? 'border-side-red/60 bg-side-red/10' : 'border-emerald-400/50 bg-emerald-400/10',
        )}
      >
        <span className="text-5xl" aria-hidden>{youAreImposter ? '🕵️' : '⚽'}</span>
        <h1 className={cn('text-2xl font-black sm:text-3xl', youAreImposter ? 'text-side-red' : 'text-emerald-300')}>
          {youAreImposter ? 'İmposter Sensin!' : 'Sen Masumsun'}
        </h1>
        {youAreImposter ? (
          <>
            <p className="text-sm text-white/70">Gizli futbolcuyu bilmiyorsun. Tek ipucun:</p>
            <div className="rounded-2xl border border-accent-gold/50 bg-accent-gold/15 px-6 py-3 text-2xl font-black text-accent-goldHi">
              {clueWord ?? '—'}
            </div>
            <p className="max-w-sm text-xs text-white/55">
              Yakalanmamak için bu ipuçla uyumlu, inandırıcı kelimeler yaz. Kimse seni şüphelenmesin.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-white/70">Gizli futbolcu:</p>
            <div className="rounded-2xl border border-emerald-400/50 bg-emerald-400/15 px-6 py-3 text-2xl font-black text-emerald-200">
              {secretPlayerName ?? '—'}
            </div>
            <p className="max-w-sm text-xs text-white/55">
              Bu futbolcuyu ima eden kelimeler yaz — ama imposter'a fazla ipucu verme. Sahte cevap vereni bul!
            </p>
          </>
        )}
      </motion.div>

      <button
        type="button"
        onClick={onAck}
        disabled={acked}
        className={cn('btn-primary px-8 py-3', acked && 'cursor-not-allowed opacity-50')}
      >
        {acked ? `Bekleniyor… (${ackedCount}/${total})` : 'Hazırım →'}
      </button>
    </section>
  );
}

/* ─────────────────────────── WORDS (sıra-tabanlı) ─────────────────────────── */
function WordsScene({
  view,
  me,
  wordInput,
  setWordInput,
  wordError,
  submitting,
  onSubmit,
  onTimeout,
  deadlineMs,
}: {
  view: NonNullable<ReturnType<typeof useOnlineImposterMatch>['view']>;
  me: number;
  wordInput: string;
  setWordInput: (v: string) => void;
  wordError: string | null;
  submitting: boolean;
  onSubmit: () => void;
  onTimeout: () => void;
  deadlineMs: number | null;
}) {
  const isMyTurn = view.activeIndex === me;
  const activeName = view.playerNames[view.activeIndex] ?? 'Oyuncu';
  const n = view.playerNames.length;

  return (
    <section className="flex flex-col items-center gap-4">
      {/* Üst: tur + sayaç + başlık */}
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-gold/30 bg-accent-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-goldHi">
          Tur {view.round + 1}/{IMPOSTER_ROUNDS} · Kelime sırası
        </span>
        <CountdownRing seconds={IMPOSTER_WORD_SECONDS} deadlineMs={deadlineMs} runKey={`words-${view.round}-${view.activeIndex}`} onComplete={onTimeout} size={48} stroke={5} color="#3b82f6" urgentColor="#ef4444" />
        <h2 className="text-base font-black sm:text-lg">
          {isMyTurn ? 'Sıra sende — bir kelime yaz' : <><span className="text-accent-goldHi">{activeName}</span> yazıyor…</>}
        </h2>
      </div>

      {/* Giriş kutusu — sürenin altında, kartların üstünde, ortada (kullanıcı isteği) */}
      {isMyTurn ? (
        <div className="flex w-full max-w-md flex-col items-center gap-1.5">
          <div className="flex w-full items-center gap-2">
            <input
              autoFocus
              value={wordInput}
              onChange={(e) => setWordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
              maxLength={24}
              placeholder="Tek/iki kelime (ad/kulüp yasak)…"
              className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-accent-gold/50"
            />
            <button type="button" onClick={onSubmit} disabled={submitting || !wordInput.trim()} className={cn('btn-primary px-5 py-2', (submitting || !wordInput.trim()) && 'cursor-not-allowed opacity-50')}>
              Gönder
            </button>
          </div>
          {wordError && <span className="text-xs font-semibold text-side-red">⚠️ {wordError}</span>}
        </div>
      ) : (
        <p className="text-center text-sm text-white/55">Sıranı bekle — diğer oyuncuların kelimelerini izle.</p>
      )}

      {/* Oyuncu kartları — yan yana, tek satır, içinde dikey kelimeler */}
      <div className="flex w-full max-w-5xl items-stretch justify-center gap-2 sm:gap-3">
        {view.playerNames.map((name, pi) => (
          <PlayerWordCard
            key={pi}
            name={name}
            colorIndex={pi}
            count={n}
            isMe={pi === me}
            isActive={pi === view.activeIndex}
            words={view.words.map((r) => r[pi]).filter((w): w is string => !!w)}
            writing={pi === view.activeIndex}
          />
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── VOTE ─────────────────────────── */
function VoteScene({
  view,
  me,
  voting,
  myVoteCast,
  onVote,
  onTimeout,
  deadlineMs,
}: {
  view: NonNullable<ReturnType<typeof useOnlineImposterMatch>['view']>;
  me: number;
  voting: boolean;
  myVoteCast: boolean;
  onVote: (t: number | null) => void;
  onTimeout: () => void;
  deadlineMs: number | null;
}) {
  // Oy verdim mi? yourVote dolu (birine oy) VEYA yerel bayrak (çekimser dahil).
  const iVoted = view.yourVote !== null || myVoteCast;
  const locked = iVoted || voting;
  const n = view.playerNames.length;

  return (
    <section className="flex flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <CountdownRing seconds={IMPOSTER_VOTE_SECONDS} deadlineMs={deadlineMs} runKey="vote" onComplete={onTimeout} size={48} stroke={5} color="#ef4444" urgentColor="#ef4444" />
        <h2 className="text-lg font-black sm:text-xl">Kim imposter? 🕵️</h2>
        <p className="text-sm text-white/60">
          {iVoted ? '✓ Oyun alındı — diğerleri bekleniyor…' : 'Şüphelendiğin oyuncunun kartına dokun.'}{' '}
          {view.votedCount}/{n} oy verildi.
        </p>
      </div>

      {/* Oyuncu kartları — yan yana tek satır, tıklanabilir (oy). Kelimeler dikey. */}
      <div className="flex w-full max-w-5xl items-stretch justify-center gap-2 sm:gap-3">
        {view.playerNames.map((name, pi) => (
          <PlayerWordCard
            key={pi}
            name={name}
            colorIndex={pi}
            count={n}
            isMe={pi === me}
            words={view.words.map((r) => r[pi]).filter((w): w is string => !!w)}
            voteable={!locked && pi !== me}
            voted={view.yourVote === pi}
            onVote={() => onVote(pi)}
          />
        ))}
      </div>

      <button
        type="button"
        disabled={locked}
        onClick={() => onVote(null)}
        className={cn('btn-ghost px-6 py-2 text-sm', locked && 'cursor-not-allowed opacity-50')}
      >
        Çekimser kal
      </button>
    </section>
  );
}

/* ─────────────── Oyuncu kartı (kelime/oylama — renkli + baş harf + dikey kelime) ─────────────── */
const CARD_COLORS = [
  { grad: 'from-side-red/85 via-side-red/35', glow: 'rgba(220,38,38,0.45)', ring: 'ring-side-red' },
  { grad: 'from-side-blue/85 via-side-blue/35', glow: 'rgba(37,99,235,0.45)', ring: 'ring-side-blue' },
  { grad: 'from-emerald-500/85 via-emerald-500/35', glow: 'rgba(16,185,129,0.45)', ring: 'ring-emerald-400' },
  { grad: 'from-amber-500/85 via-amber-500/35', glow: 'rgba(245,158,11,0.45)', ring: 'ring-amber-400' },
  { grad: 'from-purple-500/85 via-purple-500/35', glow: 'rgba(168,85,247,0.45)', ring: 'ring-purple-400' },
] as const;

function PlayerWordCard({
  name,
  colorIndex,
  count,
  isMe,
  isActive = false,
  writing = false,
  words,
  voteable = false,
  voted = false,
  onVote,
}: {
  name: string;
  colorIndex: number;
  count: number;
  isMe: boolean;
  isActive?: boolean;
  writing?: boolean;
  words: string[];
  voteable?: boolean;
  voted?: boolean;
  onVote?: () => void;
}) {
  const c = CARD_COLORS[colorIndex % CARD_COLORS.length]!;
  const initial = name.charAt(0).toLocaleUpperCase('tr-TR');
  // 3-4 kart geniş, 5 kart dar → her zaman tek satır (flex-1 eşit böl + max-w).
  const maxW = count >= 5 ? 'max-w-[118px]' : count === 4 ? 'max-w-[150px]' : 'max-w-[180px]';

  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.05 * colorIndex, type: 'spring', stiffness: 240, damping: 22 }}
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden rounded-xl border transition',
        isActive ? 'border-accent-gold/70' : voted ? 'border-side-red/80' : 'border-white/10',
        isMe && 'ring-2 ring-offset-1 ring-offset-transparent ' + c.ring,
        voteable && 'cursor-pointer hover:-translate-y-1 hover:border-side-red/60',
      )}
      style={{ boxShadow: `0 0 20px -8px ${c.glow}` }}
    >
      {/* Üst renkli bölge + baş harf */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 to-zinc-950" />
        <div className={cn('absolute inset-0 bg-gradient-to-b to-transparent', c.grad)} />
        <div className="relative z-10 flex flex-col items-center gap-1 px-1 pb-2 pt-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-base font-black text-zinc-900 shadow sm:h-10 sm:w-10">
            {initial}
          </span>
          <span className="max-w-full truncate text-[11px] font-bold text-white sm:text-xs">
            {name}{isMe ? ' (sen)' : ''}
          </span>
          {isActive && writing && <span className="animate-pulse text-[10px] font-bold text-accent-goldHi">✍️ yazıyor…</span>}
          {voted && <span className="text-[10px] font-black text-side-red">✓ oyun</span>}
        </div>
      </div>
      {/* Kelimeler — dikey, yukarıdan aşağı */}
      <div className="flex flex-1 flex-col items-stretch gap-1 bg-black/40 px-1.5 py-2">
        {words.length === 0 ? (
          <span className="py-1 text-center text-[10px] text-white/30">—</span>
        ) : (
          words.map((w, i) => (
            <span key={i} className="truncate rounded-md bg-white/10 px-1.5 py-1 text-center text-[11px] font-semibold text-white/90">
              {w}
            </span>
          ))
        )}
      </div>
    </motion.div>
  );

  const wrapCls = cn('min-w-0 flex-1', maxW);
  if (voteable && onVote) {
    return (
      <button type="button" onClick={onVote} className={cn(wrapCls, 'block text-left')}>
        {inner}
      </button>
    );
  }
  return <div className={wrapCls}>{inner}</div>;
}

/* ─────────────────────────── RESULT ─────────────────────────── */
function ResultScene({
  view,
  me,
  onRematch,
}: {
  view: NonNullable<ReturnType<typeof useOnlineImposterMatch>['view']>;
  me: number;
  onRematch: () => void;
}) {
  const crewWon = view.winner === 'crew';
  // Kendi rolüm (youAreImposter) RESULT'ta da geçerli (side===imposterIndex).
  const youWon = crewWon ? !view.youAreImposter : view.youAreImposter;
  const impName = view.imposterIndex !== null ? view.playerNames[view.imposterIndex] : '—';

  return (
    <section className="flex flex-col items-center gap-6 py-4 text-center">
      <motion.div initial={{ opacity: 0, scale: 0.9, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="flex flex-col items-center gap-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">Sonuç</span>
        <h1 className={cn('text-3xl font-black sm:text-4xl', crewWon ? 'text-emerald-300' : 'text-side-red')}>
          {crewWon ? 'Masumlar Kazandı! ⚽' : 'İmposter Kazandı! 🕵️'}
        </h1>
        <p className="mt-1 text-sm font-semibold text-white/70">{youWon ? '🎉 Sen kazandın!' : 'Bu sefer kaybettin.'}</p>
      </motion.div>

      <div className="flex w-full max-w-md flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-sm">
        <Row label="🕵️ İmposter" value={impName ?? '—'} accent="red" />
        <Row label="⚽ Gizli futbolcu" value={view.secretPlayerNameReveal ?? '—'} accent="emerald" />
        <Row label="🔑 İmposter ipucusu" value={view.clueWordReveal ?? '—'} accent="gold" />
      </div>

      {/* Oy dökümü */}
      {view.tally && (
        <div className="flex w-full max-w-md flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Oylar</span>
          {view.playerNames.map((name, pi) => (
            <div key={pi} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-1.5">
              <span className={cn('text-sm font-semibold', pi === view.imposterIndex ? 'text-side-red' : pi === me ? 'text-emerald-300' : 'text-white/80')}>
                {name}{pi === view.imposterIndex ? ' 🕵️' : ''}{pi === me ? ' (sen)' : ''}
              </span>
              <span className="text-sm font-black tabular-nums text-white/70">{view.tally?.[pi] ?? 0} oy</span>
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={onRematch} className="btn-primary px-8 py-3">Yeni oyun</button>
    </section>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent: 'red' | 'emerald' | 'gold' }) {
  const c = accent === 'red' ? 'text-side-red' : accent === 'emerald' ? 'text-emerald-300' : 'text-accent-goldHi';
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-white/55">{label}</span>
      <span className={cn('font-black', c)}>{value}</span>
    </div>
  );
}
