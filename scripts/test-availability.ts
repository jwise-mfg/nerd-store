/**
 * Regression test for the availability query.
 *
 * The held-stock figure is computed by a correlated subquery, and Drizzle's
 * SQLite dialect emits unqualified column names in a select list. An
 * interpolated `${variants.id}` therefore renders as `"id"`, which resolves to
 * the subquery's own reservations.id, matches nothing, and reports every held
 * item as available -- with no error anywhere. This test pins the behaviour.
 */
import { eq } from 'drizzle-orm'
import { db, variants } from '../packages/core/src/db/index.ts'
import { webos } from '../tenants/webos/tenant.config.ts'
import { createCart } from '../packages/core/src/cart/index.ts'
import { availability, reserveForCart, releaseReservation } from '../packages/core/src/inventory/index.ts'

let failures = 0
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`)
}

const unit = db('webos').select().from(variants).where(eq(variants.sku, 'WOA-TP32-A-0417')).get()!
const stock = unit.stockQty

check('unreserved unit is available', availability(webos, [unit.id])[0]!.available, stock)

const cartA = await createCart(webos)
await reserveForCart(webos, cartA, [{ variantId: unit.id, qty: 1 }])

check('a hold removes it from public availability', availability(webos, [unit.id])[0]!.available, stock - 1)
check('the holder still sees it (ignoreCartId)',
  availability(webos, [unit.id], { ignoreCartId: cartA })[0]!.available, stock)
check('inStock reflects the hold', availability(webos, [unit.id])[0]!.inStock, stock - 1 > 0)

await releaseReservation(webos, cartA)
check('releasing the hold restores availability', availability(webos, [unit.id])[0]!.available, stock)

const other = db('webos').select().from(variants).where(eq(variants.sku, 'WOA-FOLIO-NOS')).get()!
check('unrelated variants are unaffected',
  availability(webos, [other.id])[0]!.available, other.stockQty)

console.log(failures === 0 ? '\n  availability: all checks passed' : `\n  availability: ${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
