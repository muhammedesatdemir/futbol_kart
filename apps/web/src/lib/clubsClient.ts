/**
 * "Kariyer Yolu" modu için tam kulüp verisi (clubs.json) client-side yükleyici.
 *
 * OFFLINE (bota/arkadaşa karşı) kariyer çizelgesi kulüp ADI + ÜLKE + LOGO ister;
 * GameSessionProvider yalnız `clubsLite` (ad/logo YOK) tutar. Provider'a dokunmadan
 * burada izole çekilir — clubPoolClient.ts ile aynı desen (cache + doğrulayan fetch).
 * ONLINE'da kürasyon SUNUCUDA → bu yükleyici çağrılmaz.
 *
 * clubs.json ~1.2MB; modül-içi cache + 'default' (ETag) → bir kez iner.
 */
'use client';

import type { ClubInfo } from './careerMode';

interface ClubRaw {
  id: string;
  name: string;
  countryCode?: string;
  crestUrl?: string;
}

let cached: Map<string, ClubInfo> | null = null;
let inFlight: Promise<Map<string, ClubInfo>> | null = null;

export async function fetchClubInfoMap(): Promise<Map<string, ClubInfo>> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const res = await fetch('/data/clubs.json', { cache: 'default' });
    if (!res.ok) throw new Error(`clubs yüklenemedi: ${res.status}`);
    const raw = (await res.json()) as ClubRaw[];
    cached = new Map(
      raw.map((c) => [
        c.id,
        { id: c.id, name: c.name, countryCode: c.countryCode, crestUrl: c.crestUrl },
      ]),
    );
    return cached;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
