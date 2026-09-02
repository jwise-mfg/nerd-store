<?php
/**
 * The whole storefront.
 *
 * Each store has its own document root -- stores/<id>/public -- holding its
 * stylesheet, brand images and product photographs as ordinary files, plus a
 * two-line index.php that names the store and requires this. So nginx serves
 * every asset directly and PHP only ever sees actual pages.
 */
declare(strict_types=1);

require __DIR__ . '/boot.php';

$path   = rtrim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/', '/') ?: '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/** @var string $STORE_ID set by the store's public/index.php */
$store = store_load($STORE_ID);

/* --- Stripe webhook -------------------------------------------------------
   Before the session and before the closed-shop gate: a payment captured a
   moment before the shop closed still has to be recorded. */
if ($path === '/webhook/stripe') {
    if ($method !== 'POST') {
        http_response_code(405);
        exit;
    }
    [$code, $note] = webhook_handle(
        file_get_contents('php://input') ?: '',
        $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? ''
    );
    error_log("[webhook] $note");
    http_response_code($code);
    header('Content-Type: text/plain');
    exit($note . "\n");
}

cart_start($store);

// A closed shop still shows order status and policies -- someone who has
// already paid should not hit a maintenance notice looking for their order.
$exempt = str_starts_with($path, '/order/') || str_starts_with($path, '/policies/');
if (!$store['store_open'] && !$exempt) {
    header('Retry-After: 3600');
    respond($store, 'Closed for maintenance', view('closed', ['store' => $store]), 503);
}

/* --- routes --------------------------------------------------------------- */

if ($path === '/') {
    $items = products($store);
    if ($kind = $_GET['kind'] ?? null) {
        $items = array_values(array_filter($items, fn($p) => ($p['kind'] ?? '') === $kind));
    }
    respond($store, $store['title_tagline'] ?? $store['copy']['tagline'], view('home', [
        'store' => $store,
        'items' => $items,
        'stock' => stock_map($store['id']),
    ]));
}

// The catalogue is the home page -- at this size a separate /shop listed the
// same handful of products under a different heading. Kept as a redirect
// because the old storefront had this URL and things link to it.
if ($path === '/shop') {
    $q = $_SERVER['QUERY_STRING'] ?? '';
    redirect('/' . ($q !== '' ? '?' . $q : ''), 301);
}

if (preg_match('#^/shop/([A-Za-z0-9._-]+)$#', $path, $m)) {
    $p = product($store, $m[1]);
    if (!$p) {
        not_found($store);
    }
    respond($store, $p['title'], view('product', [
        'store' => $store,
        'p'     => $p,
        'stock' => stock_map($store['id']),
    ]));
}

if ($path === '/cart') {
    $notice = null;
    if ($method === 'POST') {
        $sku = (string) ($_POST['sku'] ?? '');
        $qty = max(0, min(99, (int) ($_POST['qty'] ?? 0)));
        $ix  = sku_index($store);
        if (isset($ix[$sku])) {
            $have    = stock_of($sku);
            $limit   = order_max($ix[$sku]['product']);
            $allowed = min($have, $limit);
            if (($_POST['action'] ?? '') === 'add') {
                $qty = (cart_raw()[$sku] ?? 0) + max(1, $qty);
            }
            if ($qty > $allowed) {
                $qty = $allowed;
                if ($allowed === 0) {
                    $notice = 'That item just sold out.';
                } elseif ($limit <= $have) {
                    $notice = 'You can order at most ' . $limit . ' of that item.';
                } else {
                    $notice = 'Only ' . $have . ' of that item ' . ($have === 1 ? 'is' : 'are') . ' in stock.';
                }
            }
            cart_set($sku, $qty);
        }
        // POST/redirect/GET, so a refresh does not re-add the item.
        if ($notice === null) {
            redirect('/cart');
        }
    }
    $lines = cart_lines($store);
    respond($store, $store['copy']['cart_title'], view('cart', [
        'store'    => $store,
        'lines'    => $lines,
        'subtotal' => cart_subtotal($lines),
        'notice'   => $notice,
    ]));
}

if ($path === '/checkout') {
    if ($method !== 'POST') {
        redirect('/cart');
    }
    $lines = array_values(array_filter(cart_lines($store), fn($l) => $l['qty'] > 0));
    if (!$lines) {
        redirect('/cart');
    }

    $number = order_number($store['order_prefix']);
    try {
        $session = checkout_session($store, $lines, $number);
    } catch (Throwable $e) {
        // The class matters as much as the message: an AuthenticationException
        // is a wrong key, an InvalidRequestException is a malformed session,
        // and a bare RuntimeException is usually a missing `composer install`.
        error_log(sprintf('[checkout] %s: %s', get_class($e), $e->getMessage()));
        // NOT the maintenance page. The shop is open; the payment processor
        // could not be reached, and telling a buyer the shop is closed sends
        // them away instead of back to a cart that is still intact.
        header('Retry-After: 300');
        respond($store, 'Checkout unavailable', view('checkout-error', ['store' => $store]), 503);
    }

    // Written before the redirect so /order/<number> resolves the moment
    // Stripe sends the buyer back, webhook or no webhook.
    order_create($store, $number, $lines, $session->id);
    cart_clear();
    redirect($session->url);
}

if (preg_match('#^/order/([A-Za-z0-9-]+)$#', $path, $m)) {
    $order = order_by_number($m[1]);
    if (!$order || $order['store'] !== $store['id']) {
        not_found($store);
    }
    // Order pages are per-buyer and change state; never let a cache hold one.
    header('Cache-Control: no-store');
    respond($store, 'Order ' . $order['number'], view('order', [
        'store' => $store,
        'order' => $order,
        'items' => order_items((int) $order['id']),
    ]));
}

if (preg_match('#^/policies/(returns|privacy)$#', $path, $m)) {
    respond($store, ucfirst($m[1]), view('policies', ['store' => $store, 'doc' => $m[1]]));
}

not_found($store);
