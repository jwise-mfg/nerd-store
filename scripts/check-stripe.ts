#!/usr/bin/env node
/**
 * Stripe preflight.
 *
 * Checks the three secrets in config.json actually work, and that the webhook
 * endpoint registered at Stripe agrees with what this code expects. Run it
 * after editing config.json and before taking a real payment -- a mistyped
 * key is otherwise silent until a customer is standing at the checkout.
 *
 *   node scripts/check-stripe.ts
 *
 * Never prints a secret: only its prefix, length, and whether it works.
 */
import Stripe from 'stripe'
import { config } from '../packages/core/src/config/index.ts'
import { allTenants } from '../packages/core/src/tenant/index.ts'

const HANDLED = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
]

let problems = 0
const ok = (m: string) => console.log(`  \x1b[32mok\x1b[0m    ${m}`)
const bad = (m: string) => { problems++; console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`) }
const warn = (m: string) => console.log(`  \x1b[33mwarn\x1b[0m  ${m}`)
const mask = (s: string) => `${s.slice(0, s.indexOf('_', 3) + 1 || 8)}…(${s.length} chars)`

const c = config().stripe

console.log('\n  Stripe preflight\n')

// --- 1. shape -------------------------------------------------------------
const shapes: [string, string, RegExp][] = [
  ['secretKey', c.secretKey, /^sk_(test|live)_[A-Za-z0-9]{20,}$/],
  ['publishableKey', c.publishableKey, /^pk_(test|live)_[A-Za-z0-9]{20,}$/],
  ['webhookSecret', c.webhookSecret, /^whsec_[A-Za-z0-9]{20,}$/],
]
for (const [name, val, re] of shapes) {
  if (!val || val.includes('REPLACE_ME') || val.includes('placeholder')) bad(`${name} is still a placeholder`)
  else if (!re.test(val)) bad(`${name} does not look right: ${mask(val)}`)
  else ok(`${name} ${mask(val)}`)
}

// Test and live keys must not be mixed -- a live secret with a test webhook
// secret fails signature verification on every real payment.
const mode = (s: string) => (s.includes('_live_') ? 'live' : s.includes('_test_') ? 'test' : '?')
if (mode(c.secretKey) !== mode(c.publishableKey)) {
  bad(`secretKey is ${mode(c.secretKey)} but publishableKey is ${mode(c.publishableKey)} -- they must match`)
} else ok(`both keys are in ${mode(c.secretKey)} mode`)

if (problems > 0) {
  console.log(`\n  ${problems} problem(s). Fix config.json before going further.\n`)
  process.exit(1)
}

// --- 2. do they actually authenticate? ------------------------------------
const stripe = new Stripe(c.secretKey, { apiVersion: '2026-08-26.dahlia' })
let account: Stripe.Account
try {
  account = await stripe.accounts.retrieve()
  ok(`authenticated as account ${account.id}`)
} catch (e) {
  bad(`secretKey rejected by Stripe: ${(e as Error).message}`)
  process.exit(1)
}

// The account prefix is prepended to each store's suffix on the customer's
// statement, so it is visible to buyers of every store.
const prefix = account.settings?.card_payments?.statement_descriptor_prefix
console.log(`\n  statement descriptors, as a cardholder sees them:`)
for (const t of allTenants()) {
  console.log(`    ${t.id.padEnd(6)} ${prefix ? `${prefix} ` : '(account prefix) '}${t.statementDescriptorSuffix}`)
}
if (!prefix) warn('no account statement_descriptor_prefix set -- Stripe will derive one')

// Stripe's own receipts are account-wide and would carry one shared business
// name to buyers of every store.
console.log()
if (account.settings?.dashboard?.display_name) {
  warn(`account display name is "${account.settings.dashboard.display_name}" -- this appears in disputes and Stripe-sent email`)
}

// --- 3. webhook endpoints -------------------------------------------------
const endpoints = await stripe.webhookEndpoints.list({ limit: 20 })
console.log(`  webhook endpoints registered: ${endpoints.data.length}`)
if (endpoints.data.length === 0) bad('no webhook endpoint -- orders will never be marked paid')

for (const e of endpoints.data) {
  console.log(`\n    ${e.url}`)
  console.log(`      status:      ${e.status}`)
  console.log(`      api_version: ${e.api_version ?? '(account default)'}`)
  if (e.api_version && e.api_version !== '2026-08-26.dahlia') {
    bad(`      endpoint renders events as ${e.api_version}, code expects 2026-08-26.dahlia`)
  }
  const enabled = e.enabled_events
  const missing = HANDLED.filter((h) => !enabled.includes(h) && !enabled.includes('*'))
  const extra = enabled.filter((x) => x !== '*' && !HANDLED.includes(x))
  if (missing.length) bad(`      not subscribed to: ${missing.join(', ')}`)
  else ok(`      subscribed to all three events this code handles`)
  if (extra.length) warn(`      also sends unhandled events: ${extra.slice(0, 6).join(', ')}`)
  if (!e.url.endsWith('/api/webhook/stripe')) warn('      URL does not end in /api/webhook/stripe')
}

console.log(`\n  ${problems === 0 ? 'All checks passed.' : `${problems} problem(s) found.`}\n`)
process.exit(problems === 0 ? 0 : 1)
