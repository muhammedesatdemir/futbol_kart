'use client';

import { motion } from 'framer-motion';
import { CardsIcon, PlayIcon, SwordsIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

export type Opponent = 'hotseat' | 'vs-bot';

interface OpponentSelectSceneProps {
  /** Mod adı — başlıkta gösterilir (örn. "Kadro Kur"). */
  modeName: string;
  onPick: (opponent: Opponent) => void;
  /** Hangi rakipler hazır? Hazır olmayan "yakında" rozetiyle soluk gösterilir. */
  available: { hotseat: boolean; vsBot: boolean };
  /**
   * Online eşleşme mevcutsa çağrılır → "🌐 Online" kartı gösterilir. VERİLMEZSE
   * online kartı HİÇ görünmez (offline-only modlar için geri uyumlu).
   */
  onOnline?: () => void;
}

/**
 * Rakip seçim ekranı — modlar arası paylaşılır. Hazır olmayan rakip soluk +
 * "yakında" rozetiyle (tıklanamaz) gösterilir; yol haritasını görünür kılar.
 */
export function OpponentSelectScene({
  modeName,
  onPick,
  available,
  onOnline,
}: OpponentSelectSceneProps) {
  return (
    <section className="flex flex-col gap-10">
      <header className="text-center">
        <span className="inline-block rounded-full border border-accent-gold/40 bg-accent-gold/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-goldHi">
          {modeName}
        </span>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
          Kime karşı oynayalım?
        </h1>
      </header>

      <div className={cn('grid gap-4', onOnline ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        <OpponentCard
          emoji="👥"
          icon={<CardsIcon size={28} />}
          title="Arkadaşına Karşı"
          body="İki oyuncu aynı ekranda sırayla oynar."
          delay={0}
          ready={available.hotseat}
          onClick={available.hotseat ? () => onPick('hotseat') : undefined}
        />
        <OpponentCard
          emoji="🤖"
          icon={<SwordsIcon size={28} />}
          title="Bota Karşı"
          body="Tek başına oyna; bot rakip kadroyu kurar."
          delay={0.08}
          ready={available.vsBot}
          onClick={available.vsBot ? () => onPick('vs-bot') : undefined}
          accent={!onOnline}
        />
        {onOnline && (
          <OpponentCard
            emoji="🌐"
            icon={<PlayIcon size={28} />}
            title="Online Eşleşme"
            body="Gerçek bir rakiple eşleş; sunucu-otoriteli, canlı."
            delay={0.16}
            ready
            onClick={onOnline}
            accent
          />
        )}
      </div>
    </section>
  );
}

function OpponentCard({
  emoji,
  icon,
  title,
  body,
  delay,
  ready,
  onClick,
  accent,
}: {
  emoji: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  delay: number;
  ready: boolean;
  onClick?: () => void;
  accent?: boolean;
}) {
  const disabled = !onClick;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={disabled ? undefined : { y: -4 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      className={cn(
        'glass-panel relative flex flex-col items-start gap-4 p-6 text-left transition',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:border-accent-gold/40 hover:bg-white/10',
        accent && ready && 'ring-1 ring-accent-gold/30',
      )}
    >
      {!ready && (
        <span className="absolute right-4 top-4 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-white/55">
          Yakında
        </span>
      )}
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
      {ready && (
        <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-accent-goldHi">
          <PlayIcon size={14} /> Seç
        </span>
      )}
    </motion.button>
  );
}
