import type { APIContext } from 'astro'
import { cartExists, createCart, type TenantConfig } from '@store/core'

/**
 * Cart session cookie.
 *
 * The cookie NAME comes from the tenant config, so the two stores never share
 * one. That matters twice over: a shopper browsing both in one browser cannot
 * carry a cart across, and the cookie name itself stops being a fingerprint
 * that links the deployments.
 */
export function readCartId(ctx: APIContext, t: TenantConfig): string | null {
  return ctx.cookies.get(t.cartCookie)?.value ?? null
}

export async function ensureCartId(ctx: APIContext, t: TenantConfig): Promise<string> {
  const existing = readCartId(ctx, t)
  // A cookie can outlive its cart: the cart is deleted once its order is
  // paid, and carts expire. Trusting the id blindly meant the next add-to-cart
  // inserted a row against a cart that no longer exists, which the foreign key
  // rejects -- the shopper would see "Could not add to cart" and nothing else.
  if (existing && cartExists(t, existing)) return existing
  const id = await createCart(t)
  ctx.cookies.set(t.cartCookie, id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    maxAge: 60 * 60 * 24 * 30,
  })
  return id
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // Cart and availability are per-shopper and perishable. Caching either
      // at the edge would serve one person's cart or a stale stock count.
      'cache-control': 'no-store',
    },
  })
}
