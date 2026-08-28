import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { REPO_ROOT } from '../config/index.ts'

/**
 * Products are files: products/<tenant>/<slug>/product.json, with images
 * sitting in the same folder. Seven products do not need a database and an
 * admin interface; they need a folder you can open in an editor.
 */

/**
 * Description accepts a plain string or an array of lines joined with
 * newlines. JSON strings cannot span lines, so anything longer than a
 * sentence becomes a wall of \n escapes -- the array form keeps prose
 * readable in the file you actually edit.
 *
 * Content is Markdown, and inline HTML passes straight through, so <br>,
 * <em> or a table are all fine when Markdown is not enough. This is your own
 * content and nobody else can edit it, which is what makes raw HTML safe here.
 */
const Description = z.union([z.string(), z.array(z.string())])
  .transform((d) => (Array.isArray(d) ? d.join('\n') : d))
  .default('')

const Image = z.object({
  /** Filename in this product's folder, or an absolute URL. */
  file: z.string().min(1),
  alt: z.string().default(''),
})

const Variant = z.object({
  sku: z.string().min(1),
  title: z.string().min(1),
  /** Dollars, as a string or number: "24.00", 24, 24.5 */
  price: z.union([z.string(), z.number()]),
  compareAt: z.union([z.string(), z.number()]).optional(),
  attributes: z.record(z.string()).default({}),
  weightGrams: z.number().int().nonnegative().default(0),
  condition: z.string().optional(),
  serial: z.string().optional(),
  conditionNotes: z.string().optional(),
  images: z.array(Image).default([]),
  /** How many you have. Edit this when a box arrives. */
  stock: z.number().int().nonnegative().default(0),
})

export const ProductFile = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  kind: z.string().min(1),
  status: z.enum(['draft', 'active', 'archived']).default('active'),
  position: z.number().int().default(100),
  description: Description,
  images: z.array(Image).default([]),
  variants: z.array(Variant).min(1, 'a product needs at least one variant or it never appears'),
})

export type ProductDoc = z.infer<typeof ProductFile> & { slug: string; dir: string }

function toCents(v: string | number): number {
  const n = typeof v === 'number' ? v : parseFloat(v.replace(/[$,]/g, ''))
  if (!Number.isFinite(n) || n < 0) throw new Error(`price "${v}" is not a number`)
  return Math.round(n * 100)
}

export function productsDir(tenant: string): string {
  return join(REPO_ROOT, 'products', tenant)
}

/**
 * Read every product for a store.
 *
 * A malformed file names itself and the field that is wrong, and stops the
 * build -- publishing a catalogue with one product silently missing is worse
 * than not publishing.
 */
export function readProductFiles(tenant: string): ProductDoc[] {
  const root = productsDir(tenant)
  if (!existsSync(root)) return []

  const out: ProductDoc[] = []
  for (const slug of readdirSync(root).sort()) {
    const dir = join(root, slug)
    if (!statSync(dir).isDirectory()) continue
    const file = join(dir, 'product.json')
    if (!existsSync(file)) continue

    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'))
    } catch (e) {
      throw new Error(`products/${tenant}/${slug}/product.json is not valid JSON: ${(e as Error).message}`)
    }
    const parsed = ProductFile.safeParse(raw)
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `    ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')
      throw new Error(`products/${tenant}/${slug}/product.json is not valid:\n${issues}`)
    }
    out.push({ ...parsed.data, slug, dir })
  }

  const dupes = out.flatMap((p) => p.variants.map((v) => v.sku))
    .filter((s, i, a) => a.indexOf(s) !== i)
  if (dupes.length) throw new Error(`Duplicate SKU(s) in products/${tenant}: ${[...new Set(dupes)].join(', ')}`)

  return out.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
}

export { toCents }
