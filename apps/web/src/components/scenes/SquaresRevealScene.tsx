'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { SquaresGrid } from './SquaresGrid';
import type { SquaresGrid as GridData } from '@/lib/squaresMode';

interface SquaresRevealSceneProps {
  grid: GridData;
  /** Otomatik geçiş (hot-seat/bot) — verilirse N ms sonra onDone. */
  autoMs?: number;
  onDone: () => void;
}

/**
 * "Kareleri Kap" açılış — matris tanıtılır + kural kısaca. Bir futbolcu adı
 * yazınca onun BİTİŞİK kulüplerinden en büyük grup kapanır → o kadar kare.
 * En çok kare kapatan kazanır.
 */
export function SquaresRevealScene({ grid, autoMs, onDone }: SquaresRevealSceneProps) {
  useEffect(() => {
    if (!autoMs) return;
    const t = setTimeout(onDone, autoMs);
    return () => clearTimeout(t);
  }, [autoMs, onDone]);

  return (
    <section className="flex flex-col items-center gap-6 py-4 text-center">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-2"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-gold/40 bg-accent-gold/15 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-accent-goldHi">
          🟦 Kareleri Kap
        </span>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Bitişik kulüpleri zincirle
        </h1>
        <p className="max-w-md text-sm text-white/65">
          Bir futbolcu adı yaz — oynadığı kulüplerden{' '}
          <span className="font-semibold text-accent-goldHi">yan yana (bitişik)</span> olanların
          en büyük grubu senin rengine kapanır.{' '}
          <span className="font-semibold text-white/80">En çok kare kapatan kazanır.</span>
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 22 }}
        className="w-full"
      >
        <SquaresGrid grid={grid} />
      </motion.div>

      {!autoMs && (
        <motion.button
          type="button"
          onClick={onDone}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="btn-primary px-8 py-3 text-base"
        >
          Başla →
        </motion.button>
      )}
    </section>
  );
}
