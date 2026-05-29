import { getRequestConfig } from 'next-intl/server';

export const defaultLocale = 'tr';
export const locales = ['tr'] as const;
export type Locale = (typeof locales)[number];

export default getRequestConfig(async () => {
  const locale: Locale = defaultLocale;
  const messages = (await import(`../messages/${locale}.json`)).default;
  return { locale, messages };
});
