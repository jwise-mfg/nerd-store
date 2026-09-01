<?php
/**
 * Loading a store's configuration and shipping rates.
 *
 * Which store a request belongs to is decided by which document root it
 * arrived in -- stores/<id>/public/index.php names it -- so there is no
 * hostname map to keep in step with nginx.
 */
declare(strict_types=1);

/** Every store id that has a folder, in a stable order. */
function store_ids(): array
{
    $ids = [];
    foreach (glob(base_dir() . '/stores/*/config.php') ?: [] as $f) {
        $ids[] = basename(dirname($f));
    }
    sort($ids);
    return $ids;
}

/** Load a store's config, with its id and directory filled in. */
function store_load(string $id): array
{
    if (!in_array($id, store_ids(), true)) {
        throw new InvalidArgumentException("unknown store: $id");
    }
    $dir = base_dir() . '/stores/' . $id;
    return ['id' => $id, 'dir' => $dir] + require $dir . '/config.php';
}

/** The shipping rate with this code, or null. */
function shipping_rate(array $store, string $code): ?array
{
    foreach ($store['shipping'] as $rate) {
        if ($rate['code'] === $code) {
            return $rate;
        }
    }
    return null;
}
