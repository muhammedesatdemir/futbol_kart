/**
 * "Kariyer Yolu" kürate havuzu (careerPools.json) client-side yükleyici.
 *
 * OFFLINE (bota/arkadaşa karşı) kürasyonu client'ta yapar → ağırlıklı seçim
 * (2 high + 1 low) için bu listeler lazım. ONLINE'da kürasyon SUNUCUDA (bu
 * çağrılmaz). clubsClient.ts ile aynı desen (cache + doğrulayan fetch).
 * Dosya yoksa null → curateCareers eski filtre fallback'ine düşer.
 */
'use client';

import type { CareerPools } from './careerMode';

let cached: CareerPools | null = null;
let inFlight: Promise<CareerPools | null> | null = null;

export async function fetchCareerPools(): Promise<CareerPools | null> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch('/data/careerPools.json', { cache: 'default' });
      if (!res.ok) return null;
      cached = (await res.json()) as CareerPools;
      return cached;
    } catch {
      return null;
    }
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
