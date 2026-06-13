'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { SwordsIcon, CardsIcon, TrophyIcon, QuestionIcon } from '@/components/icons';

/** Oynanabilir oyun modu kimliği (rakip türünden FARKLI — bu oyunun türü). */
export type PlayableMode = 'vs' | 'squad' | 'target' | 'list' | 'kareler' | 'zincir' | 'ortak' | 'kariyer';

interface GameModeSelectSceneProps {
  onPick: (mode: PlayableMode) => void;
}

interface ModeDef {
  id: PlayableMode;
  emoji: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  ready: boolean;
}

const MODES: ModeDef[] = [
  {
    id: 'vs',
    emoji: '⚔️',
    icon: <SwordsIcon size={26} />,
    title: 'VS Düello',
    body: 'İkişer kart sürün, sürpriz soruyla kapışın. 7 tur, joker ve bonuslarla.',
    ready: true,
  },
  {
    id: 'squad',
    emoji: '⚽',
    icon: <CardsIcon size={26} />,
    title: 'Kadro Kur',
    body: 'Bir kritere göre formasyonu doldur (en uzun / golcü / değerli), toplamı kapıştır.',
    ready: true,
  },
  {
    id: 'target',
    emoji: '🎯',
    icon: <QuestionIcon size={26} />,
    title: 'Hedefe Yaklaş',
    body: '5 oyuncuyla bir hedefe en çok yaklaş: ~70 Dünya Kupası maçı. En yakın kazanır.',
    ready: true,
  },
  {
    id: 'list',
    emoji: '📋',
    icon: <TrophyIcon size={26} />,
    title: 'Liste Doldur',
    body: 'Sıralı bir top-10 listesini tahmin et: "En çok milli maç". Alt sıralar daha değerli.',
    ready: true,
  },
  {
    id: 'kareler',
    emoji: '🟦',
    icon: <CardsIcon size={26} />,
    title: 'Kareleri Kap',
    body: '5×5 kulüp matrisinde futbolcu adı yaz; bitişik kulüplerini zincirle. En çok kare kapatan kazanır.',
    ready: true,
  },
  {
    id: 'zincir',
    emoji: '🔗',
    icon: <CardsIcon size={26} />,
    title: 'Zincir Kur',
    body: '7 kulüp gösterilir; futbolcu seç, kaçında oynadıysa o kadar puan. Her oyuncu 5 futbolcu girer.',
    ready: true,
  },
  {
    id: 'ortak',
    emoji: '🤝',
    icon: <CardsIcon size={26} />,
    title: 'Ortak Bul',
    body: 'Her tur 2 kulüp gelir; ikisinde de oynamış futbolcuyu bul. Ne kadar az bilinen ortak, o kadar puan.',
    ready: true,
  },
  {
    id: 'kariyer',
    emoji: '🎽',
    icon: <CardsIcon size={26} />,
    title: 'Kariyer Yolu',
    body: 'Kulüpler kademe kademe açılır; kariyerin sahibini tahmin et. Ne kadar erken bilirsen o kadar puan.',
    ready: true,
  },
];

export function GameModeSelectScene({ onPick }: GameModeSelectSceneProps) {
  return (
    <section className="flex flex-col gap-8">
      <header className="text-center">
        <span className="inline-block rounded-full border border-accent-gold/40 bg-accent-gold/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-goldHi">
          Oyun Modu
        </span>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
          Hangi modu oynayalım?
        </h1>
        <p className="mt-3 text-white/65">
          Her mod aynı oyuncu havuzunu kullanır — birini seç, başlayalım.
        </p>
      </header>

      {/* 6 mod: geniş ekranda 3×2 (lg:3 sütun) → tek ekrana sığar, scroll biter.
          Orta ekran 2 sütun, mobil 1 sütun (3 sütun dar olurdu). */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODES.map((m, i) => (
          <ModeCard
            key={m.id}
            def={m}
            delay={i * 0.06}
            onClick={
              m.ready &&
              (m.id === 'vs' ||
                m.id === 'squad' ||
                m.id === 'target' ||
                m.id === 'list' ||
                m.id === 'kareler' ||
                m.id === 'zincir' ||
                m.id === 'ortak' ||
                m.id === 'kariyer')
                ? () => onPick(m.id as PlayableMode)
                : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}

function ModeCard({
  def,
  delay,
  onClick,
}: {
  def: ModeDef;
  delay: number;
  onClick?: () => void;
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
        def.ready && !disabled && 'ring-1 ring-accent-gold/30',
      )}
    >
      {!def.ready && (
        <span className="absolute right-4 top-4 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-white/55">
          Yakında
        </span>
      )}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-gold/15 text-accent-goldHi ring-1 ring-accent-gold/30">
          {def.icon}
        </div>
        <span className="text-3xl leading-none" aria-hidden>
          {def.emoji}
        </span>
      </div>
      <div>
        <h3 className="text-lg font-bold">{def.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-white/65">{def.body}</p>
      </div>
      {def.ready && (
        <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-accent-goldHi">
          ▶ Seç
        </span>
      )}
    </motion.button>
  );
}
