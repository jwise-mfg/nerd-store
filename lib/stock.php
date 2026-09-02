<?php
/**
 * On-hand counts, in data/stock.json.
 *
 * A flat { "SKU": count } map, sorted, one line per SKU, so a diff of two
 * copies is readable and a merge is a text merge. It is not in git -- the
 * server writes it on every sale, and a server that writes tracked files
 * breaks the next pull.
 *
 * Orders stay in SQLite, where the UNIQUE constraint on the session id and
 * the webhook_events table stop a replayed webhook taking stock twice. That
 * argument never applied to seventeen numbers one person edits.
 */
declare(strict_types=1);

function stock_path(): string
{
    return data_dir() . '/stock.json';
}

/** Every count, SKU => on hand. Read fresh: the file is tiny and staleness costs more. */
function stock_all(): array
{
    if (!is_file(stock_path())) {
        stock_bootstrap();
    }
    $raw  = (string) @file_get_contents(stock_path());
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        // Refuse rather than silently treating everything as sold out, which
        // is what returning [] here would do.
        throw new RuntimeException('stock.json is not valid JSON: ' . stock_path());
    }
    return array_map('intval', $data);
}

/**
 * Replace the file atomically: write beside it, then rename. A reader can
 * only ever see the old file or the new one, never a half-written one.
 */
function stock_write(array $counts): void
{
    ksort($counts);
    $tmp = stock_path() . '.tmp';
    if (file_put_contents($tmp, json_encode($counts, JSON_PRETTY_PRINT) . "\n") === false) {
        throw new RuntimeException('could not write ' . $tmp);
    }
    @chmod($tmp, 0o664);
    if (!rename($tmp, stock_path())) {
        throw new RuntimeException('could not replace ' . stock_path());
    }
}

/**
 * Read, change and write the counts with nobody else in between.
 *
 * The lock is a separate file because stock.json is replaced by rename on
 * every write -- a lock held on it would be a lock on an inode that no longer
 * exists. $fn receives the counts by reference and may return a value.
 */
function stock_edit(callable $fn): mixed
{
    $dir = data_dir();
    if (!is_dir($dir)) {
        mkdir($dir, 0o775, true);
    }
    // Two identities take this lock: php-fpm as www-data on a sale, you as
    // yourself from bin/store. Whoever creates it must leave it group-writable
    // or the other is shut out -- and a webhook that cannot take the lock
    // records the order as paid without taking the stock.
    $path = $dir . '/stock.lock';
    $lock = @fopen($path, 'c');
    if ($lock === false) {
        throw new RuntimeException("stock: cannot open $path (is it group-writable? chmod 664 $path)");
    }
    @chmod($path, 0o664);
    if (!flock($lock, LOCK_EX)) {
        fclose($lock);
        throw new RuntimeException("stock: could not lock $path");
    }
    try {
        $counts = stock_all();
        $out    = $fn($counts);
        stock_write($counts);
        return $out;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

/** Counts for one store's declared SKUs, or everything when $store is null. */
function stock_map(?string $store = null): array
{
    $all = stock_all();
    return $store === null
        ? $all
        : array_intersect_key($all, sku_index(store_load($store), true));
}

function stock_of(string $sku): int
{
    return (int) (stock_all()[$sku] ?? 0);
}

function stock_set(string $sku, int $on_hand): void
{
    stock_edit(function (array &$c) use ($sku, $on_hand) {
        $c[$sku] = max(0, $on_hand);
    });
}

function stock_adjust(string $sku, int $delta): int
{
    return stock_edit(function (array &$c) use ($sku, $delta) {
        return $c[$sku] = max(0, ($c[$sku] ?? 0) + $delta);
    });
}

/**
 * Decrement, but only if there is enough. The check and the write happen
 * under one lock, so two webhooks arriving together cannot both pass it.
 */
function stock_take(string $sku, int $qty): bool
{
    return stock_edit(function (array &$c) use ($sku, $qty) {
        if (($c[$sku] ?? 0) < $qty) {
            return false;
        }
        $c[$sku] -= $qty;
        return true;
    });
}

/**
 * Give every SKU in the product files a count. New ones land at zero --
 * invisible in the shop until you set a number, which is the safe direction
 * for a file you just created.
 *
 * @return string[] the SKUs that were added
 */
function stock_sync(array $store): array
{
    return stock_edit(function (array &$c) use ($store) {
        $added = [];
        foreach (array_keys(sku_index($store, true)) as $sku) {
            if (!array_key_exists($sku, $c)) {
                $c[$sku] = 0;
                $added[] = $sku;
            }
        }
        return $added;
    });
}

/**
 * First run: create the file, carrying over the old `stock` table if this
 * database predates the move. The table is dropped only after the file is
 * safely written, so a failure here loses nothing.
 */
function stock_bootstrap(): void
{
    $counts = [];
    $had    = false;
    try {
        $pdo = db();
        if ($pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name='stock'")->fetchColumn()) {
            foreach ($pdo->query('SELECT sku, on_hand FROM stock') as $row) {
                $counts[$row['sku']] = (int) $row['on_hand'];
            }
            $had = true;
        }
    } catch (Throwable $e) {
        error_log('[stock] could not read the old stock table: ' . $e->getMessage());
    }

    stock_write($counts);

    if ($had) {
        error_log('[stock] migrated ' . count($counts) . ' counts from SQLite into ' . stock_path());
        // Tidying up, and nothing depends on it: the counts are already safely
        // in the file, and schema.sql no longer creates this table. Whoever
        // triggers the migration may not have write access to the database --
        // the shop runs as www-data, the CLI as you -- and a failure to drop a
        // table nobody reads must not take the shop down with it.
        try {
            db()->exec('DROP TABLE stock');
        } catch (Throwable $e) {
            error_log('[stock] the old stock table is still there, unused and harmless: '
                . $e->getMessage() . ' — drop it with: sqlite3 data/store.sqlite "DROP TABLE stock"');
        }
    }
}
