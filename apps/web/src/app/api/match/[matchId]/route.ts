import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { eq, getDb, match as matchTable } from '@futbol-kart/db';
import type { SessionState } from '@futbol-kart/game-engine';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/match/[matchId]  — Maçın güncel durumunu yükle.
 *
 * Client online maça girince (veya reconnect olunca) bunu çağırır:
 * kaynak-doğru `state`'i sunucudan alır, kaldığı yerden devam eder.
 *
 * Güvenlik: yalnızca maçın oyuncusu erişebilir. `state` (SessionState) ham
 * doğru cevap İÇERMEZ — cevaplar player verisinden tur anında hesaplanır ve
 * yalnızca reveal'da (move yanıtında) döner. Burada dönen state oynanmış
 * kartları/skorları içerir (zaten her iki oyuncuya da görünür bilgi).
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

  const fullState = m.state as SessionState;
  // GİZLİLİK: rakibin elini maskele — kart id'lerini gönderme (F12'den kart
  // sayma engellenir). Yalnızca sayısı kalır (UI rakip el boyutunu gösterir).
  // Transfer açılınca rakibin transfer-edilebilir kartları AYRI endpoint'ten
  // gelir (transfer-options). Bkz ONLINE-YOL-HARITASI.md (hile modeli).
  const state = maskOpponentHand(fullState, side);

  return NextResponse.json({
    matchId: m.id,
    mode: m.mode,
    status: m.status,
    /** Bu isteği yapan oyuncunun tarafı — client kendi perspektifini bilir. */
    yourSide: side,
    seed: m.seed,
    state,
    /** Rakibin el boyutu (kartları gizli ama sayısı görünür). */
    opponentHandCount:
      side === 'P1' ? fullState.p2Hand.length : fullState.p1Hand.length,
    winnerSide: m.winnerSide,
    turnDeadline: m.turnDeadline,
  });
}

/**
 * Rakibin el kart id'lerini boşaltır (gizlilik). Kendi elimiz olduğu gibi kalır.
 * Diğer state (skor, sahne, oynanan kartlar) zaten her iki tarafa görünür.
 */
function maskOpponentHand(
  state: SessionState,
  yourSide: 'P1' | 'P2',
): SessionState {
  if (yourSide === 'P1') {
    return { ...state, p2Hand: [] };
  }
  return { ...state, p1Hand: [] };
}
