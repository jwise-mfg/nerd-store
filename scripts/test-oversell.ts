/**
 * Concurrency test: two shoppers race for the last TouchPad.
 * Exactly one must win. The loser must fail BEFORE any card is charged.
 */
import { and, eq } from 'drizzle-orm'
import { db, variants, cartItems } from '../packages/core/src/db/index.ts'
import { createCart } from '../packages/core/src/cart/index.ts'
import { reserveForCart, availability, commitReservation, releaseReservation, OutOfStockError }
  from '../packages/core/src/inventory/index.ts'
import { webos } from '../tenants/webos/tenant.config.ts'

const unit = db('webos').select().from(variants)
  .where(and(eq(variants.tenant, 'webos'), eq(variants.sku, 'WOA-TP32-A-0417'))).get()

console.log(`Unit ${unit!.sku}: stockQty = ${unit!.stockQty}\n`)

const cartA = await createCart(webos)
const cartB = await createCart(webos)
const line = [{ variantId: unit!.id, qty: 1 }]

console.log('Two carts attempt to reserve the same unit simultaneously…')
const results = await Promise.allSettled([
  reserveForCart(webos, cartA, line),
  reserveForCart(webos, cartB, line),
])

let winners = 0, losers = 0
results.forEach((r, i) => {
  const who = i === 0 ? 'Cart A' : 'Cart B'
  if (r.status === 'fulfilled') { winners++; console.log(`  ${who}: RESERVED until ${r.value.toISOString()}`) }
  else {
    losers++
    const e = r.reason
    console.log(`  ${who}: REFUSED — ${e instanceof OutOfStockError ? `out of stock (${e.available} available)` : e.message}`)
  }
})

console.log(`\nWinners: ${winners}, Losers: ${losers}`)
console.log(winners === 1 && losers === 1 ? '  PASS — exactly one reservation succeeded' : '  FAIL — oversell possible!')

const [avail] = availability(webos, [unit!.id])
console.log(`\nPublic availability while held: ${avail!.available} (expect 0)`)

const winnerCart = results[0]!.status === 'fulfilled' ? cartA : cartB
db('webos').insert(cartItems).values({ cartId: winnerCart, variantId: unit!.id, qty: 1, unitPriceCents: unit!.priceCents }).run()
await commitReservation(webos, winnerCart)
const after = db('webos').select({ q: variants.stockQty }).from(variants).where(eq(variants.id, unit!.id)).get()
console.log(`Stock after the winner pays: ${after!.q} (expect 0)`)

// restore for further manual poking
db('webos').update(variants).set({ stockQty: 1 }).where(eq(variants.id, unit!.id)).run()
await releaseReservation(webos, cartA); await releaseReservation(webos, cartB)
console.log('\n(stock restored to 1)')
process.exit(0)
