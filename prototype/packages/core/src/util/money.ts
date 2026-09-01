/** All money is integer minor units. Floats never touch a price in this codebase. */
export function formatMoney(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

export function sumLines(lines: { qty: number; unitPriceCents: number }[]): number {
  return lines.reduce((n, l) => n + l.qty * l.unitPriceCents, 0)
}
