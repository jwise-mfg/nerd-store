#!/usr/bin/env node
/**
 * Release stock holds whose 15-minute window has passed.
 *
 * Availability already ignores expired rows, so this is housekeeping rather
 * than correctness -- but without it the reservations table grows forever and
 * every availability subquery scans more of it.
 */
import { allTenants } from '../packages/core/src/tenant/index.ts'
import { sweepExpiredReservations } from '../packages/core/src/inventory/index.ts'
import { closeAll } from '../packages/core/src/db/index.ts'

let total = 0
for (const tenant of allTenants()) {
  const n = await sweepExpiredReservations(tenant)
  total += n
  if (n > 0) console.log(`${tenant.id}: released ${n} expired reservation(s)`)
}
if (total === 0) console.log('nothing to sweep')
closeAll()
