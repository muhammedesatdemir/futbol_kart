import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { headers } from 'next/headers';
import { getDb, games as gamesTable } from '@futbol-kart/db';
import { auth } from '@/lib/auth';

/**
 * POST /api/games
 *
 * Maç bittikten sonra final snapshot'ı kaydeder.
 * Misafir oyunlar da kaydedilebilir (userId null).
 *
 * Body:
 *   {
 *     mode: 'hotseat' | 'vs-bot',
 *     p1Name: string,
 *     p2Name: string,
 *     p1Score: number,
 *     p2Score: number,
 *     winnerSide: 'P1' | 'P2' | 'tie',
 *     totalRounds: number,
 *     snapshot: any  // SessionState
 *   }
 *
 * Response: { shareId: string, url: string }
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = parseBody(body);
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Auth opsiyonel — varsa userId set'le
  let userId: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user) userId = session.user.id;
  } catch {
    // Misafir oyun, devam
  }

  const id = nanoid();
  const shareId = nanoid(10);
  const db = getDb();

  await db.insert(gamesTable).values({
    id,
    shareId,
    userId,
    mode: parsed.mode,
    p1Name: parsed.p1Name,
    p2Name: parsed.p2Name,
    p1Score: parsed.p1Score,
    p2Score: parsed.p2Score,
    winnerSide: parsed.winnerSide,
    totalRounds: parsed.totalRounds,
    snapshot: parsed.snapshot,
  });

  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('host') ?? 'localhost:3000';
  return NextResponse.json({
    shareId,
    url: `${proto}://${host}/mac/${shareId}`,
  });
}

interface ParsedBody {
  mode: string;
  p1Name: string;
  p2Name: string;
  p1Score: number;
  p2Score: number;
  winnerSide: string;
  totalRounds: number;
  snapshot: unknown;
}

function parseBody(body: unknown): ParsedBody | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const mode = b.mode;
  const winnerSide = b.winnerSide;
  if (
    typeof b.p1Name !== 'string' ||
    typeof b.p2Name !== 'string' ||
    typeof b.p1Score !== 'number' ||
    typeof b.p2Score !== 'number' ||
    typeof b.totalRounds !== 'number' ||
    (mode !== 'hotseat' && mode !== 'vs-bot') ||
    (winnerSide !== 'P1' && winnerSide !== 'P2' && winnerSide !== 'tie')
  ) {
    return null;
  }
  return {
    mode,
    p1Name: b.p1Name.slice(0, 40),
    p2Name: b.p2Name.slice(0, 40),
    p1Score: Math.max(0, Math.floor(b.p1Score)),
    p2Score: Math.max(0, Math.floor(b.p2Score)),
    winnerSide,
    totalRounds: Math.max(1, Math.min(99, Math.floor(b.totalRounds))),
    snapshot: b.snapshot ?? null,
  };
}
