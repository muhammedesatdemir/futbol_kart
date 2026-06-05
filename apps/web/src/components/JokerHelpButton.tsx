'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface JokerHelpButtonProps {
  /** Joker adı (tooltip başlığı + aria-label). */
  title: string;
  /** Açıklama metni (tooltip gövdesi). */
  body: string;
  /** Tooltip başlığının yanındaki küçük simge (emoji/ikon). */
  icon?: React.ReactNode;
  /** Tooltip hangi yöne açılsın (buton ekranın sağındaysa 'left' taşmayı önler). */
  align?: 'left' | 'right';
  className?: string;
}

/**
 * Oyun İÇİNDEKİ joker butonlarının yanındaki "(?)" ipucu — hover/tıkla → açıklama
 * tooltip'i. VS Düello'daki Transfer (?) deseninin tekrar kullanılabilir hali;
 * Kadro Kur "Öneri Jokeri" ve Hedefe Yaklaş "Röntgen Jokeri" yanında kullanılır.
 */
export function JokerHelpButton({ title, body, icon, align = 'right', className }: JokerHelpButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-label={`${title} nedir?`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/5 text-xs font-black text-white/55 transition hover:bg-white/15 hover:text-white"
      >
        ?
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            role="tooltip"
            className={cn(
              'absolute bottom-full z-40 mb-2 w-64 rounded-xl border border-white/12 bg-[#0c1322]/95 p-3 text-left text-[11px] leading-relaxed text-white/80 shadow-xl backdrop-blur',
              align === 'right' ? 'right-0' : 'left-0',
            )}
          >
            <div className="mb-1 flex items-center gap-1.5 font-bold text-accent-goldHi">
              {icon}
              {title}
            </div>
            {body}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
