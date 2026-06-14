/**
 * Matchmaking çekirdeği (online mod).
 *
 * Akış: oyuncu kuyruğa girer → 2 uygun oyuncu bulununca maç oluşturulur
 * (seed üretilir, başlangıç state kurulur). MVP: ratingsiz FIFO eşleştirme;
 * rating tabanlı eşleştirme sonra (user_rating şeması hazır).
 *
 * Bu modül DB işlemlerini yapar ama saf/öngörülebilir tutulur; HTTP'den bağımsız.
 * Bkz ONLINE-YOL-HARITASI.md (Faz 4).
 */
import { nanoid } from 'nanoid';
import {
  and,
  asc,
  desc,
  eq,
  getDb,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  match as matchTable,
  matchPlayer as matchPlayerTable,
  matchmakingQueue,
  ne,
  or,
  user as userTable,
} from '@futbol-kart/db';
import {
  initialSession,
  reduceSession,
  type SessionState,
} from '@futbol-kart/game-engine';
import { sceneDeadlineSeconds } from '@/lib/server/matchEngine';
import {
  buildInitialTargetState,
  targetSceneDeadlineSeconds,
} from '@/lib/server/targetMatchEngine';
import {
  buildInitialSquadState,
  squadSceneDeadlineSeconds,
} from '@/lib/server/squadMatchEngine';
import {
  buildInitialListState,
  listSceneDeadlineSeconds,
} from '@/lib/server/listMatchEngine';
import {
  buildInitialSquaresState,
  squaresSceneDeadlineSeconds,
} from '@/lib/server/squaresMatchEngine';
import {
  buildInitialChainState,
  chainSceneDeadlineSeconds,
} from '@/lib/server/chainMatchEngine';
import {
  buildInitialCommonState,
  commonSceneDeadlineSeconds,
} from '@/lib/server/commonMatchEngine';
import {
  buildInitialCareerState,
  careerSceneDeadlineSeconds,
} from '@/lib/server/careerMatchEngine';
import {
  buildInitialQuizState,
  quizSceneDeadlineSeconds,
} from '@/lib/server/quizMatchEngine';
import {
  buildInitialImposterState,
  imposterSceneDeadlineSeconds,
} from '@/lib/server/imposterMatchEngine';
import { IMPOSTER_MIN_PLAYERS, IMPOSTER_MAX_PLAYERS } from '@/lib/imposterMode';

/**
 * Online oynanabilen modlar. Her yeni mod buraya eklenir; `matchmaking_queue`
 * `mode` kolonuyla filtreli eşleştirir → "hedef bekleyen" yalnızca "hedef
 * bekleyenle" eşleşir. Mod-özel maç state'i `buildInitialMatchState`'te kurulur.
 *  - 'vs-duello' : VS Düello (kart kapışma) — SessionState
 *  - 'hedef'     : Hedefe Yaklaş — TargetMatchState
 *  - 'kadro'     : Kadro Kur — SquadMatchState
 *  - 'liste'     : Liste Doldur — ListMatchState (liste sunucuda gizli)
 *  - 'kareler'   : Kareleri Kap — SquaresMatchState (matris açık)
 *  - 'zincir'    : Zincir Kur — ChainMatchState (7 kulüp açık)
 *  - 'ortak'     : Ortak Bul — CommonMatchState (eşzamanlı seçim, rakip seçimi maskeli)
 *  - 'kariyer'   : Kariyer Yolu — CareerMatchState (kademeli ipucu, doğru cevap maskeli)
 *  - 'kiyas'     : 4'lü Kıyas — QuizMatchState (eşzamanlı, 4 kart kıyas, değer maskeli)
 */
export const ONLINE_MODES = ['vs-duello', 'hedef', 'kadro', 'liste', 'kareler', 'zincir', 'ortak', 'kariyer', 'kiyas', 'imposter'] as const;
export type OnlineMode = (typeof ONLINE_MODES)[number];

/** İmposter = N-kişilik lobi modu (3-5). Diğer tüm modlar 2-kişilik. */
export function isLobbyMode(mode: OnlineMode): boolean {
  return mode === 'imposter';
}

export interface MatchmakingResult {
  /** Eşleşme oldu mu? */
  matched: boolean;
  /** Eşleştiyse oluşan/katılınan maçın id'si. */
  matchId?: string;
  /** Eşleşme beklemedeyse: kuyrukta olduğunu bildirir. */
  queued?: boolean;
  /** LOBİ modu (imposter): kuyrukta kaç kişi bekliyor (N/MAX göstergesi için). */
  lobbyCount?: number;
  /** LOBİ modu: lobi kapasitesi (MAX). */
  lobbyMax?: number;
}

/**
 * Özel davet kuyruğu kaydı kaç dakika sonra "bayat" sayılır. Davet linki bu
 * süre içinde kullanılmazsa eşleşmeye dahil edilmez ve temizlenir. Kullanıcı
 * isteği: ~10-15dk sonra pasife çek (fazladan istek/zombi kayıt önlenir).
 */
const INVITE_TTL_MS = 15 * 60 * 1000;

/**
 * Online maç için başlangıç state. İki gerçek oyuncu, mod = 'online'.
 * Seed maç id'sine bağlı → deterministik soru sırası; sunucu hesabı tekrarlayabilir.
 */
export function buildOnlineMatchState(
  matchId: string,
  seed: string,
  p1Name: string,
  p2Name: string,
): SessionState {
  let s = initialSession(matchId, seed);
  // Online modu seç + isimleri ata (mod seçimi/isim modalı online'da otomatik).
  s = reduceSession(s, { type: 'MODE_CHOSEN', mode: 'online' });
  s = reduceSession(s, { type: 'NAMES_SET', p1Name, p2Name });
  return s;
}

/**
 * Mod-özel başlangıç state + ilk sahnenin süre limiti (sn). VS Düello'ya HİÇ
 * dokunmaz — yeni modlar kendi kollarını ekler. Dönen `state` opak olarak
 * `match.state` jsonb'ye yazılır (mode kolonuyla yorumlanır).
 */
async function buildInitialMatchState(
  mode: OnlineMode,
  matchId: string,
  seed: string,
  p1Name: string,
  p2Name: string,
): Promise<{ state: unknown; deadlineSecs: number | null }> {
  if (mode === 'hedef') {
    const state = await buildInitialTargetState(seed, p1Name, p2Name);
    return { state, deadlineSecs: targetSceneDeadlineSeconds(state) };
  }
  if (mode === 'kadro') {
    const state = await buildInitialSquadState(seed, p1Name, p2Name);
    return { state, deadlineSecs: squadSceneDeadlineSeconds(state) };
  }
  if (mode === 'liste') {
    const state = await buildInitialListState(seed, p1Name, p2Name);
    return { state, deadlineSecs: listSceneDeadlineSeconds(state) };
  }
  if (mode === 'kareler') {
    const state = await buildInitialSquaresState(seed, p1Name, p2Name);
    return { state, deadlineSecs: squaresSceneDeadlineSeconds(state) };
  }
  if (mode === 'zincir') {
    const state = await buildInitialChainState(seed, p1Name, p2Name);
    return { state, deadlineSecs: chainSceneDeadlineSeconds(state) };
  }
  if (mode === 'ortak') {
    const state = await buildInitialCommonState(seed, p1Name, p2Name);
    return { state, deadlineSecs: commonSceneDeadlineSeconds(state) };
  }
  if (mode === 'kariyer') {
    const state = await buildInitialCareerState(seed, p1Name, p2Name);
    return { state, deadlineSecs: careerSceneDeadlineSeconds(state) };
  }
  if (mode === 'kiyas') {
    const state = await buildInitialQuizState(seed, p1Name, p2Name);
    return { state, deadlineSecs: quizSceneDeadlineSeconds(state) };
  }
  // vs-duello (varsayılan, mevcut davranış — değişmedi).
  const state = buildOnlineMatchState(matchId, seed, p1Name, p2Name);
  return { state, deadlineSecs: sceneDeadlineSeconds(state) };
}

/**
 * Kullanıcıyı eşleştirmeye sok. Kuyrukta bekleyen BAŞKA bir oyuncu varsa
 * onunla maç oluşturur; yoksa kullanıcıyı kuyruğa ekler.
 *
 * YARIŞ KOŞULU ÇÖZÜMÜ (kritik — çift maç oluşmasını önler):
 * İki istek aynı anda gelirse, rakibi "SELECT sonra INSERT" deseniyle almak
 * GÜVENSİZ — ikisi de aynı bekleyeni görüp İKİ maç kurar (gözlenen bug:
 * aynı iki oyuncuya iki active maç → her sekme farklı maça düşer → donma).
 * Çözüm: rakibi kuyruktan ATOMİK `DELETE ... RETURNING` ile çıkar. Bu tek
 * işlemdir → yalnızca BİR istek o satırı silebilir (ilk gelen kapar);
 * ikincisi 0 satır siler ve kuyruğa girer. Tek maç garanti.
 * Bkz ONLINE-YOL-HARITASI.md (Faz 4 — atomik eşleştirme).
 */
export async function joinMatchmaking(
  userId: string,
  mode: OnlineMode,
): Promise<MatchmakingResult> {
  const db = getDb();

  // 1) Zaten BU MODDA bir aktif maçta mı? Öyleyse o maça yönlendir (tek aktif
  //    maç kuralı). MOD-ÖZEL: başka moddaki eski/zombi maç bu eşleşmeye karışmaz.
  const existingMatch = await findActiveMatchFor(userId, mode);
  if (existingMatch) {
    return { matched: true, matchId: existingMatch };
  }

  // LOBİ MODU (imposter): 2-kişilik atomik claim yerine N-kişilik lobi akışı.
  if (isLobbyMode(mode)) {
    return joinImposterLobby(userId, mode, null);
  }

  // 2) Önce KENDİMİ kuyruktan çıkar — eski/bayat bir kayıt kendimle eşleşmeyi
  //    veya tekrar girişte çift kayıt riskini önler.
  await db.delete(matchmakingQueue).where(eq(matchmakingQueue.userId, userId));

  // 3) ATOMİK: en eski bekleyen rakibi kuyruktan TEK işlemle çıkarmayı dene.
  //    Drizzle subquery ile "en eski uygun satırı sil ve döndür" — Postgres
  //    bu DELETE'i atomik uygular; iki eşzamanlı istek aynı satırı SİLEMEZ.
  const claimed = await db
    .delete(matchmakingQueue)
    .where(
      eq(
        matchmakingQueue.userId,
        db
          .select({ id: matchmakingQueue.userId })
          .from(matchmakingQueue)
          .where(
            and(
              eq(matchmakingQueue.mode, mode),
              ne(matchmakingQueue.userId, userId),
              // Yalnız HERKESE AÇIK bekleyenler (davet kodlu kayıtlar rastgele
              // eşleşmeye katılmaz — onlar sadece kendi kodlarıyla eşleşir).
              isNull(matchmakingQueue.inviteCode),
            ),
          )
          .orderBy(asc(matchmakingQueue.enqueuedAt))
          .limit(1),
      ),
    )
    .returning({ userId: matchmakingQueue.userId });

  if (claimed.length > 0) {
    // 4) Rakip kapıldı → maç oluştur (p1 = önce gelen bekleyen, p2 = yeni katılan).
    const matchId = await createMatchBetween(db, claimed[0]!.userId, userId, mode);
    return { matched: true, matchId };
  }

  // 5) Rakip kapılamadı (kuyruk boş / başkası kaptı) → kuyruğa ekle.
  await db
    .insert(matchmakingQueue)
    .values({ userId, mode })
    .onConflictDoUpdate({
      target: matchmakingQueue.userId,
      set: { mode, enqueuedAt: new Date(), inviteCode: null },
    });

  return { matched: false, queued: true };
}

/**
 * İki oyuncu arasında maç kurar (mod-özel state + deadline + kuyruk temizliği).
 * Hem rastgele eşleşme (`joinMatchmaking`) hem özel davet (`joinInvite`)
 * tarafından kullanılır → maç-kurma mantığı tek yerde.
 *
 * p1 = `firstUserId` (önce gelen / davet eden), p2 = `secondUserId` (sonra katılan).
 * GÜVENLİK AĞI: maç kurulunca HER İKİ oyuncuyu da kuyruktan temizler (claim
 * edilen zaten silinmiş olabilir; self-enqueue kalıntısı varsa o da gider).
 */
async function createMatchBetween(
  db: ReturnType<typeof getDb>,
  firstUserId: string,
  secondUserId: string,
  mode: OnlineMode,
): Promise<string> {
  const matchId = nanoid();
  const seed = `${matchId}-${mode}`;
  const [p1Name, p2Name] = await Promise.all([
    displayNameOf(db, firstUserId),
    displayNameOf(db, secondUserId),
  ]);
  const { state, deadlineSecs } = await buildInitialMatchState(
    mode,
    matchId,
    seed,
    p1Name,
    p2Name,
  );
  const turnDeadline = deadlineSecs
    ? new Date(Date.now() + deadlineSecs * 1000)
    : null;

  await db.insert(matchTable).values({
    id: matchId,
    mode,
    seed,
    status: 'active',
    p1UserId: firstUserId,
    p2UserId: secondUserId,
    currentScene: (state as { scene: string }).scene,
    state,
    turnDeadline,
  });

  await db
    .delete(matchmakingQueue)
    .where(
      or(
        eq(matchmakingQueue.userId, firstUserId),
        eq(matchmakingQueue.userId, secondUserId),
      ),
    );

  return matchId;
}

/* ============================================================================
 * LOBİ MODU (İmposter) — N-kişilik (3-5). 2-kişilik atomik claim'in çok-oyunculu
 * uyarlaması: kuyruk = lobi havuzu; 5 dolunca VEYA en eski bekleyen ≥30sn ise
 * (en az 3 kişi) atomik olarak 3-5 oyuncu kapılır → maç kurulur (match_player).
 * Mevcut 2-kişi akışı (joinMatchmaking/createMatchBetween) HİÇ değişmez.
 * ========================================================================= */

/** Lobi: en eski bekleyen bu süreyi aşınca (≥MIN kişiyle) maç başlat. */
const IMPOSTER_LOBBY_WAIT_MS = 30 * 1000;
/**
 * Lobi kaydı bu süreyi aşarsa "zombi" sayılır (oyuncu sekmeyi çökerterek kapattı,
 * poll durdu, leaveMatchmaking çağrılmadı). Temizlenir ki hayalet sayım olmasın
 * (Bulgu 4). 5dk: 30sn formasyon penceresinin çok üstü → aktif bekleyeni silmez.
 */
const IMPOSTER_LOBBY_TTL_MS = 5 * 60 * 1000;

/**
 * İmposter lobisine katıl (rastgele VEYA davet kodlu). Kuyruğa girer, ardından
 * lobi oluşturmayı dener (5 dolu / ≥3 + 30sn). `inviteCode` null → rastgele;
 * dolu → yalnız aynı kodlular birbiriyle.
 */
export async function joinImposterLobby(
  userId: string,
  mode: OnlineMode,
  inviteCode: string | null,
): Promise<MatchmakingResult> {
  const db = getDb();

  // 0) Zaten bu modda aktif maçtaysam (lobi kurulmuş, ben içindeyim) → o maça.
  //    GET-poll bu fonksiyonu çağırınca eşleşmişleri tekrar kuyruğa SOKMAMAK için şart.
  const existing = await findActiveMatchFor(userId, mode);
  if (existing) return { matched: true, matchId: existing };

  // Kuyruğa gir (upsert — tekrar çağrılırsa kod/saat tazelenmez, ilk giriş anı korunur
  //  ki "30sn bekleme" doğru başlasın; ama mode/inviteCode güncellenir).
  await db
    .insert(matchmakingQueue)
    .values({ userId, mode, inviteCode })
    .onConflictDoUpdate({
      target: matchmakingQueue.userId,
      // enqueuedAt'i KORU (tekrar poll'de sıfırlanmasın → 30sn doğru işler).
      set: { mode, inviteCode },
    });

  // Lobi oluşturmayı dene (atomik). Maç kurulduysa katılan da o maça yönlendirilir.
  const formed = await tryFormImposterLobby(db, mode, inviteCode);
  if (formed) {
    // Maç kuruldu; ben içinde miyim? (findActiveMatchFor match_player'a da bakar)
    const mine = await findActiveMatchFor(userId, mode);
    if (mine) return { matched: true, matchId: mine };
  }

  // Henüz kurulmadı → kuyrukta beklemedeyim. Lobi sayacını döndür (UI N/MAX).
  const waiting = await countLobby(db, mode, inviteCode);
  return { matched: false, queued: true, lobbyCount: waiting, lobbyMax: IMPOSTER_MAX_PLAYERS };
}

/**
 * GET-POLL için HAFİF lobi yoklaması — kuyruğa YENİDEN YAZMAZ (oyuncu zaten POST'ta
 * girdi). Yalnız: aktif maç var mı + lobi oluşturmayı dene (30sn tetikleyici herkes
 * idle olsa da çalışsın). joinImposterLobby'nin her-poll upsert'i DB'yi gereksiz
 * yoruyordu (Bulgu 3) → poll yolu yazma yapmaz, yalnız okur + (gerekirse) kurar.
 */
export async function pollImposterLobby(
  userId: string,
  mode: OnlineMode,
  inviteCode: string | null,
): Promise<MatchmakingResult> {
  const db = getDb();

  // 1) Zaten bu modda aktif maçta mıyım? (lobi kuruldu) → o maça.
  const existing = await findActiveMatchFor(userId, mode);
  if (existing) return { matched: true, matchId: existing };

  // 2) Lobi oluşturmayı dene (atomik; yazma YOK eğer koşul sağlanmazsa). Kurulduysa
  //    ben içinde olabilirim.
  const formed = await tryFormImposterLobby(db, mode, inviteCode);
  if (formed) {
    const mine = await findActiveMatchFor(userId, mode);
    if (mine) return { matched: true, matchId: mine };
  }

  // 3) Hâlâ bekliyorum → sayaç (tek SELECT). Upsert YOK.
  const waiting = await countLobby(db, mode, inviteCode);
  return { matched: false, queued: true, lobbyCount: waiting, lobbyMax: IMPOSTER_MAX_PLAYERS };
}

/** Belirli mod+kod kuyruğunda kaç kişi bekliyor. */
async function countLobby(
  db: ReturnType<typeof getDb>,
  mode: OnlineMode,
  inviteCode: string | null,
): Promise<number> {
  const codeCond = inviteCode
    ? eq(matchmakingQueue.inviteCode, inviteCode)
    : isNull(matchmakingQueue.inviteCode);
  const rows = await db
    .select({ userId: matchmakingQueue.userId })
    .from(matchmakingQueue)
    .where(and(eq(matchmakingQueue.mode, mode), codeCond));
  return rows.length;
}

/**
 * Lobi oluşturmayı dene (ATOMİK). Koşul: 5 dolu VEYA (≥3 + en eski bekleyen ≥30sn).
 * Sağlanırsa 3-5 oyuncuyu kuyruktan tek işlemde çıkarır (DELETE ... WHERE userId
 * IN (SELECT ... LIMIT N) RETURNING) → yalnız BİR eşzamanlı istek bu satırları
 * silebilir (Postgres satır kilidi) → çift lobi imkansız. Kurulursa matchId döner.
 */
async function tryFormImposterLobby(
  db: ReturnType<typeof getDb>,
  mode: OnlineMode,
  inviteCode: string | null,
): Promise<string | null> {
  const codeCond = inviteCode
    ? eq(matchmakingQueue.inviteCode, inviteCode)
    : isNull(matchmakingQueue.inviteCode);

  // ZOMBİ TEMİZLİĞİ (Bulgu 4): TTL aşmış lobi kayıtlarını sil (sekme çöktü, poll
  //  durdu, leaveMatchmaking çağrılmadı). Hayalet sayımı önler; aktif bekleyene
  //  dokunmaz (5dk > 30sn formasyon penceresi).
  const staleBefore = new Date(Date.now() - IMPOSTER_LOBBY_TTL_MS);
  await db
    .delete(matchmakingQueue)
    .where(
      and(eq(matchmakingQueue.mode, mode), codeCond, lte(matchmakingQueue.enqueuedAt, staleBefore)),
    )
    .catch(() => {});

  // Bekleyenleri en eskiden yeniye sırala (FIFO).
  const waiting = await db
    .select({ userId: matchmakingQueue.userId, enqueuedAt: matchmakingQueue.enqueuedAt })
    .from(matchmakingQueue)
    .where(and(eq(matchmakingQueue.mode, mode), codeCond))
    .orderBy(asc(matchmakingQueue.enqueuedAt));

  if (waiting.length < IMPOSTER_MIN_PLAYERS) return null;

  const full = waiting.length >= IMPOSTER_MAX_PLAYERS;
  const oldestMs = waiting[0]!.enqueuedAt.getTime();
  const waitedEnough = Date.now() - oldestMs >= IMPOSTER_LOBBY_WAIT_MS;
  if (!full && !waitedEnough) return null;

  // Kaç kişi alacağız: dolu ise tam MAX, değilse mevcut hepsi (3-MAX arası).
  const take = Math.min(waiting.length, IMPOSTER_MAX_PLAYERS);
  const claim = waiting.slice(0, take); // {userId, enqueuedAt} — enqueuedAt KORUNUR
  const ids = claim.map((w) => w.userId);

  // ATOMİK claim: bu id'leri kuyruktan tek işlemde sil + döndür. Eşzamanlı başka
  // istek aynı satırları silemez (Postgres satır kilidi + RETURNING) → yalnız biri
  // gerçekten silip lobiyi kurar; diğeri daha az/0 satır görür.
  const claimed = await db
    .delete(matchmakingQueue)
    .where(
      and(
        eq(matchmakingQueue.mode, mode),
        codeCond,
        inArray(matchmakingQueue.userId, ids),
      ),
    )
    .returning({ userId: matchmakingQueue.userId });

  // Yarış: başkası bazılarını kapmış olabilir → MIN'in altına düştüyse iptal,
  // kapılanları geri kuyruğa koy. KRİTİK: enqueuedAt KORUNUR (orijinal değer) —
  // yoksa her parçalı-claim'de saat sıfırlanır, "30sn doldu" KOŞULU HİÇ sağlanmaz
  // → 3-4 kişilik lobi sonsuza dek kurulamaz (starvation bug'ı, Bulgu 2).
  if (claimed.length < IMPOSTER_MIN_PLAYERS) {
    if (claimed.length > 0) {
      const claimedSet = new Set(claimed.map((c) => c.userId));
      const restore = claim.filter((w) => claimedSet.has(w.userId));
      await db
        .insert(matchmakingQueue)
        .values(restore.map((w) => ({ userId: w.userId, mode, inviteCode, enqueuedAt: w.enqueuedAt })))
        .onConflictDoNothing();
    }
    return null;
  }

  try {
    return await createImposterMatch(db, claimed.map((c) => c.userId), mode);
  } catch (err) {
    // Maç kurma yarıda kaldı (örn. Neon HTTP hatası → match_player rollback edildi).
    // Claim'li oyuncular kuyruktan silinmiş olabilir; sonraki poll'de tekrar girer.
    // Poll'ü 500'le çökertme — null dön, yeniden denenir.
    console.error('createImposterMatch hatası (lobi yeniden denenecek):', err);
    return null;
  }
}

/**
 * N oyuncu (3-5) ile İmposter maçı kurar. Oyuncu kimlikleri `match_player`
 * tablosunda (playerIndex 0-tabanlı). `match.p1/p2UserId` NOT NULL olduğundan
 * ilk iki oyuncuyla doldurulur (şema uyumu; yetki match_player'dan okunur).
 */
async function createImposterMatch(
  db: ReturnType<typeof getDb>,
  userIds: string[],
  mode: OnlineMode,
): Promise<string> {
  const matchId = nanoid();
  const seed = `${matchId}-${mode}`;
  const names = await Promise.all(userIds.map((uid) => displayNameOf(db, uid)));
  const state = await buildInitialImposterState(seed, names);
  const deadlineSecs = imposterSceneDeadlineSeconds(state);
  const turnDeadline = deadlineSecs ? new Date(Date.now() + deadlineSecs * 1000) : null;

  await db.insert(matchTable).values({
    id: matchId,
    mode,
    seed,
    status: 'active',
    // Şema NOT NULL uyumu — yetki match_player'dan; p1/p2 ilk iki oyuncu.
    p1UserId: userIds[0]!,
    p2UserId: userIds[1] ?? userIds[0]!,
    currentScene: state.scene,
    state,
    turnDeadline,
  });

  // Tüm oyuncuları match_player'a yaz (playerIndex = state.playerNames sırası).
  // Neon HTTP'de transaction YOK → match INSERT başarılı ama bu fail ederse YARIM
  // MAÇ kalır (match_player boş → kimse giremez, zombi active satır — Bulgu 5).
  // KURTARMA: match_player fail ederse match satırını GERİ AL (rollback) + fırlat;
  // claim'li oyuncular sonraki poll'de tekrar kuyruğa girip yeni lobi kurar.
  try {
    await db.insert(matchPlayerTable).values(
      userIds.map((uid, i) => ({ matchId, userId: uid, playerIndex: i })),
    );
  } catch (err) {
    await db.delete(matchTable).where(eq(matchTable.id, matchId)).catch(() => {});
    throw err;
  }

  // Güvenlik ağı: bu oyuncuları kuyruktan temizle (claim zaten sildi).
  await db.delete(matchmakingQueue).where(inArray(matchmakingQueue.userId, userIds));

  return matchId;
}

/**
 * Bir maçta kullanıcının oyuncu index'i (lobi modu / match_player). Yoksa null
 * (maçın oyuncusu değil). İmposter side = bu index (0-tabanlı).
 */
export async function getMatchPlayerIndex(
  matchId: string,
  userId: string,
): Promise<number | null> {
  const db = getDb();
  const rows = await db
    .select({ playerIndex: matchPlayerTable.playerIndex })
    .from(matchPlayerTable)
    .where(
      and(eq(matchPlayerTable.matchId, matchId), eq(matchPlayerTable.userId, userId)),
    )
    .limit(1);
  return rows[0]?.playerIndex ?? null;
}

/** Kullanıcıyı kuyruktan çıkar (vazgeçti / sayfadan ayrıldı). */
export async function leaveMatchmaking(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(matchmakingQueue).where(eq(matchmakingQueue.userId, userId));
}

/* ============================================================================
 * ÖZEL DAVET (arkadaşını davet et) — rastgele eşleşmenin yanında ikinci yol.
 *
 * Akış:
 *   1. Davet eden `createInvite` → bir kod üretilir, kuyruğa `invite_code` ile
 *      girer (HERKESE AÇIK rastgele claim onu görmez: isNull(inviteCode) filtresi).
 *      Davet eden linki paylaşır + bekleme ekranında polling yapar.
 *   2. Arkadaş linke tıklar → (giriş yoksa returnTo ile /giris) → `joinInvite`
 *      AYNI kodla → atomik claim YALNIZ bu kodla bekleyeni kapar → maç kurulur.
 *   3. Davet eden polling'de kendi aktif maçını görür (findActiveMatchFor) → maça.
 *
 * Davet eden, rastgele akışın aksine, beklerken kendini kuyruktan SİLMEZ (yoksa
 * arkadaşı hiç kapacak kayıt bulamaz). Bayat davetler INVITE_TTL_MS ile elenir.
 * ========================================================================= */

/** Rastgele, URL-güvenli davet kodu (tahmin edilmesi zor — 10 karakter). */
export function generateInviteCode(): string {
  return nanoid(10);
}

/**
 * Davet eden kuyruğa özel KODLA girer (kendini eşleşmeye AÇMADAN — rastgele
 * claim isNull(inviteCode) ile onu atlar). Zaten bu modda aktif maçı varsa ona
 * yönlendirir (tek aktif maç kuralı).
 */
export async function createInvite(
  userId: string,
  mode: OnlineMode,
  inviteCode: string,
): Promise<MatchmakingResult> {
  const db = getDb();

  const existingMatch = await findActiveMatchFor(userId, mode);
  if (existingMatch) {
    return { matched: true, matchId: existingMatch };
  }

  // Kuyruğa davet koduyla gir (upsert — tekrar çağrılırsa kodu/saati tazeler).
  await db
    .insert(matchmakingQueue)
    .values({ userId, mode, inviteCode })
    .onConflictDoUpdate({
      target: matchmakingQueue.userId,
      set: { mode, inviteCode, enqueuedAt: new Date() },
    });

  return { matched: false, queued: true };
}

/**
 * Arkadaş davet linkine tıklayıp katılır. AYNI `inviteCode` ile bekleyen daveti
 * ATOMİK claim eder → maç kurulur. Kendiyle eşleşme (ne userId) + bayat davet
 * (TTL) korumalı. Davet bulunamazsa (süre dolmuş / iptal / yanlış kod) matched:
 * false döner → sayfa "davet geçersiz/süresi dolmuş" gösterir.
 */
export async function joinInvite(
  userId: string,
  mode: OnlineMode,
  inviteCode: string,
): Promise<MatchmakingResult> {
  const db = getDb();

  // Zaten bu modda aktif maçı varsa ona git (davet eden de katılan da olabilir;
  // ör. davet eden linki kendi açarsa kendi maçına yönlenir).
  const existingMatch = await findActiveMatchFor(userId, mode);
  if (existingMatch) {
    return { matched: true, matchId: existingMatch };
  }

  // Bayat olmayan eşik (TTL içinde kalan davetler geçerli).
  const freshAfter = new Date(Date.now() - INVITE_TTL_MS);

  // Önce kendi kuyruk kaydımı temizle (bayat/çift kayıt önlemi — davet edenin
  // kendi kodu hariç; ama katılan farklı kullanıcı olduğundan bu güvenli).
  await db.delete(matchmakingQueue).where(eq(matchmakingQueue.userId, userId));

  // ATOMİK: bu KODLA bekleyen daveti (kendim değil + TTL içinde) tek işlemle kap.
  const claimed = await db
    .delete(matchmakingQueue)
    .where(
      eq(
        matchmakingQueue.userId,
        db
          .select({ id: matchmakingQueue.userId })
          .from(matchmakingQueue)
          .where(
            and(
              eq(matchmakingQueue.inviteCode, inviteCode),
              eq(matchmakingQueue.mode, mode),
              ne(matchmakingQueue.userId, userId),
              gte(matchmakingQueue.enqueuedAt, freshAfter),
            ),
          )
          .orderBy(asc(matchmakingQueue.enqueuedAt))
          .limit(1),
      ),
    )
    .returning({ userId: matchmakingQueue.userId });

  if (claimed.length > 0) {
    // Davet eden = p1 (önce gelen), katılan = p2.
    const matchId = await createMatchBetween(db, claimed[0]!.userId, userId, mode);
    return { matched: true, matchId };
  }

  // Davet bulunamadı: süresi dolmuş / iptal edilmiş / yanlış kod / davet eden
  // henüz kuyruğa girmemiş olabilir. matched:false → sayfa uygun mesaj gösterir.
  return { matched: false, queued: false };
}

/**
 * Bayat davet kayıtlarını temizle (TTL aşımı). Çağrıldığında yan etki olarak
 * eski davetleri siler — davet polling/katılma akışlarında ara sıra çağrılır.
 * Rastgele kuyruk (inviteCode null) ETKİLENMEZ.
 */
export async function pruneStaleInvites(): Promise<void> {
  const db = getDb();
  const staleBefore = new Date(Date.now() - INVITE_TTL_MS);
  await db
    .delete(matchmakingQueue)
    .where(
      and(
        isNotNull(matchmakingQueue.inviteCode), // sadece davet kayıtları
        lte(matchmakingQueue.enqueuedAt, staleBefore), // TTL aşmış
      ),
    );
}

/**
 * Kullanıcı eşleşmeyi beklerken: bu arada onun için bir maç oluşturulmuş mu?
 * (Rakip onu kaptıysa, kullanıcı artık bir maçın oyuncusudur.)
 *
 * MOD-ÖZEL (kritik): `mode` verilirse yalnızca O MODDAKİ aktif maça yönlendirir.
 * Yoksa kullanıcının başka moddaki eski/zombi aktif maçı (örn. hiç bitmemiş bir
 * 'hedef' maçı) 'kadro' eşleşmesinde döndürülüp YANLIŞ sayfada açılır → state
 * şekli uyuşmaz, mod-özel move route 409 verir (gözlenen bug: hedef maçı kadro
 * sayfasında → squad-move 409 fırtınası). Mod filtresi bunu kökten keser.
 */
export async function findActiveMatchFor(
  userId: string,
  mode?: OnlineMode,
): Promise<string | null> {
  const db = getDb();

  // LOBİ modu (imposter): oyuncu P3-P5 olabilir → match_player'dan (indexli) bak.
  // p1/p2 kolonları yalnız ilk iki oyuncuyu tutar; bu sorgu hepsini kapsar.
  if (mode && isLobbyMode(mode)) {
    const rows = await db
      .select({ id: matchTable.id, createdAt: matchTable.createdAt })
      .from(matchPlayerTable)
      .innerJoin(matchTable, eq(matchPlayerTable.matchId, matchTable.id))
      .where(
        and(
          eq(matchPlayerTable.userId, userId),
          eq(matchTable.status, 'active'),
          eq(matchTable.mode, mode),
        ),
      )
      .orderBy(desc(matchTable.createdAt))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  const conditions = [
    eq(matchTable.status, 'active'),
    or(eq(matchTable.p1UserId, userId), eq(matchTable.p2UserId, userId)),
  ];
  if (mode) conditions.push(eq(matchTable.mode, mode));
  const rows = await db
    .select({ id: matchTable.id })
    .from(matchTable)
    .where(and(...conditions))
    // EN YENİ active maç (desc). Eski bir zombi maç kalmışsa ona değil, en son
    // oluşturulana yönlendir — yeni eşleşmenin geçerli maçı budur.
    .orderBy(desc(matchTable.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Kullanıcının görünen adını döndürür (maç state'inde gösterim için).
 * İsim boşsa (magic-link kayıtta isim sormaz) e-postanın baş kısmından türetir
 * — örn. "ali.gursoy@x.com" → "ali.gursoy". Böylece "Oyuncu 1/2" yerine
 * tanınabilir bir ad görünür. (Kalıcı çözüm: profil ekranında ad belirleme.)
 */
async function displayNameOf(
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<string> {
  const rows = await db
    .select({ name: userTable.name, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  const row = rows[0];
  if (row?.name && row.name.trim()) return row.name.trim();
  if (row?.email) {
    const local = row.email.split('@')[0] ?? '';
    if (local) return local.slice(0, 20);
  }
  return 'Oyuncu';
}
