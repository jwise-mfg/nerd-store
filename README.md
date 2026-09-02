# nerd-store

Two small shops — [shop.i3x.dev](https://shop.i3x.dev) and
[shop.webosarchive.org](https://shop.webosarchive.org) — served by one PHP file.

No build step. No application server. One Composer package. Editing a product
means editing a file and reloading the page.

```
stores/i3x/
  config.php         name, copy, colours, shipping rates, store_open
  products/<slug>/   product.json and its images
  policies/          returns and privacy, as this shop words them
  public/            ← the document root nginx serves
    index.php          two lines: names the store, requires lib/app.php
    style.css          this shop's colours and type
    brand/             its logos
    img -> ../products     symlink, so photos stay beside product.json
    base.css -> ../../../assets/base.css   symlink, the shared layout
stores/webos/        the same, for the other shop
lib/app.php          the storefront; every page goes through it
lib/                 catalog, cart, stock, orders, checkout, mail
templates/           plain PHP templates
bin/store            administration (orders, shipping, stock)
```

**Each shop has its own document root.** Its stylesheet, logos and product
photographs are ordinary files in there, served straight off disk — nginx has
no aliases and PHP never sees a request for one. Which shop a request belongs
to is decided by which root it arrived in, so there is no hostname map to keep
in step with the vhosts.

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
  "orderMax": 5,               // optional: most one order may contain
  "shippingCents": 400,        // optional: this product's shipping. A cart
                               // charges the highest of the things in it,
                               // since it all goes in one box. Products that
                               // set nothing use the store's rate.
  "description": ["Line one.", "", "A blank line starts a paragraph."],
  "images": [{ "file": "cover.png", "alt": "…" }],
  "socialImage": "cover-social.jpg",   // optional: what a shared link shows.
                               // Otherwise the first image. LinkedIn ignores
                               // anything over 5 MB; 1200px JPEG is plenty.
  "variants": [
    { "sku": "I3X-BOOK-HC", "title": "Hardcover", "price": "24.00" }
  ]
}
```

**Stock is not in this file** — it is in `data/stock.json`, a flat
`{"SKU": count}` map, because the server writes it on every sale and this file
is in git. Use `bin/store stock`, or edit it directly; it is sorted one SKU to
a line so two copies diff and merge as text.

A product with no variants never appears. The first image is what the shop
grid shows.

## bin/store

```bash
bin/store check                     # validate every product file
bin/store stripe                    # keys work and a checkout session builds
bin/store stock                     # every SKU and its count
bin/store stock I3X-BOOK-HC 250     # set (or edit data/stock.json)
bin/store stock I3X-BOOK-HC +50     # or adjust: +50 / -10
bin/store stock --prune             # drop counts no product file declares

bin/store orders                    # recent
bin/store orders --status paid      # awaiting shipment
bin/store order I3X-4KHTP4          # full detail including address
bin/store ship I3X-4KHTP4 --carrier USPS --tracking 9400...

bin/store close                     # refuse new orders, both shops
bin/store close webos               # one shop
bin/store open                      # resume
```

`ship` emails the buyer their tracking link. `--no-email` suppresses it.

Day-to-day commands, server permissions, logs, backup and restore are all in
[`cheatsheet.md`](cheatsheet.md).

## What needs what

| Change | Action |
|---|---|
| Stock | `bin/store stock` — takes effect immediately |
| Title, price, description, images, status | edit `product.json` — immediately |
| Colours, copy, `title_tagline`, shipping rates | edit `stores/<id>/config.php` — immediately |
| Close a shop for maintenance | `bin/store close` — immediately |
| Stripe or mail keys in `config.php` | edit — immediately |
| Code | `git pull` |

Nothing on that list requires a restart. PHP reads the files on each request.

## Running it locally

```bash
composer install
cp config.example.php config.php     # Stripe test keys; mail transport 'log'
php -S localhost:8000 -t stores/i3x/public
php -S localhost:8001 -t stores/webos/public
```

The built-in server is pointed at the same directory nginx uses, so local and
production serve the same files the same way.

To exercise payment end to end you need the Stripe CLI:

```bash
stripe listen --forward-to localhost:8000/webhook/stripe
```

## How a sale works

1. `POST /checkout` builds a Stripe Checkout Session from the cart and writes
   the order as `pending`.
2. The buyer is redirected to Stripe, which takes the card, the email and the
   shipping address, and sends the receipt. Checkout accepts cards only
   (including Apple Pay and Google Pay), set per session, so the Stripe
   account's own payment-method list is untouched.
3. `checkout.session.completed` arrives at `/webhook/stripe`. The order becomes
   `paid`, stock comes off, and you get an email.
4. `bin/store ship` marks it `shipped` and sends the tracking link.

The webhook decides which store an event belongs to from
`session.metadata.store`, never from the hostname it arrived on — one Stripe
account is one event stream, so both shops' events land on whichever endpoint
is registered.

Deployment lives in [`deploy/README.md`](deploy/README.md).
