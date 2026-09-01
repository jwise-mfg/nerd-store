import type { TenantConfig } from '../tenant/types.ts'

const ALPHABET = '3479ACDEFHJKLMNPQRTVWXY' // no 0/O/1/I/S/5 -- read aloud on the phone

/**
 * Per-store reference prefix. Declared as a map rather than inlined so the
 * seam audit can assert the two stores never share one.
 */
export const ORDER_PREFIX: Record<string, string> = {
  i3x: 'I3X',
  webos: 'WOA',
}

/**
 * Per-tenant order reference: PREFIX-XXXXXX.
 *
 * Random rather than sequential, and prefixed per store. Sequential numbering
 * across a shared database would mean order I3X-1042 and WOA-1043 were placed
 * seconds apart -- an inference anyone with two receipts could make. It also
 * stops customers estimating total sales volume from their own order number.
 */
export function newOrderNumber(tenant: TenantConfig, rand = crypto.getRandomValues.bind(crypto)): string {
  const bytes = rand(new Uint8Array(6))
  const body = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
  const prefix = ORDER_PREFIX[tenant.id]
  if (!prefix) throw new Error(`No order-number prefix declared for tenant ${tenant.id}`)
  return `${prefix}-${body}`
}
