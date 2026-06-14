import { NextResponse } from 'next/server';
import { and, eq, getDb, match as matchTable } from '@futbol-kart/db';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getMatchPlayerIndex } from '@/lib/server/matchmaking';
import {
  acknowledgeRole,
  applyImposterWord,
  applyImposterVote,
  applyImposterTimeout,
  imposterSceneDeadlineSeconds,
  type ImposterMatchState,
  type ImposterWordOutcome,
} from '@/lib/server/imposterMatchEngine';
import { publishMatchEvent } from '@/lib/server/ably';
import { enforceRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

/**
 * POST /api/match/[matchId]/imposter-move — SUNUCU-OTORİTELİ HAMLE ("İmposter")
 *
 * ÇOK-OYUNCULU (3-5). `side` = oyuncu index'i (match_player'dan; p1/p2 DEĞİL).
 * Yalnızca `mode='imposter'` maçlarını işler. Diğer route'lara dokunmaz.
 *
 * Body:
 *   { action: 'ack-role' }                  — rol açılışı görüldü (herkes → WORDS)
 *   { action: 'submit-word', word: string } — sıra-tabanlı kelime (aktif oyuncu)
 *   { action: 'vote', target: number|null } — oy (null = çekimser)
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
  if (m.mode !== 'imposter') {
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

  // SIDE = oyuncu index'i (match_player). p1/p2 ternary DEĞİL (N oyuncu).
  const side = await getMatchPlayerIndex(matchId, userId);
  if (side === null) {
    return NextResponse.json(
      { error: 'Bu maçın oyuncusu değilsin.' },
      { status: 403 },
    );
  }

  let state = m.state as ImposterMatchState;
  const prevState = m.state as ImposterMatchState;

  // SÜRE KONTROLÜ (lazy): önceki sahnenin/sıranın süresi dolduysa otomatik ilerlet.
  const prevDeadline = m.turnDeadline ? new Date(m.turnDeadline).getTime() : null;
  try {
    const timed = await applyImposterTimeout(state, prevDeadline, Date.now());
    state = timed.state;
  } catch (err) {
    console.error('applyImposterTimeout hatası (maç çökmesi önlendi):', err);
  }

  let wordOutcome: ImposterWordOutcome | null = null;

  try {
    if (action.type === 'ack-role') {
      state = acknowledgeRole(state, side);
    } else if (action.type === 'submit-word') {
      const r = await applyImposterWord(state, side, action.word);
      state = r.nextState;
      wordOutcome = r.outcome;
    } else {
      state = applyImposterVote(state, side, action.target);
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Hamle reddedildi.' },
      { status: 422 },
    );
  }

  // Sahne, tur VEYA aktif oyuncu değiştiyse taze süre.
  const turnChanged =
    state.scene !== m.currentScene ||
    state.round !== prevState.round ||
    state.activeIndex !== prevState.activeIndex;
  const newDeadline = computeDeadline(state, turnChanged ? null : prevDeadline);

  const updated = await db
    .update(matchTable)
    .set({
      state,
      currentScene: state.scene,
      turnDeadline: newDeadline,
      version: m.version + 1,
      winnerSide: null, // kazanan takım state'te (imposter/crew) — tek-taraf kolonu kullanılmaz
      status: state.scene === 'RESULT' ? 'finished' : 'active',
      updatedAt: new Date(),
    })
    .where(and(eq(matchTable.id, matchId), eq(matchTable.version, m.version)))
    .returning({ id: matchTable.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: 'conflict', retry: true }, { status: 409 });
  }

  await publishMatchEvent(matchId, 'state-changed', {
    scene: state.scene,
    round: state.round,
  });

  return NextResponse.json({
    scene: state.scene,
    round: state.round,
    turnDeadline: newDeadline ? newDeadline.toISOString() : null,
    // Kelime kabul/red onayı (yasak kelime ise reason ile) — yalnız submit-word'te.
    wordOutcome,
  });
}

function computeDeadline(state: ImposterMatchState, keep: number | null): Date | null {
  const secs = imposterSceneDeadlineSeconds(state);
  if (secs === null) return null;
  if (keep !== null) return new Date(keep);
  return new Date(Date.now() + secs * 1000);
}

type Action =
  | { type: 'ack-role' }
  | { type: 'submit-word'; word: string }
  | { type: 'vote'; target: number | null };

function parseAction(body: unknown): Action | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.action === 'ack-role') return { type: 'ack-role' };
  if (b.action === 'submit-word') {
    if (typeof b.word !== 'string') return null;
    return { type: 'submit-word', word: b.word };
  }
  if (b.action === 'vote') {
    const t = b.target;
    if (t === null) return { type: 'vote', target: null };
    if (typeof t === 'number' && Number.isInteger(t) && t >= 0) {
      return { type: 'vote', target: t };
    }
    return null;
  }
  return null;
}
