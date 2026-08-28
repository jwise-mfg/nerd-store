import { and, eq } from 'drizzle-orm'
import { db, withWriteRetry } from '../db/index.ts'
import { orderItems, orders, variants, webhookEvents } from '../db/schema.ts'
import type { Address } from '../db/schema.ts'
import type { TenantConfig } from '../tenant/types.ts'
import { clearCart, loadCart, shippingFor } from '../cart/index.ts'
import { commitReservation, reserveForCart } from '../inventory/index.ts'
import { createPaymentIntent } from '../payments/stripe.ts'
import { newOrderNumber } from '../util/orderNumber.ts'
import { sendReceipt } from '../mail/index.ts'
import { notifyNewOrder } from '../notify/index.ts'

/**
 * A problem the customer can see and fix -- an empty cart, an unavailable
 * shipping rate. Distinguished from internal faults so the API layer knows
 * which messages are safe to show and which must be swallowed.
 */
export class CheckoutValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CheckoutValidationError'
  }
}

export interface BeginCheckoutResult {
  orderNumber: string
  clientSecret: string
  totalCents: number
  shippingCents: number
  subtotalCents: number
  reservationExpiresAt: string
}

/**
 * Turn a cart into a pending order with holds and a PaymentIntent.
 *
 * Order of operations matters: reserve stock BEFORE creating the intent, so a
 * buyer is never shown a payment form for something that just sold. The order
 * row is written pending and only becomes `paid` from the webhook -- never
 * from the browser telling us it succeeded.
 */
export async function beginCheckout(
  tenant: TenantConfig,
  cartId: string,
  email: string,
  address: Address,
  shippingRateCode: string,
): Promise<BeginCheckoutResult> {
  const cart = await loadCart(tenant, cartId)
  if (!cart || cart.lines.length === 0) throw new CheckoutValidationError('Your cart is empty.')
  if (cart.problems.length > 0) {
    throw new CheckoutValidationError('An item in your cart is no longer available in that quantity.')
  }

  const rate = shippingFor(tenant, address.country, cart.subtotalCents)
    .find((r) => r.code === shippingRateCode)
  if (!rate) throw new CheckoutValidationError('That shipping option is not available for your address.')

  const expiresAt = await reserveForCart(tenant, cartId, cart.lines)

  const subtotalCents = cart.subtotalCents
  const shippingCents = rate.amount
  const totalCents = subtotalCents + shippingCents

  const orderNumber = newOrderNumber(tenant)

  const intent = await createPaymentIntent({
    tenant, amountCents: totalCents, cartId, orderNumber, email,
  })

  // Order header and lines are written in one transaction: a crash between
  // them would leave an order that Stripe can charge but nobody can fulfil.
  await withWriteRetry(() =>
    db(tenant.id).transaction((tx) => {
      const created = tx
        .insert(orders)
        .values({
          tenant: tenant.id, orderNumber, email, status: 'pending',
          subtotalCents, shippingCents, totalCents, currency: tenant.currency,
          shippingRateCode: rate.code, shippingAddress: address,
          stripePaymentIntentId: intent.id,
        })
        .returning({ id: orders.id })
        .all()

      const id = created[0]!.id
      tx.insert(orderItems).values(
        cart.lines.map((l) => {
          const v = tx.select({ serial: variants.serial }).from(variants)
            .where(eq(variants.id, l.variantId)).get()
          return {
            orderId: id, variantId: l.variantId, sku: l.sku,
            titleSnapshot: `${l.productTitle} — ${l.variantTitle}`,
            attributesSnapshot: l.attributes, serialSnapshot: v?.serial ?? null,
            qty: l.qty, unitPriceCents: l.unitPriceCents,
          }
        }),
      ).run()
    }, { behavior: 'immediate' }),
  )

  return {
    orderNumber,
    clientSecret: intent.client_secret!,
    totalCents, shippingCents, subtotalCents,
    reservationExpiresAt: expiresAt.toISOString(),
  }
}

/**
 * Promote a pending order to paid. Called only from the Stripe webhook.
 *
 * Idempotent twice over: the event id is recorded, and the status transition
 * is guarded, so Stripe's at-least-once delivery cannot double-decrement
 * stock or send two receipts.
 */
export async function markPaid(eventId: string, paymentIntentId: string, tenant: TenantConfig): Promise<void> {
  const seen = await withWriteRetry(() =>
    db(tenant.id)
      .insert(webhookEvents)
      .values({ id: eventId, type: 'payment_intent.succeeded' })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id })
      .all(),
  )
  if (seen.length === 0) return // already processed

  const updated = await withWriteRetry(() =>
    db(tenant.id)
      .update(orders)
      .set({ status: 'paid', placedAt: new Date() })
      .where(and(
        eq(orders.stripePaymentIntentId, paymentIntentId),
        eq(orders.tenant, tenant.id),
        eq(orders.status, 'pending'),
      ))
      .returning()
      .all(),
  )
  const order = updated[0]
  if (!order) return

  const items = db(tenant.id).select().from(orderItems).where(eq(orderItems.orderId, order.id)).all()

  // The cart id travels on the intent metadata; holds become real decrements.
  const cartId = await cartIdForIntent(paymentIntentId)
  if (cartId) {
    await commitReservation(tenant, cartId)
    // The order now owns these items; leaving them in the cart means the
    // buyer returns to the shop and finds what they just bought still there.
    await clearCart(tenant, cartId)
  }

  // Never let mail fail the webhook. The payment is already captured and the
  // event id is already recorded, so a throw here would return 500, Stripe
  // would retry, the retry would see the event as handled and return early --
  // and the receipt would be lost anyway, with the order still marked paid.
  // Log loudly instead; `storemgr orders` remains the source of truth.
  try {
    await sendReceipt(tenant, { order, items })
  } catch (e) {
    console.error(`[mail:${tenant.id}] receipt FAILED for ${order.orderNumber} <${order.email}>:`,
      e instanceof Error ? e.message : e)
  }

  // Same protection: an unreachable Pushover or mail relay must not cost you
  // the sale. Worst case you learn about the order from `storemgr orders`.
  try {
    await notifyNewOrder(tenant, { order, items })
  } catch (e) {
    console.error(`[notify:${tenant.id}] FAILED for ${order.orderNumber}:`,
      e instanceof Error ? e.message : e)
  }
}

async function cartIdForIntent(paymentIntentId: string): Promise<string | null> {
  const { stripe } = await import('../payments/stripe.ts')
  const pi = await stripe().paymentIntents.retrieve(paymentIntentId)
  return pi.metadata?.cart_id ?? null
}

export function getOrder(tenant: TenantConfig, orderNumber: string) {
  const order = db(tenant.id)
    .select()
    .from(orders)
    .where(and(eq(orders.tenant, tenant.id), eq(orders.orderNumber, orderNumber)))
    .get()
  if (!order) return null
  const items = db(tenant.id).select().from(orderItems).where(eq(orderItems.orderId, order.id)).all()
  return { order, items }
}
