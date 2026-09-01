<?php
/**
 * On-hand counts.
 *
 * Stock lives in the database rather than in product.json because the server
 * writes it on every sale, and product.json is tracked in git -- a server that
 * edits a tracked file gives you a working tree that refuses to fast-forward
 * on the next deploy.
 */
declare(strict_types=1);

/** sku => on_hand, optionally for one store. */
function stock_map(?string $store = null): array
{
    $sql = 'SELECT sku, on_hand FROM stock';
    $arg = [];
    if ($store !== null) {
        $sql .= ' WHERE store = ?';
        $arg[] = $store;
    }
    $st = db()->prepare($sql);
    $st->execute($arg);
    return array_column($st->fetchAll(), 'on_hand', 'sku');
}

function stock_of(string $sku): int
{
    $st = db()->prepare('SELECT on_hand FROM stock WHERE sku = ?');
    $st->execute([$sku]);
    return (int) ($st->fetchColumn() ?: 0);
}

function stock_set(string $sku, string $store, int $on_hand): void
{
    $st = db()->prepare(
        'INSERT INTO stock (sku, store, on_hand) VALUES (?, ?, ?)
         ON CONFLICT(sku) DO UPDATE SET on_hand = excluded.on_hand, store = excluded.store'
    );
    $st->execute([$sku, $store, max(0, $on_hand)]);
}

function stock_adjust(string $sku, string $store, int $delta): int
{
    stock_set($sku, $store, stock_of($sku) + $delta);
    return stock_of($sku);
}

/**
 * Decrement, but only if there is enough. One statement, so two webhooks
 * arriving together cannot both pass the check -- SQLite serialises the write
 * and the loser sees rowCount 0.
 */
function stock_take(string $sku, int $qty): bool
{
    $st = db()->prepare('UPDATE stock SET on_hand = on_hand - ? WHERE sku = ? AND on_hand >= ?');
    $st->execute([$qty, $sku, $qty]);
    return $st->rowCount() === 1;
}

/**
 * Give every SKU in the product files a stock row. New SKUs land at zero --
 * invisible in the shop until you set a number, which is the safe direction
 * for a file you just created.
 *
 * @return string[] the SKUs that were created
 */
function stock_sync(array $store): array
{
    $known = stock_map();
    $added = [];
    foreach (array_keys(sku_index($store, true)) as $sku) {
        if (!array_key_exists($sku, $known)) {
            stock_set($sku, $store['id'], 0);
            $added[] = $sku;
        }
    }
    return $added;
}
