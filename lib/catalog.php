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
