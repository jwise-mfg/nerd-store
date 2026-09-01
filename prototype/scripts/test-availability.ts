#!/usr/bin/env node
/**
 * Availability = stock declared in the product file, minus live holds.
 * Pins the arithmetic that decides whether something can be sold.
 */
import { webos } from '../tenants/webos/tenant.config.ts'
import { createCart } from '../packages/core/src/cart/index.ts'
import { availability, reserveForCart, releaseReservation, stockFromFiles }
  from '../packages/core/src/inventory/index.ts'

let failures = 0
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`)
}

const SKU = 'WOA-TP32-A-0417'
const stock = stockFromFiles(webos).get(SKU)!
check('stock comes from the product file', typeof stock, 'number')
check('unreserved unit is fully available', availability(webos, [SKU])[0]!.available, stock)

const cartA = await createCart(webos)
await reserveForCart(webos, cartA, [{ sku: SKU, qty: 1 }])
check('a hold removes it from public availability', availability(webos, [SKU])[0]!.available, stock - 1)
check('the holder still sees it', availability(webos, [SKU], { ignoreCartId: cartA })[0]!.available, stock)

await releaseReservation(webos, cartA)
check('releasing restores it', availability(webos, [SKU])[0]!.available, stock)
check('an unknown SKU yields nothing', availability(webos, ['NO-SUCH-SKU']).length, 0)

console.log(failures === 0 ? '\n  availability: all checks passed' : `\n  availability: ${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
