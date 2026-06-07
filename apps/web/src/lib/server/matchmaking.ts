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
  match as matchTable,
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

/** Pilot: yalnızca VS Düello online. İleride diğer modlar eklenir. */
export const ONLINE_MODES = ['vs-duello'] as const;
export type OnlineMode = (typeof ONLINE_MODES)[number];

export interface MatchmakingResult {
  /** Eşleşme oldu mu? */
  matched: boolean;
  /** Eşleştiyse oluşan/katılınan maçın id'si. */
  matchId?: string;
  /** Eşleşme beklemedeyse: kuyrukta olduğunu bildirir. */
  queued?: boolean;
}

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

  // 1) Zaten bir aktif maçta mı? Öyleyse o maça yönlendir (tek aktif maç kuralı).
  const existingMatch = await findActiveMatchFor(userId);
  if (existingMatch) {
    return { matched: true, matchId: existingMatch };
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
            ),
          )
          .orderBy(asc(matchmakingQueue.enqueuedAt))
          .limit(1),
      ),
    )
    .returning({ userId: matchmakingQueue.userId });

  if (claimed.length > 0) {
    const opponentId = claimed[0]!.userId;
    // 4) Maç oluştur. p1 = kapılan bekleyen (önce gelen), p2 = yeni katılan.
    const matchId = nanoid();
    const seed = `${matchId}-${mode}`;
    const [p1Name, p2Name] = await Promise.all([
      displayNameOf(db, opponentId),
      displayNameOf(db, userId),
    ]);
    const state = buildOnlineMatchState(matchId, seed, p1Name, p2Name);

    // Süre EŞLEŞME ANINDA başlar (iki tarafta eş). İlk sahne el seçimi.
    const secs = sceneDeadlineSeconds(state);
    const turnDeadline = secs ? new Date(Date.now() + secs * 1000) : null;

    await db.insert(matchTable).values({
      id: matchId,
      mode,
      seed,
      status: 'active',
      p1UserId: opponentId,
      p2UserId: userId,
      currentScene: state.scene,
      state,
      turnDeadline,
    });

    // GÜVENLİK AĞI: maç kurulduğunda HER İKİ oyuncuyu da kuyruktan temizle.
    // Claim edilen zaten silindi; ama eşzamanlı bir self-enqueue (kullanıcı
    // maça girerken POST'u araya girip kendini kuyruğa yazmış olabilir) kalıntı
    // bırakabilir → "hem maçta hem kuyrukta" tutarsızlığı. Bunu siler.
    await db
      .delete(matchmakingQueue)
      .where(
        or(
          eq(matchmakingQueue.userId, opponentId),
          eq(matchmakingQueue.userId, userId),
        ),
      );

    return { matched: true, matchId };
  }

  // 5) Rakip kapılamadı (kuyruk boş / başkası kaptı) → kuyruğa ekle.
  await db
    .insert(matchmakingQueue)
    .values({ userId, mode })
    .onConflictDoUpdate({
      target: matchmakingQueue.userId,
      set: { mode, enqueuedAt: new Date() },
    });

  return { matched: false, queued: true };
}

/** Kullanıcıyı kuyruktan çıkar (vazgeçti / sayfadan ayrıldı). */
export async function leaveMatchmaking(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(matchmakingQueue).where(eq(matchmakingQueue.userId, userId));
}

/**
 * Kullanıcı eşleşmeyi beklerken: bu arada onun için bir maç oluşturulmuş mu?
 * (Rakip onu kaptıysa, kullanıcı artık bir maçın oyuncusudur.)
 */
export async function findActiveMatchFor(
  userId: string,
): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ id: matchTable.id })
    .from(matchTable)
    .where(
      and(
        eq(matchTable.status, 'active'),
        or(eq(matchTable.p1UserId, userId), eq(matchTable.p2UserId, userId)),
      ),
    )
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
