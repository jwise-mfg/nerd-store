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
 * Delivery is left as an adapter. Point MAIL_TRANSPORT at your provider; the
 * only hard requirement is that each tenant authenticates its own sending
 * domain (SPF/DKIM for i3x.dev and webosarchive.org separately). A shared
 * envelope sender or a shared DKIM d= domain is visible in every raw header.
 */
export async function sendReceipt(tenant: TenantConfig, data: ReceiptData): Promise<void> {
  const msg = renderReceipt(tenant, data)
  const endpoint = process.env.MAIL_WEBHOOK_URL
  if (!endpoint) {
    console.info(`[mail:${tenant.id}] would send to ${msg.to}: ${msg.subject}`)
    return
  }
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(msg),
  })
}
