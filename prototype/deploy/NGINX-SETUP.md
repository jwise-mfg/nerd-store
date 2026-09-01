# Getting the two shops online (Cloudflare Origin Certificates)

Cloudflare terminates TLS for the public. Each origin presents a **Cloudflare
Origin Certificate**, which only Cloudflare trusts. No certbot, no renewal
cron, and the proxy stays on the whole way through — the origin IP is never
published, not even briefly.

It is also the better answer for keeping the two shops unlinked: origin
certificates are not publicly trusted, so **they never appear in Certificate
Transparency logs**. Public certs do, permanently and searchably.

> **Order matters.** The certificate files must exist *before* you install the
> nginx configs. They reference `/etc/ssl/cloudflare/...`, and if those files
> are missing `nginx -t` fails — which would take `api.i3x.dev`, `i3x.dev` and
> `explorer.i3x.dev` down on the next reload.

---

## 0. Check the services are up

```bash
systemctl is-active shop-i3x shop-webos
curl -sI http://127.0.0.1:4321/ | head -1     # expect 200
curl -sI http://127.0.0.1:4322/ | head -1     # expect 200
```

---

## 1. Generate one Origin Certificate per zone

The two hostnames live in different Cloudflare zones, so this is two separate
certificates by construction — exactly what you want.

In the Cloudflare dashboard, for the **i3x.dev** zone:
**SSL/TLS → Origin Server → Create Certificate**

- Private key type: RSA (2048)
- Hostnames: `shop.i3x.dev`
- Validity: 15 years

Copy both boxes it shows you. The **private key is displayed once** — if you
navigate away without copying it, revoke the cert and start over.

Repeat in the **webosarchive.org** zone for `shop.webosarchive.org`.

Then on the box:

```bash
sudo mkdir -p /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/shop.i3x.dev.pem      # paste the certificate
sudo nano /etc/ssl/cloudflare/shop.i3x.dev.key      # paste the private key
sudo nano /etc/ssl/cloudflare/shop.webosarchive.org.pem
sudo nano /etc/ssl/cloudflare/shop.webosarchive.org.key

sudo chmod 644 /etc/ssl/cloudflare/*.pem
sudo chmod 600 /etc/ssl/cloudflare/*.key
sudo chown root:root /etc/ssl/cloudflare/*
```

Check each pair actually matches before going further — a mismatched cert and
key is the most common cause of nginx refusing to start:

```bash
for d in shop.i3x.dev shop.webosarchive.org; do
  c=$(sudo openssl x509 -noout -modulus -in /etc/ssl/cloudflare/$d.pem | openssl md5)
  k=$(sudo openssl rsa  -noout -modulus -in /etc/ssl/cloudflare/$d.key | openssl md5)
  [ "$c" = "$k" ] && echo "$d: cert and key match" || echo "$d: MISMATCH"
  sudo openssl x509 -noout -subject -dates -in /etc/ssl/cloudflare/$d.pem
done
```

---

## 2. DNS — point both records at the box, proxy ON

For **both** `shop.i3x.dev` and `shop.webosarchive.org`:

| field | value |
|---|---|
| Type | `A` |
| Name | `shop` |
| Content | `172.200.176.166` |
| Proxy status | **Proxied (orange cloud)** — leave it on |

On `shop.i3x.dev`, **delete the redirect rule** currently sending it to
`https://i3x.dev`, or it will keep answering instead of your shop.

> `shop.webosarchive.org` is currently serving a live page. Repointing it
> replaces whatever that is.

Then **SSL/TLS → Overview → Full (strict)** for both zones. Strict works
because the origin now presents a certificate Cloudflare issued. Flexible
would mean Cloudflare talks to your box over plain HTTP — card-adjacent
traffic in the clear across the public internet.

---

## 3. Install the nginx configs

```bash
sudo cp ~/shop.i3x.dev.conf          /etc/nginx/sites-available/shop.i3x.dev
sudo cp ~/shop.webosarchive.org.conf /etc/nginx/sites-available/shop.webosarchive.org
sudo ln -s /etc/nginx/sites-available/shop.i3x.dev          /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/shop.webosarchive.org /etc/nginx/sites-enabled/

sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` must say **ok** before you reload. If it does not, remove the two
symlinks and nothing on the box is affected.

---

## 4. Verify

```bash
curl -sI https://shop.i3x.dev/          | head -1     # 200
curl -sI https://shop.webosarchive.org/ | head -1     # 200

# each shop serves only its own catalogue
curl -s https://shop.i3x.dev/          | grep -o '<title>[^<]*'
curl -s https://shop.webosarchive.org/ | grep -o '<title>[^<]*'

# 404 on the wrong store is correct
curl -sI https://shop.i3x.dev/shop/palm-pre-3          | head -1   # 404
curl -sI https://shop.webosarchive.org/shop/palm-pre-3 | head -1   # 200

# live stock endpoint
curl -s 'https://shop.webosarchive.org/api/availability?ids=x'     # []
```

Hitting the origin IP directly should give a **certificate warning**. That is
correct: the cert is trusted by Cloudflare, not by browsers, and Cloudflare is
the only client that should ever reach this box.

---

## 5. Optional: make the origin unreachable except via Cloudflare

Right now someone who learns the origin IP can still talk to nginx directly.
Two ways to close that, either is enough:

**Authenticated Origin Pulls** — nginx refuses any TLS connection not carrying
Cloudflare's client certificate:

```bash
sudo curl -o /etc/ssl/cloudflare/origin-pull-ca.pem \
  https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem
```

Enable **SSL/TLS → Origin Server → Authenticated Origin Pulls** in Cloudflare,
then uncomment the two `ssl_client_certificate` / `ssl_verify_client` lines in
both configs and reload.

**Or firewall it** — restrict :443 to Cloudflare's ranges in the Azure NSG.
Note this box also serves `api.i3x.dev`, `i3x.dev` and `explorer.i3x.dev`, so
check those are behind Cloudflare too before locking the port down.

---

## Before you take real money

`~/repos/nerd-store/config.json` still holds **placeholder Stripe keys**. The
catalogue and cart work; checkout does not. Put the real keys in, then:

```bash
sudo systemctl restart shop-i3x shop-webos
```

Register the webhook in Stripe — one endpoint covers both shops, because
events route on `metadata.tenant`, not on which host received them:

```
https://shop.i3x.dev/api/webhook/stripe
```

Events: `payment_intent.succeeded`, `payment_intent.payment_failed`,
`payment_intent.canceled`. Put the signing secret into `config.json` too.

In the Stripe dashboard: **Settings → Customer emails → "Successful payments"
must be OFF.** It is account-wide, and left on it emails every buyer of either
shop a receipt carrying one shared business name.

---

## If it goes wrong

```bash
sudo rm /etc/nginx/sites-enabled/shop.i3x.dev \
        /etc/nginx/sites-enabled/shop.webosarchive.org
sudo nginx -t && sudo systemctl reload nginx
```

Returns the box to exactly its current state. The shop services keep running
on 4321/4322, simply unreachable from outside.

**Cloudflare 521 / 522** — nginx isn't answering on 443, or the NSG is
blocking it. Check `sudo nginx -t` and `systemctl status nginx`.

**Cloudflare 526** — Full (strict) is on but the origin cert isn't valid for
that hostname. Re-run the match check in step 1; usually the cert and key are
from different generations.
