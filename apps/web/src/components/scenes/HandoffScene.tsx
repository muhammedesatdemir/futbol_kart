'use client';

import { useTranslations } from 'next-intl';
import { PlayIcon } from '@/components/icons';

export function HandoffScene({ onContinue }: { onContinue: () => void }) {
  const t = useTranslations('pick');
  return (
    <section className="glass-panel-strong mt-12 flex flex-col items-center gap-6 p-10 text-center">
      <div className="rounded-full bg-accent-gold/20 px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent-goldHi">
        Ara
      </div>
      <h2 className="text-2xl font-black">{t('p1Done')}</h2>
      <p className="max-w-md text-white/65">{t('passDevice')}</p>
      <button type="button" onClick={onContinue} className="btn-primary">
        <PlayIcon size={14} />
        Oyuncu 2 — hazırım
      </button>
    </section>
  );
}
