import { and, eq } from 'drizzle-orm'
import { db, withWriteRetry } from '../db/index.ts'
import { cartItems, carts, products, variants } from '../db/schema.ts'
import type { TenantConfig, ShippingRate } from '../tenant/types.ts'
import { availability } from '../inventory/index.ts'
import { sumLines } from '../util/money.ts'

const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface CartLine {
  variantId: string
  sku: string
  productSlug: string
  productTitle: string
  variantTitle: string
  attributes: Record<string, string>
  image: { url: string; alt: string } | null
  qty: number
  unitPriceCents: number
  lineTotalCents: number
  /** Live availability, so the cart can show "only 1 left" or block checkout. */
  available: number
}

export interface CartView {
  id: string
  lines: CartLine[]
  subtotalCents: number
  itemCount: number
  /** Lines whose requested qty now exceeds availability. Blocks checkout. */
  problems: { variantId: string; requested: number; available: number }[]
}

export async function createCart(tenant: TenantConfig): Promise<string> {
  const rows = await withWriteRetry(() =>
    db(tenant.id)
      .insert(carts)
      .values({ tenant: tenant.id, expiresAt: new Date(Date.now() + CART_TTL_MS) })
      .returning({ id: carts.id })
      .all(),
  )
  return rows[0]!.id
}

/**
 * Load a cart, but only if it belongs to this tenant. A cart id lifted from
 * one store's cookie is simply not found on the other -- the two storefronts
 * share a database and share nothing else.
 */
export async function loadCart(tenant: TenantConfig, cartId: string | null): Promise<CartView | null> {
  if (!cartId) return null
  const cart = db(tenant.id)
    .select({ id: carts.id })
    .from(carts)
    .where(and(eq(carts.id, cartId), eq(carts.tenant, tenant.id)))
    .get()
  if (!cart) return null

  const rows = db(tenant.id)
    .select({
      variantId: variants.id, sku: variants.sku, variantTitle: variants.title,
      attributes: variants.attributes, qty: cartItems.qty,
      unitPriceCents: cartItems.unitPriceCents,
      productSlug: products.slug, productTitle: products.title, images: products.images,
      unitImages: variants.unitImages,
    })
    .from(cartItems)
    .innerJoin(variants, eq(variants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(eq(cartItems.cartId, cart.id), eq(variants.tenant, tenant.id)))
    .all()

  const avail = availability(tenant, rows.map((r) => r.variantId), { ignoreCartId: cart.id })
  const availMap = new Map(avail.map((a) => [a.variantId, a.available]))

  const lines: CartLine[] = rows.map((r) => ({
    variantId: r.variantId, sku: r.sku, productSlug: r.productSlug,
    productTitle: r.productTitle, variantTitle: r.variantTitle, attributes: r.attributes,
    image: r.unitImages[0] ?? r.images[0] ?? null,
    qty: r.qty, unitPriceCents: r.unitPriceCents,
    lineTotalCents: r.qty * r.unitPriceCents,
    available: availMap.get(r.variantId) ?? 0,
  }))

  return {
    id: cart.id,
    lines,
    subtotalCents: sumLines(lines),
    itemCount: lines.reduce((n, l) => n + l.qty, 0),
    problems: lines
      .filter((l) => l.qty > l.available)
      .map((l) => ({ variantId: l.variantId, requested: l.qty, available: l.available })),
  }
}

export async function addItem(
  tenant: TenantConfig, cartId: string, variantId: string, qty: number,
): Promise<void> {
  const v = db(tenant.id)
    .select({ id: variants.id, price: variants.priceCents })
    .from(variants)
    .where(and(eq(variants.id, variantId), eq(variants.tenant, tenant.id), eq(variants.active, true)))
    .get()
  if (!v) throw new Error('Variant not available in this store')

  await withWriteRetry(() => {
    db(tenant.id)
      .insert(cartItems)
      .values({ cartId, variantId, qty, unitPriceCents: v.price })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.variantId],
        set: { qty },
      })
      .run()
    db(tenant.id).update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId)).run()
  })
}

export async function setQty(
  tenant: TenantConfig, cartId: string, variantId: string, qty: number,
): Promise<void> {
  if (qty <= 0) return removeItem(tenant, cartId, variantId)
  await addItem(tenant, cartId, variantId, qty)
}

export async function removeItem(tenant: TenantConfig, cartId: string, variantId: string): Promise<void> {
  await withWriteRetry(() =>
    db(tenant.id)
      .delete(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)))
      .run(),
  )
}

/**
 * Every country this store will ship to, derived from its declared rates.
 *
 * Deliberately not a separate config field: a second list would drift from
 * the rates, and the pair could disagree about whether an order is
 * deliverable. Delete a rate and the country stops being offered everywhere
 * -- checkout form, validation, and copy -- with no other edit.
 */
export function shipsTo(tenant: TenantConfig): string[] {
  return [...new Set(tenant.shipping.flatMap((r) => r.countries))].sort()
}

/**
 * Discard a cart once its order is placed.
 *
 * Deleting the cart row cascades to its items and any remaining holds, so one
 * statement finishes the job. Called from the webhook rather than the browser:
 * the cart must be emptied even if the buyer closes the tab on the Stripe
 * redirect, and only the webhook is guaranteed to run.
 */
export async function clearCart(tenant: TenantConfig, cartId: string): Promise<void> {
  await withWriteRetry(() =>
    db(tenant.id).delete(carts)
      .where(and(eq(carts.id, cartId), eq(carts.tenant, tenant.id)))
      .run(),
  )
}

/** Does this cart still exist for this store? */
export function cartExists(tenant: TenantConfig, cartId: string): boolean {
  return db(tenant.id).select({ id: carts.id }).from(carts)
    .where(and(eq(carts.id, cartId), eq(carts.tenant, tenant.id))).get() !== undefined
}

/** Cheapest rate that serves the destination, honouring free-shipping thresholds. */
export function shippingFor(
  tenant: TenantConfig, country: string, subtotalCents: number,
): ShippingRate[] {
  return tenant.shipping
    .filter((r) => r.countries.includes(country))
    .map((r) => (r.freeAbove !== null && subtotalCents >= r.freeAbove ? { ...r, amount: 0 } : r))
    .sort((a, b) => a.amount - b.amount)
}
