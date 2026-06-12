'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChainClubsGrid } from './ChainClubsGrid';
import type { ChainClub } from '@/lib/chainMode';

interface ChainRevealSceneProps {
  clubs: ChainClub[];
  autoMs?: number;
  onDone: () => void;
}

/**
 * "Zincir Kur" açılış — 7 kulüp (4+3) tanıtılır + kural. Bir futbolcu seç, bu
 * kulüplerden kaçında oynadıysa o kadar puan. Her taraf 5 futbolcu girer.
 */
export function ChainRevealScene({ clubs, autoMs, onDone }: ChainRevealSceneProps) {
  useEffect(() => {
    if (!autoMs) return;
    const t = setTimeout(onDone, autoMs);
    return () => clearTimeout(t);
  }, [autoMs, onDone]);

  return (
    <section className="flex flex-col items-center gap-6 py-4 text-center">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-gold/40 bg-accent-gold/15 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-accent-goldHi">
          🔗 Zincir Kur
        </span>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Ortak oyuncuları bul</h1>
        <p className="max-w-md text-sm text-white/65">
          Bir futbolcu seç — bu 7 kulüpten{' '}
          <span className="font-semibold text-accent-goldHi">kaçında oynadıysa o kadar puan</span>.
          Her oyuncu <span className="font-semibold text-white/80">5 futbolcu</span> girer, en çok puan kazanır.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 22 }}
        className="w-full"
      >
        <ChainClubsGrid clubs={clubs} />
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
