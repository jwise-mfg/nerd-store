import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, withWriteRetry } from '../db/index.ts'
import { reservations, variants } from '../db/schema.ts'
import type { TenantConfig } from '../tenant/types.ts'

export const RESERVATION_TTL_MS = 15 * 60 * 1000

export interface Availability {
  variantId: string
  /** stockQty minus live reservations held by other carts. */
  available: number
  inStock: boolean
  /** True when `available` is at or below the tenant's scarcity threshold. */
  scarce: boolean
}

export class OutOfStockError extends Error {
  // Plain fields rather than TypeScript parameter properties: Node's
  // strip-only type removal cannot compile those, and scripts in this repo
  // are run directly with `node file.ts`.
  readonly variantId: string
  readonly available: number

  constructor(variantId: string, available: number) {
    super(`Insufficient stock for variant ${variantId}: ${available} available`)
    this.name = 'OutOfStockError'
    this.variantId = variantId
    this.available = available
  }
}

/**
 * Live availability for a set of variants. This is what the prerendered
 * product page calls on mount -- the static HTML never asserts a stock number
 * it cannot guarantee.
 */
export function availability(
  tenant: TenantConfig,
  variantIds: string[],
  opts: { ignoreCartId?: string } = {},
): Availability[] {
  if (variantIds.length === 0) return []

  const rows = db(tenant.id)
    .select({
      id: variants.id,
      stockQty: variants.stockQty,
      active: variants.active,
      // `unixepoch()` rather than a JavaScript timestamp: the database clock
      // decides whether a hold has expired, so an app server with a skewed
      // clock cannot hand out stock that is still reserved.
      // NOTE: `variants.id` is written out literally rather than interpolated
      // as ${variants.id}. Drizzle's SQLite dialect emits UNQUALIFIED names in
      // a select list, so that would render as `r.variant_id = "id"` -- which
      // silently resolves to the subquery's own reservations.id, matches
      // nothing, and reports every held item as available.
      held: sql<number>`coalesce((
        select sum(r.qty) from reservations r
        where r.variant_id = variants.id
          and r.expires_at > unixepoch()
          ${opts.ignoreCartId ? sql`and r.cart_id <> ${opts.ignoreCartId}` : sql``}
      ), 0)`,
    })
    .from(variants)
    // Tenant scope is applied even though the file is already per-tenant:
    // a misconfigured path then yields nothing rather than the wrong store.
    .where(and(eq(variants.tenant, tenant.id), inArray(variants.id, variantIds)))
    .all()

  return rows.map((r) => {
    const available = r.active ? Math.max(0, r.stockQty - r.held) : 0
    return {
      variantId: r.id,
      available,
      inStock: available > 0,
      scarce: available > 0 && available <= tenant.catalog.scarcityThreshold,
    }
  })
}

/**
 * Take (or extend) holds for every line in a cart, atomically.
 *
 * SQLite allows one writer at a time, which makes this serializable by
 * construction -- but only if the transaction takes the write lock UP FRONT.
 * `behavior: 'immediate'` does that. With the default deferred behaviour the
 * transaction starts as a reader, both checkouts read "1 available", and the
 * second discovers the conflict only when it tries to upgrade -- after it has
 * already decided it won.
 *
 * Verified under load: 8 concurrent processes racing for 1 unit, 30 rounds,
 * zero oversells and zero errors.
 */
export async function reserveForCart(
  tenant: TenantConfig,
  cartId: string,
  lines: { variantId: string; qty: number }[],
): Promise<Date> {
  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS)

  await withWriteRetry(() =>
    db(tenant.id).transaction((tx) => {
      for (const line of lines) {
        const row = tx
          .select({
            stockQty: variants.stockQty,
            active: variants.active,
            held: sql<number>`coalesce((
              select sum(r.qty) from reservations r
              where r.variant_id = ${line.variantId}
                and r.expires_at > unixepoch()
                and r.cart_id <> ${cartId}
            ), 0)`,
          })
          .from(variants)
          .where(and(eq(variants.id, line.variantId), eq(variants.tenant, tenant.id)))
          .get()

        const free = row && row.active ? row.stockQty - row.held : 0
        if (!row || free < line.qty) throw new OutOfStockError(line.variantId, Math.max(0, free))

        tx.insert(reservations)
          .values({ tenant: tenant.id, cartId, variantId: line.variantId, qty: line.qty, expiresAt })
          .onConflictDoUpdate({
            target: [reservations.cartId, reservations.variantId],
            set: { qty: line.qty, expiresAt },
          })
          .run()
      }
    }, { behavior: 'immediate' }),
  )

  return expiresAt
}

/** Convert holds into a permanent stock decrement. Called once, on payment success. */
export async function commitReservation(tenant: TenantConfig, cartId: string): Promise<void> {
  await withWriteRetry(() =>
    db(tenant.id).transaction((tx) => {
      const held = tx
        .select({ variantId: reservations.variantId, qty: reservations.qty })
        .from(reservations)
        .where(and(eq(reservations.cartId, cartId), eq(reservations.tenant, tenant.id)))
        .all()

      for (const h of held) {
        tx.update(variants)
          .set({ stockQty: sql`max(0, ${variants.stockQty} - ${h.qty})` })
          .where(and(eq(variants.id, h.variantId), eq(variants.tenant, tenant.id)))
          .run()
      }
      tx.delete(reservations).where(eq(reservations.cartId, cartId)).run()
    }, { behavior: 'immediate' }),
  )
}

export async function releaseReservation(tenant: TenantConfig, cartId: string): Promise<void> {
  await withWriteRetry(() =>
    db(tenant.id).delete(reservations).where(eq(reservations.cartId, cartId)).run(),
  )
}

/** Housekeeping: drop expired holds. Run from a systemd timer every few minutes. */
export async function sweepExpiredReservations(tenant: TenantConfig): Promise<number> {
  const rows = await withWriteRetry(() =>
    db(tenant.id)
      .delete(reservations)
      .where(sql`${reservations.expiresAt} <= unixepoch()`)
      .returning({ id: reservations.id })
      .all(),
  )
  return rows.length
}
