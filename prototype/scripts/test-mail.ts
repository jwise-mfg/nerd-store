#!/usr/bin/env node
/**
 * Send a specimen receipt, without placing an order.
 *
 *   node scripts/test-mail.ts you@example.com [-t webos]
 *
 * Uses whatever mail.transport config.json specifies, so it exercises the
 * real path: a wrong API key or an unverified domain fails here rather than
 * silently losing a customer's first receipt.
 */
import { config } from '../packages/core/src/config/index.ts'
import { tenantById } from '../packages/core/src/tenant/index.ts'
import { renderReceipt, sendReceipt } from '../packages/core/src/mail/index.ts'

const args = process.argv.slice(2)
const to = args.find((a) => a.includes('@'))
const ti = args.indexOf('-t')
const tenant = tenantById(ti >= 0 ? args[ti + 1]! : 'i3x')
if (!to) { console.error('\n  usage: node scripts/test-mail.ts you@example.com [-t webos]\n'); process.exit(1) }

const specimen = {
  order: {
    orderNumber: 'TEST-0000', email: to,
    subtotalCents: 2400, shippingCents: 500, totalCents: 2900, currency: 'usd',
    shippingAddress: { name: 'Test Order', line1: '1 Example Street', city: 'Austin',
                       state: 'TX', postalCode: '78701', country: 'US' },
  },
  items: [{ titleSnapshot: 'Specimen item', qty: 1, unitPriceCents: 2400, serialSnapshot: null }],
}

const m = config().mail
console.log(`\n  store:     ${tenant.storeName}`)
console.log(`  from:      ${tenant.mail.fromName} <${tenant.mail.fromAddress}>`)
console.log(`  to:        ${to}`)
console.log(`  transport: ${m.transport}${m.transport === 'resend' ? `  (key ${String(m.apiKey).slice(0, 6)}…)` : ''}`)

if (m.transport === 'log') {
  console.log(`\n  transport is "log", so nothing will be sent. Set mail.transport to "resend".`)
  console.log(`\n  --- the receipt that would go out ---\n`)
  console.log(renderReceipt(tenant, specimen).text.split('\n').map((l) => `  ${l}`).join('\n'))
  process.exit(0)
}

try {
  await sendReceipt(tenant, specimen)
  console.log(`\n  Sent. If it does not arrive, check spam, then Resend's dashboard for a bounce.\n`)
} catch (e) {
  console.error(`\n  FAILED: ${e instanceof Error ? e.message : e}\n`)
  console.error(`  "domain is not verified" -> add ${tenant.mail.fromAddress.split('@')[1]} in Resend and paste its DNS records into Cloudflare.`)
  console.error(`  "invalid api key"        -> mail.apiKey in config.json is wrong.\n`)
  process.exit(1)
}
