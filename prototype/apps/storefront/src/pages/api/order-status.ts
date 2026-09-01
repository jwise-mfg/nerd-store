import type { APIContext } from 'astro'
import { getOrder } from '@store/core'
import { requestTenant } from '../../lib/tenant.ts'
import { json } from '../../lib/session.ts'

export const prerender = false

/**
 * Status of one order, and nothing else.
 *
 * The confirmation page polls this while a payment is still confirming. It
 * deliberately returns only the status: the page itself already shows the
 * address and email to anyone holding the order number, and there is no
 * reason for a polling endpoint to widen that.
 */
export async function GET(ctx: APIContext) {
  const t = requestTenant(ctx.request)
  const number = new URL(ctx.request.url).searchParams.get('number')
  if (!number) return json({ error: 'Missing order number' }, 400)

  const found = getOrder(t, number.toUpperCase())
  // Same answer for "no such order" and "not yours": nothing here should help
  // anyone work out which order numbers exist.
  if (!found) return json({ status: null }, 404)
  return json({ status: found.order.status })
}
