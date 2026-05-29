'use client';

import { motion } from 'framer-motion';

interface RoundStingerProps {
  /** Şu anki tur numarası (1'den başlar). */
  round: number;
  totalRounds: number;
  /** Faz rozeti — uzatma/sudden death turlarında 'EXTRA'/'PENALTY' gibi. */
  phaseChip?: string;
}

/**
 * Tur başlangıcında ekranın üst kısmından geçen TV broadcast-stili stinger.
 * İki slim altın çubuk iki kenardan ortaya kayar, ortada tur numarası belirir.
 * Toplam süre ~700ms — sahne `ROUND_INTRO` aktifken görünür, sonra fade-out.
 */
export function RoundStinger({ round, totalRounds, phaseChip }: RoundStingerProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="pointer-events-none fixed inset-x-0 top-1/3 z-40 flex items-center justify-center motion-reduce:hidden"
      aria-hidden
    >
      {/* Sol kenardan kayan slim altın çubuk */}
      <motion.span
        initial={{ x: '-110%' }}
        animate={{ x: 0 }}
        exit={{ x: '-110%' }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="absolute right-1/2 top-1/2 h-[3px] w-[42vw] -translate-y-1/2 origin-right bg-gradient-to-r from-transparent via-accent-goldHi to-accent-gold"
        style={{ boxShadow: '0 0 18px rgba(255,215,107,0.7)' }}
      />
      {/* Sağ kenardan kayan slim altın çubuk */}
      <motion.span
        initial={{ x: '110%' }}
        animate={{ x: 0 }}
        exit={{ x: '110%' }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="absolute left-1/2 top-1/2 h-[3px] w-[42vw] -translate-y-1/2 origin-left bg-gradient-to-l from-transparent via-accent-goldHi to-accent-gold"
        style={{ boxShadow: '0 0 18px rgba(255,215,107,0.7)' }}
      />

      {/* Orta — tur numarası + faz rozeti */}
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ delay: 0.18, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center gap-2"
      >
        {phaseChip && (
          <span className="rounded-full border border-accent-gold/50 bg-accent-gold/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-accent-goldHi">
            {phaseChip}
          </span>
        )}
        <div className="flex items-baseline gap-1 font-black text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]">
          <span className="text-[10px] uppercase tracking-[0.22em] text-white/70">
            Tur
          </span>
          <span className="ml-1 text-3xl tracking-tight">{round}</span>
          <span className="text-sm text-white/50">/ {totalRounds}</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
