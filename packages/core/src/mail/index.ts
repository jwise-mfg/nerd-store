import { config } from '../config/index.ts'
import type { TenantConfig } from '../tenant/types.ts'
import { formatMoney } from '../util/money.ts'

/**
 * Transactional mail.
 *
 * Both stores send from their own domain with their own name, reply-to, and
 * postal address. Stripe's built-in receipts must stay OFF in the dashboard
 * (Settings -> Customer emails -> "Successful payments"): that toggle is
 * account-wide, so leaving it on emails every buyer of either store a receipt
 * carrying one shared business name -- the exact seam this architecture is
 * built to avoid.
 */

export interface ReceiptData {
  order: {
    orderNumber: string
    email: string
    subtotalCents: number
    shippingCents: number
    totalCents: number
    currency: string
    shippingAddress: { name: string; line1: string; line2?: string; city: string; state: string; postalCode: string; country: string }
  }
  items: { titleSnapshot: string; qty: number; unitPriceCents: number; serialSnapshot: string | null }[]
}

export interface MailMessage {
  from: string
  replyTo: string
  to: string
  subject: string
  text: string
}

export function renderReceipt(tenant: TenantConfig, data: ReceiptData): MailMessage {
  const { order, items } = data
  const money = (c: number) => formatMoney(c, order.currency)
  const lines = items
    .map((i) => `  ${i.qty} x ${i.titleSnapshot}${i.serialSnapshot ? ` (S/N ${i.serialSnapshot})` : ''}  ${money(i.qty * i.unitPriceCents)}`)
    .join('\n')

  const a = order.shippingAddress
  const text = `${tenant.copy.orderConfirmedTitle}

Order ${order.orderNumber}

${lines}

  Subtotal   ${money(order.subtotalCents)}
  Shipping   ${money(order.shippingCents)}
  Total      ${money(order.totalCents)}

Shipping to:
  ${a.name}
  ${a.line1}${a.line2 ? `\n  ${a.line2}` : ''}
  ${a.city}, ${a.state} ${a.postalCode}
  ${a.country}

Your card statement will show "${tenant.statementDescriptorSuffix}".

Questions: ${tenant.support.email}
Returns: ${tenant.origin}${tenant.support.returnsPath}

${tenant.storeName}
${tenant.mail.postalAddress}
`

  return {
    from: `${tenant.mail.fromName} <${tenant.mail.fromAddress}>`,
    replyTo: tenant.mail.replyTo,
    to: order.email,
    subject: `${tenant.storeName} — order ${order.orderNumber} confirmed`,
    text,
  }
}

/**
 * Send a receipt.
 *
 * Failures are the caller's to swallow: this is invoked from the Stripe
 * webhook after the payment has already been captured, and a mail outage must
 * never turn a completed sale into a failed webhook.
 */
export async function sendReceipt(tenant: TenantConfig, data: ReceiptData): Promise<void> {
  const msg = renderReceipt(tenant, data)
  const m = config().mail

  switch (m.transport) {
    case 'resend':
      await sendViaResend(m.apiKey!, msg)
      console.info(`[mail:${tenant.id}] sent to ${msg.to}: ${msg.subject}`)
      return

    case 'webhook': {
      const res = await fetch(m.webhookUrl!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(msg),
      })
      if (!res.ok) throw new Error(`Mail webhook returned ${res.status}`)
      console.info(`[mail:${tenant.id}] posted to webhook for ${msg.to}`)
      return
    }

    default:
      console.info(`[mail:${tenant.id}] (not sent -- transport is "log") to ${msg.to}: ${msg.subject}`)
  }
}

/**
 * Resend's HTTP API.
 *
 * Deliberately not a dependency: it is one authenticated POST, and an SDK
 * would be another package to keep current for no benefit. Verify each store's
 * domain separately in Resend so mail is DKIM-signed as d=i3x.dev and
 * d=webosarchive.org rather than sharing one signing identity.
 */
async function sendViaResend(apiKey: string, msg: MailMessage): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: msg.from,
      to: [msg.to],
      reply_to: msg.replyTo,
      subject: msg.subject,
      text: msg.text,
    }),
  })
  if (!res.ok) {
    // Quote Resend's own message: "domain not verified" and "invalid api key"
    // are the two failures worth seeing verbatim.
    const body = await res.text().catch(() => '')
    throw new Error(`Resend returned ${res.status}: ${body.slice(0, 300)}`)
  }
}
