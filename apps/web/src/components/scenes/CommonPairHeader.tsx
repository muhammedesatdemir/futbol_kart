'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import type { CommonRoundPair } from '@/lib/commonMode';

interface CommonPairHeaderProps {
  pair: CommonRoundPair;
  /** Kompakt (oyun ekranı üstü) mi, büyük (açılış) mı? */
  compact?: boolean;
  className?: string;
}

/**
 * "Ortak Bul" iki-kulüp başlığı: A logosu + "VS" + B logosu (kafa kafaya).
 * Hem açılış (büyük) hem oyun ekranı üstü (kompakt) kullanır. Logo yoksa
 * 2-harf rozeti (ChainClubsGrid fallback deseni).
 */
export function CommonPairHeader({ pair, compact = false, className }: CommonPairHeaderProps) {
  return (
    <div className={cn('flex items-center justify-center gap-3 sm:gap-5', className)}>
      <ClubBadge name={pair.aName} crestUrl={pair.aCrestUrl} side="a" compact={compact} />
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.1 }}
        className={cn(
          'font-black uppercase tracking-tight text-white/45',
          compact ? 'text-base' : 'text-2xl sm:text-3xl',
        )}
      >
        ×
      </motion.span>
      <ClubBadge name={pair.bName} crestUrl={pair.bCrestUrl} side="b" compact={compact} />
    </div>
  );
}

function ClubBadge({
  name,
  crestUrl,
  side,
  compact,
}: {
  name: string;
  crestUrl?: string;
  side: 'a' | 'b';
  compact: boolean;
}) {
  const logoCls = compact ? 'h-10 w-10 sm:h-12 sm:w-12' : 'h-20 w-20 sm:h-24 sm:w-24';
  return (
    <motion.div
      initial={{ opacity: 0, x: side === 'a' ? -24 : 24, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 20 }}
      className={cn(
        'glass-panel flex flex-col items-center gap-1.5 rounded-2xl border border-white/12 px-3',
        compact ? 'py-2' : 'py-4',
      )}
    >
      {crestUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={crestUrl} alt={name} loading="lazy" className={cn('object-contain', logoCls)} />
      ) : (
        <span
          className={cn(
            'flex items-center justify-center rounded-full bg-white/10 font-black text-white/70',
            logoCls,
            compact ? 'text-sm' : 'text-xl',
          )}
        >
          {name.slice(0, 2)}
        </span>
      )}
      <span
        className={cn(
          'line-clamp-1 max-w-[8rem] text-center font-bold leading-tight text-white/90',
          compact ? 'text-xs' : 'text-sm sm:text-base',
        )}
      >
        {name}
      </span>
    </motion.div>
  );
}
