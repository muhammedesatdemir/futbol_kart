/**
 * Mobil uygulama yapılandırması.
 *
 * API_BASE: web sunucusunun kökü. Statik veri (players.json) + ileride online
 * API'ler (auth, match, matchmaking) buradan çekilir. Backend'e DOKUNMUYORUZ —
 * sadece mevcut public dosyaları/endpoint'leri okuyoruz.
 *
 * Dev'de yerel web sunucusu (pnpm --filter web dev → :3000), prod'da derbygoal.com.
 * __DEV__ React Native global'i (geliştirme build'inde true).
 *
 * NOT: Android emülatörden bilgisayarın localhost'una erişim `10.0.2.2`
 * üzerindendir (localhost emülatörün kendisini gösterir). Fiziksel cihaz için
 * bilgisayarın LAN IP'si gerekir.
 */
export const config = {
  apiBase: __DEV__ ? 'http://10.0.2.2:3000' : 'https://derbygoal.com',
} as const;

/** Statik veri dosyaları (web public/data ile aynı yollar). */
export const dataUrls = {
  players: `${config.apiBase}/data/players.json`,
  clubs: `${config.apiBase}/data/clubs.json`,
} as const;
