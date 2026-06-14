'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';

interface QuizRevealSceneProps {
  /** Metrik etiketi (örn. "Toplam kupa") — büyük başlık. */
  metricLabel: string;
  /** İyelik ekli soru ifadesi (örn. "toplam kupası") + fiil. */
  metricQuestion: string;
  metricMost: string;
  /** Pozisyon bağlamı (örn. "forvetler") — pozisyona-bağlı metrikte; yoksa null. */
  positionContext?: string | null;
  roundNo: number;
  totalRounds: number;
  autoMs?: number;
  onDone: () => void;
}

/**
 * "4'lü Kıyas" tur açılışı — bu turda hangi metriğin kıyaslanacağı duyurulur
 * ("Hangisinin TOPLAM KUPASI en fazla?"). autoMs verilirse otomatik geçer
 * (online/bot), yoksa "Başla" butonu (offline tek ekran).
 */
export function QuizRevealScene({
  metricLabel,
  metricQuestion,
  metricMost,
  positionContext = null,
  roundNo,
  totalRounds,
  autoMs,
  onDone,
}: QuizRevealSceneProps) {
  useEffect(() => {
    if (!autoMs) return;
    const t = setTimeout(onDone, autoMs);
    return () => clearTimeout(t);
  }, [autoMs, onDone]);

  return (
    <section className="flex flex-col items-center gap-6 py-6 text-center">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-gold/40 bg-accent-gold/15 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-accent-goldHi">
          ⚖️ 4&apos;lü Kıyas · Tur {roundNo}/{totalRounds}
        </span>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Bu turun ölçütü</h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 20 }}
        className="glass-panel-strong flex flex-col items-center gap-2 rounded-3xl border-2 border-accent-gold/40 px-8 py-6"
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/55">Hangisinin {metricMost}?</span>
        <span className="text-3xl font-black text-accent-goldHi sm:text-4xl">{metricLabel}</span>
        {positionContext && (
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold text-white/75">
            yalnızca {positionContext} arasında
          </span>
        )}
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="max-w-md text-sm text-white/60"
      >
        4 futbolcudan <span className="font-semibold text-white/85">{metricQuestion} {metricMost}</span> olanı seç. Doğru bilen <span className="font-semibold text-accent-goldHi">+1 puan</span>.
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
