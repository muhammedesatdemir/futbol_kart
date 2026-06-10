'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { HomeIcon } from '@/components/icons';
import { PitchBackground } from '@/components/PitchBackground';
import { signIn, signUp, requestPasswordReset } from '@/lib/authClient';
import { cn } from '@/lib/cn';

type Tab = 'login' | 'register' | 'forgot';
type Status = 'idle' | 'busy' | 'error' | 'sent';

const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true';

/** returnTo yalnızca site içi (göreli) yola izin verir — açık yönlendirme açığı önlenir. */
function safeReturnTo(raw: string | null): string {
  if (!raw) return '/';
  // Sadece tek başına '/' ile başlayan göreli yol (//host veya http... reddedilir).
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get('returnTo'));

  const [tab, setTab] = useState<Tab>('login');

  // Ortak alanlar
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resetFeedback = () => {
    setStatus('idle');
    setErrorMsg(null);
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    resetFeedback();
  };

  const goAfterAuth = () => {
    router.push(returnTo);
    // returnTo bir online sayfasıysa, oradaki matchmaking yeniden mount olur.
    router.refresh();
  };

  const handleGoogle = async () => {
    setErrorMsg(null);
    const { error } = await signIn.social({
      provider: 'google',
      callbackURL: returnTo,
    });
    if (error) {
      setStatus('error');
      setErrorMsg(error.message ?? 'Google ile giriş başarısız, tekrar dene.');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const mail = email.trim();
    if (!isEmail(mail)) return fail('Geçerli bir e-posta adresi gir.');
    if (!password) return fail('Şifreni gir.');
    setStatus('busy');
    setErrorMsg(null);
    const { error } = await signIn.email({ email: mail, password });
    if (error) {
      return fail(
        error.message ?? 'E-posta veya şifre hatalı. Tekrar dene.',
      );
    }
    goAfterAuth();
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const mail = email.trim();
    const name = username.trim();
    if (!name || name.length < 2) return fail('Kullanıcı adı en az 2 karakter olmalı.');
    if (!isEmail(mail)) return fail('Geçerli bir e-posta adresi gir.');
    if (password.length < 6) return fail('Şifre en az 6 karakter olmalı.');
    if (password !== password2) return fail('Şifreler eşleşmiyor.');
    setStatus('busy');
    setErrorMsg(null);
    // requireEmailVerification: false → kayıt başarılıysa session açılır (oto-giriş).
    const { error } = await signUp.email({ email: mail, password, name });
    if (error) {
      return fail(
        error.message ?? 'Kayıt başarısız. Bu e-posta zaten kayıtlı olabilir.',
      );
    }
    goAfterAuth();
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    const mail = email.trim();
    if (!isEmail(mail)) return fail('Geçerli bir e-posta adresi gir.');
    setStatus('busy');
    setErrorMsg(null);
    const { error } = await requestPasswordReset({
      email: mail,
      redirectTo: '/sifre-sifirla',
    });
    if (error) {
      return fail(error.message ?? 'Bir şey ters gitti, tekrar dene.');
    }
    setStatus('sent');
  };

  function fail(msg: string) {
    setStatus('error');
    setErrorMsg(msg);
  }

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
          {tab === 'forgot' && status === 'sent' ? (
            <motion.section
              key="forgot-sent"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass-panel-strong p-8 text-center"
            >
              <h1 className="text-2xl font-black">E-posta yolda</h1>
              <p className="mt-2 text-sm text-white/65">
                <span className="text-white">{email}</span> adresine şifre
                sıfırlama linki gönderdik. Linke tıklayıp yeni şifreni belirle.
              </p>
              <p className="mt-4 text-xs text-white/40">
                Link 1 saat geçerli. Gelen kutuna düşmediyse spam'i kontrol et.
              </p>
              <button
                type="button"
                onClick={() => switchTab('login')}
                className="btn-ghost mt-6"
              >
                Girişe dön
              </button>
            </motion.section>
          ) : (
            <motion.section
              key="panel"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass-panel-strong p-8"
            >
              {tab === 'forgot' ? (
                <ForgotForm
                  email={email}
                  setEmail={setEmail}
                  onSubmit={handleForgot}
                  status={status}
                  errorMsg={errorMsg}
                  onBack={() => switchTab('login')}
                  onErrorClear={resetFeedback}
                />
              ) : (
                <>
                  {/* Sekme başlıkları */}
                  <div className="mb-6 flex rounded-xl bg-black/30 p-1">
                    <TabButton
                      active={tab === 'login'}
                      onClick={() => switchTab('login')}
                    >
                      Giriş
                    </TabButton>
                    <TabButton
                      active={tab === 'register'}
                      onClick={() => switchTab('register')}
                    >
                      Kayıt
                    </TabButton>
                  </div>

                  {googleEnabled && (
                    <>
                      <button
                        type="button"
                        onClick={handleGoogle}
                        className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white px-4 py-3 text-base font-semibold text-[#1f1500] transition hover:bg-white/90"
                      >
                        <GoogleGlyph />
                        Google ile devam et
                      </button>
                      <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                        <span className="h-px flex-1 bg-white/10" />
                        veya
                        <span className="h-px flex-1 bg-white/10" />
                      </div>
                    </>
                  )}

                  {tab === 'login' ? (
                    <form onSubmit={handleLogin} className="space-y-3">
                      <Field
                        label="E-posta"
                        type="email"
                        value={email}
                        onChange={setEmail}
                        onErrorClear={resetFeedback}
                        status={status}
                        placeholder="ornek@mail.com"
                        autoComplete="email"
                      />
                      <Field
                        label="Şifre"
                        type="password"
                        value={password}
                        onChange={setPassword}
                        onErrorClear={resetFeedback}
                        status={status}
                        placeholder="••••••••"
                        autoComplete="current-password"
                      />

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => switchTab('forgot')}
                          className="text-xs text-white/55 transition hover:text-accent-goldHi"
                        >
                          Şifremi unuttum?
                        </button>
                      </div>

                      {status === 'error' && errorMsg && (
                        <p className="text-xs text-side-red">{errorMsg}</p>
                      )}

                      <button
                        type="submit"
                        disabled={status === 'busy'}
                        className="btn-primary w-full justify-center disabled:opacity-50"
                      >
                        {status === 'busy' ? 'Giriş yapılıyor…' : 'Giriş yap'}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleRegister} className="space-y-3">
                      <Field
                        label="E-posta"
                        type="email"
                        value={email}
                        onChange={setEmail}
                        onErrorClear={resetFeedback}
                        status={status}
                        placeholder="ornek@mail.com"
                        autoComplete="email"
                      />
                      <Field
                        label="Kullanıcı adı"
                        type="text"
                        value={username}
                        onChange={setUsername}
                        onErrorClear={resetFeedback}
                        status={status}
                        placeholder="Maçta görünecek adın"
                        autoComplete="username"
                      />
                      <Field
                        label="Şifre"
                        type="password"
                        value={password}
                        onChange={setPassword}
                        onErrorClear={resetFeedback}
                        status={status}
                        placeholder="En az 6 karakter"
                        autoComplete="new-password"
                      />
                      <Field
                        label="Şifre (tekrar)"
                        type="password"
                        value={password2}
                        onChange={setPassword2}
                        onErrorClear={resetFeedback}
                        status={status}
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />

                      {status === 'error' && errorMsg && (
                        <p className="text-xs text-side-red">{errorMsg}</p>
                      )}

                      <button
                        type="submit"
                        disabled={status === 'busy'}
                        className="btn-primary w-full justify-center disabled:opacity-50"
                      >
                        {status === 'busy' ? 'Kayıt olunuyor…' : 'Kayıt ol ve gir'}
                      </button>
                    </form>
                  )}

                  <p className="mt-6 text-center text-xs text-white/40">
                    Misafir olarak da oynayabilirsin —{' '}
                    <Link href="/" className="text-accent-goldHi hover:underline">
                      ana sayfaya dön
                    </Link>
                    .
                  </p>
                </>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </>
  );
}

function ForgotForm({
  email,
  setEmail,
  onSubmit,
  status,
  errorMsg,
  onBack,
  onErrorClear,
}: {
  email: string;
  setEmail: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  status: Status;
  errorMsg: string | null;
  onBack: () => void;
  onErrorClear: () => void;
}) {
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight">Şifreni mi unuttun?</h1>
      <p className="mt-1 text-sm text-white/65">
        E-posta adresini gir, sana şifre sıfırlama linki gönderelim.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <Field
          label="E-posta"
          type="email"
          value={email}
          onChange={setEmail}
          onErrorClear={onErrorClear}
          status={status}
          placeholder="ornek@mail.com"
          autoComplete="email"
        />
        {status === 'error' && errorMsg && (
          <p className="text-xs text-side-red">{errorMsg}</p>
        )}
        <button
          type="submit"
          disabled={status === 'busy'}
          className="btn-primary w-full justify-center disabled:opacity-50"
        >
          {status === 'busy' ? 'Gönderiliyor…' : 'Sıfırlama linki gönder'}
        </button>
      </form>
      <button type="button" onClick={onBack} className="btn-ghost mt-6">
        Girişe dön
      </button>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-lg py-2 text-sm font-semibold transition',
        active
          ? 'bg-accent-gold/20 text-accent-goldHi ring-1 ring-accent-gold/40'
          : 'text-white/55 hover:text-white/80',
      )}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  onErrorClear,
  status,
  placeholder,
  autoComplete,
}: {
  label: string;
  type: 'email' | 'password' | 'text';
  value: string;
  onChange: (v: string) => void;
  onErrorClear: () => void;
  status: Status;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
        {label}
      </span>
      <input
        type={type}
        inputMode={type === 'email' ? 'email' : undefined}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (status === 'error') onErrorClear();
        }}
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

function isEmail(v: string): boolean {
  return /^.+@.+\..+$/.test(v);
}

/** Google'ın resmi çok renkli "G" logosu (marka kurallarına uygun). */
function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
