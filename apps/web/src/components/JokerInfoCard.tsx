'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface JokerInfoCardProps {
  emoji: string;
  title: string;
  body: string;
  delay?: number;
}

/**
 * Ana sayfadaki "Jokerler" bölümü kartı — özel hamleyi tanıtır.
 * StepCard ile aynı görsel dil; sol üstte emoji rozeti + "1 hak" etiketi.
 */
export function JokerInfoCard({ emoji, title, body, delay = 0 }: JokerInfoCardProps) {
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
        <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/25">
          Maçta 1 hak
        </span>
      </div>
      <h3 className="mt-1 text-sm font-bold text-white">{title}</h3>
      <p className="text-xs leading-relaxed text-white/65">{body}</p>
    </motion.div>
  );
}
