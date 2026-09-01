<?php
/**
 * The cart is a PHP session: sku => qty, and nothing else.
 *
 * Prices are not snapshotted here. The only moment a price matters is when
 * the Checkout Session is created, and that reads the product file directly,
 * so there is no window in which the cart can disagree with the shop.
 */
declare(strict_types=1);

function cart_start(array $store): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    // A distinct cookie name per store. Shared, one store's cart would follow
    // a visitor to the other.
    session_name($store['cart_cookie']);
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        // Stripe returns the buyer by redirect, so Lax is enough; Strict would
        // drop the cookie on the way back and empty the cart after payment.
        'secure'   => ($_SERVER['HTTPS'] ?? '') !== '' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https',
    ]);
    session_start();
}

function cart_raw(): array
{
    return $_SESSION['cart'] ?? [];
}

function cart_set(string $sku, int $qty): void
{
    $cart = cart_raw();
    if ($qty > 0) {
        $cart[$sku] = min($qty, 99);
    } else {
        unset($cart[$sku]);
    }
    $_SESSION['cart'] = $cart;
}

function cart_clear(): void
{
    $_SESSION['cart'] = [];
}

function cart_count(): int
{
    return array_sum(cart_raw());
}

/**
 * Resolve the cart against the product files and the stock table.
 *
 * A line whose SKU no longer exists is dropped -- the product file was
 * deleted while it sat in someone's session. A line that exceeds stock, or
 * the product's own orderMax, is capped and flagged, so the cart page can say
 * so rather than the checkout failing later.
 */
function cart_lines(array $store): array
{
    $ix    = sku_index($store);
    $stock = stock_map($store['id']);
    $lines = [];
    foreach (cart_raw() as $sku => $qty) {
        if (!isset($ix[$sku])) {
            continue;
        }
        $p        = $ix[$sku]['product'];
        $v        = $ix[$sku]['variant'];
        $on_hand  = (int) ($stock[$sku] ?? 0);
        $limit    = order_max($p);
        $allowed  = min($on_hand, $limit);
        $capped   = min((int) $qty, $allowed);
        $unit     = to_cents($v['price']);
        $lines[] = [
            'sku'        => $sku,
            'product'    => $p,
            'variant'    => $v,
            'title'      => sku_title($p, $v),
            'qty'        => $capped,
            'wanted'     => (int) $qty,
            'short'      => $capped < (int) $qty,
            // Which ceiling was hit, so the cart can say the right thing.
            'reason'     => $capped < (int) $qty ? ($limit <= $on_hand ? 'limit' : 'stock') : null,
            'allowed'    => $allowed,
            'limit'      => $limit,
            'on_hand'    => $on_hand,
            'unit_cents' => $unit,
            'line_cents' => $unit * $capped,
        ];
    }
    return $lines;
}

function cart_subtotal(array $lines): int
{
    return array_sum(array_column($lines, 'line_cents'));
}
