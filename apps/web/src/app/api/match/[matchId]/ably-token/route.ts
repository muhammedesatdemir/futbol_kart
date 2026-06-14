import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { eq, getDb, match as matchTable } from '@futbol-kart/db';
import { auth } from '@/lib/auth';
import { createMatchToken, isAblyEnabled } from '@/lib/server/ably';
import { getMatchPlayerIndex } from '@/lib/server/matchmaking';
import { enforceRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

/**
 * GET /api/match/[matchId]/ably-token
 *
 * Client'ın maç kanalına güvenli bağlanması için kısa ömürlü Ably token isteği
 * üretir (API key client'a gitmez). Yalnızca maçın oyuncusu alabilir; token
 * yalnızca bu maçın kanalını dinlemeye yetkilidir.
 *
 * Ably yapılandırılmamışsa { enabled: false } döner → client polling kullanır.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await ctx.params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });
  }
  const userId = session.user.id;

  // Flood koruması — token bağlantı kurulurken/yenilenirken çağrılır (seyrek).
  const limited = enforceRateLimit(`ably-token:${userId}`, 60, 60_000);
  if (limited) return limited;

  if (!isAblyEnabled()) {
    return NextResponse.json({ enabled: false });
  }

  // Yetki: yalnızca maçın oyuncusu.
  const db = getDb();
  const rows = await db
    .select({ p1: matchTable.p1UserId, p2: matchTable.p2UserId, mode: matchTable.mode })
    .from(matchTable)
    .where(eq(matchTable.id, matchId))
    .limit(1);
  if (!rows.length) {
    return NextResponse.json({ error: 'Maç bulunamadı.' }, { status: 404 });
  }
  const m = rows[0]!;
  let isPlayer = m.p1 === userId || m.p2 === userId;
  // İMPOSTER (çok-oyunculu): P3-P5 oyuncular p1/p2'de değil → match_player'a bak.
  if (!isPlayer && m.mode === 'imposter') {
    isPlayer = (await getMatchPlayerIndex(matchId, userId)) !== null;
  }
  if (!isPlayer) {
    return NextResponse.json(
      { error: 'Bu maçın oyuncusu değilsin.' },
      { status: 403 },
    );
  }

  const tokenRequest = await createMatchToken(matchId, userId);
  if (!tokenRequest) {
    return NextResponse.json({ enabled: false });
  }
  return NextResponse.json({ enabled: true, tokenRequest });
}
