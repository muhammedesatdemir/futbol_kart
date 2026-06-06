import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/* ============================================================================
 * Better-Auth çekirdek tabloları
 * https://www.better-auth.com/docs/concepts/database
 * Alan isimleri Better-Auth'un beklediği snake_case değil camelCase ile
 * tutuluyor ve `adapter` üzerinden eşleniyor — Better-Auth Drizzle adapter
 * varsayılan olarak alanı olduğu gibi kullanır.
 * ========================================================================= */

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index('session_user_idx').on(t.userId),
  }),
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index('account_user_idx').on(t.userId),
    providerCompound: uniqueIndex('account_provider_account_idx').on(
      t.providerId,
      t.accountId,
    ),
  }),
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    identifierIdx: index('verification_identifier_idx').on(t.identifier),
  }),
);

/* ============================================================================
 * Uygulama tabloları: oyunlar + paylaşım
 * ========================================================================= */

/**
 * Bir oyun kaydı. Misafir oyuncular için userId null kalabilir.
 * `shareId` URL'de görünen kısa kimlik (örn. /mac/abc12345).
 * `snapshot` final SessionState (oyun bittikten sonra dondurulmuş JSON).
 */
export const games = pgTable(
  'games',
  {
    id: text('id').primaryKey(),
    shareId: text('share_id').notNull().unique(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    mode: text('mode').notNull(), // 'hotseat' | 'vs-bot'
    p1Name: text('p1_name').notNull(),
    p2Name: text('p2_name').notNull(),
    p1Score: integer('p1_score').notNull(),
    p2Score: integer('p2_score').notNull(),
    winnerSide: text('winner_side').notNull(), // 'P1' | 'P2' | 'tie'
    totalRounds: integer('total_rounds').notNull(),
    /** Final SessionState ve history JSON olarak */
    snapshot: jsonb('snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    shareIdx: uniqueIndex('games_share_id_idx').on(t.shareId),
    userIdx: index('games_user_idx').on(t.userId),
    createdIdx: index('games_created_idx').on(t.createdAt),
  }),
);

/* ============================================================================
 * Online çok oyunculu tablolar
 * Bkz: ONLINE-YOL-HARITASI.md (Faz 2-4)
 * Tasarım: sunucu-otoriteli. `match.state` = kaynak-doğru SessionState (jsonb).
 * `matchMove` = audit/replay/reconnect için event log.
 * ========================================================================= */

/**
 * Bir online maç. İki girişli kullanıcı arasında.
 * `state` sunucudaki kaynak-doğru SessionState; client'taki durum yalnızca görsel.
 * `seed` ile iki oyuncu deterministik olarak aynı soru sırasını görür.
 * Reconnect: client `state`'i HTTP ile çeker, kaldığı yerden devam eder.
 */
export const match = pgTable(
  'match',
  {
    id: text('id').primaryKey(),
    mode: text('mode').notNull(), // 'vs-duello' (pilot) | sonra diğer modlar
    seed: text('seed').notNull(),
    // 'matchmaking' | 'active' | 'finished' | 'abandoned'
    status: text('status').notNull().default('active'),
    p1UserId: text('p1_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    p2UserId: text('p2_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Sunucu-otoriteli mevcut sahne (Scene enum string). */
    currentScene: text('current_scene'),
    /** Kaynak-doğru SessionState — her doğrulanmış hamleden sonra güncellenir. */
    state: jsonb('state').notNull(),
    /**
     * FlowContext'in tur-akışı durumu (FlowState: PRNG + usedQuestionIds +
     * params). Soru seçimini deterministik kılar — sunucu her turda buradan
     * yükler, seçer, geri yazar. SessionState'ten ayrı tutulur (onu kirletmez).
     */
    flowState: jsonb('flow_state'),
    /** Aktif turun sunucu-otoriteli bitiş anı (süre dolunca otomatik çözüm). */
    turnDeadline: timestamp('turn_deadline', { withTimezone: true }),
    /**
     * OPTIMISTIC LOCKING sürüm sayacı. Her yazmada artar; UPDATE yalnızca
     * okunan sürüm hâlâ geçerliyse (WHERE version = okunan) uygulanır. Eşzamanlı
     * iki hamle (aynı ms'de) yarışırsa biri reddedilir → kaybolan hamle olmaz.
     * Bkz ONLINE-YOL-HARITASI.md (eşzamanlılık).
     */
    version: integer('version').notNull().default(0),
    /** 'P1' | 'P2' | 'tie' | null (bitmeden null). */
    winnerSide: text('winner_side'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    p1Idx: index('match_p1_idx').on(t.p1UserId),
    p2Idx: index('match_p2_idx').on(t.p2UserId),
    statusIdx: index('match_status_idx').on(t.status),
  }),
);

/**
 * Bir maçtaki tek bir event (CARD_PLAYED, ROUND_RESOLVED, vb.).
 * `seq` maç içinde artan sıra no — idempotent uygulama ve çift gönderim/
 * yeniden bağlanma güvenliği için. (match_id, seq) benzersiz.
 */
export const matchMove = pgTable(
  'match_move',
  {
    id: text('id').primaryKey(),
    matchId: text('match_id')
      .notNull()
      .references(() => match.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    side: text('side').notNull(), // 'P1' | 'P2'
    /** SessionEvent (jsonb) — sunucuda doğrulandıktan sonra kaydedilir. */
    event: jsonb('event').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    matchSeqIdx: uniqueIndex('match_move_match_seq_idx').on(t.matchId, t.seq),
  }),
);

/**
 * Eşleşme bekleyen kullanıcılar. Eşleştirici kuyruktan 2 uygun oyuncu bulup
 * `match` oluşturur. MVP: ratingsiz FIFO; sonra rating tabanlı.
 */
export const matchmakingQueue = pgTable(
  'matchmaking_queue',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    mode: text('mode').notNull(),
    /** Eşleştirme için (MVP'de user_rating'den okunur veya sabit 1000). */
    rating: integer('rating').notNull().default(1000),
    enqueuedAt: timestamp('enqueued_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    modeIdx: index('matchmaking_queue_mode_idx').on(t.mode),
  }),
);

/**
 * Kullanıcı rating'i (mod bazlı). ŞEMA ŞİMDİ açılır; Elo HESABI sonra.
 * MVP'de herkes 1000'de başlar, maç bitince games/wins güncellenir.
 * Bkz: ONLINE-YOL-HARITASI.md (rating kararı).
 */
export const userRating = pgTable(
  'user_rating',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    mode: text('mode').notNull(),
    rating: integer('rating').notNull().default(1000),
    gamesPlayed: integer('games_played').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    draws: integer('draws').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: uniqueIndex('user_rating_user_mode_idx').on(t.userId, t.mode),
  }),
);

export type DbUser = typeof user.$inferSelect;
export type DbSession = typeof session.$inferSelect;
export type DbGame = typeof games.$inferSelect;
export type DbGameInsert = typeof games.$inferInsert;
export type DbMatch = typeof match.$inferSelect;
export type DbMatchInsert = typeof match.$inferInsert;
export type DbMatchMove = typeof matchMove.$inferSelect;
export type DbMatchMoveInsert = typeof matchMove.$inferInsert;
export type DbMatchmakingQueue = typeof matchmakingQueue.$inferSelect;
export type DbUserRating = typeof userRating.$inferSelect;
