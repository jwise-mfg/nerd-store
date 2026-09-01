# nerd-store

Two small shops — [shop.i3x.dev](https://shop.i3x.dev) and
[shop.webosarchive.org](https://shop.webosarchive.org) — served by one PHP file.

No build step. No application server. One Composer package. Editing a product
means editing a file and reloading the page.

```
public/index.php     the whole storefront; nginx sends everything here
stores/i3x/          config.php, style.css, brand/, policies/, products/
stores/webos/        the same, for the other shop
lib/                 nine files: catalog, cart, stock, orders, checkout, mail
templates/           plain PHP templates
bin/store            administration (orders, shipping, stock)
prototype/           the retired Astro implementation, kept for reference
```

The **hostname** picks the store; the **path** picks the page. Both shops are
the same code — everything that differs between them is in `stores/<id>/`.

## Products are files

```
stores/i3x/products/how-machines-talk/
  product.json     title, description, variants, prices
  cover.png        images live beside it, referenced by filename
```

Edit it, reload the page. There is nothing to publish and no cache to clear.

```jsonc
{
  "title": "How Machines Talk",
  "kind": "book",
  "status": "active",          // active | draft | archived
  "position": 1,               // sort order in the shop
  "description": ["Line one.", "", "A blank line starts a paragraph."],
  "images": [{ "file": "cover.png", "alt": "…" }],
  "variants": [
    { "sku": "I3X-BOOK-HC", "title": "Hardcover", "price": "24.00", "weightGrams": 420 }
  ]
}
```

**Stock is not in this file** — it is in the database, because the server
writes it on every sale and this file is in git. Use `bin/store stock`.

A product with no variants never appears. The first image is what the shop
grid shows.

## bin/store

```bash
bin/store check                     # validate every product file
bin/store stock                     # every SKU and its count
bin/store stock I3X-BOOK-HC 250     # set
bin/store stock I3X-BOOK-HC +50     # or adjust: +50 / -10

bin/store orders                    # recent
bin/store orders --status paid      # awaiting shipment
bin/store order I3X-4KHTP4          # full detail including address
bin/store ship I3X-4KHTP4 --carrier USPS --tracking 9400...
```

`ship` emails the buyer their tracking link. `--no-email` suppresses it.

## What needs what

| Change | Action |
|---|---|
| Stock | `bin/store stock` — takes effect immediately |
| Title, price, description, images, status | edit `product.json` — immediately |
| Colours, copy, shipping rates, `store_open` | edit `stores/<id>/config.php` — immediately |
| Stripe or mail keys in `config.php` | edit — immediately |
| Code | `git pull` |

Nothing on that list requires a restart. PHP reads the files on each request.

## Running it locally

```bash
composer install
cp config.example.php config.php     # Stripe test keys; mail transport 'log'
STORE=i3x   php -S localhost:8000 -t public/
STORE=webos php -S localhost:8001 -t public/
```

`STORE` exists because the built-in server has no hostname to go on. In
production nginx passes the real `Host` and this variable is unset.

To exercise payment end to end you need the Stripe CLI:

```bash
stripe listen --forward-to localhost:8000/webhook/stripe
```

## How a sale works

1. `POST /checkout` builds a Stripe Checkout Session from the cart and writes
   the order as `pending`.
2. The buyer is redirected to Stripe, which takes the card, the email and the
   shipping address, and sends the receipt.
3. `checkout.session.completed` arrives at `/webhook/stripe`. The order becomes
   `paid`, stock comes off, and you get an email.
4. `bin/store ship` marks it `shipped` and sends the tracking link.

The webhook decides which store an event belongs to from
`session.metadata.store`, never from the hostname it arrived on — one Stripe
account is one event stream, so both shops' events land on whichever endpoint
is registered.

Deployment lives in [`deploy/README.md`](deploy/README.md).
