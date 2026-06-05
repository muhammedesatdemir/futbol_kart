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
 * Yarış koşulu notu: gerçek üretimde eşleştirme transaction/locking ister
 * (iki istek aynı rakibi kapmasın). Bu MVP basit tutuldu; sağlamlaştırma Faz 4.
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

  // 2) Kuyrukta bekleyen başka oyuncu var mı? (kendisi hariç, aynı mod)
  const waiting = await db
    .select()
    .from(matchmakingQueue)
    .where(and(eq(matchmakingQueue.mode, mode), ne(matchmakingQueue.userId, userId)))
    .orderBy(asc(matchmakingQueue.enqueuedAt))
    .limit(1);

  if (waiting.length > 0) {
    const opponent = waiting[0]!;
    // 3) Maç oluştur. p1 = bekleyen (önce gelen), p2 = yeni katılan.
    const matchId = nanoid();
    const seed = `${matchId}-${mode}`;
    const [p1Name, p2Name] = await Promise.all([
      displayNameOf(db, opponent.userId),
      displayNameOf(db, userId),
    ]);
    const state = buildOnlineMatchState(matchId, seed, p1Name, p2Name);

    await db.insert(matchTable).values({
      id: matchId,
      mode,
      seed,
      status: 'active',
      p1UserId: opponent.userId,
      p2UserId: userId,
      currentScene: state.scene,
      state,
    });

    // 4) Rakibi kuyruktan çıkar (artık maçta).
    await db
      .delete(matchmakingQueue)
      .where(eq(matchmakingQueue.userId, opponent.userId));

    return { matched: true, matchId };
  }

  // 5) Bekleyen yok → kuyruğa ekle (zaten varsa zaman damgasını tazele).
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
    .orderBy(asc(matchTable.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Kullanıcının görünen adını döndürür (maç state'inde gösterim için). */
async function displayNameOf(
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<string> {
  const rows = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return rows[0]?.name ?? 'Oyuncu';
}
