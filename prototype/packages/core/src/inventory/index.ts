import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, withWriteRetry } from '../db/index.ts'
import { reservations } from '../db/schema.ts'
import { readProductFiles, productsDir } from '../catalog/files.ts'
import type { TenantConfig } from '../tenant/types.ts'

export const RESERVATION_TTL_MS = 15 * 60 * 1000

export interface Availability {
  sku: string
  available: number
  inStock: boolean
  scarce: boolean
}

export class OutOfStockError extends Error {
  readonly sku: string
  readonly available: number
  constructor(sku: string, available: number) {
    super(`Insufficient stock for ${sku}: ${available} available`)
    this.name = 'OutOfStockError'
    this.sku = sku
    this.available = available
  }
}

/** Declared stock for every SKU, straight from the product files. */
export function stockFromFiles(tenant: TenantConfig): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of readProductFiles(tenant.id)) {
    for (const v of p.variants) m.set(v.sku, v.stock)
  }
  return m
}

/** Live holds per SKU, from the database. */
function heldBySku(tenant: TenantConfig, skus: string[], ignoreCartId?: string): Map<string, number> {
  if (skus.length === 0) return new Map()
  const rows = db(tenant.id)
    .select({ sku: reservations.sku, qty: reservations.qty })
    .from(reservations)
    .where(and(
      eq(reservations.tenant, tenant.id),
      inArray(reservations.sku, skus),
      sql`${reservations.expiresAt} > unixepoch()`,
      ...(ignoreCartId ? [sql`${reservations.cartId} <> ${ignoreCartId}`] : []),
    ))
    .all()
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.sku, (m.get(r.sku) ?? 0) + r.qty)
  return m
}

/**
 * What can actually be sold right now: the number in the file, minus holds
 * other shoppers are sitting on.
 */
export function availability(
  tenant: TenantConfig,
  skus: string[],
  opts: { ignoreCartId?: string } = {},
): Availability[] {
  if (skus.length === 0) return []
  const declared = stockFromFiles(tenant)
  const held = heldBySku(tenant, skus, opts.ignoreCartId)

  return skus
    .filter((s) => declared.has(s))
    .map((sku) => {
      const available = Math.max(0, (declared.get(sku) ?? 0) - (held.get(sku) ?? 0))
      return {
        sku,
        available,
        inStock: available > 0,
        scarce: available > 0 && available <= tenant.catalog.scarcityThreshold,
      }
    })
}

/**
 * Take or extend holds for a cart.
 *
 * The check and the insert happen in one immediate transaction, so two
 * shoppers racing for the last unit cannot both pass: one commits, the other
 * sees the hold and is refused before any card is charged.
 */
export async function reserveForCart(
  tenant: TenantConfig,
  cartId: string,
  lines: { sku: string; qty: number }[],
): Promise<Date> {
  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS)
  const declared = stockFromFiles(tenant)

  await withWriteRetry(() =>
    db(tenant.id).transaction((tx) => {
      for (const line of lines) {
        const stock = declared.get(line.sku)
        if (stock === undefined) throw new OutOfStockError(line.sku, 0)

        const heldRows = tx.select({ qty: reservations.qty }).from(reservations)
          .where(and(
            eq(reservations.tenant, tenant.id),
            eq(reservations.sku, line.sku),
            sql`${reservations.expiresAt} > unixepoch()`,
            sql`${reservations.cartId} <> ${cartId}`,
          )).all()
        const held = heldRows.reduce((n, r) => n + r.qty, 0)

        const free = stock - held
        if (free < line.qty) throw new OutOfStockError(line.sku, Math.max(0, free))

        tx.insert(reservations)
          .values({ tenant: tenant.id, cartId, sku: line.sku, qty: line.qty, expiresAt })
          .onConflictDoUpdate({
            target: [reservations.cartId, reservations.sku],
            set: { qty: line.qty, expiresAt },
          })
          .run()
      }
    }, { behavior: 'immediate' }),
  )
  return expiresAt
}

/**
 * Write a new stock number into a product file.
 *
 * Written to a temporary file and renamed, which is atomic on POSIX -- a
 * crash mid-write leaves the original intact rather than a truncated file.
 * Only the one number changes; formatting and key order are preserved so the
 * file stays diffable and your edits are not reshuffled.
 */
export function setStockInFile(tenant: TenantConfig, sku: string, next: number): boolean {
  for (const p of readProductFiles(tenant.id)) {
    if (!p.variants.some((v) => v.sku === sku)) continue
    const file = join(productsDir(tenant.id), p.slug, 'product.json')
    const doc = JSON.parse(readFileSync(file, 'utf8')) as {
      variants: { sku: string; stock?: number }[]
    }
    const v = doc.variants.find((x) => x.sku === sku)
    if (!v) continue
    v.stock = Math.max(0, next)
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n')
    renameSync(tmp, file)
    return true
  }
  return false
}

/** Convert holds into a permanent decrement in the product files. */
export async function commitReservation(tenant: TenantConfig, cartId: string): Promise<void> {
  const held = db(tenant.id)
    .select({ sku: reservations.sku, qty: reservations.qty })
    .from(reservations)
    .where(and(eq(reservations.cartId, cartId), eq(reservations.tenant, tenant.id)))
    .all()

  const declared = stockFromFiles(tenant)
  for (const h of held) {
    const now = declared.get(h.sku)
    if (now === undefined) continue
    setStockInFile(tenant, h.sku, Math.max(0, now - h.qty))
  }
  await withWriteRetry(() =>
    db(tenant.id).delete(reservations).where(eq(reservations.cartId, cartId)).run(),
  )
}

export async function releaseReservation(tenant: TenantConfig, cartId: string): Promise<void> {
  await withWriteRetry(() =>
    db(tenant.id).delete(reservations).where(eq(reservations.cartId, cartId)).run(),
  )
}

/** Housekeeping: drop expired holds. Run from a systemd timer. */
export async function sweepExpiredReservations(tenant: TenantConfig): Promise<number> {
  const rows = await withWriteRetry(() =>
    db(tenant.id).delete(reservations)
      .where(sql`${reservations.expiresAt} <= unixepoch()`)
      .returning({ id: reservations.id }).all(),
  )
  return rows.length
}
