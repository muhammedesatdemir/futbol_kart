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
import {
  applyTargetTimeout,
  targetSceneDeadlineSeconds,
  targetCriterionView,
  type TargetMatchState,
} from '@/lib/server/targetMatchEngine';
import {
  applySquadTimeout,
  squadSceneDeadlineSeconds,
  squadCriterionView,
  type SquadMatchState,
} from '@/lib/server/squadMatchEngine';
import {
  applyListTimeout,
  listSceneDeadlineSeconds,
  listCriterionView,
  listFullList,
  type ListMatchState,
} from '@/lib/server/listMatchEngine';
import {
  applySquaresTimeout,
  squaresSceneDeadlineSeconds,
  type SquaresMatchState,
} from '@/lib/server/squaresMatchEngine';
import {
  applyChainTimeout,
  chainSceneDeadlineSeconds,
  type ChainMatchState,
} from '@/lib/server/chainMatchEngine';
import {
  applyCommonTimeout,
  commonSceneDeadlineSeconds,
  maskCommonState,
  type CommonMatchState,
} from '@/lib/server/commonMatchEngine';
import {
  applyCareerTimeout,
  careerSceneDeadlineSeconds,
  viewCareerState,
  type CareerMatchState,
} from '@/lib/server/careerMatchEngine';
import {
  applyQuizTimeout,
  quizSceneDeadlineSeconds,
  maskQuizState,
  type QuizMatchState,
} from '@/lib/server/quizMatchEngine';
import { publishMatchEvent } from '@/lib/server/ably';
import { enforceRateLimit } from '@/lib/server/rateLimit';

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
  //
  // KRİTİK: `?v=` parametresi YOKKEN (ilk yükleme) clientVersion NaN olmalı —
  // `Number(null)` 0 verir ve yeni maç version=0 ile başladığı için "0===0"
  // çakışıp İLK GET'i `unchanged` yapardı → client TAM state'i HİÇ alamaz →
  // sayfa kara ekranda (return null) ~deadline kadar takılırdı (kök neden bug).
  // null → NaN → Number.isFinite(NaN)=false → kısa-devre atlanır, tam state döner.
  const vParam = new URL(req.url).searchParams.get('v');
  const clientVersion = vParam === null ? NaN : Number(vParam);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });
  }
  const userId = session.user.id;

  // Flood koruması — GET en sık çağrılan uç (polling 1.5-5sn → 60sn'de ~40).
  // Tavan 240/60sn (saniyede 4) cömert; gerçek poll asla yaklaşmaz, flood'u keser.
  const limited = enforceRateLimit(`match-get:${userId}`, 240, 60_000);
  if (limited) return limited;

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

  // ── MOD DALLANMASI ────────────────────────────────────────────────────────
  // VS Düello dışındaki modlar (hedef, …) kendi opak state'lerini taşır ve
  // VS Düello'nun ağır işine (maskeleme, computeQuestionTitle, flowState) İHTİYAÇ
  // DUYMAZ. Bu yüzden erken, sade bir kolla yanıt veririz. VS Düello kolu (alt)
  // birebir korunur. Bkz PLAN.md §19 (state opak, GET m.mode ile dallanır).
  if (m.mode === 'hedef') {
    return getTargetMatch(db, m, side, clientVersion);
  }
  if (m.mode === 'kadro') {
    return getSquadMatch(db, m, side, clientVersion);
  }
  if (m.mode === 'liste') {
    return getListMatch(db, m, side, clientVersion);
  }
  if (m.mode === 'kareler') {
    return getSquaresMatch(db, m, side, clientVersion);
  }
  if (m.mode === 'zincir') {
    return getChainMatch(db, m, side, clientVersion);
  }
  if (m.mode === 'ortak') {
    return getCommonMatch(db, m, side, clientVersion);
  }
  if (m.mode === 'kariyer') {
    return getCareerMatch(db, m, side, clientVersion);
  }
  if (m.mode === 'kiyas') {
    return getQuizMatch(db, m, side, clientVersion);
  }

  // SÜRE KONTROLÜ (lazy): yükleme anında süre dolduysa otomatik tamamla.
  // Polling/Ably ile rakip sekmesi kapalı olsa bile maç ilerler.
  let fullState = m.state as SessionState;
  let deadline = m.turnDeadline ? new Date(m.turnDeadline) : null;
  let flowState = (m.flowState as FlowState | null) ?? null;
  // Bu yanıtta dönecek güncel sürüm. Timeout yazımı başarılı olursa artar.
  let currentVersion = m.version;

  // DAYANIKLILIK: applyTimeout (resolveRoundOnServer → resolveCards) bir kart
  // id'sini bulamazsa (örn. players.json güncellenip eski bir maç state'inde
  // artık var olmayan bir id kaldıysa) throw eder. Bunu YUTMA: aksi halde her
  // poll 500 döner → maç ÖLÜR ("Maç yüklenemedi" fırtınası). Hata olursa state'i
  // değiştirmeden devam et (changed:false) — maç çökmez, en kötü ihtimalle o
  // timeout uygulanmaz ve oyuncular manuel devam eder / maç sonra terk edilir.
  let timedOut: { state: SessionState; flowState: FlowState | null; changed: boolean };
  try {
    timedOut = await applyTimeout(
      fullState,
      flowState,
      deadline ? deadline.getTime() : null,
      Date.now(),
    );
  } catch (err) {
    console.error('applyTimeout hatası (maç çökmesi önlendi):', err);
    timedOut = { state: fullState, flowState, changed: false };
  }

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

/**
 * "Hedefe Yaklaş" maçı için GET — sade kol. Maskeleme YOK (hedef değer ve draft
 * pick'leri snake draft'ın doğası gereği AÇIK — offline'da da açık). Süre dolumu
 * lazy uygulanır (rakip beklerse maç ilerler). Versiyon kısa-devresi VS Düello
 * deseniyle aynı (değişmeyen poll'ler neredeyse bedava).
 */
async function getTargetMatch(
  db: ReturnType<typeof getDb>,
  m: typeof matchTable.$inferSelect,
  side: 'P1' | 'P2',
  clientVersion: number,
) {
  let state = m.state as TargetMatchState;
  let deadline = m.turnDeadline ? new Date(m.turnDeadline) : null;
  let currentVersion = m.version;

  // DAYANIKLILIK: timeout throw ederse yut (her poll 500 olmasın — VS dersi).
  let timed: { state: TargetMatchState; changed: boolean };
  try {
    timed = await applyTargetTimeout(
      state,
      deadline ? deadline.getTime() : null,
      Date.now(),
    );
  } catch (err) {
    console.error('applyTargetTimeout hatası (maç çökmesi önlendi):', err);
    timed = { state, changed: false };
  }

  // Versiyon kısa-devresi: değişiklik yok + client güncel → minik unchanged.
  if (
    !timed.changed &&
    Number.isFinite(clientVersion) &&
    clientVersion === m.version
  ) {
    return NextResponse.json({
      unchanged: true,
      version: m.version,
      turnDeadline: deadline ? deadline.toISOString() : null,
    });
  }

  if (timed.changed) {
    const secs = targetSceneDeadlineSeconds(timed.state);
    const newDeadline = secs ? new Date(Date.now() + secs * 1000) : null;
    const updated = await db
      .update(matchTable)
      .set({
        state: timed.state,
        currentScene: timed.state.scene,
        turnDeadline: newDeadline,
        version: m.version + 1,
        winnerSide: timed.state.scene === 'RESULT' ? timed.state.winner : null,
        status: timed.state.scene === 'RESULT' ? 'finished' : 'active',
        updatedAt: new Date(),
      })
      .where(and(eq(matchTable.id, m.id), eq(matchTable.version, m.version)))
      .returning({ id: matchTable.id });
    if (updated.length > 0) {
      state = timed.state;
      deadline = newDeadline;
      currentVersion = m.version + 1;
      await publishMatchEvent(m.id, 'state-changed', {
        scene: state.scene,
        draftStep: state.draftStep,
      });
    }
  }

  // Kriter metaverisi (metric fonksiyonu serileştirilemez → id'den başlık/birim).
  const criterion = await targetCriterionView(state.criterionId);

  return NextResponse.json({
    matchId: m.id,
    mode: m.mode,
    status: m.status,
    version: currentVersion,
    yourSide: side,
    seed: m.seed,
    // state OPAK döner — client TargetMatchState olarak yorumlar. Maskeleme yok.
    state,
    /** Kriter başlık/birim (client gösterimi; metric sunucuda kalır). */
    criterion,
    winnerSide: m.winnerSide,
    turnDeadline: deadline ? deadline.toISOString() : null,
  });
}

/**
 * "Kadro Kur" maçı için GET — sade kol (getTargetMatch kardeşi). Maskeleme YOK
 * (kriter + draft pick'leri açık — snake draft doğası). Süre dolumu lazy, versiyon
 * kısa-devresi VS Düello deseniyle aynı.
 */
async function getSquadMatch(
  db: ReturnType<typeof getDb>,
  m: typeof matchTable.$inferSelect,
  side: 'P1' | 'P2',
  clientVersion: number,
) {
  let state = m.state as SquadMatchState;
  let deadline = m.turnDeadline ? new Date(m.turnDeadline) : null;
  let currentVersion = m.version;

  let timed: { state: SquadMatchState; changed: boolean };
  try {
    timed = await applySquadTimeout(
      state,
      deadline ? deadline.getTime() : null,
      Date.now(),
    );
  } catch (err) {
    console.error('applySquadTimeout hatası (maç çökmesi önlendi):', err);
    timed = { state, changed: false };
  }

  if (
    !timed.changed &&
    Number.isFinite(clientVersion) &&
    clientVersion === m.version
  ) {
    return NextResponse.json({
      unchanged: true,
      version: m.version,
      turnDeadline: deadline ? deadline.toISOString() : null,
    });
  }

  if (timed.changed) {
    const secs = squadSceneDeadlineSeconds(timed.state);
    const newDeadline = secs ? new Date(Date.now() + secs * 1000) : null;
    const updated = await db
      .update(matchTable)
      .set({
        state: timed.state,
        currentScene: timed.state.scene,
        turnDeadline: newDeadline,
        version: m.version + 1,
        winnerSide: timed.state.scene === 'RESULT' ? timed.state.winner : null,
        status: timed.state.scene === 'RESULT' ? 'finished' : 'active',
        updatedAt: new Date(),
      })
      .where(and(eq(matchTable.id, m.id), eq(matchTable.version, m.version)))
      .returning({ id: matchTable.id });
    if (updated.length > 0) {
      state = timed.state;
      deadline = newDeadline;
      currentVersion = m.version + 1;
      await publishMatchEvent(m.id, 'state-changed', {
        scene: state.scene,
        draftStep: state.draftStep,
      });
    }
  }

  const criterion = await squadCriterionView(state.criterionId);

  return NextResponse.json({
    matchId: m.id,
    mode: m.mode,
    status: m.status,
    version: currentVersion,
    yourSide: side,
    seed: m.seed,
    state,
    criterion,
    winnerSide: m.winnerSide,
    turnDeadline: deadline ? deadline.toISOString() : null,
  });
}

/**
 * "Liste Doldur" maçı için GET — sade kol (getSquadMatch kardeşi).
 *
 * 🔒 HİLE KORUMASI: `state` (ListMatchState) listenin kendisini (cevaplar) ZATEN
 * İÇERMEZ — yalnız criterionId + AÇILMIŞ sıralar (filledBy/filledPlayer/filledValue)
 * + can + sıra. Yani state'i olduğu gibi dönmek güvenli; F12'den henüz açılmamış
 * sıraların cevabı görünmez. Süre dolumu lazy (pas), versiyon kısa-devresi aynı.
 */
async function getListMatch(
  db: ReturnType<typeof getDb>,
  m: typeof matchTable.$inferSelect,
  side: 'P1' | 'P2',
  clientVersion: number,
) {
  let state = m.state as ListMatchState;
  let deadline = m.turnDeadline ? new Date(m.turnDeadline) : null;
  let currentVersion = m.version;

  let timed: { state: ListMatchState; changed: boolean };
  try {
    timed = await applyListTimeout(
      state,
      deadline ? deadline.getTime() : null,
      Date.now(),
    );
  } catch (err) {
    console.error('applyListTimeout hatası (maç çökmesi önlendi):', err);
    timed = { state, changed: false };
  }

  if (
    !timed.changed &&
    Number.isFinite(clientVersion) &&
    clientVersion === m.version
  ) {
    return NextResponse.json({
      unchanged: true,
      version: m.version,
      turnDeadline: deadline ? deadline.toISOString() : null,
    });
  }

  if (timed.changed) {
    const secs = listSceneDeadlineSeconds(timed.state);
    const newDeadline = secs ? new Date(Date.now() + secs * 1000) : null;
    const updated = await db
      .update(matchTable)
      .set({
        state: timed.state,
        currentScene: timed.state.scene,
        turnDeadline: newDeadline,
        version: m.version + 1,
        winnerSide: timed.state.scene === 'RESULT' ? timed.state.winner : null,
        status: timed.state.scene === 'RESULT' ? 'finished' : 'active',
        updatedAt: new Date(),
      })
      .where(and(eq(matchTable.id, m.id), eq(matchTable.version, m.version)))
      .returning({ id: matchTable.id });
    if (updated.length > 0) {
      state = timed.state;
      deadline = newDeadline;
      currentVersion = m.version + 1;
      await publishMatchEvent(m.id, 'state-changed', {
        scene: state.scene,
        activeSide: state.activeSide,
      });
    }
  }

  const criterion = await listCriterionView(state.criterionId);

  // RESULT'ta (oyun BİTTİ) tam listeyi gönder — artık spoiler değil; sonuç ekranı
  // tüm 1-10 sırayı (açılmamışlar dahil) gösterir. PLAY/REVEAL'da ASLA gönderilmez.
  let fullList: { rank: number; playerId: string; value: number }[] | null = null;
  if (state.scene === 'RESULT') {
    fullList = await listFullList(state.criterionId);
  }

  return NextResponse.json({
    matchId: m.id,
    mode: m.mode,
    status: m.status,
    version: currentVersion,
    yourSide: side,
    seed: m.seed,
    // state OPAK döner — liste İÇERMEZ (yalnız criterionId + açılmışlar) → güvenli.
    state,
    criterion,
    // Yalnız RESULT'ta dolu (oyun bitti → cevaplar açılabilir). Aksi halde null.
    fullList,
    winnerSide: m.winnerSide,
    turnDeadline: deadline ? deadline.toISOString() : null,
  });
}

/**
 * "Kareleri Kap" maçı için GET — sade kol (getListMatch kardeşi). MASKELEME YOK:
 * matris (kulüpler + kapanma durumu) AÇIK — kulüpler zaten ekranda görünür,
 * "cevap" = hangi futbolcunun hangi kareyi açtığı (açık). Süre dolumu lazy
 * (pas), versiyon kısa-devresi aynı.
 */
async function getSquaresMatch(
  db: ReturnType<typeof getDb>,
  m: typeof matchTable.$inferSelect,
  side: 'P1' | 'P2',
  clientVersion: number,
) {
  let state = m.state as SquaresMatchState;
  let deadline = m.turnDeadline ? new Date(m.turnDeadline) : null;
  let currentVersion = m.version;

  let timed: { state: SquaresMatchState; changed: boolean };
  try {
    timed = await applySquaresTimeout(
      state,
      deadline ? deadline.getTime() : null,
      Date.now(),
    );
  } catch (err) {
    console.error('applySquaresTimeout hatası (maç çökmesi önlendi):', err);
    timed = { state, changed: false };
  }

  if (
    !timed.changed &&
    Number.isFinite(clientVersion) &&
    clientVersion === m.version
  ) {
    return NextResponse.json({
      unchanged: true,
      version: m.version,
      turnDeadline: deadline ? deadline.toISOString() : null,
    });
  }

  if (timed.changed) {
    const secs = squaresSceneDeadlineSeconds(timed.state);
    const newDeadline = secs ? new Date(Date.now() + secs * 1000) : null;
    const updated = await db
      .update(matchTable)
      .set({
        state: timed.state,
        currentScene: timed.state.scene,
        turnDeadline: newDeadline,
        version: m.version + 1,
        winnerSide: timed.state.scene === 'RESULT' ? timed.state.winner : null,
        status: timed.state.scene === 'RESULT' ? 'finished' : 'active',
        updatedAt: new Date(),
      })
      .where(and(eq(matchTable.id, m.id), eq(matchTable.version, m.version)))
      .returning({ id: matchTable.id });
    if (updated.length > 0) {
      state = timed.state;
      deadline = newDeadline;
      currentVersion = m.version + 1;
      await publishMatchEvent(m.id, 'state-changed', {
        scene: state.scene,
        activeSide: state.activeSide,
      });
    }
  }

  return NextResponse.json({
    matchId: m.id,
    mode: m.mode,
    status: m.status,
    version: currentVersion,
    yourSide: side,
    seed: m.seed,
    // state OPAK döner — matris açık (maskeleme yok).
    state,
    winnerSide: m.winnerSide,
    turnDeadline: deadline ? deadline.toISOString() : null,
  });
}

/**
 * "Zincir Kur" maçı için GET — sade kol (getSquaresMatch kardeşi). MASKELEME YOK:
 * 7 kulüp + pick'ler AÇIK (kulüpler ekranda görünür). Süre dolumu lazy (0-puanlık
 * pas), versiyon kısa-devresi aynı.
 */
async function getChainMatch(
  db: ReturnType<typeof getDb>,
  m: typeof matchTable.$inferSelect,
  side: 'P1' | 'P2',
  clientVersion: number,
) {
  let state = m.state as ChainMatchState;
  let deadline = m.turnDeadline ? new Date(m.turnDeadline) : null;
  let currentVersion = m.version;

  let timed: { state: ChainMatchState; changed: boolean };
  try {
    timed = await applyChainTimeout(
      state,
      deadline ? deadline.getTime() : null,
      Date.now(),
    );
  } catch (err) {
    console.error('applyChainTimeout hatası (maç çökmesi önlendi):', err);
    timed = { state, changed: false };
  }

  if (
    !timed.changed &&
    Number.isFinite(clientVersion) &&
    clientVersion === m.version
  ) {
    return NextResponse.json({
      unchanged: true,
      version: m.version,
      turnDeadline: deadline ? deadline.toISOString() : null,
    });
  }

  if (timed.changed) {
    const secs = chainSceneDeadlineSeconds(timed.state);
    const newDeadline = secs ? new Date(Date.now() + secs * 1000) : null;
    const updated = await db
      .update(matchTable)
      .set({
        state: timed.state,
        currentScene: timed.state.scene,
        turnDeadline: newDeadline,
        version: m.version + 1,
        winnerSide: timed.state.scene === 'RESULT' ? timed.state.winner : null,
        status: timed.state.scene === 'RESULT' ? 'finished' : 'active',
        updatedAt: new Date(),
      })
      .where(and(eq(matchTable.id, m.id), eq(matchTable.version, m.version)))
      .returning({ id: matchTable.id });
    if (updated.length > 0) {
      state = timed.state;
      deadline = newDeadline;
      currentVersion = m.version + 1;
      await publishMatchEvent(m.id, 'state-changed', {
        scene: state.scene,
        step: state.step,
      });
    }
  }

  return NextResponse.json({
    matchId: m.id,
    mode: m.mode,
    status: m.status,
    version: currentVersion,
    yourSide: side,
    seed: m.seed,
    // state OPAK döner — 7 kulüp + pick'ler açık (maskeleme yok).
    state,
    winnerSide: m.winnerSide,
    turnDeadline: deadline ? deadline.toISOString() : null,
  });
}

/**
 * "Ortak Bul" maçı için GET — sade kol (getChainMatch kardeşi). AMA MASKELEME VAR:
 * EŞZAMANLI seçim → rakibin SELECT'teki seçimi REVEAL'a kadar gizlenmeli (F12'den
 * okunamaz), kendi puanı da SELECT sırasında gizli. `maskCommonState` bunu yapar +
 * cevap havuzunu (pairs[].answers) tamamen boşaltır (spoiler koruması). Süre dolumu
 * lazy (pas), versiyon kısa-devresi aynı.
 */
async function getCommonMatch(
  db: ReturnType<typeof getDb>,
  m: typeof matchTable.$inferSelect,
  side: 'P1' | 'P2',
  clientVersion: number,
) {
  let state = m.state as CommonMatchState;
  let deadline = m.turnDeadline ? new Date(m.turnDeadline) : null;
  let currentVersion = m.version;

  let timed: { state: CommonMatchState; changed: boolean };
  try {
    timed = await applyCommonTimeout(
      state,
      deadline ? deadline.getTime() : null,
      Date.now(),
    );
  } catch (err) {
    console.error('applyCommonTimeout hatası (maç çökmesi önlendi):', err);
    timed = { state, changed: false };
  }

  if (
    !timed.changed &&
    Number.isFinite(clientVersion) &&
    clientVersion === m.version
  ) {
    return NextResponse.json({
      unchanged: true,
      version: m.version,
      turnDeadline: deadline ? deadline.toISOString() : null,
    });
  }

  if (timed.changed) {
    const secs = commonSceneDeadlineSeconds(timed.state);
    const newDeadline = secs ? new Date(Date.now() + secs * 1000) : null;
    const updated = await db
      .update(matchTable)
      .set({
        state: timed.state,
        currentScene: timed.state.scene,
        turnDeadline: newDeadline,
        version: m.version + 1,
        winnerSide: timed.state.scene === 'RESULT' ? timed.state.winner : null,
        status: timed.state.scene === 'RESULT' ? 'finished' : 'active',
        updatedAt: new Date(),
      })
      .where(and(eq(matchTable.id, m.id), eq(matchTable.version, m.version)))
      .returning({ id: matchTable.id });
    if (updated.length > 0) {
      state = timed.state;
      deadline = newDeadline;
      currentVersion = m.version + 1;
      await publishMatchEvent(m.id, 'state-changed', {
        scene: state.scene,
        round: state.round,
      });
    }
  }

  return NextResponse.json({
    matchId: m.id,
    mode: m.mode,
    status: m.status,
    version: currentVersion,
    yourSide: side,
    seed: m.seed,
    // 🔒 MASKELİ: rakibin aktif-tur seçimi + cevap havuzu gizli (spoiler koruması).
    state: maskCommonState(state, side),
    winnerSide: m.winnerSide,
    turnDeadline: deadline ? deadline.toISOString() : null,
  });
}

/**
 * "Kariyer Yolu" maçı için GET — sade kol (getCommonMatch kardeşi). MASKELEME VAR:
 * doğru cevap + açılmamış kademe ipuçları + rakibin seçimi gizlenmeli. State ham
 * DÖNMEZ; `viewCareerState(side)` taraf-özel güvenli görünüm üretir (kendi clue'm
 * açık, rakip yalnız tier/locked sinyali, doğru cevap yalnız ROUND_REVEAL/RESULT).
 * Süre dolumu lazy (kademe pas), versiyon kısa-devresi aynı.
 */
async function getCareerMatch(
  db: ReturnType<typeof getDb>,
  m: typeof matchTable.$inferSelect,
  side: 'P1' | 'P2',
  clientVersion: number,
) {
  let state = m.state as CareerMatchState;
  let deadline = m.turnDeadline ? new Date(m.turnDeadline) : null;
  let currentVersion = m.version;

  let timed: { state: CareerMatchState; changed: boolean };
  try {
    timed = await applyCareerTimeout(
      state,
      deadline ? deadline.getTime() : null,
      Date.now(),
    );
  } catch (err) {
    console.error('applyCareerTimeout hatası (maç çökmesi önlendi):', err);
    timed = { state, changed: false };
  }

  if (
    !timed.changed &&
    Number.isFinite(clientVersion) &&
    clientVersion === m.version
  ) {
    return NextResponse.json({
      unchanged: true,
      version: m.version,
      turnDeadline: deadline ? deadline.toISOString() : null,
    });
  }

  if (timed.changed) {
    const secs = careerSceneDeadlineSeconds(timed.state);
    const newDeadline = secs ? new Date(Date.now() + secs * 1000) : null;
    const updated = await db
      .update(matchTable)
      .set({
        state: timed.state,
        currentScene: timed.state.scene,
        turnDeadline: newDeadline,
        version: m.version + 1,
        winnerSide: timed.state.scene === 'RESULT' ? timed.state.winner : null,
        status: timed.state.scene === 'RESULT' ? 'finished' : 'active',
        updatedAt: new Date(),
      })
      .where(and(eq(matchTable.id, m.id), eq(matchTable.version, m.version)))
      .returning({ id: matchTable.id });
    if (updated.length > 0) {
      state = timed.state;
      deadline = newDeadline;
      currentVersion = m.version + 1;
      await publishMatchEvent(m.id, 'state-changed', {
        scene: state.scene,
        round: state.round,
      });
    }
  }

  return NextResponse.json({
    matchId: m.id,
    mode: m.mode,
    status: m.status,
    version: currentVersion,
    yourSide: side,
    seed: m.seed,
    // 🔒 MASKELİ taraf-özel görünüm — ham state DÖNMEZ (doğru cevap/rakip seçimi gizli).
    view: viewCareerState(state, side),
    winnerSide: m.winnerSide,
    turnDeadline: deadline ? deadline.toISOString() : null,
  });
}

/**
 * "4'lü Kıyas" maçı için GET — sade kol (getCommonMatch kardeşi). MASKELEME VAR:
 * EŞZAMANLI seçim → tur değerleri + doğru cevap + rakibin SELECT'teki seçimi
 * REVEAL'a kadar gizlenmeli (F12'den okunamaz). `maskQuizState` bunu yapar.
 * Süre dolumu lazy (pas), versiyon kısa-devresi aynı.
 */
async function getQuizMatch(
  db: ReturnType<typeof getDb>,
  m: typeof matchTable.$inferSelect,
  side: 'P1' | 'P2',
  clientVersion: number,
) {
  let state = m.state as QuizMatchState;
  let deadline = m.turnDeadline ? new Date(m.turnDeadline) : null;
  let currentVersion = m.version;

  let timed: { state: QuizMatchState; changed: boolean };
  try {
    timed = await applyQuizTimeout(
      state,
      deadline ? deadline.getTime() : null,
      Date.now(),
    );
  } catch (err) {
    console.error('applyQuizTimeout hatası (maç çökmesi önlendi):', err);
    timed = { state, changed: false };
  }

  if (
    !timed.changed &&
    Number.isFinite(clientVersion) &&
    clientVersion === m.version
  ) {
    return NextResponse.json({
      unchanged: true,
      version: m.version,
      turnDeadline: deadline ? deadline.toISOString() : null,
    });
  }

  if (timed.changed) {
    const secs = quizSceneDeadlineSeconds(timed.state);
    const newDeadline = secs ? new Date(Date.now() + secs * 1000) : null;
    const updated = await db
      .update(matchTable)
      .set({
        state: timed.state,
        currentScene: timed.state.scene,
        turnDeadline: newDeadline,
        version: m.version + 1,
        winnerSide: timed.state.scene === 'RESULT' ? timed.state.winner : null,
        status: timed.state.scene === 'RESULT' ? 'finished' : 'active',
        updatedAt: new Date(),
      })
      .where(and(eq(matchTable.id, m.id), eq(matchTable.version, m.version)))
      .returning({ id: matchTable.id });
    if (updated.length > 0) {
      state = timed.state;
      deadline = newDeadline;
      currentVersion = m.version + 1;
      await publishMatchEvent(m.id, 'state-changed', {
        scene: state.scene,
        round: state.round,
      });
    }
  }

  return NextResponse.json({
    matchId: m.id,
    mode: m.mode,
    status: m.status,
    version: currentVersion,
    yourSide: side,
    seed: m.seed,
    // 🔒 MASKELİ: tur değerleri + doğru cevap + rakip seçimi gizli (spoiler koruması).
    state: maskQuizState(state, side),
    winnerSide: m.winnerSide,
    turnDeadline: deadline ? deadline.toISOString() : null,
  });
}
