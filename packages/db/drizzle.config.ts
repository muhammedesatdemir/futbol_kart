import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

// .env.local'den DATABASE_URL'i yükle (kök dizinden)
config({ path: '../../.env.local' });
config({ path: '../../.env' });

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
