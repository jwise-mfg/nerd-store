# Deploying to one VPS

Two systemd services behind nginx, two SQLite files, no database server.

## Provision once

```bash
# 1. User and directories
sudo useradd --system --home /srv/nerd-store --shell /usr/sbin/nologin nerdstore
sudo mkdir -p /srv/nerd-store /var/lib/nerd-store /var/backups/nerd-store /etc/nerd-store
sudo chown -R nerdstore:nerdstore /srv/nerd-store /var/lib/nerd-store /var/backups/nerd-store

# 2. Code
sudo -u nerdstore git clone <your-repo> /srv/nerd-store

# 3. Secrets — root-owned, 600. One file per store, so compromising one
#    service's environment does not hand over the other's keys.
#    These mirror .env.example; replace every stub.
sudo tee /etc/nerd-store/i3x.env >/dev/null <<'ENV'
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
MAIL_WEBHOOK_URL=https://...
ENV
sudo cp /etc/nerd-store/i3x.env /etc/nerd-store/webos.env   # then edit if they differ
sudo chmod 600 /etc/nerd-store/*.env

# 4. Units and timers
sudo cp deploy/systemd/*.service deploy/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now shop-i3x shop-webos
sudo systemctl enable --now nerd-store-sweep.timer nerd-store-backup.timer

# 5. TLS — SEPARATE certificates. Never one cert covering both names:
#    certificate transparency logs are public and permanent, and a shared SAN
#    list publishes the connection between the two stores forever.
sudo certbot certonly --webroot -w /var/www/certbot -d shop.i3x.dev
sudo certbot certonly --webroot -w /var/www/certbot -d shop.webosarchive.org

# 6. nginx
sudo cp deploy/nginx/*.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/shop.i3x.dev.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/shop.webosarchive.org.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Deploy a change

```bash
sudo -u nerdstore /srv/nerd-store/scripts/deploy.sh
```

Builds both storefronts, **refuses to continue if the validator finds a config
collision or one store's assets in the other's bundle**, migrates both
databases, restarts the two services independently, and smoke-tests each.

## Stripe webhook

One account means one webhook stream. Point it at either store — events are
routed by `metadata.tenant`, not by which host received them:

```
https://shop.i3x.dev/api/webhook/stripe
```

Subscribe to `payment_intent.succeeded`, `payment_intent.payment_failed`,
`payment_intent.canceled`.

## Operating

```bash
journalctl -u shop-i3x -f                  # logs
systemctl list-timers 'nerd-store-*'       # sweep + backup schedule
sudo -u nerdstore ./scripts/backup.sh      # backup on demand
ls -la /var/lib/nerd-store/                # i3x.db, webos.db
```

**Restore:** stop the service, `gunzip` the backup over the file, start it.
Each store restores independently — the other keeps trading.

```bash
sudo systemctl stop shop-webos
sudo -u nerdstore gunzip -c /var/backups/nerd-store/webos-<stamp>.db.gz \
  > /var/lib/nerd-store/webos.db
sudo systemctl start shop-webos
```
