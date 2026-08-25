import { db } from './index.ts'
import { migrateAll } from './migrate.ts'
import { orderItems, orders, products, reservations, variants, webhookEvents, cartItems, carts } from './schema.ts'

/**
 * Development seed. Two catalogues that exercise genuinely different shapes:
 * i3X merch has size/colour variants over shared stock; the webOS listings are
 * mostly quantity-1 units with serials, grades, and per-unit photography.
 */

const img = (label: string) => ({
  url: `https://placehold.co/800x800/1b1d1c/e6e6fa?text=${encodeURIComponent(label)}`,
  alt: label,
})

async function main() {
  migrateAll()

  console.log('Clearing…')
  // Each store is its own file, so each is cleared against its own handle.
  for (const tenant of ['i3x', 'webos'] as const) {
    for (const t of [webhookEvents, orderItems, orders, reservations, cartItems, carts, variants, products]) {
      db(tenant).delete(t).run()
    }
  }

  // ---------------------------------------------------------------- i3X ----
  const [book] = db('i3x').insert(products).values({
    tenant: 'i3x', slug: 'how-machines-talk', kind: 'book', status: 'active', position: 1,
    title: 'How Machines Talk',
    subtitle: 'A picture book about factories that finally understand each other',
    descriptionMd: `A 32-page hardcover for ages 5–9 about why the machines in a factory
speak different languages — and what happens when someone finally writes them a common one.

Written and illustrated for the i3X initiative. Printed on FSC-certified stock.`,
    images: [img('How Machines Talk')],
  }).returning().all()

  db('i3x').insert(variants).values([
    { tenant: 'i3x', productId: book!.id, sku: 'I3X-BOOK-HC', title: 'Hardcover',
      attributes: {}, priceCents: 2400, stockQty: 180, weightGrams: 420 },
    { tenant: 'i3x', productId: book!.id, sku: 'I3X-BOOK-HC-SIGN', title: 'Hardcover, signed',
      attributes: {}, priceCents: 3500, stockQty: 25, weightGrams: 420 },
  ]).run()

  const [tee] = db('i3x').insert(products).values({
    tenant: 'i3x', slug: 'open-by-design-tee', kind: 'apparel', status: 'active', position: 2,
    title: 'Open by Design T-Shirt',
    subtitle: 'Heavyweight cotton, screen printed',
    descriptionMd: 'Ringspun 6.1oz cotton. Runs true to size. Printed in small batches.',
    images: [img('Open by Design Tee')],
  }).returning().all()

  db('i3x').insert(variants).values(
    (['S', 'M', 'L', 'XL', '2XL'] as const).flatMap((size) =>
      (['Navy', 'White'] as const).map((color) => ({
        tenant: 'i3x' as const, productId: tee!.id,
        sku: `I3X-TEE-${color.slice(0, 2).toUpperCase()}-${size}`,
        title: `${color} / ${size}`,
        attributes: { size, color },
        priceCents: 2800,
        stockQty: size === '2XL' ? 2 : 40,
        weightGrams: 200,
      })),
    ),
  ).run()

  const [stickers] = db('i3x').insert(products).values({
    tenant: 'i3x', slug: 'spec-sticker-pack', kind: 'sticker', status: 'active', position: 3,
    title: 'Spec Sticker Pack',
    subtitle: 'Six die-cut vinyl stickers',
    descriptionMd: 'Weatherproof vinyl. Survives a laptop lid and a dishwasher, in that order.',
    images: [img('Sticker Pack')],
  }).returning().all()

  db('i3x').insert(variants).values({
    tenant: 'i3x', productId: stickers!.id, sku: 'I3X-STICK-6', title: 'Pack of six',
    attributes: {}, priceCents: 900, stockQty: 300, weightGrams: 30,
  }).run()

  // -------------------------------------------------------------- webOS ----
  const [touchstone] = db('webos').insert(products).values({
    tenant: 'webos', slug: 'touchstone-charging-dock', kind: 'accessory', status: 'active', position: 1,
    title: 'Touchstone Charging Dock',
    subtitle: 'Sealed new old stock — Palm original',
    descriptionMd: `The inductive dock that made every other phone charger feel like work.
Still sealed in Palm retail packaging. Includes the dock and the original
microUSB power supply.

Fits Pre, Pre Plus, Pre 2, and Pre 3 with a Touchstone-compatible back cover.`,
    images: [img('Touchstone Dock')],
  }).returning().all()

  db('webos').insert(variants).values({
    tenant: 'webos', productId: touchstone!.id, sku: 'WOA-TS-NOS', title: 'New old stock, sealed',
    attributes: { model: 'Touchstone' }, priceCents: 4500, stockQty: 7, weightGrams: 260,
    condition: 'new_old_stock',
    conditionNotes: 'Factory sealed. Outer carton shows shelf wear consistent with storage since 2011.',
  }).run()

  const [touchpad] = db('webos').insert(products).values({
    tenant: 'webos', slug: 'hp-touchpad-32gb', kind: 'device', status: 'active', position: 2,
    title: 'HP TouchPad 32GB',
    subtitle: 'Tested, graded, and shipped with a fresh doctor',
    descriptionMd: `A 9.7" TouchPad running webOS 3.0.5, restored with webOS Doctor and
tested for 48 hours before shipping. Battery health is measured and listed per unit.

Ships with a USB cable and a 30-day functional warranty. Photographs on each
listing show the actual unit.`,
    images: [img('HP TouchPad')],
  }).returning().all()

  // Quantity-1 units: this is the case the reservation system exists for.
  db('webos').insert(variants).values([
    { tenant: 'webos', productId: touchpad!.id, sku: 'WOA-TP32-A-0417', title: 'Grade A — 32GB',
      attributes: { storage: '32GB', color: 'Black', condition: 'grade_a', model: 'TouchPad' },
      priceCents: 18500, stockQty: 1, weightGrams: 740, condition: 'grade_a',
      serial: 'TP32-0417', conditionNotes: 'Screen free of scratches. Battery holds 91% of design capacity.',
      unitImages: [img('TouchPad 0417 front'), img('TouchPad 0417 back')] },
    { tenant: 'webos', productId: touchpad!.id, sku: 'WOA-TP32-B-0912', title: 'Grade B — 32GB',
      attributes: { storage: '32GB', color: 'Black', condition: 'grade_b', model: 'TouchPad' },
      priceCents: 13500, stockQty: 1, weightGrams: 740, condition: 'grade_b',
      serial: 'TP32-0912', conditionNotes: 'Two hairline scratches on the bezel, none on the display. Battery at 78%.',
      unitImages: [img('TouchPad 0912 front')] },
  ]).run()

  const [pre3] = db('webos').insert(products).values({
    tenant: 'webos', slug: 'palm-pre-3', kind: 'device', status: 'active', position: 3,
    title: 'Palm Pre 3',
    subtitle: 'The one that barely shipped',
    descriptionMd: `Released in Europe for a matter of weeks before HP cancelled webOS hardware.
Unlocked GSM. Slider and keyboard tested through a full actuation cycle.`,
    images: [img('Palm Pre 3')],
  }).returning().all()

  db('webos').insert(variants).values({
    tenant: 'webos', productId: pre3!.id, sku: 'WOA-PRE3-A-1102', title: 'Grade A — unlocked GSM',
    attributes: { storage: '8GB', color: 'Black', condition: 'grade_a', model: 'Pre 3' },
    priceCents: 32500, stockQty: 1, weightGrams: 190, condition: 'grade_a',
    serial: 'PRE3-1102', conditionNotes: 'Excellent cosmetics. Keyboard crisp. Original battery, replacement available on request.',
    unitImages: [img('Pre 3 1102')],
  }).run()

  const [stylus] = db('webos').insert(products).values({
    tenant: 'webos', slug: 'hp-touchpad-case', kind: 'accessory', status: 'active', position: 4,
    title: 'HP TouchPad Folio Case',
    subtitle: 'New old stock',
    descriptionMd: 'The original HP folio, which doubled as a stand at two angles. Unused, still bagged.',
    images: [img('TouchPad Folio')],
  }).returning().all()

  db('webos').insert(variants).values({
    tenant: 'webos', productId: stylus!.id, sku: 'WOA-FOLIO-NOS', title: 'New old stock',
    attributes: { color: 'Black', model: 'TouchPad' }, priceCents: 2900, stockQty: 12,
    weightGrams: 320, condition: 'new_old_stock',
  }).run()

  console.log('Seeded both catalogues.')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
