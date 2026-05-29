/**
 * pnpm migrate çağrısı:
 *   1. .env.local'den DATABASE_URL'i okur
 *   2. drizzle/*.sql migration dosyalarını sırayla uygular
 *
 * Önce `pnpm --filter @futbol-kart/db generate` ile yeni migration üretilir,
 * sonra bu script `pnpm --filter @futbol-kart/db migrate` ile çalıştırılır.
 */
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..');

config({ path: resolve(ROOT, '.env.local') });
config({ path: resolve(ROOT, '.env') });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      '\x1b[31m[migrate] DATABASE_URL yok.\x1b[0m .env.local dosyasına ekle.',
    );
    process.exit(1);
  }
  console.log('[migrate] running migrations...');
  const sql = neon(url);
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: resolve(__dirname, '..', 'drizzle') });
  console.log('\x1b[32m[migrate] done.\x1b[0m');
}

main().catch((err) => {
  console.error('\x1b[31m[migrate] failed:\x1b[0m', err);
  process.exit(1);
});
