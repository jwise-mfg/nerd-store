import { useEffect, useRef, useState } from 'preact/hooks'
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js'
import type { TenantConfig } from '@store/core'

interface Props {
  publishableKey: string
  tenant: {
    currency: string
    storeName: string
    copy: Pick<TenantConfig['copy'], 'checkoutReassurance' | 'shippingRestriction'>
    /** Token values, passed in so Stripe's iframe matches the surrounding page. */
    appearance: { bg: string; bgElevated: string; ink: string; inkMuted: string; accent: string; line: string; danger: string; font: string; radius: string }
  }
}

const REGION = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null
const countryName = (code: string) => REGION?.of(code) ?? code

const money = (c: number, cur: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format(c / 100)

interface Rate { code: string; label: string; amount: number; estimate: string }

/**
 * Embedded checkout.
 *
 * The buyer never leaves the store's own domain. That is the whole point of
 * the single-account setup: Stripe's hosted Checkout page carries the
 * *account's* branding, which is identical for both storefronts and would
 * connect them the moment anyone compared two receipts. Payment Element is
 * an iframe we theme from this store's own design tokens instead.
 */
export default function Checkout({ publishableKey, tenant }: Props) {
  const [step, setStep] = useState<'address' | 'pay'>('address')
  const [rates, setRates] = useState<Rate[]>([])
  const [countries, setCountries] = useState<string[]>([])
  const [subtotal, setSubtotal] = useState(0)
  const [form, setForm] = useState({
    email: '', name: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'US',
  })
  const [rateCode, setRateCode] = useState('')
  const [totals, setTotals] = useState<{ total: number; shipping: number; subtotal: number } | null>(null)
  const [orderNumber, setOrderNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [left, setLeft] = useState('')

  const stripeRef = useRef<Stripe | null>(null)
  const elementsRef = useRef<StripeElements | null>(null)
  const mountRef = useRef<HTMLDivElement>(null)

  // Shipping options depend on destination and on the live cart subtotal
  // (free-shipping thresholds), so they are priced server-side.
  useEffect(() => {
    fetch(`/api/checkout?country=${form.country}`)
      .then((r) => r.json())
      .then((d) => {
        setRates(d.rates); setSubtotal(d.subtotalCents)
        setCountries(d.countries ?? [])
        // If the store ships to exactly one country, there is no choice to
        // make -- adopt it rather than asking.
        if (d.countries?.length === 1 && form.country !== d.countries[0]) {
          setForm((f) => ({ ...f, country: d.countries[0] }))
        }
        if (d.rates.length && !d.rates.some((r: Rate) => r.code === rateCode)) setRateCode(d.rates[0].code)
      })
  }, [form.country])

  // The hold expires; say so plainly rather than failing at the last step.
  useEffect(() => {
    if (!deadline) return
    const tick = () => {
      const ms = deadline - Date.now()
      if (ms <= 0) { setLeft('expired'); setStep('address'); setDeadline(null); return }
      const m = Math.floor(ms / 60000)
      setLeft(`${m}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadline])

  async function beginPayment(e: Event) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          shippingRateCode: rateCode,
          address: {
            name: form.name, line1: form.line1, line2: form.line2, city: form.city,
            state: form.state, postalCode: form.postalCode, country: form.country,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Checkout failed')

      setTotals({ total: data.totalCents, shipping: data.shippingCents, subtotal: data.subtotalCents })
      setOrderNumber(data.orderNumber)
      setDeadline(new Date(data.reservationExpiresAt).getTime())

      const stripe = await loadStripe(publishableKey)
      if (!stripe) throw new Error('Could not load payment form')
      stripeRef.current = stripe

      const a = tenant.appearance
      elementsRef.current = stripe.elements({
        clientSecret: data.clientSecret,
        // Stripe's iframe inherits this store's tokens, so the payment form
        // looks native to whichever storefront the buyer is standing in.
        appearance: {
          theme: 'flat',
          variables: {
            colorPrimary: a.accent, colorBackground: a.bgElevated, colorText: a.ink,
            colorTextSecondary: a.inkMuted, colorDanger: a.danger,
            fontFamily: a.font, borderRadius: a.radius, spacingUnit: '4px',
          },
          rules: { '.Input': { border: `1px solid ${a.line}` } },
        },
      })
      setStep('pay')
      queueMicrotask(() => {
        if (mountRef.current) elementsRef.current!.create('payment').mount(mountRef.current)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
    } finally {
      setBusy(false)
    }
  }

  async function confirm(e: Event) {
    e.preventDefault()
    if (!stripeRef.current || !elementsRef.current) return
    setBusy(true); setError(null)
    const { error: err } = await stripeRef.current.confirmPayment({
      elements: elementsRef.current,
      confirmParams: { return_url: `${location.origin}/order/${orderNumber}` },
    })
    // Only client-side validation failures land here; success redirects away.
    // The order is not marked paid until the webhook says so.
    if (err) { setError(err.message ?? 'Payment failed'); setBusy(false) }
  }

  const set = (k: keyof typeof form) => (e: Event) =>
    setForm({ ...form, [k]: (e.target as HTMLInputElement).value })

  if (step === 'address') {
    return (
      <form onSubmit={beginPayment}>
        {left === 'expired' && <p class="notice">Your reservation expired. Confirm your details to try again.</p>}
        <p class="muted" style="margin-top:0;">{tenant.copy.shippingRestriction}</p>
        <label class="field"><span>Email</span>
          <input type="email" required value={form.email} onInput={set('email')} autocomplete="email" /></label>
        <label class="field"><span>Full name</span>
          <input required value={form.name} onInput={set('name')} autocomplete="name" /></label>
        <label class="field"><span>Address</span>
          <input required value={form.line1} onInput={set('line1')} autocomplete="address-line1" /></label>
        <label class="field"><span>Apartment, suite (optional)</span>
          <input value={form.line2} onInput={set('line2')} autocomplete="address-line2" /></label>
        <div class="row2">
          <label class="field"><span>City</span>
            <input required value={form.city} onInput={set('city')} autocomplete="address-level2" /></label>
          <label class="field"><span>State / Province</span>
            <input required value={form.state} onInput={set('state')} autocomplete="address-level1" /></label>
        </div>
        <div class="row2">
          <label class="field"><span>Postal code</span>
            <input required value={form.postalCode} onInput={set('postalCode')} autocomplete="postal-code" /></label>
          <label class="field"><span>Country</span>
            {countries.length === 1 ? (
              // One destination: show it, do not offer a box that invites a
              // value the store will refuse.
              <input value={countryName(countries[0]!)} readOnly tabIndex={-1}
                     style="opacity:.7;cursor:default;" />
            ) : (
              <select required value={form.country}
                      onChange={(e) => setForm({ ...form, country: (e.target as HTMLSelectElement).value })}>
                {countries.map((c) => <option value={c} key={c}>{countryName(c)}</option>)}
              </select>
            )}</label>
        </div>

        <fieldset style="border:1px solid var(--c-line);border-radius:var(--r-md);padding:calc(var(--s)*2);margin-bottom:calc(var(--s)*3);">
          <legend class="muted" style="font-size:.85rem;">Shipping</legend>
          {rates.length === 0 && (
            <p class="muted" style="margin:0;">{tenant.copy.shippingRestriction}</p>
          )}
          {rates.map((r) => (
            <label key={r.code} style="display:flex;gap:8px;align-items:baseline;padding:4px 0;">
              <input type="radio" name="rate" checked={rateCode === r.code} onChange={() => setRateCode(r.code)} />
              <span>{r.label} <span class="muted">— {r.estimate}</span></span>
              <span class="price" style="margin-left:auto;">
                {r.amount === 0 ? 'Free' : money(r.amount, tenant.currency)}
              </span>
            </label>
          ))}
        </fieldset>

        {error && <p class="notice">{error}</p>}
        <button class="btn" type="submit" disabled={busy || rates.length === 0 || subtotal === 0}>
          {busy ? 'Reserving…' : 'Continue to payment'}
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={confirm}>
      <div class="totals" style="margin:0 0 calc(var(--s)*3);max-width:none;">
        <div><span>Subtotal</span><span>{money(totals!.subtotal, tenant.currency)}</span></div>
        <div><span>Shipping</span><span>{totals!.shipping === 0 ? 'Free' : money(totals!.shipping, tenant.currency)}</span></div>
        <div class="grand"><span>Total</span><span>{money(totals!.total, tenant.currency)}</span></div>
      </div>

      {left && left !== 'expired' && (
        <p class="muted" style="font-size:.9rem;">Your items are held for {left}.</p>
      )}

      <div ref={mountRef} style="margin: calc(var(--s)*3) 0;" />
      {error && <p class="notice">{error}</p>}

      <button class="btn" type="submit" disabled={busy}>
        {busy ? 'Processing…' : `Pay ${money(totals!.total, tenant.currency)}`}
      </button>
      <p class="muted" style="font-size:.85rem;margin-top:calc(var(--s)*2);">
        {tenant.copy.checkoutReassurance}
      </p>
    </form>
  )
}
