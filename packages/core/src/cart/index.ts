import { and, eq } from 'drizzle-orm'
import { db, withWriteRetry } from '../db/index.ts'
import { cartItems, carts } from '../db/schema.ts'
import type { TenantConfig, ShippingRate } from '../tenant/types.ts'
import { availability } from '../inventory/index.ts'
import { findVariant } from '../catalog/index.ts'
import { sumLines } from '../util/money.ts'

const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface CartLine {
  sku: string
  productSlug: string
  productTitle: string
  variantTitle: string
  attributes: Record<string, string>
  image: { url: string; alt: string } | null
  qty: number
  unitPriceCents: number
  lineTotalCents: number
  available: number
}

export interface CartView {
  id: string
  lines: CartLine[]
  subtotalCents: number
  itemCount: number
  problems: { sku: string; requested: number; available: number }[]
}

export async function createCart(tenant: TenantConfig): Promise<string> {
  const rows = await withWriteRetry(() =>
    db(tenant.id).insert(carts)
      .values({ tenant: tenant.id, expiresAt: new Date(Date.now() + CART_TTL_MS) })
      .returning({ id: carts.id }).all(),
  )
  return rows[0]!.id
}

/**
 * Load a cart, resolving each SKU against the product files.
 *
 * A SKU that no longer exists in the files is dropped from the view rather
 * than erroring: deleting a product should not leave a shopper with a cart
 * they cannot open.
 */
export async function loadCart(tenant: TenantConfig, cartId: string | null): Promise<CartView | null> {
  if (!cartId) return null
  const cart = db(tenant.id).select({ id: carts.id }).from(carts)
    .where(and(eq(carts.id, cartId), eq(carts.tenant, tenant.id))).get()
  if (!cart) return null

  const rows = db(tenant.id).select().from(cartItems).where(eq(cartItems.cartId, cart.id)).all()
  const avail = availability(tenant, rows.map((r) => r.sku), { ignoreCartId: cart.id })
  const availMap = new Map(avail.map((a) => [a.sku, a.available]))

  const lines: CartLine[] = []
  for (const r of rows) {
    const found = findVariant(tenant, r.sku)
    if (!found) continue
    const { product, variant } = found
    lines.push({
      sku: r.sku,
      productSlug: product.slug,
      productTitle: product.title,
      variantTitle: variant.title,
      attributes: variant.attributes,
      image: variant.unitImages[0] ?? product.images[0] ?? null,
      qty: r.qty,
      unitPriceCents: r.unitPriceCents,
      lineTotalCents: r.qty * r.unitPriceCents,
      available: availMap.get(r.sku) ?? 0,
    })
  }

  return {
    id: cart.id,
    lines,
    subtotalCents: sumLines(lines),
    itemCount: lines.reduce((n, l) => n + l.qty, 0),
    problems: lines.filter((l) => l.qty > l.available)
      .map((l) => ({ sku: l.sku, requested: l.qty, available: l.available })),
  }
}

export async function addItem(
  tenant: TenantConfig, cartId: string, sku: string, qty: number,
): Promise<void> {
  // Price comes from the product file, never from the request.
  const found = findVariant(tenant, sku)
  if (!found) throw new Error('Item not available in this store')

  await withWriteRetry(() => {
    db(tenant.id).insert(cartItems)
      .values({ cartId, sku, qty, unitPriceCents: found.variant.priceCents })
      .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.sku], set: { qty } })
      .run()
    db(tenant.id).update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId)).run()
  })
}

export async function setQty(
  tenant: TenantConfig, cartId: string, sku: string, qty: number,
): Promise<void> {
  if (qty <= 0) return removeItem(tenant, cartId, sku)
  await addItem(tenant, cartId, sku, qty)
}

export async function removeItem(tenant: TenantConfig, cartId: string, sku: string): Promise<void> {
  await withWriteRetry(() =>
    db(tenant.id).delete(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.sku, sku))).run(),
  )
}

export async function clearCart(tenant: TenantConfig, cartId: string): Promise<void> {
  await withWriteRetry(() =>
    db(tenant.id).delete(carts)
      .where(and(eq(carts.id, cartId), eq(carts.tenant, tenant.id))).run(),
  )
}

export function cartExists(tenant: TenantConfig, cartId: string): boolean {
  return db(tenant.id).select({ id: carts.id }).from(carts)
    .where(and(eq(carts.id, cartId), eq(carts.tenant, tenant.id))).get() !== undefined
}

export function shipsTo(tenant: TenantConfig): string[] {
  return [...new Set(tenant.shipping.flatMap((r) => r.countries))].sort()
}

export function shippingFor(
  tenant: TenantConfig, country: string, subtotalCents: number,
): ShippingRate[] {
  return tenant.shipping
    .filter((r) => r.countries.includes(country))
    .map((r) => (r.freeAbove !== null && subtotalCents >= r.freeAbove ? { ...r, amount: 0 } : r))
    .sort((a, b) => a.amount - b.amount)
}
