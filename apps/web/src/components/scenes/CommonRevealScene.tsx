'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { CommonPairHeader } from './CommonPairHeader';
import type { CommonRoundPair } from '@/lib/commonMode';

interface CommonRevealSceneProps {
  pair: CommonRoundPair;
  /** Kaçıncı tur (1-bazlı gösterim) ve toplam. */
  roundNo: number;
  totalRounds: number;
  autoMs?: number;
  onDone: () => void;
}

/**
 * "Ortak Bul" tur açılışı — 2 kulüp kafa kafaya tanıtılır + kural + "bu çiftte
 * N ortak isim var" ipucu. autoMs verilirse otomatik geçer (online/bot), yoksa
 * "Başla" butonu (offline tek ekran).
 */
export function CommonRevealScene({
  pair,
  roundNo,
  totalRounds,
  autoMs,
  onDone,
}: CommonRevealSceneProps) {
  useEffect(() => {
    if (!autoMs) return;
    const t = setTimeout(onDone, autoMs);
    return () => clearTimeout(t);
  }, [autoMs, onDone]);

  return (
    <section className="flex flex-col items-center gap-6 py-4 text-center">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-gold/40 bg-accent-gold/15 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-accent-goldHi">
          🤝 Ortak Bul · Tur {roundNo}/{totalRounds}
        </span>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Bu ikisinin ortağını bul</h1>
        <p className="max-w-md text-sm text-white/65">
          Her iki kulüpte de oynamış bir futbolcu seç. Ne kadar{' '}
          <span className="font-semibold text-accent-goldHi">az bilinen</span> bir ortak bulursan o kadar puan.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 22 }}
        className="w-full"
      >
        <CommonPairHeader pair={pair} />
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="text-xs font-semibold text-white/55"
      >
        Bu çiftte <span className="text-accent-goldHi">{pair.count}</span> ortak isim var.
      </motion.p>

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
