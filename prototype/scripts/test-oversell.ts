#!/usr/bin/env node
/**
 * Two shoppers race for the last unit. Exactly one may win, and the loser must
 * fail BEFORE any card is charged.
 */
import { webos } from '../tenants/webos/tenant.config.ts'
import { createCart } from '../packages/core/src/cart/index.ts'
import { availability, reserveForCart, releaseReservation, commitReservation,
  setStockInFile, stockFromFiles, OutOfStockError } from '../packages/core/src/inventory/index.ts'
import { db } from '../packages/core/src/db/index.ts'
import { cartItems } from '../packages/core/src/db/schema.ts'

const SKU = 'WOA-TP32-A-0417'
const original = stockFromFiles(webos).get(SKU)!
setStockInFile(webos, SKU, 1)
console.log(`\n  ${SKU}: stock set to 1 for the test\n`)

const cartA = await createCart(webos)
const cartB = await createCart(webos)
const line = [{ sku: SKU, qty: 1 }]

const results = await Promise.allSettled([
  reserveForCart(webos, cartA, line),
  reserveForCart(webos, cartB, line),
])
let won = 0
results.forEach((r, i) => {
  const who = i === 0 ? 'Cart A' : 'Cart B'
  if (r.status === 'fulfilled') { won++; console.log(`  ${who}: RESERVED`) }
  else console.log(`  ${who}: REFUSED — ${r.reason instanceof OutOfStockError ? `out of stock (${r.reason.available} available)` : r.reason.message}`)
})
console.log(won === 1 ? '\n  PASS — exactly one reservation succeeded' : `\n  FAIL — ${won} winners`)
console.log(`  public availability while held: ${availability(webos, [SKU])[0]!.available} (expect 0)`)

const winner = results[0]!.status === 'fulfilled' ? cartA : cartB
db('webos').insert(cartItems).values({ cartId: winner, sku: SKU, qty: 1, unitPriceCents: 18500 }).run()
await commitReservation(webos, winner)
console.log(`  stock in the file after payment: ${stockFromFiles(webos).get(SKU)} (expect 0)`)

setStockInFile(webos, SKU, original)
await releaseReservation(webos, cartA); await releaseReservation(webos, cartB)
console.log(`\n  (stock restored to ${original})\n`)
process.exit(won === 1 ? 0 : 1)
