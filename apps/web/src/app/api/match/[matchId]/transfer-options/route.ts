import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { eq, getDb, match as matchTable } from '@futbol-kart/db';
import {
  transferableCards,
  type SessionState,
} from '@futbol-kart/game-engine';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/match/[matchId]/transfer-options
 *
 * Oyuncu transfer jokerini AÇMAK üzereyken çağrılır. Rakibin
 * transfer-edilebilir kartlarını ve kendi transfer-edilebilir kartlarını döner.
 *
 * GİZLİLİK: rakibin TÜM eli değil, yalnızca transfer-edilebilir kartları döner —
 * ve yalnızca transfer hakkı varken (joker kullanılmamış, fazın son turu değil).
 * Böylece düz oyunda rakip eli gizli kalır; sadece transfer anında açılır
 * (mevcut offline oyundaki "yarı-geçici bakış" mantığı). Bkz ONLINE-YOL-HARITASI.md.
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

  const db = getDb();
  const rows = await db
    .select()
    .from(matchTable)
    .where(eq(matchTable.id, matchId))
    .limit(1);
  if (!rows.length) {
    return NextResponse.json({ error: 'Maç bulunamadı.' }, { status: 404 });
  }
  const m = rows[0]!;
  const side =
    m.p1UserId === userId ? 'P1' : m.p2UserId === userId ? 'P2' : null;
  if (!side) {
    return NextResponse.json(
      { error: 'Bu maçın oyuncusu değilsin.' },
      { status: 403 },
    );
  }

  const state = m.state as SessionState;

  // Transfer hakkı var mı? (yoksa rakip eli AÇILMAZ — gizlilik korunur)
  if (state.scene !== 'ROUND_PLAY') {
    return NextResponse.json({ error: 'Şu an transfer yapılamaz.' }, { status: 409 });
  }
  const used =
    side === 'P1' ? state.p1Jokers.transferUsed : state.p2Jokers.transferUsed;
  if (used) {
    return NextResponse.json({ error: 'Transfer jokerini zaten kullandın.' }, { status: 409 });
  }
  if (state.transferThisRound) {
    return NextResponse.json({ error: 'Bu turda bir transfer zaten yapıldı.' }, { status: 409 });
  }
  if (state.roundIndex >= state.totalRounds - 1) {
    return NextResponse.json({ error: 'Fazın son turunda transfer yapılamaz.' }, { status: 409 });
  }

  const ownHand = side === 'P1' ? state.p1Hand : state.p2Hand;
  const ownBonus = side === 'P1' ? state.p1BonusCards : state.p2BonusCards;
  const oppHand = side === 'P1' ? state.p2Hand : state.p1Hand;
  const oppBonus = side === 'P1' ? state.p2BonusCards : state.p1BonusCards;

  const ownCards = transferableCards(ownHand, ownBonus, state.transferLockedIds);
  const oppCards = transferableCards(oppHand, oppBonus, state.transferLockedIds);

  return NextResponse.json({
    /** Verebileceğin kartlar (kendi elinden). */
    ownCards,
    /** Alabileceğin kartlar (rakip elinden — yalnızca transfer-edilebilir olanlar). */
    oppCards,
  });
}
