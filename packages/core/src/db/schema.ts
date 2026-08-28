import { sql } from 'drizzle-orm'
import {
  sqliteTable, text, integer, uniqueIndex, index, primaryKey,
} from 'drizzle-orm/sqlite-core'

/**
 * What the database is FOR.
 *
 * Products live in products/<tenant>/<slug>/product.json -- seven of them did
 * not need a schema and an admin interface. Stock lives there too, so
 * restocking is editing a number in the file you already have open.
 *
 * This holds only what changes while the site is running and must survive a
 * restart: carts, the holds that stop two people buying the last unit, orders,
 * dispatches, and Stripe's idempotency record. Everything here is keyed by
 * SKU, which is the stable identity a file-based catalogue gives us.
 *
 * One SQLite file per tenant (see db/index.ts), so cross-store leakage is
 * prevented by the filesystem rather than by a WHERE clause.
 *
 * The `tenant` column is kept anyway. It is redundant for isolation now, but
 * it makes each file self-describing and turns a misconfigured path into a
 * query that returns nothing rather than one that quietly serves the wrong
 * store's catalogue.
 */

const TENANTS = ['i3x', 'webos'] as const

const PRODUCT_KINDS = [
  'book', 'apparel', 'sticker',      // i3x merch
  'device', 'accessory', 'media',    // webOS archive
] as const

const CONDITION_GRADES = [
  'new_old_stock', 'refurbished', 'grade_a', 'grade_b', 'grade_c', 'for_parts',
] as const

const ORDER_STATUSES = ['pending', 'paid', 'fulfilled', 'cancelled', 'refunded'] as const

/** SQLite has no uuid type; ids are random text generated in the application. */
const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID())

/**
 * Timestamps are stored as integer seconds, matching SQLite's `unixepoch()`.
 * Raw SQL comparisons against expiry use `unixepoch()` so the database clock
 * decides what has expired -- not a possibly-skewed application server.
 */
const ts = (name: string) => integer(name, { mode: 'timestamp' })

export const carts = sqliteTable('carts', {
  id: id(),
  tenant: text('tenant', { enum: TENANTS }).notNull(),
  createdAt: ts('created_at').notNull().default(sql`(unixepoch())`),
  updatedAt: ts('updated_at').notNull().default(sql`(unixepoch())`),
  expiresAt: ts('expires_at').notNull(),
})

export const cartItems = sqliteTable('cart_items', {
  cartId: text('cart_id').notNull().references(() => carts.id, { onDelete: 'cascade' }),
  /** Identity comes from the product file. A SKU removed from the files
      simply stops resolving, and the line drops out of the cart. */
  sku: text('sku').notNull(),
  qty: integer('qty').notNull(),
  /** Price snapshot at add-to-cart, so a repricing mid-session is visible. */
  unitPriceCents: integer('unit_price_cents').notNull(),
  addedAt: ts('added_at').notNull().default(sql`(unixepoch())`),
}, (t) => [primaryKey({ columns: [t.cartId, t.sku] })])

/**
 * Soft holds taken at checkout, released on expiry. Without these, two people
 * can pay for the same one-of-a-kind TouchPad inside the same minute and one
 * of them gets an apology email instead of a tablet.
 */
export const reservations = sqliteTable('reservations', {
  id: id(),
  tenant: text('tenant', { enum: TENANTS }).notNull(),
  sku: text('sku').notNull(),
  cartId: text('cart_id').notNull().references(() => carts.id, { onDelete: 'cascade' }),
  qty: integer('qty').notNull(),
  expiresAt: ts('expires_at').notNull(),
}, (t) => [
  index('reservations_sku_idx').on(t.sku, t.expiresAt),
  uniqueIndex('reservations_cart_sku_idx').on(t.cartId, t.sku),
])

export const orders = sqliteTable('orders', {
  id: id(),
  tenant: text('tenant', { enum: TENANTS }).notNull(),
  /**
   * Human-facing reference. Deliberately per-tenant and non-sequential across
   * tenants: a shared global counter would let anyone holding both stores'
   * receipts infer a shared backend from the numbering.
   */
  orderNumber: text('order_number').notNull(),
  email: text('email').notNull(),
  status: text('status', { enum: ORDER_STATUSES }).notNull().default('pending'),
  subtotalCents: integer('subtotal_cents').notNull(),
  shippingCents: integer('shipping_cents').notNull(),
  taxCents: integer('tax_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull(),
  currency: text('currency').notNull().default('usd'),
  shippingRateCode: text('shipping_rate_code').notNull(),
  shippingAddress: text('shipping_address', { mode: 'json' }).$type<Address>().notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  placedAt: ts('placed_at'),
  createdAt: ts('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('orders_tenant_number_idx').on(t.tenant, t.orderNumber),
  uniqueIndex('orders_pi_idx').on(t.stripePaymentIntentId),
  index('orders_tenant_status_idx').on(t.tenant, t.status),
])

export const orderItems = sqliteTable('order_items', {
  id: id(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  /** Snapshots -- an order must stay readable after the catalogue changes,
      including after a product file is edited or deleted outright. */
  sku: text('sku').notNull(),
  titleSnapshot: text('title_snapshot').notNull(),
  attributesSnapshot: text('attributes_snapshot', { mode: 'json' })
    .$type<Record<string, string>>().notNull().default({}),
  serialSnapshot: text('serial_snapshot'),
  qty: integer('qty').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
})

export const shipments = sqliteTable('shipments', {
  id: id(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  carrier: text('carrier').notNull(),
  trackingCode: text('tracking_code'),
  trackingUrl: text('tracking_url'),
  shippedAt: ts('shipped_at').notNull().default(sql`(unixepoch())`),
})

/** Stripe delivers webhooks at-least-once. This table makes handling exactly-once. */
export const webhookEvents = sqliteTable('webhook_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  receivedAt: ts('received_at').notNull().default(sql`(unixepoch())`),
})

export interface Img { url: string; alt: string }

export interface Address {
  name: string
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country: string
  phone?: string
}
