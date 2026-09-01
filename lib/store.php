<?php
/**
 * Which store is this request for?
 *
 * The hostname decides. Both stores are one codebase and one database, but
 * they are different shops to their visitors, and the Host header is the only
 * thing that distinguishes them -- never a path prefix, which would put both
 * on one domain.
 */
declare(strict_types=1);

const STORE_HOSTS = [
    'shop.i3x.dev'          => 'i3x',
    'shop.webosarchive.org' => 'webos',
];

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

/**
 * Host to store id. Falls back to the STORE environment variable so the
 * built-in server works without editing /etc/hosts:
 *
 *     STORE=i3x php -S localhost:8000 -t public/
 *
 * That is a development affordance. In production nginx only ever passes the
 * two real hostnames, and an unknown host gets no store at all.
 */
function store_for_host(?string $host): ?string
{
    $host = strtolower(preg_replace('/:\d+$/', '', trim((string) $host)));
    if (isset(STORE_HOSTS[$host])) {
        return STORE_HOSTS[$host];
    }
    $env = getenv('STORE') ?: null;
    return ($env && in_array($env, store_ids(), true)) ? $env : null;
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
