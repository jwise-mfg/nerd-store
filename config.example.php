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

    'data_dir' => __DIR__ . '/data',
];
