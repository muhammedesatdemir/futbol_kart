'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface StepCardProps {
  index: number;
  icon: React.ReactNode;
  title: string;
  body: string;
  delay?: number;
}

export function StepCard({ index, icon, title, body, delay = 0 }: StepCardProps) {
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
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-gold/15 text-accent-goldHi ring-1 ring-accent-gold/30">
          {icon}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
          Adım {index}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="text-xs leading-relaxed text-white/65">{body}</p>
    </motion.div>
  );
}
