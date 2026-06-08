import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { and, eq, getDb, match as matchTable, matchMove } from '@futbol-kart/db';
import { nanoid } from 'nanoid';
import { auth } from '@/lib/auth';
import {
  acknowledgeTargetReveal,
  applyTargetDraftPick,
  applyTargetXray,
  applyTargetTimeout,
  targetSceneDeadlineSeconds,
  type TargetMatchState,
} from '@/lib/server/targetMatchEngine';
import { publishMatchEvent } from '@/lib/server/ably';

// loadGameData fs ile okuduğu için Node runtime şart (Edge'de fs yok).
export const runtime = 'nodejs';

/**
 * POST /api/match/[matchId]/target-move — SUNUCU-OTORİTELİ HAMLE ("Hedefe Yaklaş")
 *
 * VS Düello'nun `move/route.ts`'inin KARDEŞİ; aynı iskelet (auth → maç oku →
 * süre dolumu → action doğrula/uygula → optimistic UPDATE → audit → Ably →
 * güvenli yanıt). VS Düello route'una HİÇ dokunmaz (izole → regresyon riski yok).
 *
 * Yalnızca `mode='hedef'` maçlarını işler (savunma: yanlış mod → 409).
 *
 * Body:
 *   { action: 'ack-reveal' }                      — hedef ekranı görüldü → draft
 *   { action: 'draft-pick', playerId: string }    — sırası gelen taraf seçer
 *   { action: 'xray',       playerId: string }    — röntgen (değer yalnız bana)
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
  if (m.mode !== 'hedef') {
    return NextResponse.json(
      { error: 'Bu maç bu uç için uygun değil.' },
      { status: 409 },
    );
  }
  if (m.status !== 'active') {
    // Maç bitti — KALICI durum (lock çakışması değil). finished:true → client
    // retry ETMESİN, sessizce yutsun (maç-sonu otomatik ack'leri buraya düşebilir).
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

  let state = m.state as TargetMatchState;
  let seq = await nextMoveSeq(db, matchId);

  // SÜRE KONTROLÜ (lazy): önceki sahnenin süresi dolduysa otomatik ilerlet.
  // Böylece rakip bekletse / sekme kapansa bile maç ilerler. DAYANIKLILIK:
  // throw olursa yut (her hamle 500 olmasın — VS Düello dersi).
  const prevDeadline = m.turnDeadline ? new Date(m.turnDeadline).getTime() : null;
  try {
    const timed = await applyTargetTimeout(state, prevDeadline, Date.now());
    state = timed.state;
  } catch (err) {
    console.error('applyTargetTimeout hatası (maç çökmesi önlendi):', err);
  }

  // Röntgen değeri YALNIZCA isteği yapan oyuncuya döner (gizli).
  let xrayValue: number | null = null;

  // Audit log'ları UPDATE'ten ÖNCE yazma (VS Düello dersi: çakışmada seq bozulur).
  const pendingLog: Array<{ side: 'P1' | 'P2'; event: Record<string, unknown> }> =
    [];

  try {
    if (action.type === 'ack-reveal') {
      state = acknowledgeTargetReveal(state);
    } else if (action.type === 'draft-pick') {
      state = await applyTargetDraftPick(state, side, action.playerId);
      pendingLog.push({
        side,
        event: { type: 'TARGET_PICK', side, playerId: action.playerId },
      });
    } else {
      // xray
      const r = await applyTargetXray(state, side, action.playerId);
      state = r.nextState;
      xrayValue = r.value;
      pendingLog.push({
        side,
        event: { type: 'TARGET_XRAY', side, playerId: action.playerId },
      });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Hamle reddedildi.' },
      { status: 422 },
    );
  }

  // Yeni deadline: sahne VEYA aktif taraf (draftStep) değiştiyse taze süre başlat;
  // değişmediyse (örn. aynı oyuncu röntgen kullandı, sıra hâlâ onda) mevcut
  // deadline'ı KORU — yoksa joker kullanan oyuncu kendi süresini sıfırlardı.
  const prevStep = (m.state as TargetMatchState).draftStep;
  const turnChanged = state.scene !== m.currentScene || state.draftStep !== prevStep;
  const newDeadline = computeDeadline(state, turnChanged ? null : prevDeadline);

  // OPTIMISTIC LOCKING: yalnızca okuduğumuz sürüm hâlâ geçerliyse yaz.
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
    // Sürüm çakışması — client retry etmeli. Audit yazılmadı (temiz tekrar).
    return NextResponse.json({ error: 'conflict', retry: true }, { status: 409 });
  }

  // UPDATE başarılı → audit log (seq çakışması olmaz). Hata olursa yut.
  for (const entry of pendingLog) {
    try {
      await db
        .insert(matchMove)
        .values({ id: nanoid(), matchId, seq: seq++, side: entry.side, event: entry.event });
    } catch {
      // audit kritik değil — state kaynak-doğru
    }
  }

  // Rakibe Ably ile haber ver (key yoksa sessizce atlanır — polling yedek).
  // Pick'ler AÇIK (snake draft doğası — rakip ne seçtiğini görür); xray değeri
  // GİZLİ olduğu için Ably mesajına KONULMAZ (yalnız yanıtta, isteği yapana).
  await publishMatchEvent(matchId, 'state-changed', {
    scene: state.scene,
    draftStep: state.draftStep,
  });

  // Client'a güvenli yanıt. xrayValue YALNIZCA bu isteği yapan oyuncuya döner.
  return NextResponse.json({
    scene: state.scene,
    draftStep: state.draftStep,
    turnDeadline: newDeadline ? newDeadline.toISOString() : null,
    xrayValue,
  });
}

/** Mevcut sahneye göre yeni deadline. `keep` verilirse o korunur. */
function computeDeadline(
  state: TargetMatchState,
  keep: number | null,
): Date | null {
  const secs = targetSceneDeadlineSeconds(state);
  if (secs === null) return null;
  if (keep !== null) return new Date(keep);
  return new Date(Date.now() + secs * 1000);
}

type Action =
  | { type: 'ack-reveal' }
  | { type: 'draft-pick'; playerId: string }
  | { type: 'xray'; playerId: string };

function parseAction(body: unknown): Action | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.action === 'ack-reveal') return { type: 'ack-reveal' };
  if (b.action === 'draft-pick') {
    if (typeof b.playerId !== 'string' || !b.playerId) return null;
    return { type: 'draft-pick', playerId: b.playerId };
  }
  if (b.action === 'xray') {
    if (typeof b.playerId !== 'string' || !b.playerId) return null;
    return { type: 'xray', playerId: b.playerId };
  }
  return null;
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
