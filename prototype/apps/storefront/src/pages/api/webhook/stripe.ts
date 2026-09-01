import type { APIContext } from 'astro'
import { markPaid, releaseReservation, tenantById, verifyWebhook } from '@store/core'

export const prerender = false

/**
 * Stripe webhook.
 *
 * Payment truth arrives here and nowhere else -- the browser reporting
 * success is a UI hint, not an authority. Because both stores bill through a
 * single Stripe account, every event must be routed by `metadata.tenant`
 * rather than by which deployment received it: with one account there is one
 * webhook stream, and an event for the other store will land here.
 */
export async function POST(ctx: APIContext) {
  const signature = ctx.request.headers.get('stripe-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })

  const payload = await ctx.request.text()
  let event
  try {
    event = verifyWebhook(payload, signature)
  } catch (e) {
    return new Response(`Signature verification failed: ${(e as Error).message}`, { status: 400 })
  }

  const object = event.data.object as { id: string; metadata?: Record<string, string> }
  const tenantId = object.metadata?.tenant
  if (!tenantId) return new Response('ok (no tenant metadata)', { status: 200 })

  let tenant
  try {
    tenant = tenantById(tenantId)
  } catch {
    return new Response('ok (unknown tenant)', { status: 200 })
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await markPaid(event.id, object.id, tenant)
        break
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
        // Put the stock back immediately rather than waiting out the hold.
        if (object.metadata?.cart_id) await releaseReservation(tenant, object.metadata.cart_id)
        break
    }
  } catch (e) {
    // 500 asks Stripe to retry; markPaid is idempotent so a retry is safe.
    console.error(`[webhook:${tenantId}] ${event.type} failed`, e)
    return new Response('Handler error', { status: 500 })
  }

  return new Response('ok', { status: 200 })
}
