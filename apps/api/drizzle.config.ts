import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Only needed for commands that talk to the database (migrate, push, studio).
    // `drizzle-kit generate` works offline against the schema file.
    url: process.env.DATABASE_URL ?? '',
  },
});
