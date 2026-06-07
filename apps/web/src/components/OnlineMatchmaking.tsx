'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSession } from '@/lib/authClient';
import { BallLoader } from '@/components/BallLoader';

type Phase = 'checking-auth' | 'searching' | 'found' | 'error';

/** Pilot online mod kimliği — matchmaking API'siyle aynı string. */
const ONLINE_MODE = 'vs-duello';
/** Bekleme yoklaması aralığı (ms). */
const POLL_MS = 2000;
/** "Rakip bulundu" ekranının gösterim süresi (ms) — sonra maça geçilir. */
const FOUND_SHOW_MS = 3500;

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
export function OnlineMatchmaking({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const { data: sessionData, isPending } = useSession();
  const [phase, setPhase] = useState<Phase>('checking-auth');
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<FoundInfo | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handledRef = useRef(false); // eşleşme bir kez işlensin

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
        router.push(`/oyna/${matchId}?online=1`);
      }
    },
    [router],
  );

  // "Rakip bulundu" gösterildikten sonra maça geç.
  useEffect(() => {
    if (phase !== 'found' || !found) return;
    const t = setTimeout(() => {
      router.push(`/oyna/${found.matchId}?online=1`);
    }, FOUND_SHOW_MS);
    return () => clearTimeout(t);
  }, [phase, found, router]);

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
          body: JSON.stringify({ mode: ONLINE_MODE }),
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
        const res = await fetch('/api/matchmaking', { method: 'GET' });
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
  }, [phase, onMatched]);

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
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-8">
      <motion.h2
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl font-black text-accent-goldHi sm:text-3xl"
      >
        Rakip bulundu! 🎯
      </motion.h2>

      <div className="flex items-center gap-5 sm:gap-10">
        <PlayerBadge
          name={found.p1Name}
          side="P1"
          isYou={found.yourSide === 'P1'}
          delay={0.1}
        />
        <motion.span
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25 }}
          className="text-3xl font-black text-white/70 sm:text-4xl"
        >
          VS
        </motion.span>
        <PlayerBadge
          name={found.p2Name}
          side="P2"
          isYou={found.yourSide === 'P2'}
          delay={0.18}
        />
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-sm text-white/55"
      >
        Maç başlıyor…
      </motion.p>
    </section>
  );
}

function PlayerBadge({
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
  const tone =
    side === 'P1'
      ? 'from-side-red/30 ring-side-red/50'
      : 'from-side-blue/30 ring-side-blue/50';
  return (
    <motion.div
      initial={{ opacity: 0, x: side === 'P1' ? -30 : 30, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 260, damping: 22 }}
      className={`relative flex w-36 flex-col items-center gap-3 rounded-2xl bg-gradient-to-b ${tone} to-transparent p-5 ring-2 sm:w-44`}
    >
      {isYou && (
        <span className="absolute -top-2.5 rounded-full bg-accent-gold px-3 py-0.5 text-[10px] font-black text-[#1f1500] shadow">
          SEN
        </span>
      )}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-2xl font-black ring-2 ring-white/20">
        {name.charAt(0).toUpperCase()}
      </div>
      <span className="line-clamp-2 break-all text-center text-sm font-bold leading-tight">
        {name}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
        {side === 'P1' ? 'Ev Sahibi' : 'Konuk'}
      </span>
    </motion.div>
  );
}
