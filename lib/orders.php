<?php
declare(strict_types=1);

/**
 * 0/O, 1/I and 5/S are absent, so an order number read down a phone line has
 * no ambiguous characters in it.
 */
const ORDER_ALPHABET = '3479ACDEFHJKLMNPQRTVWXY';

/**
 * PREFIX-XXXXXX, random rather than sequential: two receipts with adjacent
 * numbers would tell a customer how much the shop sells.
 */
function order_number(string $prefix): string
{
    $n = strlen(ORDER_ALPHABET);
    $body = '';
    for ($i = 0; $i < 6; $i++) {
        // random_int, not modulo on a random byte -- 256 % 23 is not zero, so
        // the obvious version quietly favours the first nine letters.
        $body .= ORDER_ALPHABET[random_int(0, $n - 1)];
    }
    return $prefix . '-' . $body;
}

/**
 * Insert a pending order and its items. Returns the order id.
 *
 * Shipping is zero here on purpose: the buyer has not chosen a rate yet --
 * Stripe collects that on its own page, and the webhook writes the real
 * shipping and total back when the session completes.
 */
function order_create(array $store, string $number, array $lines, string $session_id): int
{
    $subtotal = cart_subtotal($lines);
    $shipping = 0;

    $db = db();
    $db->beginTransaction();
    try {
        $st = $db->prepare(
            'INSERT INTO orders (number, store, status, subtotal_cents, shipping_cents, total_cents, currency, stripe_session_id)
             VALUES (?, ?, \'pending\', ?, ?, ?, ?, ?)'
        );
        $st->execute([$number, $store['id'], $subtotal, $shipping, $subtotal + $shipping, $store['currency'], $session_id]);
        $id = (int) $db->lastInsertId();

        $item = $db->prepare(
            'INSERT INTO order_items (order_id, sku, title, serial, qty, unit_cents) VALUES (?, ?, ?, ?, ?, ?)'
        );
        foreach ($lines as $l) {
            $item->execute([$id, $l['sku'], $l['title'], $l['variant']['serial'] ?? null, $l['qty'], $l['unit_cents']]);
        }
        $db->commit();
        return $id;
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
}

function order_by_number(string $number): ?array
{
    $st = db()->prepare('SELECT * FROM orders WHERE number = ?');
    $st->execute([strtoupper(trim($number))]);
    return $st->fetch() ?: null;
}

function order_items(int $order_id): array
{
    $st = db()->prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id');
    $st->execute([$order_id]);
    return $st->fetchAll();
}

function orders_list(?string $status = null, ?string $store = null, int $limit = 50): array
{
    $sql  = 'SELECT * FROM orders WHERE 1 = 1';
    $args = [];
    if ($status !== null) {
        $sql .= ' AND status = ?';
        $args[] = $status;
    }
    if ($store !== null) {
        $sql .= ' AND store = ?';
        $args[] = $store;
    }
    $sql .= ' ORDER BY created_at DESC, id DESC LIMIT ' . max(1, $limit);
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st->fetchAll();
}

/**
 * pending -> paid, once. The status is in the WHERE clause, so a redelivered
 * event finds no row to update and the caller knows not to decrement stock a
 * second time.
 *
 * @return array|null the order as it now stands, or null if it was not pending
 */
function order_mark_paid(string $session_id, array $f): ?array
{
    $st = db()->prepare(
        'UPDATE orders SET status = \'paid\', paid_at = unixepoch(),
                email = ?, stripe_payment_intent = ?,
                ship_name = ?, ship_line1 = ?, ship_line2 = ?, ship_city = ?,
                ship_state = ?, ship_postal = ?, ship_country = ?,
                shipping_cents = ?, tax_cents = ?, total_cents = ?
         WHERE stripe_session_id = ? AND status = \'pending\''
    );
    $st->execute([
        $f['email'] ?? null, $f['payment_intent'] ?? null,
        $f['name'] ?? null, $f['line1'] ?? null, $f['line2'] ?? null, $f['city'] ?? null,
        $f['state'] ?? null, $f['postal'] ?? null, $f['country'] ?? null,
        (int) ($f['shipping_cents'] ?? 0), (int) ($f['tax_cents'] ?? 0), (int) ($f['total_cents'] ?? 0),
        $session_id,
    ]);
    if ($st->rowCount() !== 1) {
        return null;
    }
    $q = db()->prepare('SELECT * FROM orders WHERE stripe_session_id = ?');
    $q->execute([$session_id]);
    return $q->fetch() ?: null;
}

function order_mark_shipped(string $number, string $carrier, ?string $tracking): bool
{
    $st = db()->prepare(
        'UPDATE orders SET status = \'shipped\', shipped_at = unixepoch(), carrier = ?, tracking = ?
         WHERE number = ? AND status = \'paid\''
    );
    $st->execute([$carrier, $tracking, strtoupper(trim($number))]);
    return $st->rowCount() === 1;
}

/**
 * Record a Stripe event id. True means we have handled it before, which is
 * how at-least-once delivery becomes exactly-once.
 */
function event_seen(string $id, string $type): bool
{
    $st = db()->prepare('INSERT OR IGNORE INTO webhook_events (id, type) VALUES (?, ?)');
    $st->execute([$id, $type]);
    return $st->rowCount() === 0;
}
