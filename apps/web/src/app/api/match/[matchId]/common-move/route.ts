import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { and, eq, getDb, match as matchTable, matchMove } from '@futbol-kart/db';
import { nanoid } from 'nanoid';
import { auth } from '@/lib/auth';
import {
  acknowledgeCommonReveal,
  acknowledgeCommonRoundReveal,
  applyCommonSelect,
  applyCommonHint,
  applyCommonTimeout,
  commonSceneDeadlineSeconds,
  type CommonMatchState,
  type CommonSelectOutcome,
  type CommonHintResult,
} from '@/lib/server/commonMatchEngine';
import { publishMatchEvent } from '@/lib/server/ably';
import { enforceRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

/**
 * POST /api/match/[matchId]/common-move — SUNUCU-OTORİTELİ HAMLE ("Ortak Bul")
 *
 * `chain-move`/`target-move`'un KARDEŞİ; aynı iskelet. Diğer mod route'larına
 * dokunmaz (izole). Yalnızca `mode='ortak'` maçlarını işler.
 *
 * EŞZAMANLI (sıra yok): iki taraf AYNI ANDA seçer; ikisi de seçince ROUND_REVEAL.
 * Seçim doğrulama + nadirlik puanı SUNUCUDA (cevap havuzu client'a sızmaz).
 *
 * Body:
 *   { action: 'ack-reveal' }                 — çift açılışı görüldü → SELECT
 *   { action: 'ack-round' }                  — tur sonucu görüldü → sonraki tur/RESULT
 *   { action: 'select', playerId: string }   — bu turdaki ortak oyuncu seçimi
 *   { action: 'use-hint' }                   — ipucu jokeri (1×/maç, yalnız isteyene)
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
  if (m.mode !== 'ortak') {
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

  let state = m.state as CommonMatchState;
  const seqBase = (m.version + 1) * 16;
  const prevState = m.state as CommonMatchState;

  // SÜRE KONTROLÜ (lazy): önceki sahnenin süresi dolduysa otomatik ilerlet.
  const prevDeadline = m.turnDeadline ? new Date(m.turnDeadline).getTime() : null;
  try {
    const timed = await applyCommonTimeout(state, prevDeadline, Date.now());
    state = timed.state;
  } catch (err) {
    console.error('applyCommonTimeout hatası (maç çökmesi önlendi):', err);
  }

  let outcome: CommonSelectOutcome | null = null;
  // İpucu sonucu — YALNIZCA isteyene döner (kişisel).
  let hint: CommonHintResult | null = null;

  const pendingLog: Array<{ side: 'P1' | 'P2'; event: Record<string, unknown> }> =
    [];

  try {
    if (action.type === 'ack-reveal') {
      state = acknowledgeCommonReveal(state);
    } else if (action.type === 'ack-round') {
      state = acknowledgeCommonRoundReveal(state);
    } else if (action.type === 'use-hint') {
      const r = await applyCommonHint(state, side);
      state = r.nextState;
      hint = r.hint;
      // İpucu puanı/durumu değiştirmez, audit gereksiz (kişisel ipucu).
    } else {
      const r = await applyCommonSelect(state, side, action.playerId);
      state = r.nextState;
      outcome = r.outcome;
      pendingLog.push({
        side,
        event: {
          type: 'COMMON_SELECT',
          side,
          round: prevState.round,
          playerId: action.playerId,
          correct: r.outcome.correct,
        },
      });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Hamle reddedildi.' },
      { status: 422 },
    );
  }

  // Sahne VEYA tur değiştiyse taze süre başlat.
  const turnChanged =
    state.scene !== m.currentScene || state.round !== prevState.round;
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
    round: state.round,
  });

  return NextResponse.json({
    scene: state.scene,
    round: state.round,
    turnDeadline: newDeadline ? newDeadline.toISOString() : null,
    // Kendi seçiminin doğru/yanlışı (PUAN GİZLİ — reveal'da açılır).
    outcome,
    // İpucu yalnız isteyene (kişisel) — rakibe gitmez.
    hint,
  });
}

function computeDeadline(state: CommonMatchState, keep: number | null): Date | null {
  const secs = commonSceneDeadlineSeconds(state);
  if (secs === null) return null;
  if (keep !== null) return new Date(keep);
  return new Date(Date.now() + secs * 1000);
}

type Action =
  | { type: 'ack-reveal' }
  | { type: 'ack-round' }
  | { type: 'use-hint' }
  | { type: 'select'; playerId: string };

function parseAction(body: unknown): Action | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.action === 'ack-reveal') return { type: 'ack-reveal' };
  if (b.action === 'ack-round') return { type: 'ack-round' };
  if (b.action === 'use-hint') return { type: 'use-hint' };
  if (b.action === 'select') {
    if (typeof b.playerId !== 'string' || !b.playerId) return null;
    return { type: 'select', playerId: b.playerId };
  }
  return null;
}
