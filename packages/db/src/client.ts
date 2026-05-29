import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Neon HTTP driver — Vercel Edge ve Node runtime'larda tek SQL üzerinden
 * iletişim kurar. Connection pooling kullanmaz (Neon kendi yapar).
 *
 * DATABASE_URL `.env.local` veya Vercel env vars'tan gelir.
 *
 * Build sırasında env yoksa modül yüklenmesi patlamasın diye Proxy ile
 * lazy: gerçek query atıldığında check edilir.
 */
let cachedDb: ReturnType<typeof drizzle> | null = null;

function buildDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL not set. Add it to .env.local (lokal) veya Vercel project env vars.',
    );
  }
  const sql = neon(url);
  return drizzle(sql, { schema });
}

/**
 * Lazy proxy. İlk method/property erişiminde DB'yi kurar.
 * Bu sayede modül yüklenmesi sırasında env eksikse patlamaz —
 * sadece gerçekten kullanılınca patlar.
 */
export function getDb(): ReturnType<typeof drizzle> {
  return new Proxy({} as ReturnType<typeof drizzle>, {
    get(_target, prop) {
      if (!cachedDb) cachedDb = buildDb();
      const value = (cachedDb as unknown as Record<string | symbol, unknown>)[
        prop
      ];
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(cachedDb)
        : value;
    },
  });
}

export type Database = ReturnType<typeof getDb>;
