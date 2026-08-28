#!/usr/bin/env node
/**
 * Store admin.
 *
 *   ./scripts/admin.ts <command> [options]
 *
 * Runs against the SQLite file directly, so it works while the services are
 * running -- WAL allows a writer alongside readers. Authentication is SSH:
 * if you can run this, you are the operator.
 *
 * IMPORTANT: catalogue pages are prerendered, so anything that changes what a
 * page SAYS needs a rebuild before shoppers see it. Stock is fetched live and
 * does not. Each command reports which it is.
 */
import { and, desc, eq, sql } from 'drizzle-orm'
import { db, withWriteRetry } from '../packages/core/src/db/index.ts'
import { products, variants, orders, orderItems, shipments } from '../packages/core/src/db/schema.ts'
import { tenantById, allTenants } from '../packages/core/src/tenant/index.ts'
import { formatMoney } from '../packages/core/src/util/money.ts'
import { availability } from '../packages/core/src/inventory/index.ts'

// ---------------------------------------------------------------- args ----
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
const t = (() => {
  try { return tenantById(TENANT) } catch {
    die(`Unknown store "${TENANT}". Options: ${allTenants().map((x) => x.id).join(', ')}`)
  }
})()!

function die(msg: string): never { console.error(`\n  ${msg}\n`); process.exit(1) }
const money = (c: number) => formatMoney(c, t.currency)
const rebuild = (why: string) =>
  console.log(`\n  ${why} is baked into the prerendered pages.\n  Run ./scripts/deploy.sh --no-pull for shoppers to see it.\n`)

/** "26" -> 2600, "26.50" -> 2650. Dollars, because cents invite a 100x error. */
function toCents(s: string): number {
  if (!/^\$?\d+(\.\d{1,2})?$/.test(s)) die(`Price "${s}" should look like 26 or 26.50`)
  return Math.round(parseFloat(s.replace('$', '')) * 100)
}

// ------------------------------------------------------------ commands ----
async function catalogue() {
  const rows = db(t.id).select({
    slug: products.slug, title: products.title, status: products.status,
    sku: variants.sku, vTitle: variants.title, price: variants.priceCents,
    stock: variants.stockQty, active: variants.active, id: variants.id,
    condition: variants.condition, serial: variants.serial,
  }).from(products).leftJoin(variants, eq(variants.productId, products.id))
    .where(eq(products.tenant, t.id))
    .orderBy(products.position, products.title, variants.sku).all()

  const live = availability(t, rows.map((r) => r.id).filter(Boolean) as string[])
  const held = new Map(live.map((a) => [a.variantId, a.available]))

  console.log(`\n  ${t.storeName}\n`)
  let slug = ''
  for (const r of rows) {
    if (r.slug !== slug) {
      slug = r.slug
      const tag = r.status === 'active' ? '' : `  [${r.status}]`
      console.log(`  ${r.title}${tag}\n    /shop/${r.slug}`)
    }
    if (!r.sku) { console.log('      (no variants -- will not appear in the shop)'); continue }
    const avail = held.get(r.id!) ?? 0
    const warn = !r.active ? ' inactive' : avail === 0 ? ' SOLD OUT' : avail <= t.catalog.scarcityThreshold ? ' low' : ''
    const cond = r.condition ? `  ${r.condition}${r.serial ? ` ${r.serial}` : ''}` : ''
    console.log(`      ${r.sku.padEnd(22)} ${money(r.price!).padStart(8)}  stock ${String(r.stock).padStart(4)}  free ${String(avail).padStart(4)}${warn}${cond}`)
  }
  console.log(`\n  "free" is stock minus live checkout holds.\n`)
}

async function setStock() {
  const [sku, qty] = positional
  if (!sku || !qty) die('usage: admin stock <sku> <qty|+n|-n> [-t store]')
  const v = db(t.id).select().from(variants)
    .where(and(eq(variants.tenant, t.id), eq(variants.sku, sku))).get()
  if (!v) die(`No variant "${sku}" in ${t.storeName}.`)

  const rel = /^[+-]/.test(qty)
  const n = parseInt(qty, 10)
  if (Number.isNaN(n)) die(`"${qty}" is not a number.`)
  const next = Math.max(0, rel ? v.stockQty + n : n)

  await withWriteRetry(() => db(t.id).update(variants).set({ stockQty: next })
    .where(eq(variants.id, v.id)).run())
  console.log(`\n  ${sku}: ${v.stockQty} -> ${next}\n  Live immediately; no rebuild needed.\n`)
}

async function setPrice() {
  const [sku, amount] = positional
  if (!sku || !amount) die('usage: admin price <sku> <26.50> [-t store]')
  const cents = toCents(amount)
  const v = db(t.id).select().from(variants)
    .where(and(eq(variants.tenant, t.id), eq(variants.sku, sku))).get()
  if (!v) die(`No variant "${sku}" in ${t.storeName}.`)
  await withWriteRetry(() => db(t.id).update(variants).set({ priceCents: cents })
    .where(eq(variants.id, v.id)).run())
  console.log(`\n  ${sku}: ${money(v.priceCents)} -> ${money(cents)}`)
  rebuild('Price')
}

async function addProduct() {
  const slug = String(flags.slug ?? ''), title = String(flags.title ?? ''), kind = String(flags.kind ?? '')
  if (!slug || !title || !kind) {
    die('usage: admin product-add --slug tote-bag --title "Tote Bag" --kind apparel [--subtitle "..."] [--description "..."]')
  }
  const exists = db(t.id).select({ id: products.id }).from(products)
    .where(and(eq(products.tenant, t.id), eq(products.slug, slug))).get()
  if (exists) die(`"${slug}" already exists in ${t.storeName}.`)

  await withWriteRetry(() => db(t.id).insert(products).values({
    tenant: t.id, slug, title, kind: kind as never,
    subtitle: flags.subtitle ? String(flags.subtitle) : null,
    descriptionMd: flags.description ? String(flags.description) : '',
    images: [], status: 'draft', position: Number(flags.position ?? 100),
  }).run())
  console.log(`\n  Created "${title}" as a DRAFT.`)
  console.log(`  Add a variant, then: admin activate ${slug} -t ${t.id}`)
  console.log(`  A product with no variant never appears, even when active.\n`)
}

async function addVariant() {
  const product = String(flags.product ?? ''), sku = String(flags.sku ?? '')
  if (!product || !sku || !flags.price) {
    die('usage: admin variant-add --product tote-bag --sku TOTE-NAT --title "Natural" --price 18 --stock 25 [--attr size=L --attr color=Navy]')
  }
  const p = db(t.id).select().from(products)
    .where(and(eq(products.tenant, t.id), eq(products.slug, product))).get()
  if (!p) die(`No product "${product}" in ${t.storeName}.`)

  const attributes: Record<string, string> = {}
  for (const a of (Array.isArray(flags.attr) ? flags.attr : [flags.attr]).filter(Boolean) as string[]) {
    const [k, v] = String(a).split('='); if (k && v) attributes[k] = v
  }
  await withWriteRetry(() => db(t.id).insert(variants).values({
    tenant: t.id, productId: p.id, sku, title: String(flags.title ?? sku),
    attributes, priceCents: toCents(String(flags.price)),
    stockQty: Number(flags.stock ?? 0), weightGrams: Number(flags.weight ?? 0),
    condition: flags.condition ? String(flags.condition) as never : null,
    serial: flags.serial ? String(flags.serial) : null,
    conditionNotes: flags.notes ? String(flags.notes) : null,
    unitImages: [], active: true,
  }).run())
  console.log(`\n  Added ${sku} to "${p.title}" at ${money(toCents(String(flags.price)))}, stock ${Number(flags.stock ?? 0)}.`)
  rebuild('A new variant')
}

async function setStatus(status: 'active' | 'archived') {
  const [slug] = positional
  if (!slug) die(`usage: admin ${status === 'active' ? 'activate' : 'archive'} <slug> [-t store]`)
  const r = await withWriteRetry(() => db(t.id).update(products).set({ status })
    .where(and(eq(products.tenant, t.id), eq(products.slug, slug)))
    .returning({ title: products.title }).all())
  if (r.length === 0) die(`No product "${slug}" in ${t.storeName}.`)
  console.log(`\n  "${r[0]!.title}" is now ${status}.`)
  rebuild('Product visibility')
}

async function listOrders() {
  const rows = db(t.id).select().from(orders)
    .where(flags.status ? and(eq(orders.tenant, t.id), eq(orders.status, String(flags.status) as never))
                        : eq(orders.tenant, t.id))
    .orderBy(desc(orders.createdAt)).limit(Number(flags.limit ?? 20)).all()
  if (rows.length === 0) { console.log(`\n  No orders in ${t.storeName}${flags.status ? ` with status ${flags.status}` : ''}.\n`); return }
  console.log(`\n  ${t.storeName} -- ${rows.length} order(s)\n`)
  for (const o of rows) {
    const when = o.placedAt ?? o.createdAt
    console.log(`  ${o.orderNumber.padEnd(12)} ${o.status.padEnd(10)} ${money(o.totalCents).padStart(9)}  ${o.email.padEnd(28)} ${when.toISOString().slice(0, 16).replace('T', ' ')}`)
  }
  const unfulfilled = rows.filter((o) => o.status === 'paid').length
  if (unfulfilled) console.log(`\n  ${unfulfilled} paid and awaiting shipment. admin order <number> for detail.\n`)
  else console.log()
}

async function showOrder() {
  const [num] = positional
  if (!num) die('usage: admin order <ORDER-NUMBER> [-t store]')
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
  if (ship.length) for (const s of ship) console.log(`\n    shipped ${s.shippedAt.toISOString().slice(0, 10)} via ${s.carrier}${s.trackingCode ? ` ${s.trackingCode}` : ''}`)
  else if (o.status === 'paid') console.log(`\n    not yet shipped -- admin ship ${o.orderNumber} --carrier USPS --tracking 9400...`)
  console.log()
}

async function ship() {
  const [num] = positional
  const carrier = String(flags.carrier ?? '')
  if (!num || !carrier) die('usage: admin ship <ORDER-NUMBER> --carrier USPS [--tracking 9400...] [--url https://...]')
  const o = db(t.id).select().from(orders)
    .where(and(eq(orders.tenant, t.id), eq(orders.orderNumber, num.toUpperCase()))).get()
  if (!o) die(`No order ${num} in ${t.storeName}.`)
  if (o.status !== 'paid') die(`${o.orderNumber} is "${o.status}", not "paid". Only paid orders ship.`)

  await withWriteRetry(() => db(t.id).transaction((tx) => {
    tx.insert(shipments).values({
      orderId: o.id, carrier,
      trackingCode: flags.tracking ? String(flags.tracking) : null,
      trackingUrl: flags.url ? String(flags.url) : null,
    }).run()
    tx.update(orders).set({ status: 'fulfilled' }).where(eq(orders.id, o.id)).run()
  }, { behavior: 'immediate' }))
  console.log(`\n  ${o.orderNumber} marked fulfilled, shipped via ${carrier}${flags.tracking ? ` (${flags.tracking})` : ''}.`)
  console.log(`  Note: this does not email the customer -- no shipping notification is implemented yet.\n`)
}

async function low() {
  const threshold = Number(flags.threshold ?? t.catalog.scarcityThreshold)
  const rows = db(t.id).select({
    sku: variants.sku, title: products.title, stock: variants.stockQty,
  }).from(variants).innerJoin(products, eq(products.id, variants.productId))
    .where(and(eq(variants.tenant, t.id), eq(variants.active, true),
               sql`${variants.stockQty} <= ${threshold}`))
    .orderBy(variants.stockQty).all()
  console.log(`\n  ${t.storeName} -- stock at or below ${threshold}\n`)
  if (rows.length === 0) console.log('    nothing low\n')
  else { for (const r of rows) console.log(`    ${String(r.stock).padStart(4)}  ${r.sku.padEnd(22)} ${r.title}`); console.log() }
}

function usage() {
  console.log(`
  Store admin -- add -t <store> to target a store (default: i3x)
                 stores: ${allTenants().map((x) => x.id).join(', ')}

  Catalogue
    catalogue                          products, prices, stock, live holds
    low [--threshold 5]                what needs restocking
    stock <sku> <qty|+n|-n>            set or adjust stock        (no rebuild)
    price <sku> <26.50>                set price                  (rebuild)
    product-add --slug --title --kind [--subtitle --description]
    variant-add --product <slug> --sku --title --price --stock
                [--attr size=L] [--condition grade_a --serial X --notes "..."]
    activate <slug> / archive <slug>                              (rebuild)

  Orders
    orders [--status paid] [--limit 20]
    order <ORDER-NUMBER>
    ship <ORDER-NUMBER> --carrier USPS [--tracking 9400...] [--url ...]

  Catalogue pages are prerendered, so changes to what a page SAYS need
  ./scripts/deploy.sh --no-pull. Stock is read live and takes effect at once.
`)
}

const commands: Record<string, () => Promise<void>> = {
  catalogue, catalog: catalogue, ls: catalogue,
  low,
  stock: setStock,
  price: setPrice,
  'product-add': addProduct,
  'variant-add': addVariant,
  activate: () => setStatus('active'),
  archive: () => setStatus('archived'),
  orders: listOrders,
  order: showOrder,
  ship,
}

if (!cmd || cmd === 'help' || cmd === '--help') { usage(); process.exit(0) }
const run = commands[cmd]
if (!run) { console.error(`\n  Unknown command "${cmd}".`); usage(); process.exit(1) }
await run()
process.exit(0)
