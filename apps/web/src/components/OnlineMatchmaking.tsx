'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSession } from '@/lib/authClient';
import { SwordsIcon } from '@/components/icons';

type Phase = 'checking-auth' | 'searching' | 'matched' | 'error';

/** Pilot online mod kimliği — matchmaking API'siyle aynı string. */
const ONLINE_MODE = 'vs-duello';
/** Bekleme yoklaması aralığı (ms). Ably gelince push'a çevrilecek (Faz 3). */
const POLL_MS = 2000;

/**
 * Online eşleşme bekleme akışı.
 *  1. Giriş yoksa /giris'e yönlendir (online yalnızca girişliye).
 *  2. Kuyruğa gir, eşleşene kadar bekle + yokla.
 *  3. Eşleşince maça git.
 *
 * NOT: Polling geçici — realtime push (Ably) Faz 3'te bunun yerini alacak.
 */
export function OnlineMatchmaking({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const { data: sessionData, isPending } = useSession();
  const [phase, setPhase] = useState<Phase>('checking-auth');
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goToMatch = useCallback(
    (matchId: string) => {
      setPhase('matched');
      router.push(`/oyna-online/${matchId}`);
    },
    [router],
  );

  // 1) Giriş kontrolü → kuyruğa gir.
  useEffect(() => {
    if (isPending) return;
    if (!sessionData?.user) {
      // Giriş yok: login'e yönlendir, dönüşte ana sayfaya gelsin.
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
          goToMatch(data.matchId);
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
  }, [isPending, sessionData, router, goToMatch]);

  // 2) Bekleme: kısa aralıklarla yokla (rakip bizi kapmış olabilir).
  useEffect(() => {
    if (phase !== 'searching') return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/matchmaking', { method: 'GET' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.matched && data.matchId) {
          if (pollRef.current) clearInterval(pollRef.current);
          goToMatch(data.matchId);
        }
      } catch {
        // geçici hata — bir sonraki yoklamada tekrar denenir
      }
    }, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, goToMatch]);

  const handleCancel = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      await fetch('/api/matchmaking', { method: 'DELETE' });
    } catch {
      // sessizce geç — kuyruktan çıkma kritik değil
    }
    onCancel();
  }, [onCancel]);

  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-8 text-center">
      <motion.div
        animate={{ rotate: phase === 'searching' ? 360 : 0 }}
        transition={
          phase === 'searching'
            ? { repeat: Infinity, duration: 2, ease: 'linear' }
            : { duration: 0.3 }
        }
        className="flex h-20 w-20 items-center justify-center rounded-2xl bg-accent-gold/15 text-accent-goldHi ring-1 ring-accent-gold/30"
      >
        <SwordsIcon size={40} />
      </motion.div>

      {phase === 'error' ? (
        <div>
          <h2 className="text-2xl font-black text-side-red">Eşleşme hatası</h2>
          <p className="mt-2 text-sm text-white/65">{error}</p>
        </div>
      ) : phase === 'matched' ? (
        <h2 className="text-2xl font-black text-accent-goldHi">Rakip bulundu! 🎯</h2>
      ) : (
        <div>
          <h2 className="text-2xl font-black">Rakip aranıyor…</h2>
          <p className="mt-2 text-sm text-white/65">
            Seninle eşleşecek bir oyuncu bekleniyor. Bu birkaç saniye sürebilir.
          </p>
        </div>
      )}

      <button type="button" onClick={handleCancel} className="btn-ghost">
        Vazgeç
      </button>
    </section>
  );
}
