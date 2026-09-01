import type { APIContext } from 'astro'
import { beginCheckout, shippingFor, shipsTo, loadCart, OutOfStockError, type Address } from '@store/core'
import { CheckoutValidationError } from '@store/core'
import { requestTenant } from '../../lib/tenant.ts'
import { json, readCartId } from '../../lib/session.ts'

export const prerender = false

/**
 * GET: shipping options for a destination, priced against the live cart, plus
 * the countries this store ships to. The form uses that list to offer only
 * deliverable destinations rather than letting someone complete an address we
 * will refuse.
 */
export async function GET(ctx: APIContext) {
  const t = requestTenant(ctx.request)
  const countries = shipsTo(t)
  const requested = (new URL(ctx.request.url).searchParams.get('country') ?? countries[0] ?? 'US').toUpperCase()
  const cart = await loadCart(t, readCartId(ctx, t))
  if (!cart) return json({ rates: [], subtotalCents: 0, countries })
  return json({
    rates: shippingFor(t, requested, cart.subtotalCents),
    subtotalCents: cart.subtotalCents,
    countries,
  })
}

/**
 * POST: reserve stock, create the PaymentIntent, return its client secret.
 *
 * The amount is computed here from the database -- never from the request
 * body. A client that posts its own total is ignored, which is the difference
 * between a checkout and a discount generator.
 */
export async function POST(ctx: APIContext) {
  const t = requestTenant(ctx.request)
  const cartId = readCartId(ctx, t)
  if (!cartId) return json({ error: 'No cart' }, 400)

  const body = await ctx.request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'A valid email is required' }, 400)

  const a = body?.address
  const required = ['name', 'line1', 'city', 'state', 'postalCode', 'country'] as const
  if (!a || required.some((k) => typeof a[k] !== 'string' || !a[k].trim())) {
    return json({ error: 'A complete shipping address is required' }, 400)
  }
  // Enforced here, not just in the form: the browser can post anything. A
  // destination we cannot ship to is refused before stock is reserved and
  // before a PaymentIntent exists, so no card is ever touched for an order
  // that cannot be fulfilled.
  const country = String(a.country).toUpperCase()
  const allowed = shipsTo(t)
  if (!allowed.includes(country)) {
    return json({
      error: t.copy.shippingRestriction,
      allowedCountries: allowed,
    }, 422)
  }

  const address: Address = {
    name: a.name, line1: a.line1, line2: a.line2 || undefined, city: a.city,
    state: a.state, postalCode: a.postalCode, country,
    phone: a.phone || undefined,
  }

  try {
    const result = await beginCheckout(t, cartId, email, address, String(body.shippingRateCode ?? ''))
    return json(result)
  } catch (e) {
    if (e instanceof OutOfStockError) {
      return json({ error: 'An item in your cart just sold out.', sku: e.sku, available: e.available }, 409)
    }
    // Validation problems are the customer's to fix, so they are quoted back.
    // Anything else -- a Stripe API error, a database fault -- is logged and
    // answered generically: upstream error text can carry key fragments,
    // account details, and internal identifiers that no buyer should see.
    if (e instanceof CheckoutValidationError) return json({ error: e.message }, 400)
    console.error(`[checkout:${t.id}] failed`, e)
    return json({ error: 'We could not start checkout. Please try again.' }, 500)
  }
}
