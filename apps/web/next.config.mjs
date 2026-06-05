import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@futbol-kart/db',
    '@futbol-kart/game-engine',
    '@futbol-kart/shared-types',
    '@futbol-kart/question-templates',
  ],
  // Statik oyun verisi (players/clubs) nadiren değişir ama büyüktür. Varsayılan
  // `max-age=0` her açılışta yeniden indirir → uzun cache + immutable ile bir
  // kez indirilip tarayıcıda tutulur. Veri güncellenince dosya adı/sürümü
  // değiştirilerek cache kırılır (ileride ?v=hash ile). Transfer ayrıca gzip/
  // brotli ile sıkışır (Vercel prod'da otomatik brotli ~1.3MB).
  async headers() {
    return [
      {
        source: '/data/:file*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
