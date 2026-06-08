'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSession } from '@/lib/authClient';
import { BallLoader } from '@/components/BallLoader';

type Phase = 'checking-auth' | 'searching' | 'found' | 'error';

/**
 * Online oynanabilen modlar + her birinin eşleşince gidilecek oyun route'u.
 * Mod-özel kuyruk: matchmaking_queue `mode` ile filtreler → yalnız aynı modu
 * bekleyenler eşleşir. Yeni mod buraya + ONLINE_MODES (matchmaking.ts) eklenir.
 */
const MODE_ROUTES: Record<string, (matchId: string) => string> = {
  'vs-duello': (id) => `/oyna/${id}?online=1`,
  hedef: (id) => `/hedefe-yaklas/${id}?online=1`,
  kadro: (id) => `/kadro/${id}?online=1`,
};
/** Bilinmeyen/eksik mod → VS Düello (geri uyumluluk). */
const DEFAULT_MODE = 'vs-duello';
/** Bekleme yoklaması aralığı (ms). */
const POLL_MS = 2000;
/** "Rakip bulundu" ekranının gösterim süresi (ms) — sonra maça geçilir. */
const FOUND_SHOW_MS = 4000;

interface FoundInfo {
  matchId: string;
  p1Name: string;
  p2Name: string;
  yourSide: 'P1' | 'P2';
}

/**
 * Online eşleşme akışı.
 *  1. Giriş yoksa /giris'e (online yalnızca girişliye).
 *  2. Kuyruğa gir, eşleşene kadar bekle + yokla.
 *  3. EŞLEŞİNCE: "Rakip bulundu" ekranını (iki oyuncu kartı, P1 sol / P2 sağ,
 *     üzerinde ad/mail) ~3.5sn göster, SONRA maça geç. Böylece ani sayfa
 *     yığılması olmaz; kullanıcı kiminle eşleştiğini görür.
 */
export function OnlineMatchmaking({
  onCancel,
  mode = DEFAULT_MODE,
}: {
  onCancel: () => void;
  /** Hangi modda eşleşilecek (vs-duello | hedef | …). Varsayılan vs-duello. */
  mode?: string;
}) {
  const router = useRouter();
  const { data: sessionData, isPending } = useSession();
  const [phase, setPhase] = useState<Phase>('checking-auth');
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<FoundInfo | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handledRef = useRef(false); // eşleşme bir kez işlensin

  // Geçersiz mod gelirse VS Düello'ya düş (route haritasında yoksa).
  const safeMode = MODE_ROUTES[mode] ? mode : DEFAULT_MODE;
  const routeFor = MODE_ROUTES[safeMode]!;

  // Eşleşme bulununca: maç bilgisini çek, "rakip bulundu" göster, sonra git.
  const onMatched = useCallback(
    async (matchId: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      if (pollRef.current) clearInterval(pollRef.current);
      try {
        const res = await fetch(`/api/match/${matchId}`);
        const data = await res.json();
        setFound({
          matchId,
          p1Name: data.state?.p1Name || 'Oyuncu 1',
          p2Name: data.state?.p2Name || 'Oyuncu 2',
          yourSide: data.yourSide ?? 'P1',
        });
        setPhase('found');
      } catch {
        // Bilgi çekilemese de maça geç (sade).
        router.push(routeFor(matchId));
      }
    },
    [router, routeFor],
  );

  // "Rakip bulundu" gösterildikten sonra maça geç (mod-özel route).
  useEffect(() => {
    if (phase !== 'found' || !found) return;
    const t = setTimeout(() => {
      router.push(routeFor(found.matchId));
    }, FOUND_SHOW_MS);
    return () => clearTimeout(t);
  }, [phase, found, router, routeFor]);

  // 1) Giriş kontrolü → kuyruğa gir.
  useEffect(() => {
    if (isPending) return;
    if (!sessionData?.user) {
      router.push('/giris');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/matchmaking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: safeMode }),
        });
        if (!res.ok) throw new Error('Eşleşme başlatılamadı.');
        const data = await res.json();
        if (cancelled) return;
        if (data.matched && data.matchId) {
          void onMatched(data.matchId);
        } else {
          setPhase('searching');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Bir hata oluştu.');
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPending, sessionData, router, onMatched]);

  // 2) Bekleme: kısa aralıklarla yokla (rakip bizi kapmış olabilir).
  useEffect(() => {
    if (phase !== 'searching') return;
    pollRef.current = setInterval(async () => {
      try {
        // MOD-ÖZEL yokla: yalnız bu modda aktif maça yönlen (başka moddaki eski
        // maç bu eşleşmeye karışmasın).
        const res = await fetch(`/api/matchmaking?mode=${encodeURIComponent(safeMode)}`, {
          method: 'GET',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.matched && data.matchId) {
          void onMatched(data.matchId);
        }
      } catch {
        // geçici hata — bir sonraki yoklamada tekrar
      }
    }, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, onMatched, safeMode]);

  const handleCancel = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      await fetch('/api/matchmaking', { method: 'DELETE' });
    } catch {
      // sessizce geç
    }
    onCancel();
  }, [onCancel]);

  if (phase === 'error') {
    return (
      <section className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
        <h2 className="text-2xl font-black text-side-red">Eşleşme hatası</h2>
        <p className="text-sm text-white/65">{error}</p>
        <button type="button" onClick={handleCancel} className="btn-ghost">
          Geri dön
        </button>
      </section>
    );
  }

  if (phase === 'found' && found) {
    return <MatchFound found={found} />;
  }

  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-8 text-center">
      <BallLoader
        size={64}
        label="Rakip aranıyor…"
        sub="Seninle eşleşecek bir oyuncu bekleniyor. Bu birkaç saniye sürebilir."
      />
      <button type="button" onClick={handleCancel} className="btn-ghost">
        Vazgeç
      </button>
    </section>
  );
}

/**
 * "Rakip bulundu" ekranı — iki oyuncu yan yana (P1 sol/kırmızı, P2 sağ/mavi),
 * üzerinde ad/mail. "SEN" rozeti kendi tarafında. VS ortada. 3.5sn sonra maça geçer.
 */
function MatchFound({ found }: { found: FoundInfo }) {
  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center gap-10">
      <motion.h2
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl font-black text-accent-goldHi sm:text-4xl"
      >
        Rakip bulundu! 🎯
      </motion.h2>

      <div className="flex items-center gap-4 sm:gap-10">
        <UserCard
          name={found.p1Name}
          side="P1"
          isYou={found.yourSide === 'P1'}
          delay={0.1}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 18 }}
          className="flex flex-col items-center"
        >
          <span className="text-4xl font-black text-white drop-shadow-[0_2px_12px_rgba(255,215,107,0.5)] sm:text-5xl">
            VS
          </span>
        </motion.div>
        <UserCard
          name={found.p2Name}
          side="P2"
          isYou={found.yourSide === 'P2'}
          delay={0.18}
        />
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="text-sm font-semibold text-white/55"
      >
        Maç başlıyor…
      </motion.p>
    </section>
  );
}

/**
 * Kullanıcı kimlik kartı — gerçek oyuncu kartı (PlayerCard) estetiğinde:
 * pozisyon-gradient yerine taraf rengi (P1 kırmızı / P2 mavi), futbolcu fotosu
 * yerine baş-harf monogramı, altta ad + Ev Sahibi/Konuk. Holo + shine + iç
 * çerçeve aynı. Kullanıcı adı eklenince `name` otomatik onu gösterir.
 */
function UserCard({
  name,
  side,
  isYou,
  delay,
}: {
  name: string;
  side: 'P1' | 'P2';
  isYou: boolean;
  delay: number;
}) {
  const theme =
    side === 'P1'
      ? {
          grad: 'from-side-red/90 via-side-red/40',
          glow: 'rgba(220,38,38,0.55)',
          border: 'rgba(220,38,38,0.5)',
          light: '#fca5a5',
          dark: '#7f1d1d',
        }
      : {
          grad: 'from-side-blue/90 via-side-blue/40',
          glow: 'rgba(37,99,235,0.55)',
          border: 'rgba(37,99,235,0.5)',
          light: '#93c5fd',
          dark: '#1e3a8a',
        };
  const initial = name.charAt(0).toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, x: side === 'P1' ? -40 : 40, scale: 0.85, rotateY: side === 'P1' ? -15 : 15 }}
      animate={{ opacity: 1, x: 0, scale: 1, rotateY: 0 }}
      transition={{ delay, type: 'spring', stiffness: 240, damping: 20 }}
      whileHover={{ y: -6, scale: 1.03 }}
      className="group relative aspect-[2/3] w-40 select-none sm:w-52"
      style={{ perspective: 900 }}
    >
      {isYou && (
        <span className="absolute -top-3 left-1/2 z-40 -translate-x-1/2 rounded-full bg-accent-gold px-3.5 py-1 text-[11px] font-black tracking-wide text-[#1f1500] shadow-lg">
          SEN
        </span>
      )}

      <div
        className="relative flex h-full w-full flex-col overflow-hidden rounded-xl shadow-card"
        style={{ boxShadow: `0 0 28px -4px ${theme.glow}` }}
      >
        {/* Koyu base */}
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 to-zinc-950" />
        {/* Taraf gradyanı (üst) */}
        <div className={`absolute inset-x-0 top-0 h-[62%] bg-gradient-to-b ${theme.grad} to-transparent`} />
        {/* Üst parıltı */}
        <div
          className="pointer-events-none absolute inset-0 z-10 opacity-40 mix-blend-overlay"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at 50% 8%, rgba(255,255,255,0.85), transparent 55%)',
          }}
        />
        {/* Holo conic */}
        <div
          className="pointer-events-none absolute inset-0 z-10 opacity-[0.18] mix-blend-color-dodge"
          style={{
            backgroundImage:
              'conic-gradient(from 210deg at 50% 50%, rgba(255,80,120,0.6), rgba(255,200,80,0.6), rgba(120,255,160,0.6), rgba(80,180,255,0.6), rgba(220,120,255,0.6), rgba(255,80,120,0.6))',
          }}
        />
        {/* Shine band — hover */}
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
          <div className="absolute inset-y-0 w-[35%] -translate-x-full -skew-x-12 bg-gradient-to-r from-transparent via-white/55 to-transparent opacity-0 mix-blend-screen transition-all duration-700 ease-out group-hover:translate-x-[260%] group-hover:opacity-100" />
        </div>
        {/* İç çerçeve */}
        <div
          className="pointer-events-none absolute inset-[3px] z-20 rounded-[10px] border"
          style={{ borderColor: `${theme.border}` }}
        />

        {/* Monogram alanı (futbolcu fotosu yerine) */}
        <div className="relative z-0 h-[72%] w-full overflow-hidden rounded-t-[inherit]">
          <div
            className="absolute inset-0 opacity-50 blur-md"
            style={{
              background: `radial-gradient(circle at 50% 35%, ${theme.light}, transparent 70%)`,
            }}
          />
          <div
            className="relative flex h-full w-full items-center justify-center text-6xl font-black sm:text-7xl"
            style={{ color: '#fff', textShadow: `0 4px 24px ${theme.glow}` }}
          >
            {initial}
          </div>
          {/* Alt karartma */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
            style={{ background: `linear-gradient(to bottom, transparent, ${theme.dark}cc)` }}
          />
        </div>

        {/* Ad + rol */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-2 pb-2 pt-1.5">
          <div
            className="mb-1 h-px w-[55%]"
            style={{ background: `linear-gradient(to right, transparent, ${theme.light}aa, transparent)` }}
          />
          <div
            className="line-clamp-1 break-all text-center text-[13px] font-black leading-tight tracking-wide text-white"
            title={name}
          >
            {name}
          </div>
          <div
            className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: theme.light }}
          >
            {side === 'P1' ? 'Ev Sahibi' : 'Konuk'}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
