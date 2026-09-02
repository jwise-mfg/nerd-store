<?php
/**
 * Secrets. Copy to config.php -- which is gitignored -- and fill in.
 *
 *     cp config.example.php config.php && chmod 600 config.php
 *
 * One Stripe account serves both stores, so there is one set of keys here
 * rather than a copy in each store folder. Everything that legitimately
 * differs per store is in stores/<id>/config.php, which is tracked.
 */
return [
    'stripe' => [
        'secret_key'     => 'REPLACE_ME',   // sk_live_... or sk_test_...
        'webhook_secret' => 'REPLACE_ME',   // whsec_...

        // Stripe Tax. Leave false until you have registered with your state
        // AND filled in the origin address under Tax settings in the
        // dashboard -- with it on and that missing, Stripe rejects the
        // Checkout Session and nobody can buy anything.
        'automatic_tax'  => false,
    ],

    'mail' => [
        // 'log'    -- render to the error log and send nothing (the default)
        // 'resend' -- POST to api.resend.com with the key below
        'transport' => 'log',
        'api_key'   => 'REPLACE_ME',        // re_...
    ],

    // Where the "you have an order" email goes. Null disables it.
    'notify_email' => null,

    // Push notification on every paid order. Null disables it.
    // https://pushover.net -- create an application to get a token; the user
    // key is on your dashboard.
    //
    // 'sound' takes a built-in name or a custom sound uploaded to your
    // application, either one name for every store or one per store, so you
    // know which shop sold without looking. Omit it for Pushover's default.
    // 'priority': -2 quiet, 0 normal, 1 high, 2 needs acknowledgement.
    // 'device': limit to one device by name; omit to reach all of them.
    'notify_pushover' => null,
    // 'notify_pushover' => [
    //     'token' => 'REPLACE_ME',
    //     'user'  => 'REPLACE_ME',
    //     'sound' => ['i3x' => 'cashregister', 'webos' => 'webos-notify'],
    // ],

    'data_dir' => __DIR__ . '/data',
];
