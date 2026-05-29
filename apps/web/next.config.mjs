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
};

export default withNextIntl(nextConfig);
