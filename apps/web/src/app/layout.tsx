import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { GameSessionProvider } from '@/lib/GameSessionProvider';
import { loadGameData } from '@/lib/data';
import './globals.css';

export const metadata: Metadata = {
  title: 'DerbyGoal: Futbol Kart & Tahmin',
  description: 'Futbolcu kartlarıyla bilgi düellosu — sürpriz sorular, kör kart seçimi, 4 oyun modu. DerbyGoal.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  const { players, clubsLite } = await loadGameData();

  return (
    <html lang={locale}>
      <body className="font-display">
        <NextIntlClientProvider messages={messages}>
          <GameSessionProvider players={players} clubsLite={clubsLite}>
            {children}
          </GameSessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
