'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface GoalVideoFxProps {
  /**
   * Her tur kazanımında değişen anahtar (ör. `${questionId}-${winner}`).
   * Değiştiğinde video baştan oynar. Beraberlikte bu komponent hiç render
   * edilmez (çağıran taraf yalnız P1/P2 kazanınca mount eder).
   *
   * Mount KARTLAR AÇILIRKEN (ROUND_REVEAL) olur — win sesinden (~1.45sn sonra,
   * ROUND_RESULT'ta) önce. ~1.43sn'lik video tam ses devreye girerken biter.
   */
  fireKey: string | number;
}

const GOAL_SRC = '/sfx/goal.mp4';

/** Mount'tan (kartlar açılır) sonra videonun başlama gecikmesi. */
const START_DELAY_MS = 500;

/**
 * Tur kazanma anında oynayan "gol" video overlay'i — WinFx kıvılcımlarının
 * altında, yarı-saydam bir katman.
 *
 * Tasarım kuralları:
 *   - Video 1080×1080 (kare), koyu stadyum/file arka planlı (alpha YOK).
 *     `mix-blend-mode: screen` ile koyu pikseller şeffaflaşır; sadece parlak
 *     top + ışıklar görünür → yarı-saydam kutlama hissi (alttaki sahne kaybolmaz).
 *   - **Boyut ölçülü** (~46vh): kartların/skorun üstünü kaplamaz, kutlama
 *     ortada toplanır. Radial mask ile kenarlar sahneye yumuşakça karışır.
 *   - **Senkron:** mount KARTLAR AÇILIRKEN (ROUND_REVEAL) olur; video START_DELAY_MS
 *     (~0.5sn) sonra başlar (kartlar bir an açık görünsün). ~1.43sn'lik video
 *     ~1.93sn'de biter; win sesi ~1.45sn'de (ROUND_RESULT) girer → ses geldikten
 *     hemen sonra video tamamlanır. Gecikme START_DELAY_MS ile ayarlanır.
 *   - **Bitince kapanır:** `onEnded` ile `done=true` → AnimatePresence fade-out;
 *     video son karede DONMAZ.
 *   - `muted` — ses zaten `playSfx('win')` ile çalıyor (kaldırılmadı). Video
 *     sesi taşımıyor; muted ayrıca autoplay kısıtını da garantiye alır.
 *   - `pointer-events-none` + `fixed inset-0` — layout itmez, tıklamayı engellemez.
 *   - WinFx'in `z-40`'ının altında (`z-30`) → kıvılcımlar videonun üzerinde kalır.
 *   - `prefers-reduced-motion` açıkken hiç gösterilmez.
 */
export function GoalVideoFx({ fireKey }: GoalVideoFxProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Her yeni fireKey'de baştan görünür; video bitince (onEnded) gizlenir.
  const [done, setDone] = useState(false);
  // Video, mount'tan (kartlar açılır) START_DELAY_MS sonra oynamaya başlar —
  // kartlar bir an açık görünsün, gol biraz gecikmeli patlasın diye.
  const [started, setStarted] = useState(false);

  // NOT: Video DAİMA mount edilir (ref hazır olsun); `play()` START_DELAY_MS
  // sonra çağrılır. Görünürlük `started` ile CSS opacity üzerinden kontrol
  // edilir. (Videoyu `started` ile koşullu render etmek race'e yol açar:
  // setStarted ile aynı turda videoRef.current henüz null olur → play() kaçar.)
  useEffect(() => {
    setDone(false);
    setStarted(false);
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setDone(true);
      return;
    }
    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
        video.currentTime = 0;
      } catch {
        /* no-op */
      }
    }
    const t = setTimeout(() => {
      setStarted(true);
      const v = videoRef.current;
      if (!v) return;
      try {
        v.currentTime = 0;
        void v.play().catch(() => {
          /* asset yok / autoplay reddi — sessizce yut */
        });
      } catch {
        /* no-op */
      }
    }, START_DELAY_MS);
    return () => clearTimeout(t);
  }, [fireKey]);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          key={fireKey}
          className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <video
            ref={videoRef}
            src={GOAL_SRC}
            muted
            playsInline
            preload="auto"
            onEnded={() => setDone(true)}
            // Yarı-saydam overlay: `screen` blend koyu pikselleri eritir; radial
            // mask ile kenarlar sahneye yumuşakça karışır (sert kare kutu yok).
            // Ölçülü boyut → kartların/skorun üstünü kaplamaz. `started` olana
            // dek görünmez (opacity 0) — gecikme boyunca donuk kare görünmez.
            className="h-[min(46vh,62vw)] w-[min(46vh,62vw)] object-cover mix-blend-screen transition-opacity duration-200"
            style={{
              opacity: started ? 1 : 0,
              WebkitMaskImage:
                'radial-gradient(circle at 50% 45%, black 38%, transparent 72%)',
              maskImage:
                'radial-gradient(circle at 50% 45%, black 38%, transparent 72%)',
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
