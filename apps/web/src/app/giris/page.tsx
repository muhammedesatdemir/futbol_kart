'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { HomeIcon, PlayIcon } from '@/components/icons';
import { PitchBackground } from '@/components/PitchBackground';
import { authClient } from '@/lib/authClient';
import { cn } from '@/lib/cn';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value || !/^.+@.+\..+$/.test(value)) {
      setErrorMsg('Geçerli bir e-posta adresi gir.');
      setStatus('error');
      return;
    }
    setStatus('sending');
    setErrorMsg(null);
    const { error } = await authClient.signIn.magicLink({
      email: value,
      callbackURL: '/',
    });
    if (error) {
      setStatus('error');
      setErrorMsg(error.message ?? 'Bir şey ters gitti, tekrar dene.');
      return;
    }
    setStatus('sent');
  };

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
          <Image src="/logo/dglogo-128.png" alt="DerbyGoal" width={24} height={24} className="rounded-md ring-1 ring-white/10" />
          <span className="text-xs font-semibold uppercase tracking-[0.22em]">
            DerbyGoal
          </span>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {status === 'sent' ? (
          <motion.section
            key="sent"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-panel-strong p-8 text-center"
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-gold/20 text-accent-goldHi ring-1 ring-accent-gold/40">
              <PlayIcon size={28} />
            </div>
            <h1 className="text-2xl font-black">E-posta yolda</h1>
            <p className="mt-2 text-sm text-white/65">
              <span className="text-white">{email}</span> adresine giriş linki
              gönderdik. Linke tıkladığında otomatik giriş yapılacak.
            </p>
            <p className="mt-4 text-xs text-white/40">
              Link 15 dakika geçerli. Gelen kutuna düşmediyse spam'i kontrol et.
            </p>
            <button
              type="button"
              onClick={() => {
                setStatus('idle');
                setEmail('');
              }}
              className="btn-ghost mt-6"
            >
              Başka adres dene
            </button>
          </motion.section>
        ) : (
          <motion.section
            key="form"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-panel-strong p-8"
          >
            <h1 className="text-2xl font-black tracking-tight">Giriş yap</h1>
            <p className="mt-1 text-sm text-white/65">
              E-posta adresini yaz, sana tek tıkla giriş linki gönderelim.
              Şifre yok.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                  E-posta
                </span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (status === 'error') setStatus('idle');
                  }}
                  placeholder="ornek@mail.com"
                  className={cn(
                    'mt-1 w-full rounded-xl border border-white/10 bg-black/30',
                    'px-4 py-3 text-base font-medium text-white',
                    'placeholder:text-white/30',
                    'outline-none transition focus:border-accent-gold/60 focus:bg-black/50',
                    status === 'error' &&
                      'border-side-red/60 focus:border-side-red/80',
                  )}
                />
              </label>

              {status === 'error' && errorMsg && (
                <p className="text-xs text-side-red">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={status === 'sending'}
                className="btn-primary w-full justify-center disabled:opacity-50"
              >
                {status === 'sending' ? 'Gönderiliyor…' : 'Giriş linki gönder'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-white/40">
              Hesabın yoksa otomatik oluşturulur. Misafir olarak da oynayabilirsin —{' '}
              <Link href="/" className="text-accent-goldHi hover:underline">
                ana sayfaya dön
              </Link>
              .
            </p>
          </motion.section>
        )}
      </AnimatePresence>
      </main>
    </>
  );
}
