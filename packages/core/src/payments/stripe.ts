import Stripe from 'stripe'
import type { TenantConfig } from '../tenant/types.ts'

let _stripe: Stripe | null = null

export function stripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  _stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' })
  return _stripe
}

export interface IntentInput {
  tenant: TenantConfig
  amountCents: number
  cartId: string
  orderNumber: string
  email: string
}

/**
 * Create a PaymentIntent that carries the *store's* identity, not the account's.
 *
 * Both storefronts bill through one Stripe account, so every customer-visible
 * artefact Stripe can generate on its own is a place the shared operator can
 * show through. The four defences, in order of how often they are missed:
 *
 *  1. `statement_descriptor_suffix` -- without it the cardholder's statement
 *     shows only the account's default descriptor, identically for both
 *     stores. This is the leak that survives everything else, because it is
 *     the one artefact the buyer keeps.
 *  2. `receipt_email` is deliberately NOT set. Setting it makes Stripe send
 *     its own receipt, branded with the account's business name and logo, to
 *     a buyer who has never heard of the other store. We send our own.
 *  3. `description` and metadata are tenant-scoped, so support tooling and
 *     dispute evidence quote the right store back to the customer.
 *  4. `metadata.tenant` lets the webhook route the event without trusting
 *     anything the client sent.
 */
export async function createPaymentIntent(input: IntentInput): Promise<Stripe.PaymentIntent> {
  const { tenant } = input
  return stripe().paymentIntents.create(
    {
      amount: input.amountCents,
      currency: tenant.currency,
      automatic_payment_methods: { enabled: true },
      statement_descriptor_suffix: assertDescriptor(tenant.statementDescriptorSuffix),
      description: `${tenant.storeName} order ${input.orderNumber}`,
      metadata: {
        tenant: tenant.id,
        cart_id: input.cartId,
        order_number: input.orderNumber,
        store: tenant.storeName,
      },
      // receipt_email intentionally omitted -- see (2) above.
    },
    // Idempotent on the order reference: a double-submitted checkout reuses
    // the same intent instead of creating a second authorisation.
    { idempotencyKey: `pi:${tenant.id}:${input.orderNumber}` },
  )
}

export async function updateIntentAmount(
  intentId: string, amountCents: number,
): Promise<Stripe.PaymentIntent> {
  return stripe().paymentIntents.update(intentId, { amount: amountCents })
}

/**
 * Stripe permits [A-Za-z0-9 .-] and caps the *combined* account prefix plus
 * suffix at 22 characters. Failing here at boot beats discovering it in a
 * declined payment.
 */
function assertDescriptor(suffix: string): string {
  if (!/^[A-Za-z0-9 .-]{1,12}$/.test(suffix)) {
    throw new Error(
      `Invalid statement_descriptor_suffix "${suffix}": use 1-12 chars of [A-Za-z0-9 .-]`,
    )
  }
  return suffix
}

export function verifyWebhook(payload: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set')
  return stripe().webhooks.constructEvent(payload, signature, secret)
}
