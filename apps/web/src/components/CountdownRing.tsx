'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

interface CountdownRingProps {
  /** Toplam süre (saniye). */
  seconds: number;
  /**
   * ONLINE: sunucu-otoriteli bitiş anı (epoch ms). Verilirse geri sayım buna
   * KİLİTLENİR — kalan = deadline - now. Böylece sayfaya geç dönen oyuncu da
   * doğru kalan süreyi görür ve iki tarafta süre EŞ akar (lokal `seconds`
   * sayımı yerine). `seconds` yalnızca halkanın tam-oranı için referans kalır.
   */
  deadlineMs?: number | null;
  /** Süre dolunca bir kez çağrılır. */
  onComplete: () => void;
  /**
   * Yeniden başlatma anahtarı. Değişince geri sayım baştan başlar
   * (aynı sahnede tekrar kullanım için). Değişmezse bir kez sayar.
   */
  runKey?: string | number;
  /** Halka rengi (CSS renk). Varsayılan: amber/kırmızı geçiş yerine düz. */
  color?: string;
  /** Süre azaldıkça (son ~%30) bu renge döner (aciliyet). */
  urgentColor?: string;
  /** Piksel cinsinden çap. */
  size?: number;
  /** Halka kalınlığı. */
  stroke?: number;
  /** Duraklatma — true iken sayaç ilerlemez (ihtiyaç olursa). */
  paused?: boolean;
  className?: string;
}

/**
 * Yeniden kullanılabilir dairesel geri sayım.
 *
 * - Ortada tam sayı saniye, kenarında süreyle ORANTILI akıcı dolan/boşalan halka.
 * - requestAnimationFrame ile akıcı (saniye adımı değil); 60fps.
 * - Son %30'da urgentColor'a yumuşak geçer + hafif nabız.
 * - prefers-reduced-motion: animasyon yok ama sayaç + onComplete çalışır.
 *
 * NOT: Bu bileşen ileride her kart seçiminde de kullanılacak (sadece renk/size
 * farkıyla). API'yi sade ve genel tuttum.
 */
export function CountdownRing({
  seconds,
  deadlineMs = null,
  onComplete,
  runKey = 'once',
  color = '#f0c14b',
  urgentColor = '#ef4444',
  size = 48,
  stroke = 4,
  paused = false,
  className,
}: CountdownRingProps) {
  // remaining: 0..1 oranı (1 = tam süre). Akıcı animasyon için kesirli.
  const [ratio, setRatio] = useState(1);
  const completedRef = useRef(false);
  // onComplete'i ref'te tut — effect bağımlılığına girip RAF'ı resetlemesin.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    completedRef.current = false;
    setRatio(1);

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const totalMs = seconds * 1000;
    let raf = 0;
    let startTs: number | null = null;
    let pausedAccum = 0;
    let pauseStartedAt: number | null = null;

    const finish = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      setRatio(0);
      onCompleteRef.current();
    };

    // ONLINE (deadline-tabanlı): kalan süreyi sunucu deadline'ından hesapla.
    // Sayfaya geç dönen oyuncu doğru kalanı görür; iki tarafta süre EŞ akar.
    if (deadlineMs != null) {
      const deadlineTick = () => {
        if (pausedRef.current) {
          raf = requestAnimationFrame(deadlineTick);
          return;
        }
        const remainingMs = deadlineMs - Date.now();
        const r = Math.max(0, Math.min(1, remainingMs / totalMs));
        setRatio(r);
        if (remainingMs <= 0) {
          finish();
          return;
        }
        raf = requestAnimationFrame(deadlineTick);
      };
      raf = requestAnimationFrame(deadlineTick);
      return () => cancelAnimationFrame(raf);
    }

    if (reduce) {
      // Animasyonsuz: sade timeout (sayaç güncellenmez ama süre işler).
      const id = setTimeout(finish, totalMs);
      return () => clearTimeout(id);
    }

    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;

      if (pausedRef.current) {
        if (pauseStartedAt === null) pauseStartedAt = ts;
        raf = requestAnimationFrame(tick);
        return;
      }
      if (pauseStartedAt !== null) {
        pausedAccum += ts - pauseStartedAt;
        pauseStartedAt = null;
      }

      const elapsed = ts - startTs - pausedAccum;
      const r = Math.max(0, 1 - elapsed / totalMs);
      setRatio(r);

      if (r <= 0) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
    // runKey/deadline değişince yeniden başlar; seconds sabit varsayılır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, seconds, deadlineMs]);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);
  const urgent = ratio <= 0.3;
  const ringColor = urgent ? urgentColor : color;
  // Gösterilen saniye: yukarı yuvarla ki "0" sadece bittiğinde görünsün.
  const displaySec = Math.max(0, Math.ceil(ratio * seconds));

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="timer"
      aria-label={`${displaySec} saniye kaldı`}
    >
      <svg
        width={size}
        height={size}
        className={cn('-rotate-90', urgent && 'animate-pulse-soft')}
      >
        {/* İz (boş halka) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={stroke}
        />
        {/* Dolu kısım — süreyle orantılı, akıcı */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: 'stroke 0.3s linear',
            filter: `drop-shadow(0 0 4px ${ringColor})`,
          }}
        />
      </svg>
      <span
        className="absolute text-[13px] font-black tabular-nums"
        style={{ color: ringColor }}
      >
        {displaySec}
      </span>
    </div>
  );
}
