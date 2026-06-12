import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { and, eq, getDb, match as matchTable, matchMove } from '@futbol-kart/db';
import { nanoid } from 'nanoid';
import { auth } from '@/lib/auth';
import {
  acknowledgeChainReveal,
  applyChainGuess,
  applyChainTimeout,
  chainSceneDeadlineSeconds,
  type ChainMatchState,
} from '@/lib/server/chainMatchEngine';
import { publishMatchEvent } from '@/lib/server/ably';
import { enforceRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

/**
 * POST /api/match/[matchId]/chain-move — SUNUCU-OTORİTELİ HAMLE ("Zincir Kur")
 *
 * `squares-move`/`list-move`'un KARDEŞİ; aynı iskelet. Diğer mod route'larına
 * dokunmaz (izole). Yalnızca `mode='zincir'` maçlarını işler.
 *
 * Sıra-tabanlı (snake): yalnız aktif tarafın pick'i kabul. Keşişim SUNUCUDA
 * hesaplanır. 7 kulüp açık → maskeleme yok.
 *
 * Body:
 *   { action: 'ack-reveal' }                 — kulüp ekranı görüldü → play
 *   { action: 'guess', playerId: string }    — sırası gelen taraf futbolcu girer
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
  if (m.mode !== 'zincir') {
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

  let state = m.state as ChainMatchState;
  const seqBase = (m.version + 1) * 16;

  // SÜRE KONTROLÜ (lazy): önceki sahnenin süresi dolduysa otomatik ilerlet.
  const prevDeadline = m.turnDeadline ? new Date(m.turnDeadline).getTime() : null;
  try {
    const timed = await applyChainTimeout(state, prevDeadline, Date.now());
    state = timed.state;
  } catch (err) {
    console.error('applyChainTimeout hatası (maç çökmesi önlendi):', err);
  }

  let outcome: import('@/lib/server/chainMatchEngine').ChainGuessOutcome | null =
    null;

  const prevStep = (m.state as ChainMatchState).step;
  const pendingLog: Array<{ side: 'P1' | 'P2'; event: Record<string, unknown> }> =
    [];

  try {
    if (action.type === 'ack-reveal') {
      state = acknowledgeChainReveal(state);
    } else {
      const r = await applyChainGuess(state, side, action.playerId);
      state = r.nextState;
      outcome = r.outcome;
      pendingLog.push({
        side,
        event: {
          type: 'CHAIN_GUESS',
          side,
          playerId: action.playerId,
          gained: r.outcome.gained,
        },
      });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Hamle reddedildi.' },
      { status: 422 },
    );
  }

  // Sahne VEYA adım değiştiyse taze süre başlat.
  const turnChanged = state.scene !== m.currentScene || state.step !== prevStep;
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

  await publishMatchEvent(matchId, 'state-changed', {
    scene: state.scene,
    step: state.step,
  });

  return NextResponse.json({
    scene: state.scene,
    step: state.step,
    turnDeadline: newDeadline ? newDeadline.toISOString() : null,
    outcome,
  });
}

function computeDeadline(state: ChainMatchState, keep: number | null): Date | null {
  const secs = chainSceneDeadlineSeconds(state);
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
