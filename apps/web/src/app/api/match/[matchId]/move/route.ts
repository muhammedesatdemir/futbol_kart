import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { eq, getDb, match as matchTable, matchMove } from '@futbol-kart/db';
import { nanoid } from 'nanoid';
import type { SessionState } from '@futbol-kart/game-engine';
import { auth } from '@/lib/auth';
import { applyCardPlay, resolveRoundOnServer } from '@/lib/server/matchEngine';

// loadGameData fs ile okuduğu için Node runtime şart (Edge'de fs yok).
export const runtime = 'nodejs';

/**
 * POST /api/match/[matchId]/move  — SUNUCU-OTORİTELİ HAMLE (kavram ispatı)
 *
 * Online'ın kalbi: client yalnızca "şu kartı oynadım" niyetini gönderir.
 * Sunucu maçı DB'den okur, hamleyi `game-engine` ile DOĞRULAR, iki taraf da
 * oynadıysa turu SUNUCUDA çözer (doğru cevap client'a sızmaz), kaynak-doğru
 * state'i DB'ye yazar ve client'a yalnızca güvenli sonucu döner.
 *
 * Body: { side: 'P1' | 'P2', cardId: string }
 * Yetki: yalnızca maçın oyuncusu, yalnızca kendi tarafı için hamle yapabilir.
 *
 * NOT: Bu bir kavram ispatıdır — realtime (Ably) yayını ve süre/deadline
 * zorlaması sonraki fazlarda eklenecek (bkz ONLINE-YOL-HARITASI.md Faz 3-5).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await ctx.params;

  // 1) Yetki: girişli kullanıcı şart (online yalnızca girişliye açık).
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });
  }
  const userId = session.user.id;

  // 2) Gövdeyi doğrula.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON.' }, { status: 400 });
  }
  const parsed = parseMoveBody(body);
  if (!parsed) {
    return NextResponse.json({ error: 'Geçersiz hamle gövdesi.' }, { status: 400 });
  }

  const db = getDb();

  // 3) Maçı oku (kaynak-doğru state DB'de).
  const rows = await db
    .select()
    .from(matchTable)
    .where(eq(matchTable.id, matchId))
    .limit(1);
  if (!rows.length) {
    return NextResponse.json({ error: 'Maç bulunamadı.' }, { status: 404 });
  }
  const m = rows[0]!;

  if (m.status !== 'active') {
    return NextResponse.json({ error: 'Maç aktif değil.' }, { status: 409 });
  }

  // 4) Bu kullanıcı bu maçın oyuncusu mu, ve oynadığı taraf KENDİ tarafı mı?
  const userSide =
    m.p1UserId === userId ? 'P1' : m.p2UserId === userId ? 'P2' : null;
  if (!userSide) {
    return NextResponse.json({ error: 'Bu maçın oyuncusu değilsin.' }, { status: 403 });
  }
  if (userSide !== parsed.side) {
    return NextResponse.json(
      { error: 'Yalnızca kendi tarafın için hamle yapabilirsin.' },
      { status: 403 },
    );
  }

  // 5) Hamleyi SUNUCUDA doğrula + uygula (game-engine).
  let state = m.state as SessionState;
  let nextSeq = await nextMoveSeq(db, matchId);
  try {
    state = applyCardPlay(state, parsed.side, parsed.cardId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Hamle reddedildi.' },
      { status: 422 },
    );
  }

  // Hamleyi audit log'a yaz (replay/reconnect için).
  await db.insert(matchMove).values({
    id: nanoid(),
    matchId,
    seq: nextSeq,
    side: parsed.side,
    event: { type: 'CARD_PLAYED', side: parsed.side, cardId: parsed.cardId },
  });
  nextSeq += 1;

  // 6) İki taraf da oynadıysa turu SUNUCUDA çöz (doğru cevap burada kalır).
  let reveal = null;
  if (state.currentP1Card && state.currentP2Card) {
    const resolved = await resolveRoundOnServer(state);
    state = resolved.nextState;
    reveal = resolved.reveal;
    await db.insert(matchMove).values({
      id: nanoid(),
      matchId,
      seq: nextSeq,
      side: 'P1', // 'system' resolve — tarafı P1 ile işaretliyoruz (audit amaçlı)
      event: { type: 'ROUND_RESOLVED', ...reveal },
    });
  }

  // 7) Kaynak-doğru state'i DB'ye yaz.
  await db
    .update(matchTable)
    .set({ state, currentScene: state.scene, updatedAt: new Date() })
    .where(eq(matchTable.id, matchId));

  // 8) Client'a yalnızca GÜVENLİ veriyi dön (ham doğru cevap havuzu DEĞİL).
  return NextResponse.json({
    scene: state.scene,
    p1Score: state.p1Score,
    p2Score: state.p2Score,
    roundIndex: state.roundIndex,
    // reveal yalnızca tur çözüldüyse dolu — o turun gerçek değerleri.
    reveal,
  });
}

interface MoveBody {
  side: 'P1' | 'P2';
  cardId: string;
}

function parseMoveBody(body: unknown): MoveBody | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.side !== 'P1' && b.side !== 'P2') return null;
  if (typeof b.cardId !== 'string' || !b.cardId) return null;
  return { side: b.side, cardId: b.cardId };
}

/** Bu maç için bir sonraki sıra numarası (audit log idempotency). */
async function nextMoveSeq(
  db: ReturnType<typeof getDb>,
  matchId: string,
): Promise<number> {
  const existing = await db
    .select({ seq: matchMove.seq })
    .from(matchMove)
    .where(eq(matchMove.matchId, matchId));
  if (!existing.length) return 0;
  return Math.max(...existing.map((r) => r.seq)) + 1;
}
