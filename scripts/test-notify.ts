#!/usr/bin/env node
/**
 * Fire a specimen new-order notification through the configured channels.
 *
 *   node scripts/test-notify.ts [-t webos]
 *
 * Touches neither the database nor Stripe. Use it to prove email and Pushover
 * work before relying on them to tell you a real sale happened.
 */
import { config } from '../packages/core/src/config/index.ts'
import { tenantById } from '../packages/core/src/tenant/index.ts'
import { notifyNewOrder } from '../packages/core/src/notify/index.ts'

const args = process.argv.slice(2)
const ti = args.indexOf('-t')
const tenant = tenantById(ti >= 0 ? args[ti + 1]! : 'i3x')
const { notify, mail } = config()

console.log(`\n  store:    ${tenant.storeName}`)
console.log(`  email:    ${notify.email ?? '(not configured)'}${notify.email ? `  via ${mail.transport}` : ''}`)
if (notify.pushover) {
  const { soundFor } = await import('../packages/core/src/notify/index.ts')
  const snd = soundFor(notify.pushover.sound, tenant.id)
  console.log(`  pushover: user ${notify.pushover.user.slice(0, 6)}…`)
  console.log(`  sound:    ${snd ?? '(Pushover default)'}${notify.pushover.priority != null ? `   priority ${notify.pushover.priority}` : ''}`)
} else {
  console.log(`  pushover: (not configured)`)
}
if (!notify.email && !notify.pushover) {
  console.log(`\n  Nothing configured. Add a "notify" block to config.json.\n`)
  process.exit(1)
}
if (notify.email && mail.transport === 'log') {
  console.log(`\n  mail.transport is "log", so the email will only be written to the journal.`)
}

await notifyNewOrder(tenant, {
  order: {
    orderNumber: 'TEST-0000', email: 'buyer@example.com',
    subtotalCents: 18500, shippingCents: 800, totalCents: 19300,
    currency: 'usd', shippingRateCode: 'us_standard',
    shippingAddress: { name: 'Test Buyer', line1: '1 Example Street', city: 'Austin',
                       state: 'TX', postalCode: '78701', country: 'US' },
  },
  items: [{ titleSnapshot: 'Specimen item', sku: 'TEST-SKU', qty: 1,
            unitPriceCents: 18500, serialSnapshot: null }],
})
console.log(`\n  Sent. Any channel that failed is logged above.\n`)
process.exit(0)
