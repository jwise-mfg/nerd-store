#!/usr/bin/env node
/**
 * Store admin.
 *
 *   storemgr <command> [options]
 *
 * Products are files: products/<store>/<slug>/product.json, with images in the
 * same folder. Edit them in whatever you like. This tool covers the things a
 * file cannot do -- reading live stock, and working through orders.
 */
import { execFileSync } from 'node:child_process'
import { and, desc, eq } from 'drizzle-orm'
import { db, withWriteRetry } from '../packages/core/src/db/index.ts'
import { orders, orderItems, shipments } from '../packages/core/src/db/schema.ts'
import { tenantById, allTenants } from '../packages/core/src/tenant/index.ts'
import { formatMoney } from '../packages/core/src/util/money.ts'
import { availability, setStockInFile, stockFromFiles } from '../packages/core/src/inventory/index.ts'
import { listAllProducts, readProductFiles, productsDir } from '../packages/core/src/catalog/index.ts'
import { sendShipped, trackingUrlFor } from '../packages/core/src/mail/index.ts'

const argv = process.argv.slice(2)
const cmd = argv[0]
const positional: string[] = []
const flags: Record<string, string | true> = {}
for (let i = 1; i < argv.length; i++) {
  const a = argv[i]!
  if (a.startsWith('--')) {
    const [k, v] = a.slice(2).split('=')
    flags[k!] = v ?? (argv[i + 1] && !argv[i + 1]!.startsWith('-') ? argv[++i]! : true)
  } else if (a === '-t') flags.tenant = argv[++i]!
  else positional.push(a)
}
const TENANT = String(flags.tenant ?? 'i3x')
function die(msg: string): never { console.error(`\n  ${msg}\n`); process.exit(1) }
const t = (() => {
  try { return tenantById(TENANT) } catch {
    die(`Unknown store "${TENANT}". Options: ${allTenants().map((x) => x.id).join(', ')}`)
  }
})()!
const money = (c: number) => formatMoney(c, t.currency)
const at = t.id === 'i3x' ? '' : ` -t ${t.id}`

let pendingPublish = false

/**
 * Rebuild this store's pages. No service restart: Astro's node server and
 * nginx both read built files from disk per request, so the running process
 * serves the new pages.
 */
function publishNow(): void {
  process.stdout.write(`  publishing ${t.id}… `)
  const started = Date.now()
  try {
    execFileSync('npm', ['run', `build:${t.id}`], { stdio: 'pipe' })
    console.log(`done (${((Date.now() - started) / 1000).toFixed(1)}s) — live now\n`)
  } catch (e) {
    console.log('FAILED\n')
    console.error(((e as { stdout?: Buffer }).stdout?.toString() ?? '').split('\n').slice(-15).join('\n'))
    console.error(`\n  The change is saved; the site still shows the previous build.`)
    console.error(`  Fix the error above and run: storemgr publish${at}\n`)
    process.exit(1)
  }
}

// ------------------------------------------------------------------ views --
async function inventory() {
  const items = listAllProducts(t)
  const skus = items.flatMap((p) => p.variants.map((v) => v.sku))
  const live = new Map(availability(t, skus).map((a) => [a.sku, a.available]))

  console.log(`\n  ${t.storeName}    products/${t.id}/\n`)
  for (const p of items) {
    const tag = p.status === 'active' ? '' : `  [${p.status}]`
    console.log(`  ${p.title}${tag}`)
    console.log(`    products/${t.id}/${p.slug}/product.json`)
    for (const v of p.variants) {
      const free = live.get(v.sku) ?? 0
      const held = v.stockAtBuild - free
      const note = free === 0 ? ' SOLD OUT'
        : free <= t.catalog.scarcityThreshold ? ' low' : ''
      const cond = v.condition ? `  ${v.condition}${v.serial ? ` ${v.serial}` : ''}` : ''
      console.log(`      ${v.sku.padEnd(22)} ${money(v.priceCents).padStart(9)}` +
        `  stock ${String(v.stockAtBuild).padStart(4)}` +
        `${held > 0 ? `  (${held} held)` : ''}${note}${cond}`)
    }
  }
  console.log(`\n  "held" is stock someone has in checkout right now.\n`)
}

async function low() {
  const threshold = Number(flags.threshold ?? t.catalog.scarcityThreshold)
  const rows = listAllProducts(t).flatMap((p) =>
    p.variants.filter((v) => v.stockAtBuild <= threshold)
      .map((v) => ({ sku: v.sku, title: p.title, stock: v.stockAtBuild })))
  console.log(`\n  ${t.storeName} — stock at or below ${threshold}\n`)
  if (!rows.length) console.log('    nothing low\n')
  else {
    for (const r of rows.sort((a, b) => a.stock - b.stock)) {
      console.log(`    ${String(r.stock).padStart(4)}  ${r.sku.padEnd(22)} ${r.title}`)
    }
    console.log()
  }
}

/** Validate every product file without publishing. */
async function check() {
  let n = 0
  for (const tn of allTenants()) {
    try {
      const ps = readProductFiles(tn.id)
      n += ps.length
      console.log(`  ${tn.id}: ${ps.length} product(s), ${ps.reduce((a, p) => a + p.variants.length, 0)} SKU(s) — ok`)
    } catch (e) {
      console.error(`\n  ${(e as Error).message}\n`)
      process.exit(1)
    }
  }
  console.log(`\n  ${n} product file(s) valid.\n`)
}

async function stock() {
  const [sku, qty] = positional
  if (!sku || !qty) die(`usage: storemgr stock <sku> <qty|+n|-n>${at}`)
  const current = stockFromFiles(t).get(sku)
  if (current === undefined) die(`No SKU "${sku}" in products/${t.id}/. Run: storemgr inventory${at}`)

  const n = parseInt(qty, 10)
  if (Number.isNaN(n)) die(`"${qty}" is not a number.`)
  const next = Math.max(0, /^[+-]/.test(qty) ? current + n : n)

  if (!setStockInFile(t, sku, next)) die(`Could not write the product file for ${sku}.`)
  console.log(`\n  ${sku}: ${current} -> ${next}`)
  console.log(`  Written to products/${t.id}/…/product.json`)
  pendingPublish = true
}

// ----------------------------------------------------------------- orders --
async function listOrders() {
  const rows = db(t.id).select().from(orders)
    .where(flags.status ? and(eq(orders.tenant, t.id), eq(orders.status, String(flags.status) as never))
                        : eq(orders.tenant, t.id))
    .orderBy(desc(orders.createdAt)).limit(Number(flags.limit ?? 20)).all()
  if (!rows.length) { console.log(`\n  No orders in ${t.storeName}.\n`); return }
  console.log(`\n  ${t.storeName} — ${rows.length} order(s)\n`)
  for (const o of rows) {
    const when = o.placedAt ?? o.createdAt
    console.log(`  ${o.orderNumber.padEnd(12)} ${o.status.padEnd(10)} ${money(o.totalCents).padStart(9)}` +
      `  ${o.email.padEnd(28)} ${when.toISOString().slice(0, 16).replace('T', ' ')}`)
  }
  const waiting = rows.filter((o) => o.status === 'paid').length
  console.log(waiting ? `\n  ${waiting} paid and awaiting shipment.\n` : '\n')
}

async function showOrder() {
  const [num] = positional
  if (!num) die(`usage: storemgr order <ORDER-NUMBER>${at}`)
  const o = db(t.id).select().from(orders)
    .where(and(eq(orders.tenant, t.id), eq(orders.orderNumber, num.toUpperCase()))).get()
  if (!o) die(`No order ${num} in ${t.storeName}.`)
  const items = db(t.id).select().from(orderItems).where(eq(orderItems.orderId, o.id)).all()
  const ship = db(t.id).select().from(shipments).where(eq(shipments.orderId, o.id)).all()
  const a = o.shippingAddress

  console.log(`\n  ${o.orderNumber}  ${o.status}\n`)
  for (const i of items) {
    console.log(`    ${i.qty} x ${i.titleSnapshot}${i.serialSnapshot ? `  S/N ${i.serialSnapshot}` : ''}`)
    console.log(`        ${i.sku}  ${money(i.unitPriceCents)} each`)
  }
  console.log(`\n    subtotal ${money(o.subtotalCents).padStart(10)}`)
  console.log(`    shipping ${money(o.shippingCents).padStart(10)}  (${o.shippingRateCode})`)
  console.log(`    total    ${money(o.totalCents).padStart(10)}`)
  console.log(`\n    ${o.email}`)
  console.log(`    ${a.name}\n    ${a.line1}${a.line2 ? `\n    ${a.line2}` : ''}\n    ${a.city}, ${a.state} ${a.postalCode}\n    ${a.country}`)
  if (o.stripePaymentIntentId) console.log(`\n    stripe: ${o.stripePaymentIntentId}`)
  if (ship.length) for (const s of ship) {
    console.log(`\n    shipped ${s.shippedAt.toISOString().slice(0, 10)} via ${s.carrier}${s.trackingCode ? ` ${s.trackingCode}` : ''}`)
  } else if (o.status === 'paid') {
    console.log(`\n    not yet shipped — storemgr ship ${o.orderNumber} --carrier USPS --tracking 9400...${at}`)
  }
  console.log()
}

async function ship() {
  const [num] = positional
  const carrier = String(flags.carrier ?? '')
  if (!num || !carrier) die(`usage: storemgr ship <ORDER-NUMBER> --carrier USPS [--tracking 9400...] [--no-email]${at}`)
  const o = db(t.id).select().from(orders)
    .where(and(eq(orders.tenant, t.id), eq(orders.orderNumber, num.toUpperCase()))).get()
  if (!o) die(`No order ${num} in ${t.storeName}.`)
  if (o.status !== 'paid') die(`${o.orderNumber} is "${o.status}", not "paid". Only paid orders ship.`)

  const trackingCode = flags.tracking ? String(flags.tracking) : null
  const trackingUrl = flags.url ? String(flags.url) : null
  await withWriteRetry(() => db(t.id).transaction((tx) => {
    tx.insert(shipments).values({ orderId: o.id, carrier, trackingCode, trackingUrl }).run()
    tx.update(orders).set({ status: 'fulfilled' }).where(eq(orders.id, o.id)).run()
  }, { behavior: 'immediate' }))
  console.log(`\n  ${o.orderNumber} marked fulfilled, shipped via ${carrier}${trackingCode ? ` (${trackingCode})` : ''}.`)

  if (flags['no-email']) { console.log(`  Customer not emailed (--no-email).\n`); return }
  const items = db(t.id).select().from(orderItems).where(eq(orderItems.orderId, o.id)).all()
  try {
    await sendShipped(t, {
      order: { orderNumber: o.orderNumber, email: o.email, shippingAddress: o.shippingAddress },
      items: items.map((i) => ({ titleSnapshot: i.titleSnapshot, qty: i.qty, serialSnapshot: i.serialSnapshot })),
      shipment: { carrier, trackingCode, trackingUrl },
    })
    const link = trackingUrl ?? trackingUrlFor(carrier, trackingCode)
    console.log(`  Emailed ${o.email}${link ? `\n  Tracking: ${link}` : ''}\n`)
  } catch (e) {
    console.log(`  BUT the email failed: ${e instanceof Error ? e.message : e}`)
    console.log(`  The order IS fulfilled. Retry with: storemgr ship-email ${o.orderNumber}${at}\n`)
  }
}

async function shipEmail() {
  const [num] = positional
  if (!num) die(`usage: storemgr ship-email <ORDER-NUMBER> [--to someone@else]${at}`)
  const o = db(t.id).select().from(orders)
    .where(and(eq(orders.tenant, t.id), eq(orders.orderNumber, num.toUpperCase()))).get()
  if (!o) die(`No order ${num} in ${t.storeName}.`)
  const s = db(t.id).select().from(shipments).where(eq(shipments.orderId, o.id))
    .orderBy(desc(shipments.shippedAt)).get()
  if (!s) die(`${o.orderNumber} has no recorded shipment.`)
  const items = db(t.id).select().from(orderItems).where(eq(orderItems.orderId, o.id)).all()
  await sendShipped(t, {
    order: { orderNumber: o.orderNumber, email: flags.to ? String(flags.to) : o.email, shippingAddress: o.shippingAddress },
    items: items.map((i) => ({ titleSnapshot: i.titleSnapshot, qty: i.qty, serialSnapshot: i.serialSnapshot })),
    shipment: { carrier: s.carrier, trackingCode: s.trackingCode, trackingUrl: s.trackingUrl },
  })
  console.log(`\n  Sent to ${flags.to ?? o.email}.\n`)
}

async function publish() { pendingPublish = true; console.log() }

function usage() {
  console.log(`
  Store admin -- add -t <store> to target a store (default: i3x)
                 stores: ${allTenants().map((x) => x.id).join(', ')}

  Products are FILES. To add, rename, re-price, re-describe or re-photograph
  anything, edit products/<store>/<slug>/product.json and drop images in the
  same folder. Then: storemgr publish

  Inventory
    inventory                      what is listed, priced, in stock, on hold
    low [--threshold 5]            what needs restocking
    stock <sku> <qty|+n|-n>        write a new count into the product file
    check                          validate every product file
    publish                        rebuild this store's pages

  Orders
    orders [--status paid] [--limit 20]
    order <ORDER-NUMBER>
    ship <ORDER-NUMBER> --carrier USPS [--tracking 9400...] [--url ...] [--no-email]
    ship-email <ORDER-NUMBER> [--to someone@else]

  USPS, UPS, FedEx and DHL get a tracking link built automatically.
`)
}

const commands: Record<string, () => Promise<void>> = {
  inventory, ls: inventory, low, stock, check, publish,
  orders: listOrders, order: showOrder, ship, 'ship-email': shipEmail,
}

if (!cmd || cmd === 'help' || cmd === '--help') { usage(); process.exit(0) }
const run = commands[cmd]
if (!run) { console.error(`\n  Unknown command "${cmd}".`); usage(); process.exit(1) }
await run()
if (pendingPublish) {
  if (flags['no-publish']) console.log(`  Deferred. Run: storemgr publish${at}\n`)
  else publishNow()
}
process.exit(0)
