import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Text, type StyleProp, type TextStyle } from 'react-native';

interface CountUpProps {
  target: number;
  durationMs?: number;
  delayMs?: number;
  format?: (v: number) => string;
  style?: StyleProp<TextStyle>;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Skor say-up animasyonu. Web karşılığı: CountUp.tsx (aynı RAF + easeOutCubic).
 *
 * RN'de requestAnimationFrame global olarak mevcut → web ile birebir mantık,
 * Reanimated köprüsüne gerek yok (metin güncellemesi için en güvenilir yol).
 * Reduce-motion açıksa anında final değeri gösterir.
 */
export function CountUp({
  target,
  durationMs = 700,
  delayMs = 0,
  format = (v) => Math.round(v).toString(),
  style,
}: CountUpProps) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let stopped = false;

    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (stopped) return;
      if (reduce) {
        setValue(target);
        return;
      }

      let startTime: number | null = null;
      const tick = (ts: number) => {
        if (stopped) return;
        if (startTime === null) startTime = ts;
        const elapsed = ts - startTime - delayMs;
        if (elapsed < 0) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        const progress = Math.min(1, elapsed / durationMs);
        setValue(target * easeOutCubic(progress));
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setValue(target);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    });

    return () => {
      stopped = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs, delayMs]);

  return <Text style={style}>{format(value)}</Text>;
}
