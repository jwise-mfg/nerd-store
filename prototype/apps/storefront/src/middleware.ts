import { defineMiddleware } from 'astro:middleware'
import { config } from '@store/core'

/**
 * Close the live routes when the shop is shut.
 *
 * The prerendered pages are handled by the layout, which renders the
 * maintenance notice instead of the page. This covers what the layout cannot:
 * the API. A closed shop that still accepted a card would be considerably
 * worse than one that merely looked open.
 *
 * 503 with Retry-After is the honest status -- it tells crawlers this is
 * temporary, where a 404 would invite them to drop the pages from the index.
 */
export const onRequest = defineMiddleware(async (ctx, next) => {
  if (config().storeOpen) return next()

  const path = ctx.url.pathname
  // Stripe must still be able to deliver events: a payment captured moments
  // before closing still needs its order marked paid and its receipt sent.
  if (path.startsWith('/api/webhook/')) return next()

  if (path.startsWith('/api/')) {
    return new Response(
      JSON.stringify({ error: 'The shop is temporarily closed for maintenance.' }),
      { status: 503, headers: { 'content-type': 'application/json', 'retry-after': '3600', 'cache-control': 'no-store' } },
    )
  }

  const res = await next()
  res.headers.set('retry-after', '3600')
  return res
})
