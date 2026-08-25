#!/usr/bin/env node
/**
 * Tenant configuration validator.
 *
 * Multi-tenant values that MUST be unique per store are easy to duplicate by
 * accident -- copy a tenant config to start a new one and you inherit its
 * cookie name, its statement descriptor, and its order-number prefix. Each of
 * those collisions is a real bug: a shared cookie name carries carts between
 * stores, a duplicate descriptor makes charges unattributable on a customer's
 * statement, and duplicate order prefixes break support lookups.
 *
 * This checks every tenant, and every pair of tenants, and optionally the
 * built output -- a bundle should contain only the store it was built for.
 *
 *   node scripts/validate-tenants.mjs          # config checks
 *   node scripts/validate-tenants.mjs --dist   # also scan built output
 *
 * Exits non-zero on any failure, so it can gate a deploy.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const fails = []
const warns = []
const ok = []

const check = (label, condition, detail = '') =>
  condition ? ok.push(label) : fails.push(`${label}${detail ? ` — ${detail}` : ''}`)
const warn = (label, condition, detail = '') => { if (!condition) warns.push(`${label}${detail ? ` — ${detail}` : ''}`) }

// --- read configs without a TS toolchain: extract the literals we care about
function readConfig(id) {
  const src = readFileSync(join(ROOT, 'tenants', id, 'tenant.config.ts'), 'utf8')
  const pick = (key) => src.match(new RegExp(`${key}:\\s*'([^']*)'`))?.[1] ?? null
  const pickAll = (key) => [...src.matchAll(new RegExp(`${key}:\\s*'([^']*)'`, 'g'))].map((m) => m[1])
  return {
    id,
    origin: pick('origin'),
    storeName: pick('storeName'),
    descriptor: pick('statementDescriptorSuffix'),
    cartCookie: pick('cartCookie'),
    fromAddress: pick('fromAddress'),
    supportEmail: pickAll('email').at(-1),
    analyticsProvider: pick('provider'),
    analyticsDomain: pick('domain'),
    src,
  }
}

// Discover every tenant rather than naming two, so adding a third store is a
// directory plus a config -- and the audit covers it automatically.
const TENANT_IDS = readdirSync(join(ROOT, 'tenants'))
  .filter((d) => existsSync(join(ROOT, 'tenants', d, 'tenant.config.ts')))
  .sort()

if (TENANT_IDS.length < 2) {
  console.log(`\n  Only ${TENANT_IDS.length} tenant(s) found — nothing to compare.\n`)
  process.exit(0)
}

const CONFIGS = TENANT_IDS.map(readConfig)
const PAIRS = CONFIGS.flatMap((x, i) => CONFIGS.slice(i + 1).map((y) => [x, y]))

console.log(`\n  Tenant validation — ${CONFIGS.length} stores\n`)

// --- order-number prefixes ----------------------------------------------
const orderSrc = readFileSync(join(ROOT, 'packages/core/src/util/orderNumber.ts'), 'utf8')
const block = orderSrc.match(/ORDER_PREFIX[^=]*=\s*{([^}]*)}/)?.[1] ?? ''
const ORDER_PREFIXES = Object.fromEntries(
  [...block.matchAll(/(\w+)\s*:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]),
)
const prefixValues = Object.values(ORDER_PREFIXES)
check('order-number prefixes are all distinct',
  new Set(prefixValues).size === prefixValues.length && prefixValues.length >= CONFIGS.length,
  'duplicate prefixes make an order reference ambiguous across stores')
warn('order numbers are non-sequential', /getRandomValues|rand\(/.test(orderSrc),
  'sequential ids disclose order volume to anyone holding a reference')

// --- per-tenant checks --------------------------------------------------
for (const t of CONFIGS) {
  // The statement descriptor is the artefact the buyer keeps.
  check(`${t.id}: descriptor is set`, !!t.descriptor,
    'without a suffix, charges from every store share one descriptor and customers cannot tell them apart')
  check(`${t.id}: descriptor is valid`, /^[A-Za-z0-9 .-]{1,12}$/.test(t.descriptor ?? ''),
    `"${t.descriptor}" must be 1-12 chars of [A-Za-z0-9 .-]`)
  check(`${t.id}: has an order-number prefix`, !!ORDER_PREFIXES[t.id],
    'add one to ORDER_PREFIX in packages/core/src/util/orderNumber.ts')
}

// --- per-pair checks ----------------------------------------------------
const domainOf = (e) => (e ?? '').split('@')[1] ?? ''

for (const [a, b] of PAIRS) {
  const p = `${a.id}/${b.id}`
  check(`${p}: distinct origins`, a.origin !== b.origin)
  check(`${p}: distinct store names`, a.storeName !== b.storeName)
  check(`${p}: distinct cart cookie names`, a.cartCookie && a.cartCookie !== b.cartCookie,
    'a shared cookie name carries a cart from one store into the other')
  check(`${p}: distinct statement descriptors`, a.descriptor !== b.descriptor)
  check(`${p}: distinct mail sending domains`, domainOf(a.fromAddress) !== domainOf(b.fromAddress),
    'each store should send from, and authenticate, its own domain')
  check(`${p}: distinct support addresses`, a.supportEmail !== b.supportEmail)

  const shareAnalytics =
    a.analyticsProvider !== 'none' && b.analyticsProvider !== 'none' &&
    a.analyticsDomain && a.analyticsDomain === b.analyticsDomain
  check(`${p}: no shared analytics property`, !shareAnalytics,
    'a shared measurement id merges both stores traffic into one report')

  // A tenant config should describe only its own store. Copy-paste between
  // configs is the usual cause of a stray reference.
  const names = (t) => [t.storeName, t.origin.replace(/^https?:\/\//, ''), t.descriptor].filter(Boolean)
  for (const [self, other] of [[a, b], [b, a]]) {
    const stray = names(other).filter((n) => self.src.includes(n))
    check(`${self.id}: config references only itself`, stray.length === 0, stray.join(', '))
  }
}

// 7. Built output ---------------------------------------------------------
if (process.argv.includes('--dist')) {
  const walk = (dir) => existsSync(dir)
    ? readdirSync(dir).flatMap((f) => {
        const p = join(dir, f)
        return statSync(p).isDirectory() ? walk(p) : ['.html', '.js', '.css', '.json'].includes(extname(p)) ? [p] : []
      })
    : []

  for (const self of CONFIGS) {
    const dist = join(ROOT, `apps/storefront/dist-${self.id}`)
    const files = walk(dist)
    if (files.length === 0) {
      warns.push(`${self.id}: no build found at dist-${self.id} — run npm run build:all`)
      continue
    }
    const hits = []
    for (const other of CONFIGS) {
      if (other.id === self.id) continue
      const needles = [other.storeName, other.origin, other.descriptor, other.fromAddress, other.cartCookie]
        .filter(Boolean)
      for (const f of files) {
        const text = readFileSync(f, 'utf8')
        for (const n of needles) if (text.includes(n)) hits.push(`${f.replace(ROOT, '')} contains "${n}"`)
      }
    }
    check(`${self.id}: build contains only its own store`, hits.length === 0, hits.slice(0, 5).join('; '))
  }
}

// --- report --------------------------------------------------------------
for (const o of ok) console.log(`  \x1b[32mPASS\x1b[0m  ${o}`)
for (const w of warns) console.log(`  \x1b[33mWARN\x1b[0m  ${w}`)
for (const f of fails) console.log(`  \x1b[31mFAIL\x1b[0m  ${f}`)

console.log(`\n  ${ok.length} passed, ${warns.length} warnings, ${fails.length} failed\n`)

if (fails.length) {
  console.log('  Fix the collisions above before deploying.\n')
  process.exit(1)
}
