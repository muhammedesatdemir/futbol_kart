import { NextResponse } from 'next/server';
import { eq, getDb, games as gamesTable } from '@futbol-kart/db';

/**
 * GET /api/games/[shareId]
 *
 * Read-only paylaşım. Auth gerekmez.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await ctx.params;
  if (!shareId || shareId.length < 6) {
    return NextResponse.json({ error: 'Bad shareId' }, { status: 400 });
  }

  const db = getDb();
  const row = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.shareId, shareId))
    .limit(1);

  if (!row.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const g = row[0]!;
  return NextResponse.json({
    shareId: g.shareId,
    mode: g.mode,
    p1Name: g.p1Name,
    p2Name: g.p2Name,
    p1Score: g.p1Score,
    p2Score: g.p2Score,
    winnerSide: g.winnerSide,
    totalRounds: g.totalRounds,
    snapshot: g.snapshot,
    createdAt: g.createdAt,
  });
}
