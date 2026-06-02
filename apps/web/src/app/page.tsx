import { getTranslations } from 'next-intl/server';
import { StepCard } from '@/components/StepCard';
import { JokerInfoCard } from '@/components/JokerInfoCard';
import { HomeHero } from '@/components/HomeHero';
import { UserMenu } from '@/components/UserMenu';
import { NewGameButton } from '@/components/NewGameButton';
import { ScenePreload } from '@/components/ScenePreload';
import {
  CardsIcon,
  QuestionIcon,
  SoccerBallIcon,
  SwordsIcon,
  TrophyIcon,
} from '@/components/icons';

export default async function HomePage() {
  const t = await getTranslations('home');

  return (
    <main className="relative">
      <ScenePreload />
      {/* Hero üzerinde absolute header — şeffaf, ortam atmosferi bozulmadan görünür */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-5 sm:px-8 sm:py-6">
        <div className="pointer-events-auto flex items-center gap-2 text-white/85 drop-shadow">
          <SoccerBallIcon size={22} className="text-accent-goldHi" />
          <span className="text-sm font-semibold uppercase tracking-[0.22em]">
            Futbol Kart
          </span>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/65 backdrop-blur">
            {t('version')}
          </span>
          <UserMenu />
        </div>
      </header>

      {/* === HERO — fullscreen === */}
      <HomeHero />

      {/* === Nasıl oynanır — hero altı === */}
      <section className="relative mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-goldHi">
            {t('howItWorks')}
          </span>
          <h2 className="mt-3 text-balance text-3xl font-black tracking-tight sm:text-4xl">
            4 adımda oyna
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StepCard
            index={1}
            icon={<CardsIcon size={18} />}
            title={t('step1Title')}
            body={t('step1Body')}
            delay={0}
          />
          <StepCard
            index={2}
            icon={<QuestionIcon size={18} />}
            title={t('step2Title')}
            body={t('step2Body')}
            delay={0.06}
          />
          <StepCard
            index={3}
            icon={<SwordsIcon size={18} />}
            title={t('step3Title')}
            body={t('step3Body')}
            delay={0.12}
          />
          <StepCard
            index={4}
            icon={<TrophyIcon size={18} />}
            title={t('step4Title')}
            body={t('step4Body')}
            delay={0.18}
          />
        </div>

        {/* === Jokerler === */}
        <div className="mt-20 mb-8 flex flex-col items-center text-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-goldHi">
            {t('jokersKicker')}
          </span>
          <h2 className="mt-3 text-balance text-3xl font-black tracking-tight sm:text-4xl">
            {t('jokersTitle')}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/55">
            {t('jokersSubtitle')}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <JokerInfoCard
            emoji="✖️"
            title={t('joker1Title')}
            body={t('joker1Body')}
            delay={0}
          />
          <JokerInfoCard
            emoji="👁"
            title={t('joker2Title')}
            body={t('joker2Body')}
            delay={0.06}
          />
          <JokerInfoCard
            emoji="🔄"
            title={t('joker3Title')}
            body={t('joker3Body')}
            delay={0.12}
          />
        </div>

        {/* İkinci CTA — fold altında ulaşılabilir kalsın */}
        <div className="mt-12 flex justify-center">
          <NewGameButton label={t('playCta')} />
        </div>
      </section>

      <footer className="border-t border-white/5 px-5 py-8 text-center text-xs text-white/30 sm:px-8">
        {t('version')}
      </footer>
    </main>
  );
}
