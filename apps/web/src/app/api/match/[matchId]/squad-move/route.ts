import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { and, eq, getDb, match as matchTable, matchMove } from '@futbol-kart/db';
import { nanoid } from 'nanoid';
import { auth } from '@/lib/auth';
import {
  acknowledgeSquadReveal,
  applySquadDraftPick,
  applySquadJoker,
  applySquadTimeout,
  squadSceneDeadlineSeconds,
  type SquadMatchState,
} from '@/lib/server/squadMatchEngine';
import { publishMatchEvent } from '@/lib/server/ably';
import { enforceRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

/**
 * POST /api/match/[matchId]/squad-move — SUNUCU-OTORİTELİ HAMLE ("Kadro Kur")
 *
 * `target-move/route.ts`'in KARDEŞİ; aynı iskelet. VS Düello / Hedefe route'larına
 * dokunmaz (izole). Yalnızca `mode='kadro'` maçlarını işler.
 *
 * Body:
 *   { action: 'ack-reveal' }                              — kriter ekranı görüldü → draft
 *   { action: 'draft-pick', slotId, playerId }            — sırası gelen taraf seçer
 *   { action: 'joker' }                                   — öneri jokeri (yalnız isteyene döner)
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
  if (m.mode !== 'kadro') {
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

  let state = m.state as SquadMatchState;
  let seq = await nextMoveSeq(db, matchId);

  // SÜRE KONTROLÜ (lazy): önceki sahnenin süresi dolduysa otomatik ilerlet.
  const prevDeadline = m.turnDeadline ? new Date(m.turnDeadline).getTime() : null;
  try {
    const timed = await applySquadTimeout(state, prevDeadline, Date.now());
    state = timed.state;
  } catch (err) {
    console.error('applySquadTimeout hatası (maç çökmesi önlendi):', err);
  }

  // Öneri YALNIZCA isteği yapan oyuncuya döner (gizli değil ama mod-özel feedback).
  let suggestion: { slotId: string; playerId: string; value: number } | null = null;

  const prevStep = (m.state as SquadMatchState).draftStep;
  const pendingLog: Array<{ side: 'P1' | 'P2'; event: Record<string, unknown> }> =
    [];

  try {
    if (action.type === 'ack-reveal') {
      state = acknowledgeSquadReveal(state);
    } else if (action.type === 'draft-pick') {
      state = await applySquadDraftPick(state, side, action.slotId, action.playerId);
      pendingLog.push({
        side,
        event: {
          type: 'SQUAD_PICK',
          side,
          slotId: action.slotId,
          playerId: action.playerId,
        },
      });
    } else {
      // joker (öneri)
      const r = await applySquadJoker(state, side);
      state = r.nextState;
      suggestion = r.suggestion;
      pendingLog.push({ side, event: { type: 'SQUAD_JOKER', side } });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Hamle reddedildi.' },
      { status: 422 },
    );
  }

  // Sahne VEYA aktif taraf (draftStep) değiştiyse taze süre; değişmediyse koru
  // (öneri jokeri sırayı değiştirmez → kendi süreni sıfırlama).
  const turnChanged =
    state.scene !== m.currentScene || state.draftStep !== prevStep;
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

  for (const entry of pendingLog) {
    try {
      await db
        .insert(matchMove)
        .values({ id: nanoid(), matchId, seq: seq++, side: entry.side, event: entry.event });
    } catch {
      // audit kritik değil
    }
  }

  // Rakibe Ably haber ver. Pick'ler AÇIK (snake draft doğası). Öneri GİZLİ
  // (yalnız yanıtta, isteyene) → Ably'ye konmaz.
  await publishMatchEvent(matchId, 'state-changed', {
    scene: state.scene,
    draftStep: state.draftStep,
  });

  return NextResponse.json({
    scene: state.scene,
    draftStep: state.draftStep,
    turnDeadline: newDeadline ? newDeadline.toISOString() : null,
    suggestion,
  });
}

function computeDeadline(state: SquadMatchState, keep: number | null): Date | null {
  const secs = squadSceneDeadlineSeconds(state);
  if (secs === null) return null;
  if (keep !== null) return new Date(keep);
  return new Date(Date.now() + secs * 1000);
}

type Action =
  | { type: 'ack-reveal' }
  | { type: 'draft-pick'; slotId: string; playerId: string }
  | { type: 'joker' };

function parseAction(body: unknown): Action | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.action === 'ack-reveal') return { type: 'ack-reveal' };
  if (b.action === 'joker') return { type: 'joker' };
  if (b.action === 'draft-pick') {
    if (typeof b.slotId !== 'string' || !b.slotId) return null;
    if (typeof b.playerId !== 'string' || !b.playerId) return null;
    return { type: 'draft-pick', slotId: b.slotId, playerId: b.playerId };
  }
  return null;
}

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
