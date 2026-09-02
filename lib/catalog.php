<?php
/**
 * Products are files. stores/<store>/products/<slug>/product.json, with the
 * images beside it, and the folder name is the slug. There is no build step
 * and no import: edit the file, reload the page.
 */
declare(strict_types=1);

/**
 * @param bool $all include draft and archived products (the CLI wants them,
 *                  the shop does not)
 */
function products(array $store, bool $all = false): array
{
    $out = [];
    foreach (glob($store['dir'] . '/products/*/product.json') ?: [] as $file) {
        $p = json_decode((string) file_get_contents($file), true);
        if (!is_array($p)) {
            throw new RuntimeException("malformed product file: $file");
        }
        $p['slug']     = basename(dirname($file));
        $p['status'] ??= 'active';
        $p['position'] = $p['position'] ?? 100;
        if (!$all && $p['status'] !== 'active') {
            continue;
        }
        $out[] = $p;
    }
    usort($out, fn($a, $b) => [$a['position'], $a['title']] <=> [$b['position'], $b['title']]);
    return $out;
}

function product(array $store, string $slug, bool $all = false): ?array
{
    // basename() so a slug out of the URL cannot walk up out of products/.
    $slug = basename($slug);
    foreach (products($store, $all) as $p) {
        if ($p['slug'] === $slug) {
            return $p;
        }
    }
    return null;
}

/** sku => ['product' => ..., 'variant' => ...] across the whole store. */
function sku_index(array $store, bool $all = false): array
{
    $ix = [];
    foreach (products($store, $all) as $p) {
        foreach ($p['variants'] ?? [] as $v) {
            $ix[$v['sku']] = ['product' => $p, 'variant' => $v];
        }
    }
    return $ix;
}

/**
 * The most of this product one order may contain. Absent means the ordinary
 * cap. Applies per variant: the two products carrying it have a single
 * variant each, and summing siblings would cost more than it is worth.
 */
function order_max(array $product): int
{
    return max(1, (int) ($product['orderMax'] ?? 99));
}

/**
 * What this product ships for at a given service level, or null to use the
 * store's own price.
 *
 *   "shippingCents": 400                        the cheapest service; dearer
 *                                               ones keep the store's premium
 *   "shippingCents": {"us_standard": 400}       exact, per rate code
 *
 * A number is the common case. The map is there for when a product's faster
 * option should not simply track the store's premium.
 */
function product_shipping(array $product, string $code, array $rates): ?int
{
    $v = $product['shippingCents'] ?? null;
    if ($v === null) {
        return null;
    }
    if (is_array($v)) {
        return isset($v[$code]) ? max(0, (int) $v[$code]) : null;
    }

    // A single number prices the cheapest service. Dearer ones keep the
    // premium the store charges for them -- otherwise overriding a product
    // would quietly offer Priority Mail at the price of Standard, which is
    // the faster service given away.
    $prices  = array_map(fn($r) => (int) $r['cents'], $rates);
    $base    = $prices ? min($prices) : 0;
    $thisOne = 0;
    foreach ($rates as $r) {
        if ($r['code'] === $code) {
            $thisOne = (int) $r['cents'];
        }
    }
    return max(0, (int) $v) + ($thisOne - $base);
}

/** The display name that goes on the invoice and the order row. */
function sku_title(array $product, array $variant): string
{
    return $product['title'] . ' — ' . $variant['title'];
}

/**
 * Images are served by nginx straight out of the product folder, aliased to
 * /img/. An absolute URL (the placeholder photography) passes through.
 */
function image_url(string $slug, string $file): string
{
    return str_starts_with($file, 'http') ? $file : '/img/' . rawurlencode($slug) . '/' . rawurlencode($file);
}

function first_image(array $product): ?array
{
    $img = $product['images'][0] ?? null;
    return $img ? ['url' => image_url($product['slug'], $img['file']), 'alt' => $img['alt'] ?? ''] : null;
}

/**
 * Descriptions are prose, stored as a string or as an array of lines. Blank
 * lines separate paragraphs. Deliberately not Markdown: none of the seven
 * product files uses any, and a Markdown parser is a dependency.
 */
function description_html(array $product): string
{
    $raw = $product['description'] ?? '';
    $text = is_array($raw) ? implode("\n", $raw) : (string) $raw;
    $html = '';
    foreach (preg_split('/\n\s*\n/', trim($text)) ?: [] as $para) {
        if (trim($para) !== '') {
            $html .= '<p>' . nl2br(e(trim($para))) . "</p>\n";
        }
    }
    return $html;
}
