import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { and, eq, getDb, match as matchTable, matchMove } from '@futbol-kart/db';
import { nanoid } from 'nanoid';
import { auth } from '@/lib/auth';
import {
  acknowledgeSquaresReveal,
  applySquaresGuess,
  applySquaresSuggest,
  applySquaresTimeout,
  squaresSceneDeadlineSeconds,
  type SquaresMatchState,
} from '@/lib/server/squaresMatchEngine';
import { publishMatchEvent } from '@/lib/server/ably';
import { enforceRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

/**
 * POST /api/match/[matchId]/squares-move — SUNUCU-OTORİTELİ HAMLE ("Kareleri Kap")
 *
 * `list-move`/`squad-move`/`target-move`'un KARDEŞİ; aynı iskelet. Diğer mod
 * route'larına dokunmaz (izole). Yalnızca `mode='kareler'` maçlarını işler.
 *
 * Sıra-tabanlı: yalnız aktif tarafın tahmini kabul. Bitişik grup SUNUCUDA
 * hesaplanır (client manipüle edemez). Matris açık → maskeleme yok.
 *
 * Body:
 *   { action: 'ack-reveal' }                 — matris ekranı görüldü → play
 *   { action: 'guess', playerId: string }    — sırası gelen taraf futbolcu tahmin eder
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
  if (m.mode !== 'kareler') {
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

  let state = m.state as SquaresMatchState;
  // seq version'dan türetilir (bkz. list-move — DB taraması yok).
  const seqBase = (m.version + 1) * 16;

  // SÜRE KONTROLÜ (lazy): önceki sahnenin süresi dolduysa otomatik ilerlet (pas).
  const prevDeadline = m.turnDeadline ? new Date(m.turnDeadline).getTime() : null;
  try {
    const timed = await applySquaresTimeout(state, prevDeadline, Date.now());
    state = timed.state;
  } catch (err) {
    console.error('applySquaresTimeout hatası (maç çökmesi önlendi):', err);
  }

  // Tahmin sonucu — isteği yapan oyuncuya döner (matris açık, sızıntı yok).
  let outcome: import('@/lib/server/squaresMatchEngine').SquaresGuessOutcome | null =
    null;
  // Öneri jokeri sonucu — YALNIZCA isteyene döner (kişisel).
  let suggestion: import('@/lib/server/squaresMatchEngine').SquaresSuggestResult | null =
    null;

  const prevActive = (m.state as SquaresMatchState).activeSide;
  const prevCaptured = (m.state as SquaresMatchState).grid.cells.filter(
    (c) => c.capturedBy !== null,
  ).length;
  const pendingLog: Array<{ side: 'P1' | 'P2'; event: Record<string, unknown> }> =
    [];

  try {
    if (action.type === 'ack-reveal') {
      state = acknowledgeSquaresReveal(state);
    } else if (action.type === 'use-suggest') {
      const r = await applySquaresSuggest(state, side);
      state = r.nextState;
      suggestion = r.suggestion;
    } else {
      // guess
      const r = await applySquaresGuess(state, side, action.playerId);
      state = r.nextState;
      outcome = r.outcome;
      pendingLog.push({
        side,
        event: {
          type: 'SQUARES_GUESS',
          side,
          playerId: action.playerId,
          hit: r.outcome.hit,
          gained: r.outcome.gained ?? 0,
        },
      });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Hamle reddedildi.' },
      { status: 422 },
    );
  }

  // Sahne, aktif taraf VEYA kapatılan kare sayısı değiştiyse taze süre başlat.
  const nowCaptured = state.grid.cells.filter((c) => c.capturedBy !== null).length;
  const turnChanged =
    state.scene !== m.currentScene ||
    state.activeSide !== prevActive ||
    nowCaptured !== prevCaptured;
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

  // TEK batch INSERT (audit kritik değil).
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

  // Rakibe Ably haber ver — yalnız "değişti" sinyali (matris zaten açık).
  await publishMatchEvent(matchId, 'state-changed', {
    scene: state.scene,
    activeSide: state.activeSide,
    captured: nowCaptured,
  });

  // Client'a güvenli yanıt — outcome (hit/cells/gained/lives) + öneri (kişisel).
  return NextResponse.json({
    scene: state.scene,
    activeSide: state.activeSide,
    turnDeadline: newDeadline ? newDeadline.toISOString() : null,
    outcome,
    suggestion,
  });
}

function computeDeadline(state: SquaresMatchState, keep: number | null): Date | null {
  const secs = squaresSceneDeadlineSeconds(state);
  if (secs === null) return null;
  if (keep !== null) return new Date(keep);
  return new Date(Date.now() + secs * 1000);
}

type Action =
  | { type: 'ack-reveal' }
  | { type: 'use-suggest' }
  | { type: 'guess'; playerId: string };

function parseAction(body: unknown): Action | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.action === 'ack-reveal') return { type: 'ack-reveal' };
  if (b.action === 'use-suggest') return { type: 'use-suggest' };
  if (b.action === 'guess') {
    if (typeof b.playerId !== 'string' || !b.playerId) return null;
    return { type: 'guess', playerId: b.playerId };
  }
  return null;
}
