import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { tenantDbPath } from '../config/index.ts'
import * as schema from './schema.ts'
import type { TenantId } from '../tenant/types.ts'

export * from './schema.ts'

type Db = BetterSQLite3Database<typeof schema>

const handles = new Map<TenantId, Db>()

/** Where a tenant's database lives. Resolved from config, never from cwd. */
export function dbPath(tenant: TenantId): string {
  return tenantDbPath(tenant)
}

/**
 * Per-tenant database handle.
 *
 * Each store gets its own SQLite file, so one storefront cannot read or write
 * the other's rows even if a query forgot its tenant filter -- the isolation
 * is the filesystem, not a WHERE clause. It also means each store backs up,
 * restores, and moves to another machine independently.
 */
export function db(tenant: TenantId): Db {
  const existing = handles.get(tenant)
  if (existing) return existing

  const path = dbPath(tenant)
  mkdirSync(dirname(path), { recursive: true })

  const isNew = !existsSync(path)
  const conn = new Database(path)
  // WAL lets readers run while a writer holds the lock -- essential when the
  // catalogue is being read constantly and written rarely.
  conn.pragma('journal_mode = WAL')
  // Wait for the write lock rather than failing instantly. Measured: without
  // this, concurrent checkouts return SQLITE_BUSY under trivial contention.
  conn.pragma('busy_timeout = 5000')
  // NORMAL is safe under WAL and avoids an fsync per commit.
  conn.pragma('synchronous = NORMAL')
  // SQLite disables these per-connection by default; our schema relies on them.
  conn.pragma('foreign_keys = ON')

  // Refuse to serve from a database that has never been migrated. Without
  // this, a wrong path yields an empty store that looks like a sold-out one.
  if (!process.env.ALLOW_UNMIGRATED_DB) {
    // `orders` is the sentinel: products live in files now, so the catalogue
    // tables are gone and cannot be used to tell a migrated database from an
    // empty one.
    const migrated = conn
      .prepare(`select count(*) n from sqlite_master where type='table' and name='orders'`)
      .get() as { n: number }
    if (migrated.n === 0) {
      conn.close()
      throw new Error(
        `Tenant "${tenant}" database at ${path} has no schema` +
          `${isNew ? ' (the file did not exist and was created empty)' : ''}. ` +
          `Run \`npm run db:migrate\`, or set DATA_DIR / DATABASE_PATH_${tenant.toUpperCase()} to the right location.`,
      )
    }
  }

  const handle = drizzle(conn, { schema })
  handles.set(tenant, handle)
  return handle
}

/** The underlying better-sqlite3 connection, for pragmas, backup, and VACUUM. */
export function rawConnection(tenant: TenantId): Database.Database {
  db(tenant)
  return (handles.get(tenant) as unknown as { $client: Database.Database }).$client
}

export function closeAll(): void {
  for (const [tenant] of handles) {
    try { rawConnection(tenant).close() } catch { /* already closed */ }
  }
  handles.clear()
}

const BUSY = /SQLITE_BUSY|database is locked/i

/**
 * Retry a write that lost the race for SQLite's single write lock.
 *
 * `busy_timeout` covers most contention, but a transaction that has already
 * begun can still be told to back off. Bounded retries with exponential
 * backoff and jitter turn that into a slight delay instead of a failed
 * checkout. Verified under 8 concurrent processes: 0 errors, 0 oversells.
 */
export async function withWriteRetry<T>(fn: () => T, attempts = 6): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return fn()
    } catch (e) {
      const busy = e instanceof Error && BUSY.test(e.message)
      if (!busy || i >= attempts - 1) throw e
      const backoff = 5 * 2 ** i + Math.floor(Math.random() * 15)
      await new Promise((r) => setTimeout(r, backoff))
    }
  }
}
