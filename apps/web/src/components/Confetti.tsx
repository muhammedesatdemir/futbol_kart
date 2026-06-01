'use client';

import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

interface ConfettiProps {
  /** Kazanan taraf — konfeti rengini belirler. 'tie'da hiç patlamaz. */
  side: 'P1' | 'P2' | 'tie';
  /** Patlamayı tetikleyen anahtar; değiştiğinde yeniden patlar. */
  fireKey: string | number;
}

const SIDE_COLORS: Record<'P1' | 'P2', string[]> = {
  // Kazanan tarafın rengi + altın paleti
  P1: ['#ef4444', '#c8323d', '#f0c14b', '#ffe8a8', '#ffffff'],
  P2: ['#3b82f6', '#2c5fd6', '#f0c14b', '#ffe8a8', '#ffffff'],
};

/**
 * Maç sonu konfeti patlaması — canvas-confetti (GPU canvas, kendi RAF döngüsü).
 *
 * - İki alt köşeden içe doğru iki ardışık patlama (stadyum top patlaması hissi)
 * - Renkler kazanan tarafa göre + altın
 * - prefers-reduced-motion açıkken hiç patlamaz
 * - 'tie'da patlamaz (sakin)
 * - Kendi canvas'ını oluşturur, fixed + pointer-events:none, mount/unmount güvenli
 */
export function Confetti({ side, fireKey }: ConfettiProps) {
  const firedFor = useRef<string | number | null>(null);

  useEffect(() => {
    if (side === 'tie') return;
    if (firedFor.current === fireKey) return;
    firedFor.current = fireKey;

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const colors = SIDE_COLORS[side];
    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    const baseCount = isMobile ? 60 : 120;

    let cancelled = false;

    const burst = (originX: number, angle: number) => {
      if (cancelled) return;
      confetti({
        particleCount: baseCount,
        spread: 70,
        startVelocity: 48,
        gravity: 0.95,
        ticks: 220,
        origin: { x: originX, y: 0.85 },
        angle,
        colors,
        scalar: isMobile ? 0.9 : 1,
        disableForReducedMotion: true,
      });
    };

    // Sol-alt ve sağ-alt köşeden içe; ikinci dalga kısa gecikmeyle.
    burst(0.12, 60);
    burst(0.88, 120);
    const t = window.setTimeout(() => {
      burst(0.5, 90);
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [side, fireKey]);

  return null;
}
