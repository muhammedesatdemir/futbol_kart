'use client';

import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useSfx } from '@/lib/useSfx';
import type { ListCriterion } from '@/lib/listMode';
import { LIST_SIZE } from '@/lib/listMode';

interface ListRevealSceneProps {
  criterion: ListCriterion;
  /** Liste başlığı açılınca (veya "Başla") çağrılır → play fazına geçilir. */
  onDone: () => void;
}

/**
 * Liste konusu dramatik açılış — "🏆 EN ÇOK MİLLİ MAÇ" büyük başlık + altın
 * parıltı. ~4 sn sonra otomatik (oyuncu "Başla" ile de geçebilir).
 * Mod 2 TargetRevealScene'in kardeşi (çark yok, başlık odaklı).
 */
export function ListRevealScene({ criterion, onDone }: ListRevealSceneProps) {
  const reduced = useReducedMotion();
  const playSfx = useSfx();

  // Maç başı hakem düdüğü — kriter açılışı sahnesi görünür görünmez (bir kez).
  useEffect(() => {
    playSfx('whistleStart');
  }, [playSfx]);

  useEffect(() => {
    if (!reduced) {
      const t = setTimeout(() => playSfx('win'), 350);
      return () => clearTimeout(t);
    }
  }, [reduced, playSfx]);

  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center"
      >
        <span className="inline-block rounded-full border border-accent-gold/40 bg-accent-gold/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-accent-goldHi">
          🏆 Liste Doldur
        </span>
      </motion.div>

      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.15 }}
        className="relative flex flex-col items-center gap-3 rounded-3xl border-2 border-accent-gold/40 bg-gradient-to-b from-zinc-900 to-black px-10 py-10 shadow-2xl sm:px-16"
      >
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-3xl"
          style={{ boxShadow: '0 0 60px rgba(255,213,74,0.4)' }}
          animate={{ opacity: [0.4, 0.85, 0.4] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        />
        <span className="text-xs font-bold uppercase tracking-[0.25em] text-white/45">
          Top {LIST_SIZE} — Tüm zamanlar
        </span>
        <h1 className="max-w-md text-center text-4xl font-black uppercase leading-tight tracking-tight text-accent-goldHi drop-shadow-[0_0_30px_rgba(255,213,74,0.5)] sm:text-5xl">
          {criterion.title}
        </h1>
      </motion.div>

      <p className="max-w-sm text-center text-sm leading-relaxed text-white/55">
        Havuzdan oyuncu seç — listedeyse{' '}
        <span className="font-semibold text-white/80">gerçek sırasına</span> oturur
        ve o sıranın puanını kazanırsın.{' '}
        <span className="font-semibold text-accent-goldHi">Alt sıralar daha değerli</span>{' '}
        (10. sıra = 10 puan).
      </p>

      <motion.button
        type="button"
        onClick={onDone}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="btn-primary animate-cta-pulse motion-reduce:animate-none shadow-glow-gold"
      >
        🎯 Tahmin etmeye başla
      </motion.button>
    </section>
  );
}
