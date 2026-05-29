import { notFound } from 'next/navigation';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getDb, games as gamesTable } from '@futbol-kart/db';
import type { Metadata } from 'next';
import {
  CardsIcon,
  HomeIcon,
  SoccerBallIcon,
  TrophyIcon,
} from '@/components/icons';
import { NewGameButton } from '@/components/NewGameButton';
import { PitchBackground } from '@/components/PitchBackground';
import { cn } from '@/lib/cn';

interface SharedGameRow {
  shareId: string;
  mode: string;
  p1Name: string;
  p2Name: string;
  p1Score: number;
  p2Score: number;
  winnerSide: string;
  totalRounds: number;
  createdAt: Date;
}

async function loadGame(shareId: string): Promise<SharedGameRow | null> {
  try {
    const db = getDb();
    const row = await db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.shareId, shareId))
      .limit(1);
    if (!row.length) return null;
    const g = row[0]!;
    return {
      shareId: g.shareId,
      mode: g.mode,
      p1Name: g.p1Name,
      p2Name: g.p2Name,
      p1Score: g.p1Score,
      p2Score: g.p2Score,
      winnerSide: g.winnerSide,
      totalRounds: g.totalRounds,
      createdAt: g.createdAt,
    };
  } catch {
    // DB bağlanmamışsa null dön (geliştirme ortamı için).
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shareId: string }>;
}): Promise<Metadata> {
  const { shareId } = await params;
  const game = await loadGame(shareId);
  if (!game) {
    return { title: 'Maç bulunamadı · Futbol Kart' };
  }
  const winner =
    game.winnerSide === 'tie'
      ? 'Berabere'
      : game.winnerSide === 'P1'
        ? game.p1Name
        : game.p2Name;
  const title = `${game.p1Name} ${game.p1Score} – ${game.p2Score} ${game.p2Name} · Futbol Kart`;
  const description =
    game.winnerSide === 'tie'
      ? `${game.p1Name} ile ${game.p2Name} berabere kaldı.`
      : `Kazanan: ${winner}. Maçı incele veya kendin de oyna.`;
  return { title, description };
}

export default async function SharedMatchPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const game = await loadGame(shareId);
  if (!game) notFound();

  const winnerName =
    game.winnerSide === 'tie'
      ? 'Berabere'
      : game.winnerSide === 'P1'
        ? game.p1Name
        : game.p2Name;
  const dateFormatted = new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(game.createdAt);

  return (
    <>
      <PitchBackground />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="btn-ghost">
          <HomeIcon size={16} />
          Ana sayfa
        </Link>
        <div className="flex items-center gap-2 text-white/70">
          <SoccerBallIcon size={18} className="text-accent-goldHi" />
          <span className="text-xs font-semibold uppercase tracking-[0.22em]">
            Futbol Kart
          </span>
        </div>
      </header>

      <section className="flex flex-col items-center gap-6 text-center">
        <div
          className={cn(
            'flex h-20 w-20 items-center justify-center rounded-2xl',
            game.winnerSide === 'tie'
              ? 'bg-white/10 text-white/70 ring-1 ring-white/20'
              : 'bg-accent-gold/20 text-accent-goldHi ring-1 ring-accent-gold/40 shadow-glow-gold',
          )}
        >
          <TrophyIcon size={40} />
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-goldHi">
            {game.winnerSide === 'tie' ? 'Sonuç' : 'Kazanan'}
          </div>
          <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
            {winnerName}
          </h1>
        </div>

        <div className="glass-panel-strong flex w-full items-stretch overflow-hidden">
          <SidePanel
            name={game.p1Name}
            score={game.p1Score}
            side="red"
            isWinner={game.winnerSide === 'P1'}
          />
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
              Sonuç
            </span>
            <span className="text-xl font-black text-white/85">
              {game.p1Score} – {game.p2Score}
            </span>
          </div>
          <SidePanel
            name={game.p2Name}
            score={game.p2Score}
            side="blue"
            isWinner={game.winnerSide === 'P2'}
          />
        </div>

        <div className="text-xs text-white/45">
          {game.totalRounds} tur · {game.mode === 'hotseat' ? 'Arkadaşına karşı' : 'Bota karşı'} ·{' '}
          {dateFormatted}
        </div>
      </section>

      <section className="glass-panel flex flex-col items-center gap-4 p-8 text-center">
        <CardsIcon size={32} className="text-accent-goldHi" />
        <h2 className="text-xl font-bold">Sen de bir el oyna</h2>
        <p className="max-w-md text-sm text-white/65">
          Aynı oyunu sen de deneyebilirsin. Arkadaşına veya bota karşı — kart seç,
          soruyu gör, kazan.
        </p>
        <NewGameButton label="Hemen oyna" />
      </section>
      </main>
    </>
  );
}

function SidePanel({
  name,
  score,
  side,
  isWinner,
}: {
  name: string;
  score: number;
  side: 'red' | 'blue';
  isWinner: boolean;
}) {
  const bar =
    side === 'red'
      ? 'from-side-red/70 via-side-red/30 to-transparent bg-gradient-to-r'
      : 'from-side-blue/70 via-side-blue/30 to-transparent bg-gradient-to-l';
  const dot = side === 'red' ? 'bg-side-red' : 'bg-side-blue';
  return (
    <div
      className={cn(
        'relative flex min-w-[40%] items-center gap-3 px-4 py-4 sm:min-w-[35%]',
        side === 'blue' && 'flex-row-reverse text-right',
        bar,
      )}
    >
      <span className={cn('h-2.5 w-2.5 rounded-full', dot)} />
      <div className="flex flex-1 flex-col">
        <span
          className={cn(
            'text-[10px] font-semibold uppercase tracking-[0.18em]',
            isWinner ? 'text-accent-goldHi' : 'text-white/55',
          )}
        >
          {name}
        </span>
        <span
          className={cn(
            'text-3xl font-black leading-none',
            isWinner ? 'text-accent-goldHi' : 'text-white',
          )}
        >
          {score}
        </span>
      </div>
    </div>
  );
}
