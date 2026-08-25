import { useEffect, useMemo, useState } from 'preact/hooks'
import type { CatalogProduct, CatalogVariant, TenantConfig } from '@store/core'

interface Props {
  product: CatalogProduct
  tenant: Pick<TenantConfig, 'currency' | 'catalog'> & { copy: Pick<TenantConfig['copy'], 'soldOut' | 'lastOne'> }
}

const money = (c: number, cur: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format(c / 100)

/**
 * Variant picker + add to cart.
 *
 * The page around this island is prerendered, so the stock figure baked into
 * the HTML may be minutes or days stale. For merch that is harmless; for a
 * quantity-1 TouchPad it is the difference between a sale and an apology. So
 * the island treats build-time stock as unknown, fetches live availability on
 * mount, and keeps the button disabled until the server has answered.
 */
export default function AddToCart({ product, tenant }: Props) {
  const axes = tenant.catalog.variantAxes.filter((axis) =>
    product.variants.some((v) => v.attributes[axis]),
  )

  const [selection, setSelection] = useState<Record<string, string>>(() => {
    const first = product.variants[0]
    return Object.fromEntries(axes.map((a) => [a, first?.attributes[a] ?? '']))
  })
  const [live, setLive] = useState<Record<string, number> | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const variant: CatalogVariant | undefined = useMemo(() => {
    if (axes.length === 0) return product.variants[0]
    return product.variants.find((v) => axes.every((a) => v.attributes[a] === selection[a]))
  }, [selection, product, axes])

  useEffect(() => {
    let cancelled = false
    const ids = product.variants.map((v) => v.id)
    fetch(`/api/availability?ids=${ids.join(',')}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('unavailable'))))
      .then((rows: { variantId: string; available: number }[]) => {
        if (cancelled) return
        setLive(Object.fromEntries(rows.map((r) => [r.variantId, r.available])))
      })
      // Fail closed: if we cannot confirm stock, we do not let the sale happen.
      .catch(() => !cancelled && setLive({}))
    return () => { cancelled = true }
  }, [product.id])

  const available = variant && live ? (live[variant.id] ?? 0) : null
  const ready = live !== null && variant !== undefined
  const canBuy = ready && (available ?? 0) > 0 && !busy

  const optionsFor = (axis: string) =>
    [...new Set(product.variants.map((v) => v.attributes[axis]).filter(Boolean))] as string[]

  async function add() {
    if (!variant) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'add', variantId: variant.id, qty: 1 }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not add to cart')
      location.href = '/cart'
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not add to cart')
      setBusy(false)
    }
  }

  return (
    <div>
      {axes.map((axis) => (
        <label class="field" key={axis}>
          <span>{axis}</span>
          <select
            value={selection[axis]}
            onChange={(e) =>
              setSelection({ ...selection, [axis]: (e.target as HTMLSelectElement).value })
            }
          >
            {optionsFor(axis).map((opt) => (
              <option value={opt} key={opt}>{opt}</option>
            ))}
          </select>
        </label>
      ))}

      <p class="price" style="font-size:1.5rem;">
        {variant ? money(variant.priceCents, tenant.currency) : '—'}
        {variant?.compareAtCents && (
          <span class="muted" style="font-size:1rem;margin-left:8px;text-decoration:line-through;">
            {money(variant.compareAtCents, tenant.currency)}
          </span>
        )}
      </p>

      <p aria-live="polite" style="min-height:1.6em;">
        {!ready && <span class="muted">Checking availability…</span>}
        {ready && available === 0 && <span class="chip chip-out">{tenant.copy.soldOut}</span>}
        {ready && available !== null && available > 0 && available <= tenant.catalog.scarcityThreshold && (
          <span class="chip chip-scarce">
            {available === 1 ? tenant.copy.lastOne : `Only ${available} left`}
          </span>
        )}
      </p>

      <button class="btn" disabled={!canBuy} onClick={add}>
        {busy ? 'Adding…' : ready && available === 0 ? tenant.copy.soldOut : 'Add to cart'}
      </button>
      {msg && <p class="notice" style="margin-top:12px;">{msg}</p>}
    </div>
  )
}
