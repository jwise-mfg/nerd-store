import type { Config } from 'drizzle-kit'

// Migrations are generated once from the shared schema and applied to every
// tenant file by src/db/migrate.ts. The url here is only used by drizzle-kit
// for `generate` and `studio`.
export default {
  schema: './src/db/schema.ts',
  out: '../../db/migrations',
  dialect: 'sqlite',
  dbCredentials: { url: process.env.DATABASE_PATH_I3X ?? './data/i3x.db' },
} satisfies Config
