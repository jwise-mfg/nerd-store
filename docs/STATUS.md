# Where things stand

Last updated 2026-08-28.

## Working

`shop.i3x.dev` is live behind Cloudflare with a Cloudflare Origin Certificate.
A full **test-mode** purchase completed end to end: payment → webhook → order
recorded → customer receipt (Resend) → operator email → Pushover alert → cart
emptied. Products are files; `storemgr` covers stock and orders.

## Outstanding

Roughly in the order that matters.

**1. The catalogue is still demo data.** "How Machines Talk", a TouchPad with
a fabricated serial — all invented as placeholders. Replace with real products:
edit `products/<store>/<slug>/product.json`, drop photos in the same folder,
then `storemgr publish`. Delete a folder to remove a product.

**2. Refunds and disputes are not handled.** Refunding in Stripe leaves the
order `paid` and never returns stock to the product file. For a quantity-1
device that means it stays silently unsellable. Needs `charge.refunded` and
`charge.dispute.created` handlers, not just webhook subscriptions.

**3. Live mode has never taken a payment.** Only test mode has. Before
announcing, run one real purchase and confirm the order flips to `paid`, stock
decrements exactly once, and the receipt arrives.

**4. Shipping rates are placeholders.** `$5.00` standard / `$12.00` priority
for i3x, `$8.00` / `$18.00` for webOS — numbers I invented. Replace with real
USPS costs in `tenants/<store>/tenant.config.ts`.

**5. Product images are not backed up.** They live in `products/…`, are not in
git, and `backup.sh` only covers the databases. Losing the server loses the
photos. Either commit them or add `products/` to the backup.

**6. `shop.webosarchive.org` is not set up.** No DNS, no nginx block, no
Resend domain verification. Note something already serves that hostname —
repointing replaces it.

## Smaller

- Abandoned carts are never swept; the timer only clears expired stock holds.
- The order confirmation page shows a buyer's address and email to anyone
  holding the order number. Order numbers are random (~148M combinations) but
  travel in receipts and Pushover alerts.
- Both stores' charges carry the `JWISE LLC` statement prefix and the same
  postal address on receipts — a customer with one receipt from each can see
  the link. Known and accepted.

## Verified along the way

Worth not re-testing: oversell protection (two carts race for the last unit,
exactly one wins, loser refused before any card is charged), cross-store
isolation (each store 404s the other's products and reveals nothing via the
availability API), backup/restore round-trip, and the tenant validator
catching a real asset leak between builds.
