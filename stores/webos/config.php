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
    'store_open'       => true,

    'support_email'    => 'curator@webosarchive.org',
    'mail_from'        => 'webOS Archive Store <curator@webosarchive.org>',
    'postal_address'   => 'JW LLC',

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

    // The main site's logo, copied into brand/ so the shop serves it itself.
    'brand' => [
        'wordmark'         => '/brand/wosa-wide.png',
        'wordmark_alt'     => 'webOS Archive',
        'wordmark_height'  => '32px',
        'favicon'          => '/favicon.ico',
        'apple_touch_icon' => null,
        'social_image'     => '/brand/social.jpg',
    ],

    'shipping' => [
        ['code' => 'us_standard', 'label' => 'Ground (tracked)', 'cents' => 1100, 'estimate' => '7-10 business days'],
        ['code' => 'us_priority',  'label' => 'Expedited',        'cents' => 2200, 'estimate' => '5-7 business days'],
    ],

    'nav' => [
        ['label' => 'Home',        'href' => 'https://www.webosarchive.org'],
        ['label' => 'Shop',        'href' => '/'],
        ['label' => 'Devices',     'href' => '/?kind=device'],
        ['label' => 'Accessories', 'href' => '/?kind=accessory'],
    ],

    'copy' => [
        'tagline'               => 'Keeping webOS alive!',
        'hero_title'            => 'New and gently used webOS Gear in guaranteed condition',
        'hero_body'             => 'webOS chargers, cases and cables that never left the warehouse — plus tested, graded TouchPads and Phones for people still running the mobile OS everyone copied...',
        'hero_cta'              => 'See what’s in stock',
        'catalog_title'         => 'In stock now',
        'catalog_empty'         => 'Everything’s spoken for right now. Check back — stock moves in batches.',
        'cart_title'            => 'Your cart',
        'cart_empty'            => 'Nothing in your cart yet.',
        'checkout_title'        => 'Checkout',
        'shipping_restriction'  => 'We currently ship within the United States only.',
        'checkout_reassurance'  => 'Payment is processed securely. Your card statement will show "WEBOS SHOP".',
        'order_confirmed_title' => 'Order confirmed.',
        'order_confirmed_body'  => 'Devices are packed with care and shipped with tracking. Every unit is tested before it goes out — if something arrives wrong, reply to the confirmation email and we’ll sort it.',
        'sold_out'              => 'Sold out',
        'last_one'              => 'Last one',
        'returns_link'          => 'Returns',
        'footer_blurb'          => 'The webOS Archive Shop funds hosting, preservation, and the app museum. Products are used unless marked New Old Stock; every listing shows photographs represenative of the item you actully receive.',
    ],
];
