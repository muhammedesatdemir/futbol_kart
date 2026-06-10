'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { nanoid } from 'nanoid';
import { PitchBackground } from '@/components/PitchBackground';
import { OnlineMatchmaking } from '@/components/OnlineMatchmaking';

/**
 * Online eşleşme sayfası.
 * Mod seçiminden buraya gelinir; `?mode=` ile hangi mod (vs-duello | hedef | …)
 * eşleşeceği belirlenir. İki yol:
 *  - Rastgele: `?mode=X` → OnlineMatchmaking rastgele kuyruğa girer.
 *  - Davet aç: `?mode=X&invite=create` → bir kod üretilir, davet eden link +
 *    bekleme ekranı görür (arkadaşını davet et).
 */
function OnlineMatchmakingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') ?? undefined;
  const wantsInvite = searchParams.get('invite') === 'create';

  // Davet kodu bir KEZ üretilir (re-render'da değişmesin → link sabit kalsın).
  const [inviteCode] = useState(() => (wantsInvite ? nanoid(10) : null));

  return (
    <OnlineMatchmaking
      mode={mode}
      invite={inviteCode ? { role: 'create', code: inviteCode } : undefined}
      onCancel={() => router.push('/')}
    />
  );
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
