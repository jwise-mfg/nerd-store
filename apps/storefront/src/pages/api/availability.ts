import type { APIContext } from 'astro'
import { availability } from '@store/core'
import { requestTenant } from '../../lib/tenant.ts'
import { json } from '../../lib/session.ts'

export const prerender = false

/**
 * Live stock for a set of variants -- the endpoint that keeps prerendered
 * product pages honest. Deliberately returns only counts, never prices or
 * titles, so it cannot be used to enumerate the catalogue.
 */
export async function GET(ctx: APIContext) {
  const t = requestTenant(ctx.request)
  const raw = new URL(ctx.request.url).searchParams.get('ids') ?? ''
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50)
  if (ids.length === 0) return json([])

  const rows = availability(t, ids)
  return json(rows.map((r) => ({ variantId: r.variantId, available: r.available, scarce: r.scarce })))
}
