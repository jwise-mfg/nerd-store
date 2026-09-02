<?php
/**
 * Two plain-text emails and one push notification, sent with curl.
 *
 * Stripe sends the payment receipt itself, so nothing here runs on the happy
 * path of a sale except the note to the operator. There is no HTML part: a
 * receipt is a list of things and a total, and text renders everywhere.
 */
declare(strict_types=1);

const CARRIER_TRACKING = [
    'usps'  => 'https://tools.usps.com/go/TrackConfirmAction?tLabels=',
    'ups'   => 'https://www.ups.com/track?tracknum=',
    'fedex' => 'https://www.fedex.com/fedextrack/?trknbr=',
    'dhl'   => 'https://www.dhl.com/en/express/tracking.html?AWB=',
];

function tracking_url(?string $carrier, ?string $code): ?string
{
    if (!$carrier || !$code) {
        return null;
    }
    $key = strtolower(str_replace(' ', '', $carrier));
    return isset(CARRIER_TRACKING[$key]) ? CARRIER_TRACKING[$key] . rawurlencode($code) : null;
}

/**
 * @param array{to:string,subject:string,text:string,from:string,reply_to?:string} $msg
 */
function mail_send(array $msg): bool
{
    $cfg = secrets()['mail'] ?? [];
    $transport = $cfg['transport'] ?? 'log';

    if ($transport === 'log') {
        error_log("[mail:log] to={$msg['to']} subject={$msg['subject']}\n" . $msg['text']);
        return true;
    }

    if ($transport !== 'resend') {
        error_log("[mail] unknown transport: $transport");
        return false;
    }

    $body = array_filter([
        'from'     => $msg['from'],
        'to'       => [$msg['to']],
        'reply_to' => $msg['reply_to'] ?? null,
        'subject'  => $msg['subject'],
        'text'     => $msg['text'],
    ]);

    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . ($cfg['api_key'] ?? ''),
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_SLASHES),
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code < 200 || $code >= 300) {
        error_log("[mail] resend returned $code: " . substr((string) $res, 0, 300));
        return false;
    }
    return true;
}

function address_block(array $order): string
{
    $parts = array_filter([
        $order['ship_name'],
        $order['ship_line1'],
        $order['ship_line2'],
        trim(($order['ship_city'] ?? '') . ', ' . ($order['ship_state'] ?? '') . ' ' . ($order['ship_postal'] ?? '')),
        $order['ship_country'],
    ]);
    return implode("\n", array_map('trim', $parts));
}

function item_lines(array $items, bool $prices = true): string
{
    $out = '';
    foreach ($items as $i) {
        $line = sprintf('  %d x %s', $i['qty'], $i['title']);
        if (!empty($i['serial'])) {
            $line .= ' (S/N ' . $i['serial'] . ')';
        }
        if ($prices) {
            $line = str_pad($line, 52) . money($i['qty'] * $i['unit_cents']);
        }
        $out .= $line . "\n";
    }
    return $out;
}

/** To the buyer, from `bin/store ship`. */
function mail_shipped(array $store, array $order, array $items): bool
{
    if (empty($order['email'])) {
        return false;
    }
    $url  = tracking_url($order['carrier'], $order['tracking']);
    $text = "Your order is on its way.\n\n"
        . "Order {$order['number']}\n\n"
        . item_lines($items, false) . "\n"
        . ($order['tracking']
            ? "Carrier:  {$order['carrier']}\nTracking: {$order['tracking']}\n"
              . ($url ? "          $url\n" : '')
              . "\nTracking can take a few hours to show movement.\n"
            : "No tracking number is available for this shipment.\n")
        . "\nShipping to:\n" . address_block($order) . "\n\n"
        . "Questions: {$store['support_email']}\n\n"
        . "{$store['name']}\n{$store['postal_address']}\n";

    return mail_send([
        'from'    => $store['mail_from'],
        'to'      => $order['email'],
        'subject' => "{$store['name']} — order {$order['number']} has shipped",
        'text'    => $text,
    ]);
}

/** To the operator, on payment. Reply goes to the buyer. */
function mail_new_order(array $store, array $order, array $items, array $warnings = []): bool
{
    $to = secrets()['notify_email'] ?? null;
    if (!$to) {
        return false;
    }
    $text = ($warnings ? implode("\n", array_map(fn($w) => "!! $w", $warnings)) . "\n\n" : '')
        . "Order {$order['number']} — " . money((int) $order['total_cents']) . "\n\n"
        . item_lines($items) . "\n"
        . str_pad('  Subtotal', 52) . money((int) $order['subtotal_cents']) . "\n"
        . str_pad('  Shipping', 52) . money((int) $order['shipping_cents']) . "\n"
        . ((int) $order['tax_cents'] > 0
            ? str_pad('  Tax', 52) . money((int) $order['tax_cents']) . "\n" : '')
        . str_pad('  Total', 52) . money((int) $order['total_cents']) . "\n\n"
        . "Ship to:\n" . address_block($order) . "\n\n"
        . "Buyer: {$order['email']}\n\n"
        . "  bin/store ship {$order['number']} --carrier USPS --tracking ...\n";

    return mail_send([
        'from'     => $store['mail_from'],
        'reply_to' => $order['email'] ?: null,
        'to'       => $to,
        'subject'  => ($warnings ? '!! ' : '') . "{$store['name']} — order {$order['number']} — " . money((int) $order['total_cents']),
        'text'     => $text,
    ]);
}

/**
 * To the operator's phone, on payment. Pushover's API is form-encoded, not
 * JSON. Only what was configured is sent: Pushover applies its own defaults
 * for anything omitted, and an empty string is not the same as absent.
 */
function pushover_new_order(array $store, array $order, array $items, array $warnings = []): bool
{
    $cfg = secrets()['notify_pushover'] ?? null;
    if (!$cfg) {
        return false;
    }

    $sound = $cfg['sound'] ?? null;
    if (is_array($sound)) {
        // Per-store map. An unmapped store gets Pushover's default rather than
        // borrowing another store's sound, which would defeat setting them.
        $sound = $sound[$store['id']] ?? null;
    }

    $summary = implode(', ', array_map(fn($i) => "{$i['qty']}x {$i['title']}", $items));
    $body = array_filter([
        'token'     => $cfg['token'] ?? '',
        'user'      => $cfg['user'] ?? '',
        'title'     => ($warnings ? '!! ' : '') . "{$store['name']} — new order",
        'message'   => money((int) $order['total_cents']) . " — $summary"
            . ($warnings ? "\n\n" . implode("\n", array_map(fn($w) => "!! $w", $warnings)) : ''),
        'url'       => "{$store['origin']}/order/{$order['number']}",
        'url_title' => "Order {$order['number']}",
        'sound'     => $sound,
        'priority'  => $cfg['priority'] ?? null,
        'device'    => $cfg['device'] ?? null,
    ], fn($v) => $v !== null && $v !== '');

    $ch = curl_init('https://api.pushover.net/1/messages.json');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_POSTFIELDS     => http_build_query($body),
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code < 200 || $code >= 300) {
        error_log("[pushover] returned $code: " . substr((string) $res, 0, 300));
        return false;
    }
    return true;
}
