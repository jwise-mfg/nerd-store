import { useEffect, useState } from 'preact/hooks'
import type { CartView, TenantConfig } from '@store/core'

interface Props { tenant: Pick<TenantConfig, 'currency'> & { copy: Pick<TenantConfig['copy'], 'cartEmpty'> } }

const money = (c: number, cur: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format(c / 100)

export default function CartTable({ tenant }: Props) {
  const [cart, setCart] = useState<CartView | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetch('/api/cart').then((r) => r.json()).then(setCart) }, [])

  async function mutate(variantId: string, action: 'set' | 'remove', qty = 0) {
    setBusy(true)
    const res = await fetch('/api/cart', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, variantId, qty }),
    })
    if (res.ok) setCart(await res.json())
    setBusy(false)
  }

  if (!cart) return <p class="muted">Loading…</p>
  if (cart.lines.length === 0) return <p class="muted">{tenant.copy.cartEmpty}</p>

  return (
    <div>
      {cart.problems.length > 0 && (
        <p class="notice">
          Some items are no longer available in the quantity you selected. Adjust them to continue.
        </p>
      )}

      <table class="table">
        <tbody>
          {cart.lines.map((l) => (
            <tr key={l.variantId}>
              <td style="width:88px;">
                {l.image && <img src={l.image.url} alt={l.image.alt} width="72" height="72" style="border-radius:var(--r-sm);" />}
              </td>
              <td>
                <a href={`/shop/${l.productSlug}`}>{l.productTitle}</a>
                <div class="muted" style="font-size:.9rem;">{l.variantTitle}</div>
                {l.qty > l.available && (
                  <div style="color:var(--c-danger);font-size:.85rem;">
                    {l.available === 0 ? 'No longer available' : `Only ${l.available} available`}
                  </div>
                )}
              </td>
              <td style="width:96px;">
                {/* Capped at live availability so the quantity box cannot
                    request stock the store does not have. */}
                <input
                  type="number" min="0" max={Math.max(l.available, 0)} value={l.qty} disabled={busy}
                  onChange={(e) => mutate(l.variantId, 'set', Number((e.target as HTMLInputElement).value))}
                  style="width:100%;padding:6px;background:var(--c-bg-elevated);color:var(--c-ink);border:1px solid var(--c-line);border-radius:var(--r-sm);"
                />
              </td>
              <td style="width:100px;text-align:right;" class="price">
                {money(l.lineTotalCents, tenant.currency)}
              </td>
              <td style="width:32px;text-align:right;">
                <button
                  onClick={() => mutate(l.variantId, 'remove')} disabled={busy}
                  aria-label={`Remove ${l.productTitle}`}
                  style="background:none;border:0;color:var(--c-ink-muted);cursor:pointer;font-size:1.2rem;"
                >×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div class="totals">
        <div><span>Subtotal</span><span>{money(cart.subtotalCents, tenant.currency)}</span></div>
        <div class="muted" style="font-size:.9rem;"><span>Shipping</span><span>Calculated at checkout</span></div>
      </div>

      <p style="text-align:right;margin-top:calc(var(--s)*3);">
        <a class="btn" href="/checkout" style={cart.problems.length ? 'pointer-events:none;opacity:.45;' : ''}>
          Checkout
        </a>
      </p>
    </div>
  )
}
