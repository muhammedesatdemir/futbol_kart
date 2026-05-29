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

export type DbUser = typeof user.$inferSelect;
export type DbSession = typeof session.$inferSelect;
export type DbGame = typeof games.$inferSelect;
export type DbGameInsert = typeof games.$inferInsert;
