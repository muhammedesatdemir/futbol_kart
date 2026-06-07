import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { GameSessionProvider } from '@/lib/GameSessionProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'DerbyGoal: Futbol Kart & Tahmin',
  description: 'Futbolcu kartlarıyla bilgi düellosu — sürpriz sorular, kör kart seçimi, 4 oyun modu. DerbyGoal.',
};

// ÖNEMLİ (Faz 0 — performans): Eskiden burada `await loadGameData()` ile
// 25MB players.json YÜKLENİP GameSessionProvider'a prop olarak geçiliyordu.
// Bu, devasa veriyi HER sayfanın SSR HTML'ine gömüyordu → her tam-sayfa
// navigasyonunda (özellikle online rematch) 8-9sn bloklama + KARA EKRAN.
// Artık veri CLIENT-SIDE lazy yükleniyor (GameSessionProvider içinde
// fetchGameData, /data/players.json force-cache). Online zaten sunucu-otoriteli;
// veriye yalnızca kart seçim ekranı muhtaç. Bkz ONLINE-YOL-HARITASI.md (Faz 0).

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="font-display">
        <NextIntlClientProvider messages={messages}>
          <GameSessionProvider>{children}</GameSessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
