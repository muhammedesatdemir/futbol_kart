import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { CardRow } from '@/components/CardRow';
import { PlayerCard } from '@/components/PlayerCard';
import { PitchBackground } from '@/components/PitchBackground';
import { Scoreboard } from '@/components/Scoreboard';
import Image from 'next/image';
import { HomeIcon } from '@/components/icons';
import { dummyPlayers } from '@/data/dummyPlayers';

export default async function DemoPage() {
  const t = await getTranslations('demo');

  return (
    <>
      <PitchBackground />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="btn-ghost">
          <HomeIcon size={16} />
          Ana sayfa
        </Link>
        <div className="flex items-center gap-2 text-white/70">
          <Image src="/logo/dglogo-128.png" alt="DerbyGoal" width={26} height={26} className="rounded-md ring-1 ring-white/10" />
          <span className="text-sm font-semibold uppercase tracking-[0.22em]">
            DerbyGoal
          </span>
        </div>
      </header>

      <section className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-gold/30 bg-accent-gold/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-goldHi">
          {t('kicker')}
        </span>
        <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
          {t('title')}
        </h1>
        <p className="mt-2 text-sm text-white/65 sm:text-base">{t('subtitle')}</p>
      </section>

      <Scoreboard
        p1Name={t('scoreboardPlayer1')}
        p2Name={t('scoreboardPlayer2')}
        p1Score={1}
        p2Score={2}
        round={3}
        totalRounds={7}
      />

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-goldHi">
            {t('openCards')}
          </h2>
          <div className="ml-4 h-px flex-1 bg-gradient-to-r from-accent-gold/30 to-transparent" />
        </div>
        <CardRow>
          {dummyPlayers.map((p) => (
            <PlayerCard key={p.id} player={p} />
          ))}
        </CardRow>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-goldHi">
            {t('closedCards')}
          </h2>
          <div className="ml-4 h-px flex-1 bg-gradient-to-r from-accent-gold/30 to-transparent" />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <PlayerCard key={`r-${i}`} faceDown index={i} side="red" />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <PlayerCard key={`b-${i}`} faceDown index={i} side="blue" />
          ))}
        </div>
      </section>
      </main>
    </>
  );
}
