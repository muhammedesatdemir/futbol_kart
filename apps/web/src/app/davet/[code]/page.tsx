'use client';

import { Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { PitchBackground } from '@/components/PitchBackground';
import { OnlineMatchmaking } from '@/components/OnlineMatchmaking';

/**
 * Davet linki landing'i: /davet/<code>?mode=<mod>
 *
 * Arkadaş bu linke tıklar. OnlineMatchmaking `invite.role='join'` ile çalışır:
 *  - Giriş yoksa: OnlineMatchmaking içeride returnTo ile /giris'e atar → kayıt/
 *    giriş sonrası bu tam URL'e geri döner (mevcut returnTo mekanizması).
 *  - Giriş varsa: aynı kodla davet kuyruğundan eşleşmeyi atomik claim eder →
 *    maç kurulur → ikisi de maça geçer. Davet yoksa "davet bulunamadı" gösterir.
 */
function DavetInner() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') ?? undefined;
  const code = params.code;

  return (
    <OnlineMatchmaking
      mode={mode}
      invite={{ role: 'join', code }}
      onCancel={() => router.push('/')}
    />
  );
}

export default function DavetPage() {
  return (
    <>
      <PitchBackground />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col px-5 py-10">
        {/* useSearchParams → Suspense sınırı gerekir (Next.js App Router). */}
        <Suspense fallback={null}>
          <DavetInner />
        </Suspense>
      </main>
    </>
  );
}
