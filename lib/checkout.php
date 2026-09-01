<?php
/**
 * Stripe Checkout, hosted.
 *
 * The buyer is redirected to Stripe, which collects the card, the email and
 * the shipping address, picks a shipping rate, and sends the receipt. Nothing
 * on this side touches card data and there is no client-side JavaScript.
 */
declare(strict_types=1);

function stripe_client(): \Stripe\StripeClient
{
    if (!class_exists(\Stripe\StripeClient::class)) {
        throw new RuntimeException('stripe-php is not installed — run: composer install');
    }
    return new \Stripe\StripeClient(secrets()['stripe']['secret_key']);
}

/** Create the Checkout Session a cart redirects to. */
function checkout_session(array $store, array $lines, string $number): \Stripe\Checkout\Session
{
    $items = [];
    foreach ($lines as $l) {
        $items[] = [
            'quantity'   => $l['qty'],
            'price_data' => [
                'currency'     => $store['currency'],
                'unit_amount'  => $l['unit_cents'],
                'product_data' => array_filter([
                    'name'        => $l['title'],
                    'description' => !empty($l['variant']['serial']) ? 'Serial ' . $l['variant']['serial'] : null,
                ]),
            ],
        ];
    }

    $shipping = [];
    foreach ($store['shipping'] as $r) {
        $shipping[] = ['shipping_rate_data' => [
            'type'         => 'fixed_amount',
            'fixed_amount' => ['amount' => $r['cents'], 'currency' => $store['currency']],
            'display_name' => $r['label'] . ' — ' . $r['estimate'],
        ]];
    }

    return stripe_client()->checkout->sessions->create([
        'mode'                        => 'payment',
        'line_items'                  => $items,
        'shipping_options'            => $shipping,
        'shipping_address_collection' => ['allowed_countries' => ['US']],
        'success_url'                 => $store['origin'] . '/order/' . $number,
        'cancel_url'                  => $store['origin'] . '/cart',
        'client_reference_id'         => $number,
        // The webhook reads the store from here, not from the Host header:
        // one Stripe account is one event stream, and both stores' events
        // arrive at whichever endpoint is registered.
        'metadata'                    => ['store' => $store['id'], 'order_number' => $number],
        'payment_intent_data'         => [
            'description'                 => $store['name'] . ' order ' . $number,
            'statement_descriptor_suffix' => $store['statement_suffix'],
            'metadata'                    => ['store' => $store['id'], 'order_number' => $number],
        ],
    ], [
        // A double-clicked checkout button reuses the session rather than
        // opening a second one against the same order number.
        'idempotency_key' => 'cs:' . $store['id'] . ':' . $number,
    ]);
}

/**
 * Handle one webhook delivery.
 *
 * @return array{0:int,1:string} HTTP status and a line for the log
 */
function webhook_handle(string $payload, string $signature): array
{
    try {
        $event = \Stripe\Webhook::constructEvent($payload, $signature, secrets()['stripe']['webhook_secret']);
    } catch (\UnexpectedValueException | \Stripe\Exception\SignatureVerificationException $e) {
        return [400, 'signature rejected: ' . $e->getMessage()];
    }

    // Recorded before anything is acted on, so a redelivery stops here.
    if (event_seen($event->id, $event->type)) {
        return [200, "duplicate {$event->id}"];
    }

    if ($event->type !== 'checkout.session.completed') {
        return [200, "ignored {$event->type}"];
    }

    $s       = $event->data->object;
    $storeId = $s->metadata->store ?? null;
    if (!$storeId || !in_array($storeId, store_ids(), true)) {
        return [200, "no such store in metadata: " . var_export($storeId, true)];
    }
    if (($s->payment_status ?? '') !== 'paid') {
        return [200, "session {$s->id} not paid ({$s->payment_status})"];
    }

    $store = store_load($storeId);
    // Stripe moved shipping onto collected_information; accept either shape so
    // an API-version bump in the dashboard cannot silently drop the address.
    $ship = $s->collected_information->shipping_details ?? $s->shipping_details ?? null;
    $addr = $ship->address ?? null;

    $order = order_mark_paid($s->id, [
        'email'          => $s->customer_details->email ?? null,
        'payment_intent' => is_string($s->payment_intent ?? null) ? $s->payment_intent : ($s->payment_intent->id ?? null),
        'name'           => $ship->name ?? ($s->customer_details->name ?? null),
        'line1'          => $addr->line1 ?? null,
        'line2'          => $addr->line2 ?? null,
        'city'           => $addr->city ?? null,
        'state'          => $addr->state ?? null,
        'postal'         => $addr->postal_code ?? null,
        'country'        => $addr->country ?? null,
        'shipping_cents' => (int) ($s->total_details->amount_shipping ?? 0),
        'total_cents'    => (int) ($s->amount_total ?? 0),
    ]);

    if ($order === null) {
        return [200, "session {$s->id} was not pending"];
    }

    // Only reached on the pending -> paid transition, so stock comes off once.
    $items = order_items((int) $order['id']);
    foreach ($items as $i) {
        if (!stock_take($i['sku'], (int) $i['qty'])) {
            error_log("[webhook] oversold {$i['sku']} on order {$order['number']} — refund and restock");
        }
    }

    // Neither of these may fail the webhook: a 500 would earn a retry that
    // short-circuits on the event id, losing the mail and keeping the order.
    try {
        mail_new_order($store, $order, $items);
    } catch (Throwable $e) {
        error_log('[webhook] operator notice failed: ' . $e->getMessage());
    }

    return [200, "paid {$order['number']}"];
}
