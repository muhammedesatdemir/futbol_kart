'use client';

import { useEffect, useRef, useState } from 'react';

interface CountUpProps {
  /** Hedef değer (sayısal). null/boolean ise count-up devre dışı, doğrudan render. */
  target: number;
  durationMs?: number;
  /** Bu format fonksiyonu her ara değer için çağrılır. */
  format?: (v: number) => string;
  /** Animasyonu başlatmadan önce gecikme. */
  delayMs?: number;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Performant count-up: requestAnimationFrame ile.
 * prefers-reduced-motion açıkken animasyon yok, anında final değeri gösterir.
 */
export function CountUp({
  target,
  durationMs = 700,
  delayMs = 0,
  format = (v) => Math.round(v).toString(),
}: CountUpProps) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduce) {
      setValue(target);
      return;
    }

    let startTime: number | null = null;
    let stopped = false;

    const tick = (ts: number) => {
      if (stopped) return;
      if (startTime === null) startTime = ts;
      const elapsed = ts - startTime - delayMs;
      if (elapsed < 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const progress = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(progress);
      setValue(target * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setValue(target);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs, delayMs]);

  return <>{format(value)}</>;
}
