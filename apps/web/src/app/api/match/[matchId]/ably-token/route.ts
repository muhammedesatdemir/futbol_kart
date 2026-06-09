import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { eq, getDb, match as matchTable } from '@futbol-kart/db';
import { auth } from '@/lib/auth';
import { createMatchToken, isAblyEnabled } from '@/lib/server/ably';
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
    .select({ p1: matchTable.p1UserId, p2: matchTable.p2UserId })
    .from(matchTable)
    .where(eq(matchTable.id, matchId))
    .limit(1);
  if (!rows.length) {
    return NextResponse.json({ error: 'Maç bulunamadı.' }, { status: 404 });
  }
  const m = rows[0]!;
  if (m.p1 !== userId && m.p2 !== userId) {
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
