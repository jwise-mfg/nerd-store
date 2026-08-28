import type { APIContext } from 'astro'
import { addItem, loadCart, removeItem, setQty } from '@store/core'
import { requestTenant } from '../../lib/tenant.ts'
import { ensureCartId, json, readCartId } from '../../lib/session.ts'

export const prerender = false

export async function GET(ctx: APIContext) {
  const t = requestTenant(ctx.request)
  const cart = await loadCart(t, readCartId(ctx, t))
  return json(cart ?? { id: null, lines: [], subtotalCents: 0, itemCount: 0, problems: [] })
}

export async function POST(ctx: APIContext) {
  const t = requestTenant(ctx.request)
  const body = await ctx.request.json().catch(() => null)
  if (!body || typeof body.sku !== 'string') return json({ error: 'Bad request' }, 400)

  const cartId = await ensureCartId(ctx, t)
  const qty = Number.isInteger(body.qty) ? Math.max(0, Math.min(99, body.qty)) : 1

  try {
    // Every mutation resolves the SKU against THIS store's product files, so
    // one storefront can never add the other's inventory to a cart.
    if (body.action === 'remove') await removeItem(t, cartId, body.sku)
    else if (body.action === 'set') await setQty(t, cartId, body.sku, qty)
    else await addItem(t, cartId, body.sku, qty)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not update cart' }, 400)
  }

  return json(await loadCart(t, cartId))
}
