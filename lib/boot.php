<?php
/**
 * Everything the front controller and the CLI both need.
 *
 * There is no autoloader for our own code -- nine files that all get used on
 * every request do not benefit from being loaded lazily, and a plain list of
 * requires is easier to follow than a PSR-4 map.
 */
declare(strict_types=1);

function base_dir(): string
{
    return dirname(__DIR__);
}

/** Secrets from the gitignored config.php. Read once. */
function secrets(): array
{
    static $cfg = null;
    if ($cfg === null) {
        $path = base_dir() . '/config.php';
        if (!is_file($path)) {
            throw new RuntimeException('config.php is missing -- copy config.example.php to config.php');
        }
        $cfg = require $path;
    }
    return $cfg;
}

function data_dir(): string
{
    return secrets()['data_dir'] ?? base_dir() . '/data';
}

/**
 * The database, created and migrated on first touch. schema.sql is all
 * CREATE ... IF NOT EXISTS, so applying it every time costs a few
 * microseconds and removes the migration step entirely.
 */
function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    // Two identities write this database: php-fpm as www-data serving the
    // shop, and you as yourself running bin/store. This umask only affects the
    // directory below -- mkdir asks for 0775 and the default 022 would strip
    // the group write, leaving the web server unable to create the database.
    //
    // It does NOT govern the database file: SQLite opens that asking for 0644,
    // and a umask can only clear bits, never add them. What makes the file
    // group-writable is chmod, and -wal and -shm then inherit the mode from
    // the database file. See deploy/README.md.
    umask(0002);

    $dir = data_dir();
    if (!is_dir($dir)) {
        mkdir($dir, 0o775, true);
    }
    $pdo = new PDO('sqlite:' . $dir . '/store.sqlite', null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    // WAL so a reader never blocks the webhook writing an order; the timeout
    // covers the one case that still contends, two writes at the same instant.
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec(file_get_contents(base_dir() . '/schema.sql'));
    return $pdo;
}

/**
 * Dollars to cents. Accepts "24.00", "$1,299", 24, 24.5 -- product files are
 * hand-edited, so the forgiving version is the correct one.
 */
function to_cents(string|int|float $price): int
{
    $n = is_string($price) ? (float) str_replace(['$', ',', ' '], '', $price) : (float) $price;
    return (int) round($n * 100);
}

function money(int $cents): string
{
    return ($cents < 0 ? '-' : '') . '$' . number_format(abs($cents) / 100, 2);
}

require_once __DIR__ . '/store.php';
require_once __DIR__ . '/catalog.php';
require_once __DIR__ . '/stock.php';
require_once __DIR__ . '/cart.php';
require_once __DIR__ . '/orders.php';
require_once __DIR__ . '/mail.php';
require_once __DIR__ . '/render.php';

// stripe-php, the one Composer package. Loaded if present so that the CLI and
// the catalogue pages still work on a checkout without `composer install`.
if (is_file(base_dir() . '/vendor/autoload.php')) {
    require_once base_dir() . '/vendor/autoload.php';
}
require_once __DIR__ . '/checkout.php';
