'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { PlayerSide } from '@futbol-kart/shared-types';

interface WinFxProps {
  /** Kazanan taraf. Kıvılcım rengini ve halo rengini belirler. */
  side: PlayerSide;
  /**
   * Her tetiklemede artan bir anahtar (ör. roundIndex). Aynı tur içinde tekrar
   * mount olmadan yeniden patlama tetiklemek için kullanılır.
   */
  fireKey: string | number;
}

/** Taraf rengi (kart kenar temasıyla aynı) + altın karışım paleti. */
const SIDE_COLORS: Record<PlayerSide, string[]> = {
  P1: ['#ef4444', '#f0c14b', '#ffe8a8', '#ffd76b'],
  P2: ['#3b82f6', '#f0c14b', '#ffe8a8', '#ffd76b'],
};

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0..1, 1=taze
  size: number;
  color: string;
}

/**
 * "Sinyal seviyesi" tur kazanma efekti — iki katman:
 *   1. Kazanan tarafın merkezinden tek-canvas kıvılcım patlaması (yerçekimiyle düşer)
 *   2. Ortadan dışa açılan altın halo dalgası (motion.div radial-gradient)
 *
 * Tasarım kuralları:
 *   - Tek <canvas> — DOM partikül yok (60fps korunur)
 *   - position: fixed + pointer-events: none — layout itmez, tıklama engellemez
 *   - Mobilde partikül sayısı yarıya (matchMedia)
 *   - prefers-reduced-motion açıkken hiçbir şey çizilmez (erken return)
 *   - ~600ms sonra kendini söndürür; AnimatePresence ile unmount edilmeli
 */
export function WinFx({ side, fireKey }: WinFxProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    const count = isMobile ? 14 : 26;
    const colors = SIDE_COLORS[side];

    // Patlama merkezi: ekranın üst-orta bölgesi (kart reveal alanı civarı)
    const cx = w / 2;
    const cy = h * 0.42;

    const sparks: Spark[] = Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count + (i % 2) * 0.3;
      const speed = 3 + (i % 5) * 1.6;
      return {
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2.5, // hafif yukarı bias
        life: 1,
        size: 2 + (i % 3),
        color: colors[i % colors.length],
      };
    });

    let raf = 0;
    let start: number | null = null;
    const DURATION = 620;

    const tick = (ts: number) => {
      if (start === null) start = ts;
      const t = ts - start;
      ctx.clearRect(0, 0, w, h);

      for (const s of sparks) {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.22; // yerçekimi
        s.vx *= 0.98;
        s.life = Math.max(0, 1 - t / DURATION);

        ctx.globalAlpha = s.life;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * (0.4 + s.life * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (t < DURATION) {
        raf = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [side, fireKey]);

  const haloColor = side === 'P1' ? 'rgba(239,68,68,0.35)' : 'rgba(59,130,246,0.35)';

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 motion-reduce:hidden"
      aria-hidden
    >
      {/* Kıvılcım canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Dışa açılan altın+taraf halo dalgası */}
      <motion.div
        key={fireKey}
        className="absolute left-1/2 top-[42%] h-[44vh] w-[44vh] -translate-x-1/2 -translate-y-1/2 rounded-full"
        initial={{ scale: 0.2, opacity: 0.85 }}
        animate={{ scale: 1.5, opacity: 0 }}
        transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
        style={{
          background: `radial-gradient(circle, ${haloColor} 0%, rgba(240,193,75,0.22) 40%, transparent 70%)`,
        }}
      />
    </div>
  );
}
