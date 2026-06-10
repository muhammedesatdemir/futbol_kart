'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PitchBackground } from '@/components/PitchBackground';
import { OnlineMatchmaking } from '@/components/OnlineMatchmaking';

/**
 * Online eşleşme sayfası.
 * Mod seçiminden buraya gelinir; `?mode=` ile hangi mod (vs-duello | hedef | …)
 * eşleşeceği belirlenir. OnlineMatchmaking giriş sonrası bir SEÇİM ekranı sunar
 * (rastgele rakip / arkadaşını davet et) ve seçime göre akışı yürütür.
 */
function OnlineMatchmakingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') ?? undefined;

  return <OnlineMatchmaking mode={mode} onCancel={() => router.push('/')} />;
}

export default function OnlinePage() {
  return (
    <>
      <PitchBackground />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col px-5 py-10">
        {/* useSearchParams → Suspense sınırı gerekir (Next.js App Router). */}
        <Suspense fallback={null}>
          <OnlineMatchmakingInner />
        </Suspense>
      </main>
    </>
  );
}
