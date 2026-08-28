import { config } from '../config/index.ts'
import { sendMail, type ReceiptData } from '../mail/index.ts'
import { formatMoney } from '../util/money.ts'
import type { TenantConfig } from '../tenant/types.ts'

/**
 * Tell the operator a sale happened.
 *
 * Separate from the customer receipt on purpose: this one names the store,
 * lists what has to be picked and packed, and is addressed to whoever fulfils
 * it. Both channels are optional and neither is allowed to fail a payment.
 */

export interface OrderNotice {
  order: {
    orderNumber: string
    email: string
    subtotalCents: number
    shippingCents: number
    totalCents: number
    currency: string
    shippingRateCode: string
    shippingAddress: {
      name: string; line1: string; line2?: string
      city: string; state: string; postalCode: string; country: string
    }
  }
  items: { titleSnapshot: string; sku: string; qty: number; unitPriceCents: number; serialSnapshot: string | null }[]
}

function summarise(tenant: TenantConfig, n: OrderNotice): { title: string; lines: string[] } {
  const money = (c: number) => formatMoney(c, n.order.currency)
  const a = n.order.shippingAddress
  return {
    title: `${tenant.storeName} — order ${n.order.orderNumber} — ${money(n.order.totalCents)}`,
    lines: [
      ...n.items.map((i) =>
        `  ${i.qty} x ${i.titleSnapshot}` +
        `\n      ${i.sku}${i.serialSnapshot ? `  S/N ${i.serialSnapshot}` : ''}`),
      '',
      `  subtotal ${money(n.order.subtotalCents)}`,
      `  shipping ${money(n.order.shippingCents)}  (${n.order.shippingRateCode})`,
      `  total    ${money(n.order.totalCents)}`,
      '',
      '  Ship to:',
      `    ${a.name}`,
      `    ${a.line1}${a.line2 ? `\n    ${a.line2}` : ''}`,
      `    ${a.city}, ${a.state} ${a.postalCode}`,
      `    ${a.country}`,
      '',
      `  Buyer: ${n.order.email}`,
      '',
      `  Mark it shipped:`,
      `    storemgr ship ${n.order.orderNumber} --carrier USPS --tracking ... -t ${tenant.id}`,
    ],
  }
}

/**
 * Both channels are attempted independently: Pushover being down should not
 * cost you the email, and vice versa. The caller catches everything anyway,
 * but losing both to one failure would be careless.
 */
export async function notifyNewOrder(tenant: TenantConfig, n: OrderNotice): Promise<void> {
  const { notify } = config()
  const { title, lines } = summarise(tenant, n)

  if (!notify.email && !notify.pushover) {
    console.info(`[notify:${tenant.id}] ${title} (no notification targets configured)`)
    return
  }

  const results = await Promise.allSettled([
    notify.email
      ? sendMail(tenant.id, {
          // From the store, so replies reach the same place a customer would.
          from: `${tenant.mail.fromName} <${tenant.mail.fromAddress}>`,
          replyTo: n.order.email,          // reply goes straight to the buyer
          to: notify.email,
          subject: title,
          text: `${title}\n\n${lines.join('\n')}\n`,
        })
      : Promise.resolve(),
    notify.pushover
      ? pushover(notify.pushover, {
          title: `${tenant.storeName} — new order`,
          message: `${formatMoney(n.order.totalCents, n.order.currency)} — ${n.items.map((i) => `${i.qty}x ${i.titleSnapshot}`).join(', ')}`,
          url: `${tenant.origin}/order/${n.order.orderNumber}`,
          urlTitle: `Order ${n.order.orderNumber}`,
          sound: soundFor(notify.pushover.sound, tenant.id),
        })
      : Promise.resolve(),
  ])

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[notify:${tenant.id}] ${i === 0 ? 'email' : 'pushover'} failed:`, r.reason?.message ?? r.reason)
    }
  })
}

/**
 * Resolve the sound for a store: one name for all, or a per-store map. An
 * unmapped store falls through to Pushover's default rather than borrowing
 * another store's sound, which would defeat the point of setting them.
 */
export function soundFor(
  sound: string | Record<string, string> | null,
  tenantId: string,
): string | undefined {
  if (!sound) return undefined
  if (typeof sound === 'string') return sound
  return sound[tenantId]
}

interface PushoverMessage {
  title: string
  message: string
  url?: string
  urlTitle?: string
  sound?: string | undefined
}

/** Pushover's API is form-encoded, not JSON. */
export async function pushover(
  creds: { token: string; user: string; priority?: number | null; device?: string | null },
  msg: PushoverMessage,
): Promise<void> {
  const body = new URLSearchParams({
    token: creds.token,
    user: creds.user,
    title: msg.title,
    message: msg.message,
  })
  // Only send what was configured: Pushover applies its own defaults for
  // anything omitted, and an empty string is not the same as absent.
  if (msg.sound) body.set('sound', msg.sound)
  if (msg.url) body.set('url', msg.url)
  if (msg.urlTitle) body.set('url_title', msg.urlTitle)
  if (creds.priority != null) body.set('priority', String(creds.priority))
  if (creds.device) body.set('device', creds.device)

  const res = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', body })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Pushover returned ${res.status}: ${text.slice(0, 300)}`)
  }
}
