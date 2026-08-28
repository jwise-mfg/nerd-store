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
import { copyFileSync, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
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

/** Where this store's static files live. Per-store, so nothing crosses over. */
const publicDir = () => resolve(process.cwd(), `apps/storefront/public-${t.id}`)

// ------------------------------------------------------------ commands ----

async function editProduct() {
  const [slug] = positional
  if (!slug) die('usage: admin product-edit <slug> [--title "..."] [--subtitle "..."] [--description "..."] [--slug new-slug] [--position 3]')
  const p = db(t.id).select().from(products)
    .where(and(eq(products.tenant, t.id), eq(products.slug, slug))).get()
  if (!p) die(`No product "${slug}" in ${t.storeName}.`)

  const patch: Record<string, unknown> = {}
  if (flags.title) patch.title = String(flags.title)
  if (flags.subtitle !== undefined) patch.subtitle = flags.subtitle === true ? null : String(flags.subtitle)
  if (flags.description !== undefined) patch.descriptionMd = flags.description === true ? '' : String(flags.description)
  if (flags.position) patch.position = Number(flags.position)
  if (flags.slug) {
    const taken = db(t.id).select({ id: products.id }).from(products)
      .where(and(eq(products.tenant, t.id), eq(products.slug, String(flags.slug)))).get()
    if (taken) die(`"${flags.slug}" is already used by another product.`)
    patch.slug = String(flags.slug)
  }
  if (Object.keys(patch).length === 0) die('Nothing to change. Pass --title, --subtitle, --description, --slug or --position.')

  patch.updatedAt = new Date()
  await withWriteRetry(() => db(t.id).update(products).set(patch).where(eq(products.id, p.id)).run())
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'updatedAt') continue
    console.log(`\n  ${k}: ${JSON.stringify(v)}`)
  }
  if (patch.slug) console.log(`\n  The old URL /shop/${slug} will 404. Anyone who bookmarked it loses it.`)
  rebuild('Product text')
}

/** Markdown description read from a file, for anything longer than a line. */
async function describe() {
  const [slug, file] = positional
  if (!slug || !file) die('usage: admin describe <slug> <file.md>   -- replaces the description from a Markdown file')
  const path = resolve(process.cwd(), file)
  if (!existsSync(path)) die(`No such file: ${path}`)
  const md = (await import('node:fs')).readFileSync(path, 'utf8')
  const r = await withWriteRetry(() => db(t.id).update(products)
    .set({ descriptionMd: md, updatedAt: new Date() })
    .where(and(eq(products.tenant, t.id), eq(products.slug, slug)))
    .returning({ title: products.title }).all())
  if (r.length === 0) die(`No product "${slug}" in ${t.storeName}.`)
  console.log(`\n  "${r[0]!.title}": description replaced (${md.length} chars of Markdown).`)
  rebuild('The description')
}

const IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg']

/**
 * Copy an image into this store's public directory and attach it.
 *
 * The file is copied rather than referenced, because the build only ships
 * what is inside publicDir -- a path elsewhere on disk would resolve locally
 * and 404 in production.
 */
async function addImage() {
  const [slug, file] = positional
  if (!slug || !file) die('usage: admin image-add <slug> <file.jpg> [--alt "..."] [--sku SKU] [--first]')
  const src = resolve(process.cwd(), file)
  if (!existsSync(src)) die(`No such file: ${src}`)
  const ext = extname(src).toLowerCase()
  if (!IMAGE_TYPES.includes(ext)) die(`${ext} is not an image. Use one of: ${IMAGE_TYPES.join(' ')}`)

  const p = db(t.id).select().from(products)
    .where(and(eq(products.tenant, t.id), eq(products.slug, slug))).get()
  if (!p) die(`No product "${slug}" in ${t.storeName}.`)

  const sku = flags.sku ? String(flags.sku) : null
  const v = sku
    ? db(t.id).select().from(variants).where(and(eq(variants.tenant, t.id), eq(variants.sku, sku))).get()
    : null
  if (sku && !v) die(`No variant "${sku}" in ${t.storeName}.`)
  if (v && v.productId !== p.id) die(`${sku} does not belong to "${slug}".`)

  // Name it after the product so the directory stays legible, and keep a
  // counter so re-adding never silently overwrites an existing photo.
  const dir = join(publicDir(), 'products', slug)
  mkdirSync(dir, { recursive: true })
  let name = `${sku ? sku.toLowerCase() : slug}${ext}`
  let n = 2
  while (existsSync(join(dir, name))) name = `${sku ? sku.toLowerCase() : slug}-${n++}${ext}`
  copyFileSync(src, join(dir, name))

  const url = `/products/${slug}/${name}`
  const alt = String(flags.alt ?? p.title)
  const entry = { url, alt }

  if (v) {
    const next = flags.first ? [entry, ...v.unitImages] : [...v.unitImages, entry]
    await withWriteRetry(() => db(t.id).update(variants).set({ unitImages: next }).where(eq(variants.id, v.id)).run())
    console.log(`\n  Attached to ${sku} as photo ${next.length} of ${next.length}.`)
  } else {
    const next = flags.first ? [entry, ...p.images] : [...p.images, entry]
    await withWriteRetry(() => db(t.id).update(products).set({ images: next, updatedAt: new Date() }).where(eq(products.id, p.id)).run())
    console.log(`\n  Attached to "${p.title}" as image ${next.length} of ${next.length}.`)
  }
  console.log(`  ${url}  (${Math.round(statSync(src).size / 1024)} KB)`)
  if (!flags.alt) console.log(`  No --alt given, so alt text defaults to the product title. Set it for screen readers.`)
  rebuild('Images')
}

async function listImages() {
  const [slug] = positional
  if (!slug) die('usage: admin images <slug>')
  const p = db(t.id).select().from(products)
    .where(and(eq(products.tenant, t.id), eq(products.slug, slug))).get()
  if (!p) die(`No product "${slug}" in ${t.storeName}.`)
  console.log(`\n  ${p.title}\n`)
  console.log('  product images:')
  if (p.images.length === 0) console.log('    (none -- the card and page show no picture)')
  p.images.forEach((im, i) => console.log(`    [${i}] ${im.url}\n        alt: ${im.alt}`))
  const vs = db(t.id).select().from(variants).where(eq(variants.productId, p.id)).all()
  for (const v of vs.filter((x) => x.unitImages.length)) {
    console.log(`\n  ${v.sku} (photographs of this unit):`)
    v.unitImages.forEach((im, i) => console.log(`    [${i}] ${im.url}\n        alt: ${im.alt}`))
  }
  console.log()
}

async function removeImage() {
  const [slug, idxRaw] = positional
  if (!slug || idxRaw === undefined) die('usage: admin image-rm <slug> <index> [--sku SKU]   -- index from: admin images <slug>')
  const idx = Number(idxRaw)
  const p = db(t.id).select().from(products)
    .where(and(eq(products.tenant, t.id), eq(products.slug, slug))).get()
  if (!p) die(`No product "${slug}" in ${t.storeName}.`)

  const sku = flags.sku ? String(flags.sku) : null
  const v = sku ? db(t.id).select().from(variants).where(and(eq(variants.tenant, t.id), eq(variants.sku, sku))).get() : null
  if (sku && !v) die(`No variant "${sku}".`)

  const list = v ? v.unitImages : p.images
  if (!list[idx]) die(`No image at index ${idx}. Run: admin images ${slug}`)
  const gone = list[idx]!
  const next = list.filter((_, i) => i !== idx)

  if (v) await withWriteRetry(() => db(t.id).update(variants).set({ unitImages: next }).where(eq(variants.id, v.id)).run())
  else await withWriteRetry(() => db(t.id).update(products).set({ images: next, updatedAt: new Date() }).where(eq(products.id, p.id)).run())

  // Detach first, delete the file only if nothing else references it.
  const stillUsed = db(t.id).select({ images: products.images }).from(products).where(eq(products.tenant, t.id)).all()
    .some((r) => r.images.some((im) => im.url === gone.url))
    || db(t.id).select({ u: variants.unitImages }).from(variants).where(eq(variants.tenant, t.id)).all()
    .some((r) => r.u.some((im) => im.url === gone.url))
  const onDisk = join(publicDir(), gone.url.replace(/^\//, ''))
  if (!stillUsed && existsSync(onDisk)) { unlinkSync(onDisk); console.log(`\n  Detached and deleted ${gone.url}`) }
  else console.log(`\n  Detached ${gone.url}${stillUsed ? ' (file kept -- still used elsewhere)' : ''}`)
  rebuild('Images')
}

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
    product-edit <slug> [--title --subtitle --description --slug --position]
    describe <slug> <file.md>          replace the description from a file
    images <slug>                      list attached images
    image-add <slug> <file.jpg> --alt "..." [--sku SKU] [--first]
    image-rm <slug> <index> [--sku SKU]
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
  'product-edit': editProduct,
  describe,
  'image-add': addImage,
  images: listImages,
  'image-rm': removeImage,
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
