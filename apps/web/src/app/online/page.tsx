'use client';

import { useRouter } from 'next/navigation';
import { PitchBackground } from '@/components/PitchBackground';
import { OnlineMatchmaking } from '@/components/OnlineMatchmaking';

/**
 * Online eşleşme sayfası.
 * Mod seçiminden "🌐 Online Eşleşme" ile buraya gelinir.
 * OnlineMatchmaking: giriş kontrolü → kuyruğa gir → eşleşince maça yönlendir.
 */
export default function OnlinePage() {
  const router = useRouter();
  return (
    <>
      <PitchBackground />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col px-5 py-10">
        <OnlineMatchmaking onCancel={() => router.push('/')} />
      </main>
    </>
  );
}
