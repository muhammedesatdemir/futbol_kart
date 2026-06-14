/**
 * Better-Auth hata nesnesini ({ code?, message?, status? }) GÜZEL TÜRKÇE'ye çevir.
 *
 * Better-Auth `error.message` HAM İngilizce döner ("Invalid email or password",
 * "Invalid password" vb.) → kullanıcıya ASLA ham gösterme. Öncelik sırası:
 *   1) `code` (Better-Auth sürümleri arası stabil) — en güvenilir.
 *   2) mesaj eşleşmesi (kod gelmezse).
 *   3) bağlam-özel genel Türkçe fallback (giriş/kayıt/sıfırlama).
 *
 * Giriş, kayıt, şifre sıfırlama akışlarının HEPSİ bunu kullanır (tek kaynak).
 */
export function trAuthError(
  error: { code?: string; message?: string; status?: number } | null | undefined,
  fallback: string,
): string {
  const code = (error?.code ?? '').toUpperCase();
  const msg = (error?.message ?? '').toLowerCase();

  // Kod-tabanlı (en güvenilir).
  if (
    code === 'INVALID_EMAIL_OR_PASSWORD' ||
    code === 'INVALID_PASSWORD' ||
    code === 'INVALID_CREDENTIALS'
  )
    return 'E-posta veya şifre hatalı. Lütfen tekrar dene.';
  if (code === 'USER_NOT_FOUND')
    return 'Bu e-posta ile kayıtlı bir hesap bulunamadı.';
  if (code === 'USER_ALREADY_EXISTS' || code === 'EMAIL_ALREADY_EXISTS')
    return 'Bu e-posta zaten kayıtlı. Giriş yapmayı dene.';
  if (code === 'PASSWORD_TOO_SHORT')
    return 'Şifre çok kısa — en az 6 karakter olmalı.';
  if (code === 'EMAIL_NOT_VERIFIED')
    return 'E-posta adresin henüz doğrulanmadı.';
  if (code === 'INVALID_TOKEN' || code === 'TOKEN_EXPIRED')
    return 'Bağlantı geçersiz veya süresi dolmuş. Yeni bir bağlantı iste.';
  if (code === 'TOO_MANY_REQUESTS' || error?.status === 429)
    return 'Çok fazla deneme yaptın. Biraz bekleyip tekrar dene.';

  // Mesaj-tabanlı yedek (kod gelmezse).
  if (
    msg.includes('invalid') &&
    (msg.includes('password') || msg.includes('email') || msg.includes('credential'))
  )
    return 'E-posta veya şifre hatalı. Lütfen tekrar dene.';
  if (msg.includes('already') && msg.includes('exist'))
    return 'Bu e-posta zaten kayıtlı. Giriş yapmayı dene.';
  if (msg.includes('not found'))
    return 'Bu e-posta ile kayıtlı bir hesap bulunamadı.';
  if (msg.includes('expired') || (msg.includes('invalid') && msg.includes('token')))
    return 'Bağlantı geçersiz veya süresi dolmuş. Yeni bir bağlantı iste.';
  if (msg.includes('too many') || msg.includes('rate limit'))
    return 'Çok fazla deneme yaptın. Biraz bekleyip tekrar dene.';

  // Bilinmeyen hata → bağlam-özel genel Türkçe (asla ham İngilizce gösterme).
  return fallback;
}
