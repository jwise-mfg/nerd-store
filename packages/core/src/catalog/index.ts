import { and, asc, eq } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { products, variants } from '../db/schema.ts'
import type { TenantConfig } from '../tenant/types.ts'

export interface CatalogVariant {
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
  /** Build-time snapshot only. The page must refresh this client-side. */
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

/** Every active product for one store. Called by getStaticPaths at build time. */
export function listProducts(tenant: TenantConfig): CatalogProduct[] {
  const rows = db(tenant.id)
    .select()
    .from(products)
    .leftJoin(variants, eq(variants.productId, products.id))
    .where(and(eq(products.tenant, tenant.id), eq(products.status, 'active')))
    .orderBy(asc(products.position), asc(products.title))
    .all()

  const byId = new Map<string, CatalogProduct>()
  for (const row of rows) {
    const p = row.products
    let entry = byId.get(p.id)
    if (!entry) {
      entry = {
        id: p.id, slug: p.slug, kind: p.kind, title: p.title, subtitle: p.subtitle,
        descriptionMd: p.descriptionMd, images: p.images, variants: [], fromPriceCents: Infinity,
      }
      byId.set(p.id, entry)
    }
    const v = row.variants
    if (v && v.active) {
      entry.variants.push({
        id: v.id, sku: v.sku, title: v.title, attributes: v.attributes,
        priceCents: v.priceCents, compareAtCents: v.compareAtCents,
        condition: v.condition, serial: v.serial, conditionNotes: v.conditionNotes,
        unitImages: v.unitImages, stockAtBuild: v.stockQty,
      })
      entry.fromPriceCents = Math.min(entry.fromPriceCents, v.priceCents)
    }
  }

  return [...byId.values()]
    .filter((p) => p.variants.length > 0)
    .map((p) => ({ ...p, fromPriceCents: p.fromPriceCents === Infinity ? 0 : p.fromPriceCents }))
}

export function getProduct(tenant: TenantConfig, slug: string): CatalogProduct | null {
  return listProducts(tenant).find((p) => p.slug === slug) ?? null
}

/** Facet values present in this store's catalog, for the filter UI. */
export function facetsFor(tenant: TenantConfig, items: CatalogProduct[]): Record<string, string[]> {
  const out: Record<string, Set<string>> = {}
  for (const key of tenant.catalog.facets) out[key] = new Set()
  for (const p of items) {
    for (const v of p.variants) {
      for (const key of tenant.catalog.facets) {
        const val = key === 'kind' ? p.kind : v.attributes[key]
        if (val) out[key]!.add(val)
      }
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, s]) => [k, [...s].sort()]))
}
