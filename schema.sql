-- One database, both stores. The `store` column keeps rows self-describing;
-- separate files would only mean two backups and two of every query.

CREATE TABLE IF NOT EXISTS orders (
  id                    INTEGER PRIMARY KEY,
  number                TEXT    NOT NULL UNIQUE,
  store                 TEXT    NOT NULL,
  status                TEXT    NOT NULL DEFAULT 'pending',   -- pending | paid | shipped
  email                 TEXT,
  ship_name             TEXT,
  ship_line1            TEXT,
  ship_line2            TEXT,
  ship_city             TEXT,
  ship_state            TEXT,
  ship_postal           TEXT,
  ship_country          TEXT,
  subtotal_cents        INTEGER NOT NULL DEFAULT 0,
  shipping_cents        INTEGER NOT NULL DEFAULT 0,
  -- What Stripe Tax calculated and collected. Our own copy: Stripe's reports
  -- are what you file from, this is so an order reconciles on its own.
  tax_cents             INTEGER NOT NULL DEFAULT 0,
  total_cents           INTEGER NOT NULL DEFAULT 0,
  currency              TEXT    NOT NULL DEFAULT 'usd',
  -- UNIQUE so a replayed Checkout Session can never open a second order.
  stripe_session_id     TEXT    UNIQUE,
  stripe_payment_intent TEXT,
  carrier               TEXT,
  tracking              TEXT,
  created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  paid_at               INTEGER,
  shipped_at            INTEGER
);
CREATE INDEX IF NOT EXISTS orders_store_status ON orders (store, status);

-- Titles and prices are copied in, not joined: an order must still read
-- correctly after the product file it came from is edited or deleted.
CREATE TABLE IF NOT EXISTS order_items (
  id         INTEGER PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku        TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  serial     TEXT,
  qty        INTEGER NOT NULL,
  unit_cents INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS order_items_order ON order_items (order_id);

-- Stock is the one mutable thing about a product, so it lives here rather
-- than in the tracked product.json files -- the server writing to a tracked
-- file is what makes the next `git pull` refuse to fast-forward.
CREATE TABLE IF NOT EXISTS stock (
  sku     TEXT PRIMARY KEY,
  store   TEXT    NOT NULL,
  on_hand INTEGER NOT NULL DEFAULT 0
);

-- Stripe delivers at least once. This makes it exactly once.
CREATE TABLE IF NOT EXISTS webhook_events (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  received_at INTEGER NOT NULL DEFAULT (unixepoch())
);
