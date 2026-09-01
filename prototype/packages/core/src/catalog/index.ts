import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import type { TenantConfig } from '../tenant/types.ts'
import { readProductFiles, toCents, type ProductDoc } from './files.ts'
import { REPO_ROOT } from '../config/index.ts'

export * from './files.ts'

export interface CatalogVariant {
  /** SKU is the identity. Stable across edits, unlike a generated id. */
  id: string
  sku: string
  title: string
  attributes: Record<string, string>
  priceCents: number
  compareAtCents: number | null
  condition: string | null
  serial: string | null
  conditionNotes: string | null
  unitImages: { url: string; alt: string }[]
  /** Declared in the file. The page still confirms it live before selling. */
  stockAtBuild: number
}

export interface CatalogProduct {
  id: string
  slug: string
  kind: string
  title: string
  subtitle: string | null
  descriptionMd: string
  images: { url: string; alt: string }[]
  variants: CatalogVariant[]
  fromPriceCents: number
}

/**
 * A bare filename means "the image next to this product.json". Anything with
 * a scheme or a leading slash is passed through untouched.
 */
function imageUrl(slug: string, file: string): string {
  if (/^https?:\/\//.test(file) || file.startsWith('/')) return file
  return `/products/${slug}/${file}`
}

function toCatalog(p: ProductDoc): CatalogProduct {
  const variants = p.variants.map((v) => ({
    id: v.sku,
    sku: v.sku,
    title: v.title,
    attributes: v.attributes,
    priceCents: toCents(v.price),
    compareAtCents: v.compareAt !== undefined ? toCents(v.compareAt) : null,
    condition: v.condition ?? null,
    serial: v.serial ?? null,
    conditionNotes: v.conditionNotes ?? null,
    unitImages: v.images.map((im) => ({ url: imageUrl(p.slug, im.file), alt: im.alt })),
    stockAtBuild: v.stock,
  }))
  return {
    id: p.slug,
    slug: p.slug,
    kind: p.kind,
    title: p.title,
    subtitle: p.subtitle ?? null,
    descriptionMd: p.description,
    images: p.images.map((im) => ({ url: imageUrl(p.slug, im.file), alt: im.alt })),
    variants,
    fromPriceCents: variants.length ? Math.min(...variants.map((v) => v.priceCents)) : 0,
  }
}

/** Every listed product for one store, read from products/<tenant>/. */
export function listProducts(tenant: TenantConfig): CatalogProduct[] {
  return readProductFiles(tenant.id)
    .filter((p) => p.status === 'active')
    .map(toCatalog)
}

/** Including drafts and archived, for tooling that needs the whole picture. */
export function listAllProducts(tenant: TenantConfig): (CatalogProduct & { status: string })[] {
  return readProductFiles(tenant.id).map((p) => ({ ...toCatalog(p), status: p.status }))
}

export function getProduct(tenant: TenantConfig, slug: string): CatalogProduct | null {
  return listProducts(tenant).find((p) => p.slug === slug) ?? null
}

export function findVariant(tenant: TenantConfig, sku: string) {
  for (const p of listProducts(tenant)) {
    const v = p.variants.find((x) => x.sku === sku)
    if (v) return { product: p, variant: v }
  }
  return null
}

/**
 * Copy product images into the store's public directory so the build ships
 * them. Keeping the originals beside product.json means the folder you edit
 * holds everything about that product.
 */
export function stageImages(tenant: TenantConfig): number {
  let n = 0
  for (const p of readProductFiles(tenant.id)) {
    const dest = join(REPO_ROOT, `apps/storefront/public-${tenant.id}`, 'products', p.slug)
    const files = readdirSync(p.dir).filter((f) => /\.(jpe?g|png|webp|avif|gif|svg)$/i.test(f))
    if (files.length === 0) continue
    mkdirSync(dest, { recursive: true })
    for (const f of files) {
      copyFileSync(join(p.dir, f), join(dest, basename(f)))
      n++
    }
  }
  return n
}

/** Facet values present in this store's catalogue, for the filter UI. */
export function facetsFor(tenant: TenantConfig, items: CatalogProduct[]): Record<string, string[]> {
  const out: Record<string, Set<string>> = {}
  for (const key of tenant.catalog.facets) out[key] = new Set()
  for (const p of items) {
    for (const v of p.variants) {
      for (const key of tenant.catalog.facets) {
        const val = key === 'kind' ? p.kind
          : key === 'condition' ? (v.attributes[key] ?? v.condition ?? '')
          : v.attributes[key]
        if (val) out[key]!.add(val)
      }
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, s]) => [k, [...s].sort()]))
}
