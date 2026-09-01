# nerd-store cheatsheet

Everything runs from `~/repos/nerd-store` on the server. Add `-t webos` to any
`storemgr` command to target the other store; it defaults to `i3x`.

---

## Products are files — no command needed

```
products/i3x/how-machines-talk/
  product.json      title, description, price, variants, stock
  cover.png         images live beside it, referenced by filename
```

Edit the file, then **`storemgr publish`** (~3s, no downtime).

```jsonc
{
  "title": "How Machines Talk",
  "subtitle": "A picture book about factories",
  "kind": "book",                    // book apparel sticker device accessory media
  "status": "active",                // active | draft | archived
  "position": 1,                     // sort order, lower first
  "description": [                   // Markdown; inline HTML ok; array avoids \n
    "First paragraph.",
    "",
    "Second paragraph."
  ],
  "images": [{ "file": "cover.png", "alt": "Book cover" }],
  "variants": [{
    "sku": "I3X-BOOK-HC",            // the identity — don't reuse or recycle
    "title": "Hardcover",
    "price": "24.00",                // dollars
    "stock": 180,
    "weightGrams": 420,
    "attributes": { "size": "L" },   // drives the variant picker
    "condition": "grade_a",          // used goods only
    "serial": "TP32-0417",
    "conditionNotes": "Battery at 91%.",
    "images": [{ "file": "unit-front.jpg", "alt": "This unit" }]
  }]
}
```

A product with no variants never appears. First image is what the shop grid shows.

---

## storemgr

```bash
storemgr inventory                  # listed, priced, in stock, on hold
storemgr low [--threshold 5]        # what needs restocking
storemgr stock I3X-BOOK-HC 250      # set — writes into product.json
storemgr stock I3X-BOOK-HC +50      # or adjust: +50 / -10
storemgr check                      # validate every product file
storemgr publish                    # rebuild this store's pages

storemgr orders                     # recent
storemgr orders --status paid       # awaiting shipment
storemgr order I3X-4KHTP4           # full detail incl. address
storemgr ship I3X-4KHTP4 --carrier USPS --tracking 9400...
storemgr ship I3X-4KHTP4 --carrier USPS --no-email
storemgr ship-email I3X-4KHTP4 [--to someone@else]
```

USPS, UPS, FedEx, DHL get a tracking link built automatically.
`--no-publish` on any command defers the rebuild; then `storemgr publish` once.

---

## Deploy

```bash
./scripts/deploy.sh                 # pull, build, validate, restart, smoke test
./scripts/deploy.sh --no-pull       # deploy what's already checked out
```

Only reinstalls dependencies when `package-lock.json` changes.

---

## config.json  (gitignored — holds secrets)

```jsonc
{
  "storeOpen": true,                 // false = "Down for maintenance" on every page
  "stripe":  { "secretKey": "sk_…", "publishableKey": "pk_…", "webhookSecret": "whsec_…" },
  "mail":    { "transport": "resend", "apiKey": "re_…", "webhookUrl": null },
  "notify":  { "email": "you@…",
               "pushover": { "token": "…", "user": "…",
                             "sound": { "i3x": "cashregister", "webos": "webos-notify" } } },
  "storage": { "dataDir": "./data", "databasePaths": {} }
}
```

**Closing the shop needs a publish** — pages are prerendered, so a flag only
the server checked would leave them open.

```bash
# edit "storeOpen": false, then
storemgr publish -t i3x && storemgr publish -t webos
```

---

## Checks before you rely on something

```bash
npm run check:stripe                # keys valid, webhook events + API version match
node scripts/test-mail.ts you@…     # send a specimen receipt
node scripts/test-notify.ts         # fire a specimen order alert
npm test                            # availability + oversell + tenant validation
```

---

## Server

```bash
systemctl status shop-i3x shop-webos
journalctl -u shop-i3x -f                       # live logs
journalctl -u shop-i3x --since '1 hour ago' | grep -E 'mail|notify|ERROR'
sudo systemctl restart shop-i3x shop-webos      # only needed for config.json changes
./scripts/backup.sh                             # on demand; runs nightly at 04:17
ls ~/backups/nerd-store/
sudo nginx -t && sudo systemctl reload nginx
```

**Restore:** stop the service, `gunzip -c ~/backups/nerd-store/i3x-<stamp>.db.gz > data/i3x.db`, start it.

---

## What needs what

| Change | Action |
|---|---|
| Stock number | `storemgr stock` — publishes automatically |
| Title, price, description, images, status | edit `product.json` → `storemgr publish` |
| `storeOpen`, theme, copy, shipping rates | edit → `storemgr publish` |
| Stripe keys, mail, notify in `config.json` | edit → `sudo systemctl restart shop-i3x shop-webos` |
| Service units in `deploy/systemd/` | edit → `./scripts/deploy.sh` (daemon-reloads for you) |
| Code | `./scripts/deploy.sh` |

Product images are **not** in git — they live in `products/…` and are copied
into the build. Back them up with the databases.
