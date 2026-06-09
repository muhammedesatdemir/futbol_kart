/**
 * Hafif, bağımlılıksız rate-limit — API route'larını flood/spam'e karşı korur.
 *
 * Amaç (PLAN/güvenlik notu): kötü niyetli biri `/api/match/.../move` veya
 * `/api/matchmaking`'i saniyede yüzlerce kez çağırıp Neon bağlantısını / Ably
 * mesaj kotasını tüketmesin. Bu bir DoS kalkanı DEĞİL (dağıtık saldırıyı durdurmaz);
 * tek-kullanıcı/tek-IP kaynaklı aşırı isteği eler — ilk savunma katmanı.
 *
 * Tasarım kararları:
 *   - **In-memory + sliding window.** Harici servis (Upstash vb.), env veya
 *     bağımlılık YOK — kuruluma dokunmaz. Vercel serverless'ta bellek instance
 *     başına/cold-start'ta sıfırlanır → kalıcı/dağıtık değil; ama tek instance'a
 *     gelen burst'ü yine de keser. Trafik büyürse Upstash'e taşınabilir (aynı API).
 *   - **Fail-open.** Limit aşılmadıkça hiçbir şeyi değiştirmez; emin olunmayan
 *     durumda isteğe İZİN verir (oyun akışını asla yanlışlıkla bozmamak için).
 *   - **Cömert limitler.** Normal oyun trafiğinin çok üstünde — gerçek oyuncu
 *     asla görmez; yalnız otomatik flood 429 alır.
 *   - **Kendini temizler.** Süresi geçen pencereler tembelce silinir (bellek sızmaz).
 */

import { NextResponse } from 'next/server';

/** Bir anahtarın son istek zaman damgaları (ms). En eski baştan düşülür. */
const buckets = new Map<string, number[]>();

/** Bellek tavanı — bu kadar farklı anahtardan sonra en eskiler atılır (sızma önlemi). */
const MAX_KEYS = 10_000;

export interface RateLimitResult {
  /** İsteğe izin verilsin mi? */
  ok: boolean;
  /** Reddedildiyse client'ın beklemesi gereken yaklaşık saniye (Retry-After). */
  retryAfterSec: number;
}

/**
 * Sliding-window rate-limit kontrolü.
 *
 * @param key        Benzersiz aktör+uç anahtarı (örn. `move:<userId>`).
 * @param limit      Pencere başına izinli istek sayısı.
 * @param windowMs   Pencere genişliği (ms).
 * @returns          ok=false ise çağıran 429 + Retry-After ile yanıt vermeli.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Bellek tavanı: çok fazla farklı anahtar birikirse en eski yarısını at
  // (basit + ucuz; LRU değil ama sızmayı önlemeye yeter).
  if (buckets.size > MAX_KEYS) {
    let removed = 0;
    const target = Math.floor(MAX_KEYS / 2);
    for (const k of buckets.keys()) {
      buckets.delete(k);
      if (++removed >= target) break;
    }
  }

  const hits = buckets.get(key);
  if (!hits) {
    buckets.set(key, [now]);
    return { ok: true, retryAfterSec: 0 };
  }

  // Pencere dışındaki eski isteklerin başını düş (sliding window).
  let firstValid = 0;
  while (firstValid < hits.length && hits[firstValid]! <= windowStart) {
    firstValid++;
  }
  if (firstValid > 0) hits.splice(0, firstValid);

  if (hits.length >= limit) {
    // En eski geçerli isteğin pencereden çıkacağı ana kadar bekle.
    const oldest = hits[0]!;
    const retryMs = Math.max(0, oldest + windowMs - now);
    return { ok: false, retryAfterSec: Math.ceil(retryMs / 1000) || 1 };
  }

  hits.push(now);
  return { ok: true, retryAfterSec: 0 };
}

/**
 * Pratik kısayol: `userId` (yoksa IP) bazlı limit kontrolü + hazır 429 yanıtı.
 * İzin varsa `null` döner (çağıran normal akışa devam eder); aşılırsa doğrudan
 * döndürülecek `NextResponse` (429 + Retry-After) döner.
 *
 * Kullanım (route'ta session alındıktan sonra):
 *   const limited = enforceRateLimit(`move:${userId}`, 120, 60_000);
 *   if (limited) return limited;
 */
export function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const r = checkRateLimit(key, limit, windowMs);
  if (r.ok) return null;
  return NextResponse.json(
    { error: 'Çok fazla istek. Lütfen biraz bekle.' },
    { status: 429, headers: { 'Retry-After': String(r.retryAfterSec) } },
  );
}
