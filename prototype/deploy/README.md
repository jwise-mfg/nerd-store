# Deploying to one VPS

Two systemd services behind nginx, two SQLite files, no database server.

## Provision once

```bash
# 1. Code, in the usual place
cd ~/repos && git clone https://github.com/jwise-mfg/nerd-store.git
cd nerd-store && npm ci

# 2. Backup directory
mkdir -p ~/backups/nerd-store

# 3. Configuration — the only file holding secrets. Both services read it;
#    they share a Stripe account, so two copies would just be two places to
#    update the same key.
cp config.example.json config.json
chmod 600 config.json
nano config.json          # replace every REPLACE_ME with a real Stripe key

# 4. Units and timers. /etc/systemd/system gets symlinks back into
#    deploy/systemd, so the units are version-controlled with everything
#    else and there is never a second copy to keep in step.
sudo ./deploy/install-units.sh
sudo systemctl start shop-i3x shop-webos
sudo systemctl start nerd-store-sweep.timer nerd-store-backup.timer

# sqlite3 CLI is what backup.sh uses for consistent snapshots
sudo apt-get install -y sqlite3

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
~/repos/nerd-store/scripts/deploy.sh
```

It pulls, rebuilds both storefronts, validates, migrates, restarts, and smoke
tests. Dependencies are only reinstalled when `package-lock.json` changes, so
a code-only deploy takes seconds rather than reinstalling ~350 packages.

`--no-pull` deploys what is already checked out.

If the pull changed anything under `deploy/systemd/`, it runs
`systemctl daemon-reload` before restarting and says which units moved.

Builds both storefronts, **refuses to continue if the validator finds a config
collision or one store's assets in the other's bundle**, migrates both
databases, restarts the two services independently, and smoke-tests each.

## Changing a unit file

Edit it in `deploy/systemd/`, commit, and deploy — the symlink means the
change is live on the box the moment the pull lands. Two things do *not*
follow automatically:

- **systemd caches unit contents.** A changed unit needs
  `sudo systemctl daemon-reload`, then a restart of anything affected.
  `deploy.sh` does both when the pull touches `deploy/systemd/`; if you edit
  a unit directly on the box, run them yourself.
- **Adding or removing a unit** changes the set of symlinks, so re-run
  `sudo ./deploy/install-units.sh`. It is safe to re-run at any time and
  starts nothing.

Two things to know about this arrangement:

- The units now live on `/home`. systemd reads them at boot, so if `/home`
  ever moves to a late-mounted or encrypted filesystem the services fail to
  start with no obvious cause. The app already runs from `~/repos`, so this
  changes nothing today.
- The unit files are writable by `cesmii` without sudo, and a unit is what
  decides which user a service runs as. On a box with one administrator who
  already has sudo that is not a new capability, but it does mean anything
  that can write the repository can change what runs as whom at the next
  reboot.

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
./storemgr inventory                        # stock and prices
./storemgr orders --status paid            # awaiting shipment
journalctl -u shop-i3x -f                  # logs
systemctl list-timers 'nerd-store-*'       # sweep + backup schedule
./scripts/backup.sh                        # backup on demand
ls -la ~/repos/nerd-store/data/            # i3x.db, webos.db
cat ~/repos/nerd-store/config.json         # the one file holding secrets
```

**Restore:** stop the service, `gunzip` the backup over the file, start it.
Each store restores independently — the other keeps trading.

```bash
sudo systemctl stop shop-webos
gunzip -c ~/backups/nerd-store/webos-<stamp>.db.gz > ~/repos/nerd-store/data/webos.db
sudo systemctl start shop-webos
```
