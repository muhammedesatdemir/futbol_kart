'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import type { GameMode } from '@futbol-kart/shared-types';
import { CardsIcon, PlayIcon, SwordsIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

interface ModeSelectSceneProps {
  onPick: (mode: GameMode) => void;
}

export function ModeSelectScene({ onPick }: ModeSelectSceneProps) {
  const t = useTranslations('newGame');
  return (
    <section className="flex flex-col gap-10">
      <header className="text-center">
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
          {t('title')}
        </h1>
        <p className="mt-3 text-white/65">{t('subtitle')}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <ModeCard
          emoji="👥"
          icon={<CardsIcon size={28} />}
          title={t('hotseatTitle')}
          body={t('hotseatBody')}
          delay={0}
          onClick={() => onPick('hotseat')}
        />
        <ModeCard
          emoji="🤖"
          icon={<SwordsIcon size={28} />}
          title={t('vsBotTitle')}
          body={t('vsBotBody')}
          delay={0.08}
          onClick={() => onPick('vs-bot')}
          accent
        />
      </div>
    </section>
  );
}

interface ModeCardProps {
  emoji: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  delay: number;
  onClick: () => void;
  accent?: boolean;
}

function ModeCard({ emoji, icon, title, body, delay, onClick, accent }: ModeCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'glass-panel flex flex-col items-start gap-4 p-6 text-left transition',
        'hover:border-accent-gold/40 hover:bg-white/10',
        accent && 'ring-1 ring-accent-gold/30',
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-gold/15 text-accent-goldHi ring-1 ring-accent-gold/30">
          {icon}
        </div>
        <span className="text-3xl leading-none" aria-hidden>
          {emoji}
        </span>
      </div>
      <div>
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-white/65">{body}</p>
      </div>
      <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-accent-goldHi">
        <PlayIcon size={14} /> Seç
      </span>
    </motion.button>
  );
}
