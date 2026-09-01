# Deploying to one VPS

nginx and PHP-FPM. Two vhosts, one SQLite file, no application server, **no
systemd units**, and one cron line.

## Provision once

```bash
# 1. Code
cd ~/repos && git clone https://github.com/jwise-mfg/nerd-store.git
cd nerd-store && composer install --no-dev

# 2. Runtime
sudo apt-get install -y php8.3-fpm php8.3-sqlite3 php8.3-curl php8.3-mbstring sqlite3

# 3. Secrets — the only file holding keys. One Stripe account serves both
#    shops, so there is one copy of this and not one per store.
cp config.example.php config.php
chmod 600 config.php
nano config.php            # replace every REPLACE_ME

# 4. Let the web server read the tree and write the database.
mkdir -p data
sudo chown -R cesmii:www-data data
sudo chmod 775 data

# 5. TLS — SEPARATE certificates, one per zone. Never one cert covering both
#    names: certificate transparency logs are public and permanent, and a
#    shared SAN list publishes the connection between the two shops forever.
#    See NGINX-SETUP.md.

# 6. nginx. Symlinked, so `git pull` updates them and there is no second copy.
sudo ln -s ~/repos/nerd-store/deploy/nginx/cloudflare-real-ip.conf /etc/nginx/conf.d/
sudo ln -s ~/repos/nerd-store/deploy/nginx/shop.i3x.dev.conf          /etc/nginx/sites-enabled/
sudo ln -s ~/repos/nerd-store/deploy/nginx/shop.webosarchive.org.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

#    Each vhost roots at stores/<id>/public. Two symlinks in there are part of
#    the checkout and come out of git already made:
#      img      -> ../products                  product photographs
#      base.css -> ../../../assets/base.css     the layout shared by both shops

# 7. Stock, and a check that every product file parses.
bin/store check
bin/store stock I3X-BOOK-HC 180        # ... and so on

# 8. Nightly backup — one line, no timer unit.
crontab -e
#   17 4 * * * /home/cesmii/repos/nerd-store/bin/backup.sh
```

`cloudflare-real-ip.conf` is separate on purpose: `real_ip_header` may appear
only once per context, so keeping it in both site files makes `nginx -t` fail
with "directive is duplicate" as soon as the second shop is enabled.

## Deploy a change

```bash
cd ~/repos/nerd-store && git pull
```

That is the whole deploy. PHP reads the files on the next request — there is
nothing to build, nothing to restart, and no downtime.

Two exceptions:

- **`composer.lock` changed** — run `composer install --no-dev`.
- **`opcache.validate_timestamps=0`** — if the box is tuned that way, PHP
  caches the compiled files and will not see the pull until
  `sudo systemctl reload php8.3-fpm`. Check with
  `php -i | grep validate_timestamps`; the default is 1, which needs nothing.

## Stripe

One account, so **one** webhook endpoint. Point it at either host — events are
routed by `session.metadata.store`, not by which host received them:

```
https://shop.i3x.dev/webhook/stripe
```

Subscribe to `checkout.session.completed`. Put the signing secret in
`config.php` as `stripe.webhook_secret`.

In **Settings → Customer emails**, turn **"Successful payments" ON**. Stripe
sends the payment receipt; this codebase only sends the shipping notice.
Both shops' receipts carry the account's business name, "JW LLC", which is
the accepted trade-off for not running our own card form.

## Operating

```bash
bin/store orders --status paid          # awaiting shipment
bin/store ship I3X-4KHTP4 --carrier USPS --tracking 9400...
bin/store stock                         # every SKU
bin/backup.sh                           # backup on demand
tail -f /var/log/nginx/shop.i3x.dev.error.log   # app errors land here
sqlite3 data/store.sqlite 'select * from orders order by id desc limit 5'
```

**Restore:** stop nothing. Copy the backup over the file and the next request
picks it up.

```bash
gunzip -c ~/backups/nerd-store/store-<stamp>.db.gz > ~/repos/nerd-store/data/store.sqlite
```

## Closing a shop

Set `'store_open' => false` in `stores/<id>/config.php`. It takes effect on the
next request, applies to that shop alone, and leaves order pages and policies
reachable so anyone who has already paid can still find their order.
