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

# 3. Configuration. Copy the example and fill it in — this is the only file
#    holding secrets. Both services read it; they share a Stripe account, so
#    two copies would just be two places to update the same key.
sudo cp /srv/nerd-store/config.example.json /etc/nerd-store/config.json
sudo nano /etc/nerd-store/config.json      # replace every REPLACE_ME
sudo chown root:nerdstore /etc/nerd-store/config.json
sudo chmod 640 /etc/nerd-store/config.json

#    Set storage.dataDir to the absolute production path:
#      "storage": { "dataDir": "/var/lib/nerd-store" }

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
cd /srv/nerd-store && sudo -u nerdstore git pull
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
sudo cat /etc/nerd-store/config.json       # the one file holding secrets
```

**Restore:** stop the service, `gunzip` the backup over the file, start it.
Each store restores independently — the other keeps trading.

```bash
sudo systemctl stop shop-webos
sudo -u nerdstore gunzip -c /var/backups/nerd-store/webos-<stamp>.db.gz \
  > /var/lib/nerd-store/webos.db
sudo systemctl start shop-webos
```
