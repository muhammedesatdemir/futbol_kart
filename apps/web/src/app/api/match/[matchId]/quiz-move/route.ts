import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { and, eq, getDb, match as matchTable, matchMove } from '@futbol-kart/db';
import { nanoid } from 'nanoid';
import { auth } from '@/lib/auth';
import {
  acknowledgeQuizReveal,
  acknowledgeQuizRoundReveal,
  applyQuizSelect,
  applyQuizJoker,
  applyQuizTimeout,
  quizSceneDeadlineSeconds,
  type QuizMatchState,
  type QuizSelectOutcome,
  type QuizJokerResult,
} from '@/lib/server/quizMatchEngine';
import { publishMatchEvent } from '@/lib/server/ably';
import { enforceRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

/**
 * POST /api/match/[matchId]/quiz-move — SUNUCU-OTORİTELİ HAMLE ("4'lü Kıyas")
 *
 * `common-move`'un KARDEŞİ; aynı iskelet. Diğer mod route'larına dokunmaz (izole).
 * Yalnızca `mode='kiyas'` maçlarını işler.
 *
 * EŞZAMANLI (sıra yok): iki taraf AYNI ANDA seçer; ikisi de seçince ROUND_REVEAL.
 * Seçim doğrulama + puan + joker SUNUCUDA (değerler/doğru cevap client'a sızmaz).
 *
 * Body:
 *   { action: 'ack-reveal' }                  — metrik açılışı görüldü → SELECT
 *   { action: 'ack-round' }                   — tur sonucu görüldü → sonraki tur/RESULT
 *   { action: 'select', indexes: number[] }   — bu turdaki kart seçimi (1-2 index)
 *   { action: 'use-joker', joker: 'fifty'|'double' } — joker (1×/maç, yalnız isteyene)
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
  if (m.mode !== 'kiyas') {
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

  let state = m.state as QuizMatchState;
  const seqBase = (m.version + 1) * 16;
  const prevState = m.state as QuizMatchState;

  // SÜRE KONTROLÜ (lazy): önceki sahnenin süresi dolduysa otomatik ilerlet.
  const prevDeadline = m.turnDeadline ? new Date(m.turnDeadline).getTime() : null;
  try {
    const timed = await applyQuizTimeout(state, prevDeadline, Date.now());
    state = timed.state;
  } catch (err) {
    console.error('applyQuizTimeout hatası (maç çökmesi önlendi):', err);
  }

  let outcome: QuizSelectOutcome | null = null;
  // Joker sonucu — YALNIZCA isteyene döner (kişisel; %50 → kalan index'ler).
  let joker: QuizJokerResult | null = null;

  const pendingLog: Array<{ side: 'P1' | 'P2'; event: Record<string, unknown> }> =
    [];

  try {
    if (action.type === 'ack-reveal') {
      state = acknowledgeQuizReveal(state);
    } else if (action.type === 'ack-round') {
      state = acknowledgeQuizRoundReveal(state);
    } else if (action.type === 'use-joker') {
      const r = applyQuizJoker(state, side, action.joker);
      state = r.nextState;
      joker = r.result;
      // Joker puanı/turu değiştirmez (yalnız jokers[side] işaretlenir); audit gereksiz.
    } else {
      const r = await applyQuizSelect(state, side, action.indexes);
      state = r.nextState;
      outcome = r.outcome;
      pendingLog.push({
        side,
        event: {
          type: 'QUIZ_SELECT',
          side,
          round: prevState.round,
          indexes: action.indexes,
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
    // Kendi seçiminin doğru/yanlışı (DEĞER GİZLİ — reveal'da açılır).
    outcome,
    // Joker yalnız isteyene (kişisel) — rakibe gitmez.
    joker,
  });
}

function computeDeadline(state: QuizMatchState, keep: number | null): Date | null {
  const secs = quizSceneDeadlineSeconds(state);
  if (secs === null) return null;
  if (keep !== null) return new Date(keep);
  return new Date(Date.now() + secs * 1000);
}

type Action =
  | { type: 'ack-reveal' }
  | { type: 'ack-round' }
  | { type: 'use-joker'; joker: 'fifty' | 'double' }
  | { type: 'select'; indexes: number[] };

function parseAction(body: unknown): Action | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.action === 'ack-reveal') return { type: 'ack-reveal' };
  if (b.action === 'ack-round') return { type: 'ack-round' };
  if (b.action === 'use-joker') {
    if (b.joker === 'fifty' || b.joker === 'double') return { type: 'use-joker', joker: b.joker };
    return null;
  }
  if (b.action === 'select') {
    if (!Array.isArray(b.indexes)) return null;
    const indexes = b.indexes.filter((x): x is number => typeof x === 'number');
    if (indexes.length === 0 || indexes.length > 2) return null;
    return { type: 'select', indexes };
  }
  return null;
}
