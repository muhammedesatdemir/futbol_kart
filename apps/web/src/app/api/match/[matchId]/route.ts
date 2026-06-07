import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { and, eq, getDb, match as matchTable } from '@futbol-kart/db';
import type { SessionState, FlowState } from '@futbol-kart/game-engine';
import { auth } from '@/lib/auth';
import {
  applyTimeout,
  sceneDeadlineSeconds,
  computeQuestionTitle,
} from '@/lib/server/matchEngine';
import { publishMatchEvent } from '@/lib/server/ably';

export const runtime = 'nodejs';

/**
 * GET /api/match/[matchId]  — Maçın güncel durumunu yükle.
 *
 * Client online maça girince (veya reconnect olunca) bunu çağırır:
 * kaynak-doğru `state`'i sunucudan alır, kaldığı yerden devam eder.
 *
 * Güvenlik: yalnızca maçın oyuncusu erişebilir. `state` (SessionState) ham
 * doğru cevap İÇERMEZ — cevaplar player verisinden tur anında hesaplanır ve
 * yalnızca reveal'da (move yanıtında) döner. Burada dönen state oynanmış
 * kartları/skorları içerir (zaten her iki oyuncuya da görünür bilgi).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await ctx.params;
  // Client en son gördüğü sürümü ?v= ile gönderir. Sürüm değişmediyse (ve
  // timeout da tetiklenmediyse) TAM yanıt yerine minik "unchanged" döneriz →
  // computeQuestionTitle (loadGameData + şablon tarama) ve state serileştirme
  // ATLANIR. Poll'lerin çoğu (kimse hamle yapmıyorken) böylece neredeyse bedava.
  const clientVersion = Number(new URL(req.url).searchParams.get('v'));

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });
  }
  const userId = session.user.id;

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

  const side =
    m.p1UserId === userId ? 'P1' : m.p2UserId === userId ? 'P2' : null;
  if (!side) {
    return NextResponse.json(
      { error: 'Bu maçın oyuncusu değilsin.' },
      { status: 403 },
    );
  }

  // SÜRE KONTROLÜ (lazy): yükleme anında süre dolduysa otomatik tamamla.
  // Polling/Ably ile rakip sekmesi kapalı olsa bile maç ilerler.
  let fullState = m.state as SessionState;
  let deadline = m.turnDeadline ? new Date(m.turnDeadline) : null;
  let flowState = (m.flowState as FlowState | null) ?? null;
  // Bu yanıtta dönecek güncel sürüm. Timeout yazımı başarılı olursa artar.
  let currentVersion = m.version;

  const timedOut = await applyTimeout(
    fullState,
    flowState,
    deadline ? deadline.getTime() : null,
    Date.now(),
  );

  // VERSİYON KISA-DEVRESİ: timeout bir şey değiştirmedi VE client zaten güncel
  // sürümü görüyorsa, ağır işi (computeQuestionTitle → loadGameData + tarama,
  // maskeleme, tam state serileştirme) hiç yapma. Deadline'ı yine döneriz ki
  // client geri sayımı senkron tutsun. Bu, "değişmeyen poll" durumunu —
  // GET'lerin büyük çoğunluğunu — neredeyse bedava yapar.
  if (
    !timedOut.changed &&
    Number.isFinite(clientVersion) &&
    clientVersion === m.version
  ) {
    return NextResponse.json({
      unchanged: true,
      version: m.version,
      turnDeadline: deadline ? deadline.toISOString() : null,
    });
  }

  if (timedOut.changed) {
    // Yeni sahne için yeni deadline.
    const secs = sceneDeadlineSeconds(timedOut.state);
    const newDeadline = secs ? new Date(Date.now() + secs * 1000) : null;
    // OPTIMISTIC LOCKING: GET sık çağrılır (polling); iki client aynı anda
    // timeout uygulayabilir. Sürüm koşuluyla yalnızca biri yazar; diğeri
    // sessizce geçer (bir sonraki polling güncel state'i görür — retry gerekmez).
    const updated = await db
      .update(matchTable)
      .set({
        state: timedOut.state,
        flowState: timedOut.flowState,
        currentScene: timedOut.state.scene,
        turnDeadline: newDeadline,
        version: m.version + 1,
        status: timedOut.state.scene === 'FINAL' ? 'finished' : 'active',
        updatedAt: new Date(),
      })
      .where(and(eq(matchTable.id, m.id), eq(matchTable.version, m.version)))
      .returning({ id: matchTable.id });
    if (updated.length > 0) {
      fullState = timedOut.state;
      flowState = timedOut.flowState;
      deadline = newDeadline;
      currentVersion = m.version + 1;
      await publishMatchEvent(m.id, 'state-changed', {
        scene: fullState.scene,
        roundIndex: fullState.roundIndex,
        questionId: fullState.currentQuestionId,
      });
    }
    // updated.length === 0 → başka istek araya girdi; bu GET eski state'i
    // gösterir, sorun değil (1.5sn sonra polling güncelini çeker).
  }

  // GİZLİLİK: rakibin elini maskele — kart id'lerini gönderme (F12'den kart
  // sayma engellenir). Yalnızca sayısı kalır (UI rakip el boyutunu gösterir).
  const maskedState = maskOpponentHand(fullState, side);

  // Soru başlığını parametrelerle dolu olarak SUNUCUDA üret (client'ın flow'u
  // soruyu seçmediği için {targetApps} gibi yer tutucuları dolduramaz).
  const questionTitle = await computeQuestionTitle(fullState, flowState);

  return NextResponse.json({
    matchId: m.id,
    mode: m.mode,
    status: m.status,
    /** Maçın güncel sürümü — client saklar, bir sonraki GET'te ?v= ile yollar. */
    version: currentVersion,
    /** Bu isteği yapan oyuncunun tarafı — client kendi perspektifini bilir. */
    yourSide: side,
    seed: m.seed,
    state: maskedState,
    /** Parametrelerle dolu soru başlığı (online'da client bunu kullanır). */
    currentQuestionTitle: questionTitle,
    /** Rakibin el boyutu (kartları gizli ama sayısı görünür). */
    opponentHandCount:
      side === 'P1' ? fullState.p2Hand.length : fullState.p1Hand.length,
    winnerSide: m.winnerSide,
    /** Bu aşamanın sunucu-otoriteli bitiş anı (ISO) — client geri sayım gösterir. */
    turnDeadline: deadline ? deadline.toISOString() : null,
  });
}

/**
 * Rakibin el kart id'lerini boşaltır (gizlilik). Kendi elimiz olduğu gibi kalır.
 * Diğer state (skor, sahne, oynanan kartlar) zaten her iki tarafa görünür.
 */
function maskOpponentHand(
  state: SessionState,
  yourSide: 'P1' | 'P2',
): SessionState {
  if (yourSide === 'P1') {
    return { ...state, p2Hand: [] };
  }
  return { ...state, p1Hand: [] };
}
