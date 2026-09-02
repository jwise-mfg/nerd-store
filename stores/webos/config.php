<?php
/**
 * shop.webosarchive.org
 *
 * Dark ground with lavender as the accent, set in Verdana with Prelude for
 * display -- the webOS system faces. No Google Fonts request: the typefaces
 * are local or substituted, and a font request would be an outbound call this
 * store does not need to make.
 *
 * No secrets here -- this file is tracked.
 */
return [
    'name'             => 'webOS Archive Shop',
    'origin'           => 'https://shop.webosarchive.org',
    'currency'         => 'usd',
    'order_prefix'     => 'WOA',
    'statement_suffix' => 'WEBOS SHOP',
    'cart_cookie'      => 'woa_cart',

    // Shut until the listings carry photographs of the actual units and
    // data/stock.json has counts for the current SKUs. Order pages and
    // policies stay reachable; the catalogue, cart and checkout return 503.
    'store_open'       => false,

    'support_email'    => 'shop@webosarchive.org',
    'mail_from'        => 'webOS Archive Shop <shop@webosarchive.org>',
    'postal_address'   => 'JW LLC — 5387 Avion Park Dr., Highland Heights, OH 44143',

    // The <title> tag on the home page — see the note in the i3x config.
    'title_tagline'    => 'Keeping webOS alive.',

    'font_href'        => null,
    'analytics_domain' => 'shop.webosarchive.org',
    // No third-party scripts on this store.
    'body_end_html'    => null,

    // Most listings are a single graded unit, so "last one" should appear
    // later here than on the merchandise store.
    'scarcity_threshold'    => 2,
    // Used hardware: grade, serial and condition notes belong on the page.
    'show_condition_detail' => true,

    // No brand assets exist yet; the layout falls back to the store name.
    'brand' => [
        'wordmark'         => null,
        'favicon'          => null,
        'apple_touch_icon' => null,
        'social_image'     => null,
    ],

    'shipping' => [
        ['code' => 'us_ground',    'label' => 'Ground (tracked)', 'cents' => 1100, 'estimate' => '7-10 business days'],
        ['code' => 'us_expedited', 'label' => 'Expedited',        'cents' => 2200, 'estimate' => '5-7 business days'],
    ],

    'nav' => [
        ['label' => 'Shop',             'href' => '/'],
        ['label' => 'Devices',          'href' => '/?kind=device'],
        ['label' => 'Accessories',      'href' => '/?kind=accessory'],
        ['label' => 'webosarchive.org', 'href' => 'https://www.webosarchive.org'],
    ],

    'copy' => [
        'tagline'               => 'Keeping webOS alive.',
        'hero_title'            => 'New old stock, still sealed.',
        'hero_body'             => 'Touchstone chargers, cases, styluses, and cables that never left the warehouse — plus tested, graded TouchPads, Pres, and Pixis for people still running the best mobile OS nobody bought.',
        'hero_cta'              => 'See what’s in stock',
        'catalog_title'         => 'In stock now',
        'catalog_empty'         => 'Everything’s spoken for right now. Check back — stock moves in batches.',
        'cart_title'            => 'Your cart',
        'cart_empty'            => 'Nothing in your cart yet.',
        'checkout_title'        => 'Checkout',
        'shipping_restriction'  => 'We ship within the United States only.',
        'checkout_reassurance'  => 'Payment is processed securely. Your card statement will show "WEBOS SHOP".',
        'order_confirmed_title' => 'Order confirmed.',
        'order_confirmed_body'  => 'Devices are packed with care and shipped with tracking. Every unit is tested before it goes out — if something arrives wrong, reply to the confirmation email and we’ll sort it.',
        'sold_out'              => 'Sold',
        'last_one'              => 'Last one',
        'returns_link'          => 'Returns',
        'footer_blurb'          => 'The webOS Archive Shop funds hosting, preservation, and the app museum. Devices are used unless marked new old stock; every listing shows photographs of the actual unit you receive.',
    ],
];
