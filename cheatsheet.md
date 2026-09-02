# CLI cheatsheet

Everything runs from the repo root: `cd ~/repos/nerd-store` on the server,
the project folder locally. `bin/store` with no arguments prints its usage.

## Daily

```bash
bin/store orders --status paid                        # what needs shipping
bin/store order I3X-4KHTP4                            # full detail, with address
bin/store ship I3X-4KHTP4 --carrier USPS --tracking 9400...   # marks shipped, emails the buyer
bin/store ship I3X-4KHTP4 --carrier USPS --tracking 9400... --no-email
bin/store stock                                       # every SKU, its count, and which file declares it
bin/store stock I3X-BOOK-HC                           # one count
```

## Stock

```bash
bin/store stock I3X-BOOK-HC 180        # set
bin/store stock I3X-BOOK-HC +50        # received more
bin/store stock I3X-BOOK-HC -2         # sold one by hand, damaged one
bin/store stock --prune                # drop counts for SKUs no product file declares
```

Stock lives in `data/stock.json`, not in git. Editing it directly is fine:
one SKU per line, sorted.

## Products

Edit `stores/<id>/products/<slug>/product.json`, reload the page. A new SKU
starts at zero stock until you set it:

```bash
bin/store stock NEW-SKU 25
```

`bin/store check` is optional. It is worth running after editing a product
file on the server without looking at the page, because a malformed
product.json is a 500 on every page of that shop, not just the product's.

## Orders and the other store

```bash
bin/store orders                       # recent, both stores
bin/store orders --store webos
bin/store orders --status pending      # started checkout, never paid -- normal, ignore
bin/store orders --n 200
```

## Close and open

```bash
bin/store close            # both shops, immediately, not in git
bin/store close webos      # one
bin/store open             # resume (does not override store_open => false in a config)
```

For a closure that should deploy with git, set `'store_open' => false` in
`stores/<id>/config.php` instead.

## Deploy

```bash
# locally
git add -A && git commit -m "..." && git push

# server
cd ~/repos/nerd-store && git pull
composer install --no-dev              # only if composer.lock changed
```

No restart. PHP reads the files on the next request.

## Stripe

```bash
bin/store stripe           # key works, LIVE or test, tax setting, and a session builds for each store
```

Webhook health is in the Stripe dashboard under Developers, Webhooks:
recent deliveries should all be 200.

## Logs

```bash
sudo tail -f /var/log/php8.3-fpm.log                    # [checkout], [webhook], [stock], [mail]
tail -f /var/log/nginx/shop.i3x.dev.error.log
tail -f /var/log/nginx/shop.i3x.dev.access.log
sqlite3 data/store.sqlite 'select number, store, status, total_cents, email from orders order by id desc limit 10'
```

## Permissions

php-fpm (www-data) and you both write `data/`. If a checkout says
"readonly database", or `bin/store` says it cannot open `stock.lock`:

```bash
id -nG | grep -q www-data || { sudo usermod -aG www-data cesmii; newgrp www-data; }
sudo chown -R cesmii:www-data data && sudo chmod 2775 data
sudo chmod 664 data/store.sqlite data/stock.json data/stock.lock
sudo -u www-data test -w data/store.sqlite && echo "db ok"
sudo -u www-data php -r 'require "lib/boot.php"; stock_edit(fn(&$c) => null); echo "lock ok\n";'
```

`config.php` must be `cesmii:www-data 640`. 600 locks php-fpm out.

## Backup and restore

```bash
bin/backup.sh                                   # on demand; cron runs it nightly at 04:17
ls -lt ~/backups/nerd-store | head

# restore -- orders and stock are a matching pair
bin/store close
rm -f data/store.sqlite-wal data/store.sqlite-shm
gunzip -c ~/backups/nerd-store/store-<stamp>.db.gz  > data/store.sqlite
gunzip -c ~/backups/nerd-store/stock-<stamp>.json.gz > data/stock.json
sudo chown cesmii:www-data data/store.sqlite data/stock.json
chmod 664 data/store.sqlite data/stock.json
bin/store open
```

## Local

```bash
composer install
cp config.example.php config.php                # test keys, mail transport 'log'
php -S localhost:8000 -t stores/i3x/public
php -S localhost:8001 -t stores/webos/public
stripe listen --forward-to localhost:8000/webhook/stripe
```
