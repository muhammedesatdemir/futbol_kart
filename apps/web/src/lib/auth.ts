/**
 * Better-Auth server config.
 *
 * Giriş yolları (öncelik sırası):
 *   1. E-posta + şifre (ANA yol — kayıt: mail+kullanıcı adı+şifre, oto-giriş).
 *   2. Google OAuth ("Google ile devam et" — env varsa aktif).
 *   3. E-posta magic-link (yedek — link gelir, tıklayınca session açılır).
 *
 * Mail trafiği (Resend, free tier 3000/ay):
 *   - Şifre sıfırlama linki ("şifremi unuttum").
 *   - Magic-link (yedek giriş yolu kullanılırsa).
 *   - Kayıt doğrulaması GÖNDERİLMEZ (requireEmailVerification: false → oto-giriş).
 *   Yani normal kayıt/giriş HİÇ mail atmaz; limit pratikte yalnız reset ile harcanır.
 *
 * Gerekli env vars:
 *   - DATABASE_URL          Neon connection string
 *   - BETTER_AUTH_SECRET    32+ karakter rastgele string
 *   - BETTER_AUTH_URL       https://yourdomain.com (prod) veya http://localhost:3000 (dev)
 *   - RESEND_API_KEY        Resend dashboard'dan (şifre sıfırlama + magic-link için)
 *   - EMAIL_FROM            "DerbyGoal <noreply@derbygoal.com>" (Resend'de doğrulanmış domain)
 * Opsiyonel (Google girişi için — yoksa yalnızca e-posta/şifre + magic-link aktif olur):
 *   - GOOGLE_CLIENT_ID      Google Cloud Console → OAuth 2.0 Client ID
 *   - GOOGLE_CLIENT_SECRET  aynı yerden
 *   Yönlendirme URI'si: {BETTER_AUTH_URL}/api/auth/callback/google
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { Resend } from 'resend';
import { getDb } from '@futbol-kart/db';
import * as schema from '@futbol-kart/db';

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM ?? 'onboarding@resend.dev';
const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Google OAuth yalnızca her iki env de tanımlıysa aktif olur. Yoksa giriş
// tamamen magic-link üzerinden çalışır (geliştirmede Google kurmadan ilerlenebilir).
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleEnabled = Boolean(googleClientId && googleClientSecret);

async function sendMagicLinkEmail(email: string, url: string) {
  // Resend yapılandırılmamışsa konsola yaz — geliştirme modunda link kopyalayıp
  // tarayıcıya yapıştırarak da test edilebilir.
  if (!resend) {
    console.log(
      `\n[auth] Resend yapılandırılmamış. Magic link manuel:\n  to: ${email}\n  url: ${url}\n`,
    );
    return;
  }
  await resend.emails.send({
    from: emailFrom,
    to: email,
    subject: 'DerbyGoal — giriş linkin',
    html: actionEmailTemplate({
      intro: 'Aşağıdaki butona tıklayarak giriş yapabilirsin. Link 15 dakika geçerli.',
      buttonLabel: 'Giriş yap',
      url,
    }),
  });
}

async function sendResetPasswordEmail(email: string, url: string) {
  // Resend yoksa dev'de konsola yaz — linki tarayıcıya yapıştırarak test edilir.
  if (!resend) {
    console.log(
      `\n[auth] Resend yapılandırılmamış. Şifre sıfırlama linki manuel:\n  to: ${email}\n  url: ${url}\n`,
    );
    return;
  }
  await resend.emails.send({
    from: emailFrom,
    to: email,
    subject: 'DerbyGoal — şifre sıfırlama',
    html: actionEmailTemplate({
      intro:
        'Şifreni sıfırlamak için aşağıdaki butona tıkla. Link 1 saat geçerli. Bu isteği sen yapmadıysan görmezden gel.',
      buttonLabel: 'Şifremi sıfırla',
      url,
    }),
  });
}

function actionEmailTemplate({
  intro,
  buttonLabel,
  url,
}: {
  intro: string;
  buttonLabel: string;
  url: string;
}): string {
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 40px auto; padding: 24px; background: #0a2614; color: #f7f7f7; border-radius: 16px;">
      <h1 style="color: #ffd76b; font-size: 22px; margin: 0 0 8px;">DerbyGoal</h1>
      <p style="color: rgba(255,255,255,0.65); margin: 0 0 24px;">
        ${intro}
      </p>
      <a href="${url}" style="display: inline-block; background: linear-gradient(180deg, #ffd76b, #f0c14b); color: #1f1500; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 700;">
        ${buttonLabel}
      </a>
      <p style="color: rgba(255,255,255,0.4); font-size: 12px; margin: 24px 0 0;">
        Bu maili sen istemediysen yok say.
      </p>
    </div>
  `;
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(getDb(), {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  // E-posta + şifre ANA giriş yolu. Kayıtta doğrulama maili GÖNDERİLMEZ
  // (requireEmailVerification: false) → kayıt anında oto-giriş açılır.
  // Şifremi-unuttum akışı sendResetPassword ile Resend üzerinden mail atar.
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 6,
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail(user.email, url);
    },
    resetPasswordTokenExpiresIn: 60 * 60, // 1 saat
  },
  // Oturum cookie'si uzun ömürlü: bir kez giren bir daha şifre sormadan döner.
  // updateAge ile her kullanımda süre tazelenir (kayan pencere).
  session: {
    expiresIn: 60 * 60 * 24 * 60, // 60 gün
    updateAge: 60 * 60 * 24, // günde bir tazele
  },
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: googleClientId as string,
          clientSecret: googleClientSecret as string,
        },
      }
    : undefined,
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
      expiresIn: 60 * 15, // 15 dakika
    }),
  ],
});

export type AuthInstance = typeof auth;
