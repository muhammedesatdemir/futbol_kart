import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { and, eq, getDb, match as matchTable, matchMove } from '@futbol-kart/db';
import { nanoid } from 'nanoid';
import { auth } from '@/lib/auth';
import {
  acknowledgeCareerIntro,
  acknowledgeCareerRoundReveal,
  applyCareerGuess,
  applyCareerTimeout,
  careerSceneDeadlineSeconds,
  type CareerMatchState,
  type CareerGuessOutcome,
} from '@/lib/server/careerMatchEngine';
import { publishMatchEvent } from '@/lib/server/ably';
import { enforceRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

/**
 * POST /api/match/[matchId]/career-move — SUNUCU-OTORİTELİ HAMLE ("Kariyer Yolu")
 *
 * `common-move`/`chain-move`'un KARDEŞİ. Diğer mod route'larına dokunmaz (izole).
 * Yalnızca `mode='kariyer'` maçlarını işler.
 *
 * EŞZAMANLI + KADEMELİ: iki taraf her kademede tahmin eder; doğru bilen kilitlenir,
 * yanlış sonraki kademeye düşer. Doğru cevap SUNUCUDA (client'a sızmaz).
 *
 * Body:
 *   { action: 'ack-intro' }                 — kariyer açılışı görüldü → GUESS
 *   { action: 'ack-round' }                  — tur sonucu görüldü → sonraki tur/RESULT
 *   { action: 'guess', playerId: string }    — bu kademedeki tahmin
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
  if (m.mode !== 'kariyer') {
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

  let state = m.state as CareerMatchState;
  const seqBase = (m.version + 1) * 16;
  const prevState = m.state as CareerMatchState;
  const prevSig = tierSig(prevState);

  // SÜRE KONTROLÜ (lazy): önceki kademenin/sahnenin süresi dolduysa otomatik ilerlet.
  const prevDeadline = m.turnDeadline ? new Date(m.turnDeadline).getTime() : null;
  try {
    const timed = await applyCareerTimeout(state, prevDeadline, Date.now());
    state = timed.state;
  } catch (err) {
    console.error('applyCareerTimeout hatası (maç çökmesi önlendi):', err);
  }

  let outcome: CareerGuessOutcome | null = null;
  const pendingLog: Array<{ side: 'P1' | 'P2'; event: Record<string, unknown> }> =
    [];

  try {
    if (action.type === 'ack-intro') {
      state = acknowledgeCareerIntro(state);
    } else if (action.type === 'ack-round') {
      state = acknowledgeCareerRoundReveal(state);
    } else {
      const r = await applyCareerGuess(state, side, action.playerId);
      state = r.nextState;
      outcome = r.outcome;
      pendingLog.push({
        side,
        event: {
          type: 'CAREER_GUESS',
          side,
          round: prevState.round,
          tier: r.outcome.tier,
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

  // Sahne, tur VEYA kademe (herhangi bir tarafın tier'ı) değiştiyse taze süre.
  const turnChanged =
    state.scene !== m.currentScene ||
    state.round !== prevState.round ||
    tierSig(state) !== prevSig;
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
    // Kendi tahmininin doğru/yanlışı + puanı (doğru CEVAP değil — o reveal'da).
    outcome,
  });
}

/** Aktif turdaki iki tarafın (tier|locked|submitted) imzası — değişim tespiti. */
function tierSig(state: CareerMatchState): string {
  const r = state.rounds[state.round];
  if (!r) return 'none';
  const f = (s: { tier: number; locked: boolean; submitted: boolean }) =>
    `${s.tier}${s.locked ? 'L' : ''}${s.submitted ? 'S' : ''}`;
  return `${f(r.P1)}|${f(r.P2)}`;
}

function computeDeadline(state: CareerMatchState, keep: number | null): Date | null {
  const secs = careerSceneDeadlineSeconds(state);
  if (secs === null) return null;
  if (keep !== null) return new Date(keep);
  return new Date(Date.now() + secs * 1000);
}

type Action =
  | { type: 'ack-intro' }
  | { type: 'ack-round' }
  | { type: 'guess'; playerId: string };

function parseAction(body: unknown): Action | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.action === 'ack-intro') return { type: 'ack-intro' };
  if (b.action === 'ack-round') return { type: 'ack-round' };
  if (b.action === 'guess') {
    if (typeof b.playerId !== 'string' || !b.playerId) return null;
    return { type: 'guess', playerId: b.playerId };
  }
  return null;
}
