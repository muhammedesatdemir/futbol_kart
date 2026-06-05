'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface JokerInfoCardProps {
  emoji: string;
  title: string;
  body: string;
  delay?: number;
  /**
   * Opsiyonel detay metni — kartın sağ üstündeki (?) ipucu rozetine bağlanır.
   * Verilmezse (?) gösterilmez (gövde metni zaten tam açıklamadır).
   */
  tooltip?: string;
}

/**
 * Ana sayfadaki "Jokerler" bölümü kartı — özel hamleyi tanıtır.
 * StepCard ile aynı görsel dil; sol üstte emoji rozeti + "1 hak" etiketi.
 * Opsiyonel (?) ipucu: hover/tıkla → detay tooltip (oyun-içi JokerBar deseni).
 */
export function JokerInfoCard({ emoji, title, body, delay = 0, tooltip }: JokerInfoCardProps) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'glass-panel relative flex h-full flex-col gap-2 p-4',
        'transition hover:border-accent-gold/40 hover:bg-white/10',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-gold/15 text-lg ring-1 ring-accent-gold/30">
          {emoji}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/25">
            Maçta 1 hak
          </span>
          {tooltip && (
            <div className="relative">
              <button
                type="button"
                aria-label={`${title} nedir?`}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                onClick={() => setOpen((v) => !v)}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[11px] font-black text-white/55 transition hover:bg-white/15 hover:text-white"
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
                    className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-white/12 bg-[#0c1322]/95 p-3 text-left text-[11px] leading-relaxed text-white/80 shadow-xl backdrop-blur"
                  >
                    <div className="mb-1 flex items-center gap-1.5 font-bold text-accent-goldHi">
                      <span className="text-sm">{emoji}</span>
                      {title}
                    </div>
                    {tooltip}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
      <h3 className="mt-1 text-sm font-bold text-white">{title}</h3>
      <p className="text-xs leading-relaxed text-white/65">{body}</p>
    </motion.div>
  );
}
