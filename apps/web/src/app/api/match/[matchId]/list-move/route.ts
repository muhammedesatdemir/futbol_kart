import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { and, eq, getDb, match as matchTable, matchMove } from '@futbol-kart/db';
import { nanoid } from 'nanoid';
import { auth } from '@/lib/auth';
import {
  acknowledgeListReveal,
  applyListGuess,
  applyListTimeout,
  listSceneDeadlineSeconds,
  type ListMatchState,
} from '@/lib/server/listMatchEngine';
import { publishMatchEvent } from '@/lib/server/ably';
import { enforceRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

/**
 * POST /api/match/[matchId]/list-move — SUNUCU-OTORİTELİ HAMLE ("Liste Doldur")
 *
 * `squad-move`/`target-move`'un KARDEŞİ; aynı iskelet. VS Düello/Hedefe/Kadro
 * route'larına dokunmaz (izole). Yalnızca `mode='liste'` maçlarını işler.
 *
 * 🔒 HİLE KORUMASI: liste (cevaplar) yanıtta ASLA dönmez — yalnız tahmin sonucu
 *    (hit/rank/value/lives). Sıra-tabanlı: yalnız aktif tarafın tahmini kabul.
 *
 * Body:
 *   { action: 'ack-reveal' }                 — liste ekranı görüldü → play
 *   { action: 'guess', playerId: string }    — sırası gelen taraf tahmin eder
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await ctx.params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });
  }
  const userId = session.user.id;

  // Flood koruması (hamle ucu) — bkz. move/route.ts.
  const limited = enforceRateLimit(`move:${userId}`, 120, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON.' }, { status: 400 });
  }
  const action = parseAction(body);
  if (!action) {
    return NextResponse.json({ error: 'Geçersiz eylem.' }, { status: 400 });
  }

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
  if (m.mode !== 'liste') {
    return NextResponse.json(
      { error: 'Bu maç bu uç için uygun değil.' },
      { status: 409 },
    );
  }
  if (m.status !== 'active') {
    return NextResponse.json(
      { error: 'Maç aktif değil.', finished: true },
      { status: 409 },
    );
  }

  const side =
    m.p1UserId === userId ? 'P1' : m.p2UserId === userId ? 'P2' : null;
  if (!side) {
    return NextResponse.json(
      { error: 'Bu maçın oyuncusu değilsin.' },
      { status: 403 },
    );
  }

  let state = m.state as ListMatchState;
  // seq'i DB'den OKUMUYORUZ: bu hamlenin sahiplendiği sürümden (m.version + 1)
  // türetiyoruz. Optimistic lock her başarılı hamleye benzersiz sürüm verdiği
  // için seq bloğu da benzersiz + monoton artan kalır (replay/reconnect sırası
  // korunur), fazladan round-trip olmadan. 16'lık blok: bir hamlede ~1 event.
  const seqBase = (m.version + 1) * 16;

  // SÜRE KONTROLÜ (lazy): önceki sahnenin süresi dolduysa otomatik ilerlet (pas).
  const prevDeadline = m.turnDeadline ? new Date(m.turnDeadline).getTime() : null;
  try {
    const timed = await applyListTimeout(state, prevDeadline, Date.now());
    state = timed.state;
  } catch (err) {
    console.error('applyListTimeout hatası (maç çökmesi önlendi):', err);
  }

  // Tahmin sonucu — YALNIZCA isteği yapan oyuncuya döner (liste sızdırmaz).
  let outcome: import('@/lib/server/listMatchEngine').ListGuessOutcome | null = null;

  // Sıra/can değişimini "tur değişti mi" için yakala (süre yenileme).
  const prevActive = (m.state as ListMatchState).activeSide;
  const prevFilled = Object.keys((m.state as ListMatchState).filledPlayer).length;
  const pendingLog: Array<{ side: 'P1' | 'P2'; event: Record<string, unknown> }> =
    [];

  try {
    if (action.type === 'ack-reveal') {
      state = acknowledgeListReveal(state);
    } else {
      // guess
      const r = await applyListGuess(state, side, action.playerId);
      state = r.nextState;
      outcome = r.outcome;
      pendingLog.push({
        side,
        event: { type: 'LIST_GUESS', side, playerId: action.playerId, hit: r.outcome.hit },
      });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Hamle reddedildi.' },
      { status: 422 },
    );
  }

  // Sahne, aktif taraf VEYA açılan sıra sayısı değiştiyse taze süre başlat.
  // (Her tahmin sırayı değiştirir → her başarılı hamlede süre yenilenir.)
  const nowFilled = Object.keys(state.filledPlayer).length;
  const turnChanged =
    state.scene !== m.currentScene ||
    state.activeSide !== prevActive ||
    nowFilled !== prevFilled;
  const newDeadline = computeDeadline(state, turnChanged ? null : prevDeadline);

  const updated = await db
    .update(matchTable)
    .set({
      state,
      currentScene: state.scene,
      turnDeadline: newDeadline,
      version: m.version + 1,
      winnerSide: state.scene === 'RESULT' ? state.winner : null,
      status: state.scene === 'RESULT' ? 'finished' : 'active',
      updatedAt: new Date(),
    })
    .where(and(eq(matchTable.id, matchId), eq(matchTable.version, m.version)))
    .returning({ id: matchTable.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: 'conflict', retry: true }, { status: 409 });
  }

  // TEK batch INSERT (eskiden her event ayrı round-trip'ti). audit kritik değil.
  if (pendingLog.length > 0) {
    try {
      await db.insert(matchMove).values(
        pendingLog.map((entry, i) => ({
          id: nanoid(),
          matchId,
          seq: seqBase + i,
          side: entry.side,
          event: entry.event,
        })),
      );
    } catch {
      // audit kritik değil
    }
  }

  // Rakibe Ably haber ver — yalnız "değişti" sinyali (liste/cevap TAŞIMAZ).
  // Rakip mesajı alır → ucuz ?v= GET → maskeli state (açılmış sıralar + sıra/can).
  await publishMatchEvent(matchId, 'state-changed', {
    scene: state.scene,
    activeSide: state.activeSide,
    filled: nowFilled,
  });

  // Client'a güvenli yanıt — outcome yalnız bu isteği yapan oyuncuya (liste sızmaz).
  return NextResponse.json({
    scene: state.scene,
    activeSide: state.activeSide,
    turnDeadline: newDeadline ? newDeadline.toISOString() : null,
    outcome,
  });
}

function computeDeadline(state: ListMatchState, keep: number | null): Date | null {
  const secs = listSceneDeadlineSeconds(state);
  if (secs === null) return null;
  if (keep !== null) return new Date(keep);
  return new Date(Date.now() + secs * 1000);
}

type Action =
  | { type: 'ack-reveal' }
  | { type: 'guess'; playerId: string };

function parseAction(body: unknown): Action | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.action === 'ack-reveal') return { type: 'ack-reveal' };
  if (b.action === 'guess') {
    if (typeof b.playerId !== 'string' || !b.playerId) return null;
    return { type: 'guess', playerId: b.playerId };
  }
  return null;
}

