import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { db, dbPath } from './index.ts'
import { allTenants } from '../tenant/index.ts'

/**
 * Apply migrations to every tenant's file.
 *
 * Run on deploy, before the services restart. Each store migrates
 * independently, so a failure on one does not leave the other unstarted.
 */
export function migrateAll(): void {
  // Creating the schema is the one legitimate reason to open an empty file.
  process.env.ALLOW_UNMIGRATED_DB = '1'
  const here = dirname(fileURLToPath(import.meta.url))
  const folder = join(here, '../../../../db/migrations')
  for (const t of allTenants()) {
    migrate(db(t.id), { migrationsFolder: folder })
    console.log(`  migrated ${t.id} -> ${dbPath(t.id)}`)
  }
  delete process.env.ALLOW_UNMIGRATED_DB
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Migrating tenant databases…')
  migrateAll()
  console.log('Done.')
}
