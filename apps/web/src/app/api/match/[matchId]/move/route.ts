import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { and, eq, getDb, match as matchTable, matchMove } from '@futbol-kart/db';
import { nanoid } from 'nanoid';
import type { SessionState, FlowState } from '@futbol-kart/game-engine';
import { auth } from '@/lib/auth';
import {
  applyHandSubmit,
  applyCardPlay,
  applyMultiplierJoker,
  applyRevealJoker,
  applyTransferJoker,
  maybeStartRound,
  resolveRoundOnServer,
  acknowledgeRound,
  acknowledgePhaseTransition,
  applyTimeout,
  sceneDeadlineSeconds,
} from '@/lib/server/matchEngine';
import { publishMatchEvent } from '@/lib/server/ably';

// loadGameData fs ile okuduğu için Node runtime şart (Edge'de fs yok).
export const runtime = 'nodejs';

/**
 * POST /api/match/[matchId]/move  — SUNUCU-OTORİTELİ HAMLE
 *
 * Online'ın kalbi: client yalnızca "niyet" gönderir. Sunucu maçı DB'den okur,
 * hamleyi `game-engine` ile DOĞRULAR, gerekirse turu/soruyu otomatik ilerletir,
 * kaynak-doğru state'i DB'ye yazar, Ably ile rakibe yayar ve client'a yalnızca
 * güvenli sonucu döner.
 *
 * Body (temel dilim — 2 eylem):
 *   { action: 'submit-hand', cards: string[] }   — el seçimi (eşzamanlı)
 *   { action: 'play-card',   cardId: string }    — kart oynama (eşzamanlı)
 *
 * Yetki: yalnızca maçın oyuncusu, yalnızca kendi tarafı için.
 * NOT: joker/bonus/faz/süre sonraki fazlarda (bkz ONLINE-YOL-HARITASI.md).
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
  if (m.status !== 'active') {
    return NextResponse.json({ error: 'Maç aktif değil.' }, { status: 409 });
  }

  const side =
    m.p1UserId === userId ? 'P1' : m.p2UserId === userId ? 'P2' : null;
  if (!side) {
    return NextResponse.json(
      { error: 'Bu maçın oyuncusu değilsin.' },
      { status: 403 },
    );
  }

  let state = m.state as SessionState;
  let flowState = (m.flowState as FlowState | null) ?? null;
  let seq = await nextMoveSeq(db, matchId);

  // SÜRE KONTROLÜ (lazy): önceki aşamanın süresi dolduysa otomatik tamamla.
  // Böylece rakip bekletse / sekme kapansa bile maç ilerler.
  const prevDeadline = m.turnDeadline ? new Date(m.turnDeadline).getTime() : null;
  const timedOut = await applyTimeout(state, flowState, prevDeadline, Date.now());
  state = timedOut.state;
  flowState = timedOut.flowState;
  let reveal = null;
  // İstatistik-gör jokeri: YALNIZCA bu isteği yapan oyuncuya döner (gizli).
  let revealValues = null;
  // Transfer takası: her iki tarafa tabela olarak gösterilir.
  let transfer: { side: 'P1' | 'P2'; give: string; take: string } | null = null;

  // YAN ETKİLERİ BİRİKTİR: audit log'ları UPDATE'ten ÖNCE yazma! Çakışmada
  // (409) UPDATE başarısız olur ama erken yazılmış audit + seq retry'da
  // tekrar yazılıp unique index'i bozar (eski bug buydu). Bu yüzden state'i
  // saf hesapla, audit'i biriktir, yalnızca UPDATE başarılıysa topluca yaz.
  const pendingLog: Array<{ side: 'P1' | 'P2'; event: Record<string, unknown> }> =
    [];

  try {
    if (action.type === 'submit-hand') {
      state = applyHandSubmit(state, side, action.cards);
      pendingLog.push({
        side,
        event: { type: 'HAND_SUBMITTED', side, cards: action.cards },
      });
      // İki el de geldiyse turu başlat (soruyu deterministik seç).
      const started = await maybeStartRound(state, flowState);
      state = started.state;
      flowState = started.flowState;
      if (started.questionId) {
        pendingLog.push({
          side: 'P1',
          event: { type: 'ROUND_STARTED', questionId: started.questionId },
        });
      }
    } else if (action.type === 'use-multiplier') {
      state = applyMultiplierJoker(state, side);
      pendingLog.push({ side, event: { type: 'JOKER_MULTIPLIER', side } });
    } else if (action.type === 'use-reveal') {
      const r = await applyRevealJoker(state, side, flowState);
      state = r.nextState;
      revealValues = r.values;
      pendingLog.push({ side, event: { type: 'JOKER_REVEAL', side } });
    } else if (action.type === 'ack') {
      const acked = await acknowledgeRound(state, flowState);
      state = acked.state;
      flowState = acked.flowState;
    } else if (action.type === 'phase-ack') {
      state = acknowledgePhaseTransition(state);
    } else if (action.type === 'transfer') {
      const t = applyTransferJoker(state, side, action.give, action.take);
      state = t.nextState;
      transfer = { side: t.side, give: t.give, take: t.take };
      pendingLog.push({
        side,
        event: {
          type: 'TRANSFER_EXECUTE',
          side: t.side,
          give: t.give,
          take: t.take,
        },
      });
    } else {
      // play-card
      state = applyCardPlay(state, side, action.cardId);
      pendingLog.push({
        side,
        event: { type: 'CARD_PLAYED', side, cardId: action.cardId },
      });
      // İki kart da geldiyse turu çöz (doğru cevap sunucuda kalır).
      if (state.currentP1Card && state.currentP2Card) {
        const resolved = await resolveRoundOnServer(state, flowState);
        state = resolved.nextState;
        flowState = resolved.flowState;
        reveal = resolved.reveal;
        pendingLog.push({
          side: 'P1',
          event: { type: 'ROUND_RESOLVED', ...reveal },
        });
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Hamle reddedildi.' },
      { status: 422 },
    );
  }

  // Yeni deadline hesapla. SAHNE DEĞİŞTİYSE yeni süre başlat; aynı sahnedeyse
  // (örn. P1 el seçti, P2 hâlâ seçiyor) mevcut deadline'ı KORU — yoksa rakibin
  // her hamlesi öbürünün süresini sıfırlardı.
  const sceneChanged = state.scene !== m.currentScene;
  const newDeadline = computeDeadline(
    state,
    sceneChanged ? null : prevDeadline,
  );

  // Kaynak-doğru state + flowState + deadline'ı DB'ye yaz.
  // OPTIMISTIC LOCKING: yalnızca okuduğumuz sürüm hâlâ geçerliyse yaz. Araya
  // başka hamle girdiyse (version değiştiyse) UPDATE 0 satır eder → 409 dön,
  // client retry eder. Eşzamanlı iki hamlede kaybolan hamle olmaz.
  const updated = await db
    .update(matchTable)
    .set({
      state,
      flowState,
      currentScene: state.scene,
      turnDeadline: newDeadline,
      version: m.version + 1,
      winnerSide: state.scene === 'FINAL' ? finalWinner(state) : null,
      status: state.scene === 'FINAL' ? 'finished' : 'active',
      updatedAt: new Date(),
    })
    .where(and(eq(matchTable.id, matchId), eq(matchTable.version, m.version)))
    .returning({ id: matchTable.id });

  if (updated.length === 0) {
    // Sürüm çakışması: başka bir hamle araya girdi. Client retry etmeli.
    // Audit yazılmadı (pendingLog beklemede) → retry temiz tekrarlar.
    return NextResponse.json(
      { error: 'conflict', retry: true },
      { status: 409 },
    );
  }

  // UPDATE başarılı → şimdi audit log'ları yaz (seq çakışması olmaz çünkü bu
  // sürümü biz aldık). Hata olursa yut (audit kritik değil, state kaynak-doğru).
  for (const entry of pendingLog) {
    try {
      await logMove(db, matchId, seq++, entry.side, entry.event);
    } catch {
      // audit yazımı başarısız — state zaten yazıldı, yut
    }
  }

  // Rakibe Ably ile haber ver (key yoksa sessizce atlanır — polling yedek).
  // transfer tabelası her iki tarafa gösterilir (gizli değil — açık takas).
  await publishMatchEvent(matchId, 'state-changed', {
    scene: state.scene,
    roundIndex: state.roundIndex,
    questionId: state.currentQuestionId,
    reveal,
    transfer,
  });

  // Client'a yalnızca GÜVENLİ veriyi dön (ham doğru cevap havuzu DEĞİL).
  return NextResponse.json({
    scene: state.scene,
    p1Score: state.p1Score,
    p2Score: state.p2Score,
    roundIndex: state.roundIndex,
    questionId: state.currentQuestionId,
    p1HandCount: state.p1Hand.length,
    p2HandCount: state.p2Hand.length,
    pendingMultiplier: state.pendingMultiplier,
    turnDeadline: newDeadline ? newDeadline.toISOString() : null,
    reveal,
    // revealValues YALNIZCA bu isteği yapan oyuncuya döner (kendi eli — gizli).
    revealValues,
    // transfer tabelası — her iki tarafa açık.
    transfer,
  });
}

/**
 * Mevcut sahneye göre yeni deadline. `keep` verilirse (aynı sahne) o korunur.
 * Süresiz sahnelerde null.
 */
function computeDeadline(state: SessionState, keep: number | null): Date | null {
  const secs = sceneDeadlineSeconds(state);
  if (secs === null) return null;
  if (keep !== null) return new Date(keep);
  return new Date(Date.now() + secs * 1000);
}

/** FINAL'de kazananı cumulative skora göre belirler. */
function finalWinner(state: SessionState): 'P1' | 'P2' | 'tie' {
  if (state.cumulativeP1 > state.cumulativeP2) return 'P1';
  if (state.cumulativeP2 > state.cumulativeP1) return 'P2';
  return 'tie';
}

type Action =
  | { type: 'submit-hand'; cards: string[] }
  | { type: 'play-card'; cardId: string }
  | { type: 'use-multiplier' }
  | { type: 'use-reveal' }
  | { type: 'ack' }
  | { type: 'phase-ack' }
  | { type: 'transfer'; give: string; take: string };

function parseAction(body: unknown): Action | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.action === 'use-multiplier') return { type: 'use-multiplier' };
  if (b.action === 'use-reveal') return { type: 'use-reveal' };
  if (b.action === 'ack') return { type: 'ack' };
  if (b.action === 'phase-ack') return { type: 'phase-ack' };
  if (b.action === 'transfer') {
    if (typeof b.give !== 'string' || !b.give) return null;
    if (typeof b.take !== 'string' || !b.take) return null;
    return { type: 'transfer', give: b.give, take: b.take };
  }
  if (b.action === 'submit-hand') {
    if (
      !Array.isArray(b.cards) ||
      !b.cards.every((c) => typeof c === 'string' && c)
    ) {
      return null;
    }
    return { type: 'submit-hand', cards: b.cards as string[] };
  }
  if (b.action === 'play-card') {
    if (typeof b.cardId !== 'string' || !b.cardId) return null;
    return { type: 'play-card', cardId: b.cardId };
  }
  return null;
}

async function logMove(
  db: ReturnType<typeof getDb>,
  matchId: string,
  seq: number,
  side: 'P1' | 'P2',
  event: Record<string, unknown>,
): Promise<void> {
  await db.insert(matchMove).values({ id: nanoid(), matchId, seq, side, event });
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
