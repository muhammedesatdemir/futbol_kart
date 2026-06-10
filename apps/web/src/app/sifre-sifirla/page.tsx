'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { HomeIcon } from '@/components/icons';
import { PitchBackground } from '@/components/PitchBackground';
import { resetPassword } from '@/lib/authClient';
import { cn } from '@/lib/cn';

type Status = 'idle' | 'busy' | 'error' | 'done';

/**
 * Şifre sıfırlama sayfası. Kullanıcı şifremi-unuttum mailindeki linke
 * tıklayınca buraya `?token=...` ile gelir. Yeni şifre alır, resetPassword
 * çağırır. Token yok/geçersizse "linkin süresi dolmuş" mesajı gösterilir.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  // Better-Auth token geçersizse maile ?error=INVALID_TOKEN ekleyebilir.
  const tokenError = searchParams.get('error');

  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fail = (msg: string) => {
    setStatus('error');
    setErrorMsg(msg);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return fail('Sıfırlama linki geçersiz veya süresi dolmuş.');
    if (password.length < 6) return fail('Şifre en az 6 karakter olmalı.');
    if (password !== password2) return fail('Şifreler eşleşmiyor.');
    setStatus('busy');
    setErrorMsg(null);
    const { error } = await resetPassword({ newPassword: password, token });
    if (error) {
      return fail(
        error.message ?? 'Şifre sıfırlanamadı. Link süresi dolmuş olabilir.',
      );
    }
    setStatus('done');
    // 2 sn sonra girişe yönlendir.
    setTimeout(() => router.push('/giris'), 2000);
  };

  const invalidLink = !token || tokenError;

  return (
    <>
      <PitchBackground />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        <header className="mb-8 flex items-center justify-between">
          <Link href="/" className="btn-ghost">
            <HomeIcon size={16} />
            Ana sayfa
          </Link>
          <div className="flex items-center gap-2 text-white/70">
            <Image
              src="/logo/dglogo-128.png"
              alt="DerbyGoal"
              width={24}
              height={24}
              className="rounded-md ring-1 ring-white/10"
            />
            <span className="text-xs font-semibold uppercase tracking-[0.22em]">
              DerbyGoal
            </span>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {status === 'done' ? (
            <motion.section
              key="done"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass-panel-strong p-8 text-center"
            >
              <h1 className="text-2xl font-black">Şifren güncellendi</h1>
              <p className="mt-2 text-sm text-white/65">
                Yeni şifrenle giriş yapabilirsin. Yönlendiriliyorsun…
              </p>
              <Link href="/giris" className="btn-primary mt-6 justify-center">
                Girişe git
              </Link>
            </motion.section>
          ) : invalidLink ? (
            <motion.section
              key="invalid"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass-panel-strong p-8 text-center"
            >
              <h1 className="text-2xl font-black">Geçersiz link</h1>
              <p className="mt-2 text-sm text-white/65">
                Bu şifre sıfırlama linki geçersiz veya süresi dolmuş. Yeniden
                istek oluştur.
              </p>
              <Link href="/giris" className="btn-primary mt-6 justify-center">
                Şifremi unuttum'a dön
              </Link>
            </motion.section>
          ) : (
            <motion.section
              key="form"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass-panel-strong p-8"
            >
              <h1 className="text-2xl font-black tracking-tight">
                Yeni şifre belirle
              </h1>
              <p className="mt-1 text-sm text-white/65">
                Hesabın için yeni bir şifre gir.
              </p>
              <form onSubmit={handleSubmit} className="mt-6 space-y-3">
                <PwField
                  label="Yeni şifre"
                  value={password}
                  onChange={(v) => {
                    setPassword(v);
                    if (status === 'error') setStatus('idle');
                  }}
                  status={status}
                  placeholder="En az 6 karakter"
                />
                <PwField
                  label="Yeni şifre (tekrar)"
                  value={password2}
                  onChange={(v) => {
                    setPassword2(v);
                    if (status === 'error') setStatus('idle');
                  }}
                  status={status}
                  placeholder="••••••••"
                />
                {status === 'error' && errorMsg && (
                  <p className="text-xs text-side-red">{errorMsg}</p>
                )}
                <button
                  type="submit"
                  disabled={status === 'busy'}
                  className="btn-primary w-full justify-center disabled:opacity-50"
                >
                  {status === 'busy' ? 'Kaydediliyor…' : 'Şifreyi güncelle'}
                </button>
              </form>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </>
  );
}

function PwField({
  label,
  value,
  onChange,
  status,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  status: Status;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
        {label}
      </span>
      <input
        type="password"
        autoComplete="new-password"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'mt-1 w-full rounded-xl border border-white/10 bg-black/30',
          'px-4 py-3 text-base font-medium text-white',
          'placeholder:text-white/30',
          'outline-none transition focus:border-accent-gold/60 focus:bg-black/50',
          status === 'error' && 'border-side-red/60 focus:border-side-red/80',
        )}
      />
    </label>
  );
}
