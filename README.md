# nerd-store

One commerce framework, two unrelated-looking storefronts, selected by URL.

| | [shop.i3x.dev](https://shop.i3x.dev) | [shop.webosarchive.org](https://shop.webosarchive.org) |
|---|---|---|
| Sells | A children's book, t-shirts, stickers | New old stock accessories, graded used TouchPads / Pres |
| Looks like | [www.i3x.dev](https://www.i3x.dev) — white, `#00367F` navy, Lato / Work Sans | [webosarchive.org](https://www.webosarchive.org) — `#101110`, lavender links, Verdana, webOS card UI |
| Inventory | Restocked, size/colour variants | Mostly quantity-1, with serials, condition grades, and photos of the actual unit |
| Statement | `I3X STORE` | `WEBOS SHOP` |

Both storefronts are built from one codebase and one schema. Everything that
differs between them lives in a single config file per store.

---

## Setup

No database server, no containers. SQLite files under `data/`.

**1. Create your config.** Copy the example and replace the stub values:

```bash
cp config.example.json config.json
```

`config.json` is gitignored and is the only place secrets belong.
`config.example.json` is committed — everything in it is public, so it holds
stubs (`REPLACE_ME`) and never real values. It is fully commented, and
comments are allowed in `config.json` too, the way `tsconfig.json` allows
them. The only values you must fill in are the three Stripe keys.

The loader validates the file on startup and names every problem at once:
a missing file, malformed JSON, a missing key, or a copy you forgot to edit
each produce a specific message rather than a failure later inside Stripe.

Only genuinely process-level values stay in the environment, because systemd
owns them: `TENANT`, `HOST`, `PORT`, and `CONFIG_PATH` (which points at this
file — `/etc/nerd-store/config.json` in production).

**2. Turn on the commit hook.** It blocks staged secrets, `config.json`, and
database files, and fails a commit that puts a real key in
`config.example.json`:

```bash
git config core.hooksPath .githooks
```

**3. Run it.**

```bash
npm run setup        # install, migrate, seed both catalogues
npm run dev:i3x      # → http://localhost:4321
npm run dev:webos    # → http://localhost:4322
```

```bash
npm run build:all    # produces dist-i3x/ and dist-webos/
npm test             # availability + oversell + tenant validation
```

**4. Receipts.** Set `mail.transport` to `"resend"` and paste an API key from
<https://resend.com/api-keys>. Verify each store's domain separately in Resend
so mail is signed as `d=i3x.dev` and `d=webosarchive.org` rather than sharing
one identity. Then check it before a customer does:

```bash
node scripts/test-mail.ts you@example.com          # or -t webos
```

With `mail.transport` left as `"log"` nothing is sent; receipts only appear in
the journal.

**5. Order notifications.** Receipts go to the customer; `notify` tells *you*.

```json
"notify": {
  "email": "you@example.com",
  "pushover": {
    "token": "…", "user": "…",
    "sound": { "i3x": "cashregister", "webos": "webos-notify" }
  }
}
```

`sound` takes a built-in or custom Pushover sound, and a per-store map means
you can tell which shop sold without looking. Test both channels without
placing an order:

```bash
node scripts/test-notify.ts          # or -t webos
```

Deploying to a VPS: see [deploy/README.md](deploy/README.md).

---

## Running the shop

`storemgr` manages the catalogue, stock, and orders. Authentication is SSH: if
you can run it, you are the operator, so there is no login and no public admin
surface on a live store.

```bash
./storemgr help

./storemgr inventory                      # listings, prices, stock, live holds
./storemgr low                           # what needs restocking
./storemgr stock I3X-BOOK-HC +50         # set (250) or adjust (+50 / -10)
./storemgr price I3X-BOOK-HC 26.50       # dollars, not cents
./storemgr orders --status paid          # awaiting shipment
./storemgr order I3X-ABC123              # full detail incl. address
./storemgr ship I3X-ABC123 --carrier USPS --tracking 9400...
```

Add `-t webos` to target the other store; it defaults to `i3x`.

Editing listings and images:

```bash
./storemgr product-edit how-machines-talk --title "..." --subtitle "..."
./storemgr describe how-machines-talk description.md   # Markdown, from a file
./storemgr images how-machines-talk                    # list, with indices
./storemgr image-add how-machines-talk cover.jpg --alt "Book cover"
./storemgr image-add hp-touchpad-32gb front.jpg --sku WOA-TP32-A-0417 --alt "This unit" -t webos
./storemgr image-rm how-machines-talk 0
```

`image-add` copies the file into that store's own `public-<tenant>/products/`
directory. Referencing a path elsewhere on disk would work locally and 404 in
production, because the build only ships what is inside it. Use `--sku` for a
photograph of one specific unit rather than the product generally.

Adding something new takes two steps, because a product with no variant never
appears in the shop:

```bash
./storemgr product-add --slug tote --title "i3X Tote" --kind apparel
./storemgr variant-add --product tote --sku I3X-TOTE-NAT --price 18 --stock 25
./storemgr activate tote
```

Put it on your PATH to drop the `./`:

```bash
mkdir -p ~/.local/bin && ln -sf "$PWD/storemgr" ~/.local/bin/storemgr
```

**Changes publish themselves.** Anything that alters a page's content
rebuilds that store automatically — a few seconds, no downtime, and no service
restart, because Astro's node server and nginx both read the built files from
disk per request. Pass `--no-publish` to defer when making several edits, then
run `storemgr publish` once.

Stock needs no publish at all: the product page fetches availability live.

---

## Layout

```
tenants/<id>/tenant.config.ts   Everything that differs between stores
packages/core/                  Everything that doesn't
  tenant/types.ts                 The tenant contract
  db/schema.ts                    One schema serving both catalogue shapes
  db/index.ts                     Per-tenant SQLite handles + write retry
  inventory/                      Availability + reservations (oversell protection)
  cart/  orders/  payments/  mail/
apps/storefront/                One Astro app, built once per tenant
  public-i3x/  public-webos/     Per-store static files; never shared
deploy/systemd/                 Two hardened units, sweep + backup timers
deploy/nginx/                   One server block per store, separate certs
scripts/validate-tenants.mjs    Config-collision gate, run before deploy
config.json                     Secrets + storage  (gitignored)
config.example.json             Commented stub template  (committed)
data/                           i3x.db, webos.db  (gitignored)
```

### One database file per store

`data/i3x.db` and `data/webos.db` are separate files. A query can therefore
never reach the wrong store's rows, and each store backs up, restores, and
moves machines independently. Queries still carry their `tenant` filter as
defence in depth: if a path is ever misconfigured, they return nothing rather
than quietly serving the wrong catalogue.

SQLite allows one writer at a time, which makes the reservation transaction
serializable by construction — but only with `behavior: 'immediate'`, which
takes the write lock up front. Verified: 8 concurrent processes racing for one
unit, 30 rounds, zero oversells and zero errors.

### The one rule

`TenantConfig` is the entire surface on which the stores may differ. Feature
code never branches on `tenant.id` — it reads a declared capability instead.
Condition grades render because `catalog.showConditionDetail` is true, not
because the store is the webOS one. Break this rule and the framework quietly
becomes two applications sharing a folder.

Adding a third store is a directory, a registry entry, an `ORDER_PREFIX`, and
a host mapping. `npm run validate` will tell you what you forgot.

---

## How it's static and still correct

Astro prerenders the catalogue, so pages are cheap and fast. But a prerendered
page claiming "in stock" for a one-of-a-kind TouchPad that sold ten minutes
ago sells something you can't ship.

So build-time stock is treated as a hint. The product page's island fetches
live availability on mount and keeps the buy button disabled until the server
answers — and **fails closed** if it can't. At checkout, stock is reserved in
an immediate transaction before any PaymentIntent exists, so of two
simultaneous buyers exactly one gets a payment form and the other is told the
item is gone before a card is touched.

Only these routes are server-rendered: `/api/*` and `/order/[orderNumber]`.

## Payment truth

Orders become `paid` from the Stripe webhook and nowhere else. The browser
reporting success is a UI hint. Because both stores bill through one Stripe
account there is one webhook stream, so events are routed by
`metadata.tenant`, not by which deployment received them. `markPaid` is
idempotent twice over — recorded event id, guarded status transition — because
Stripe delivers at least once.

## Status

Working and exercised: catalogue, cart, tenant isolation, availability under
holds, reservations under concurrency, shipping rates, order records, backup
and restore round-trip, tenant validation, commit hook.

Not run locally: `nginx -t` (nginx isn't installed here — the configs are
structurally checked only, so validate on the box before reloading).

**Not yet exercised: the payment itself.** Everything up to
`stripe.paymentIntents.create` runs; the call needs real test keys. Before
launch, run a card through `4242 4242 4242 4242`, confirm the webhook fires,
and check that the order flips to `paid`, stock decrements once, and the
receipt sends. Also wire `MAIL_WEBHOOK_URL` — unset, receipts only log.
