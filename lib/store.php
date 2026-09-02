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

/**
 * Is this shop refusing orders?
 *
 * Two ways, for two different jobs.
 *
 * `store_open => false` in the store's config is the declarative one: it is
 * in git, so it is reviewed and deployed like any other change. Right for
 * "we are shut until the new stock lands".
 *
 * A file in the data directory is the operational one, and the right answer
 * for the ten minutes you are moving a database around. data/closed shuts
 * both shops, data/closed-<id> shuts one. It is untracked, so flipping it on
 * the server leaves the working tree clean and the next `git pull` alone --
 * which editing a tracked config file does not.
 */
function store_closed(array $store): bool
{
    if (!($store['store_open'] ?? true)) {
        return true;
    }
    return is_file(data_dir() . '/closed')
        || is_file(data_dir() . '/closed-' . $store['id']);
}
