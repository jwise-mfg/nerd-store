<?php
/**
 * shop.i3x.dev
 *
 * Colours taken from www.i3x.dev by the role each plays in its stylesheet:
 * a near-black ground, green as the primary action, navy only on hover.
 * Set in Lato with Work Sans for display.
 *
 * No secrets here -- this file is tracked. Stripe and mail keys are in the
 * gitignored config.php at the repository root.
 */
return [
    'name'             => 'i3X Store',
    'origin'           => 'https://shop.i3x.dev',
    'currency'         => 'usd',
    'order_prefix'     => 'I3X',
    'statement_suffix' => 'I3X STORE',
    'cart_cookie'      => 'i3x_cart',

    // Flip to false to close this store alone. Takes effect on the next
    // request -- there is nothing to rebuild.
    'store_open'       => true,

    'support_email'    => 'store@i3x.dev',
    'mail_from'        => 'i3X Store <store@i3x.dev>',
    'postal_address'   => 'JW LLC',

    // The <title> tag on the home page. Separate from copy.tagline, which is
    // what the page itself shows: a browser tab and a search result want
    // something that reads on its own, away from the logo above it.
    'title_tagline'    => 'Conformant Swag',

    'font_href'        => 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Work+Sans:wght@500;600;700&display=swap',
    'analytics_domain' => null,

    // Show "only N left" at or below this figure.
    'scarcity_threshold'     => 3,
    // Merchandise, not used goods: no condition grades on the product page.
    'show_condition_detail'  => false,

    'brand' => [
        'wordmark'         => '/brand/i3x-logo-white.png',
        'wordmark_alt'     => 'i3X — Industrial Information Interoperability eXchange',
        'wordmark_height'  => '30px',
        'favicon'          => '/brand/i3x-orb-32.png',
        'apple_touch_icon' => '/brand/i3x-orb-256.png',
    ],

    // Passed to Stripe Checkout, which collects the address and lets the
    // buyer pick. US only.
    'shipping' => [
        ['code' => 'us_standard', 'label' => 'Standard (USPS)', 'cents' => 900,  'estimate' => '7-10 business days'],
        ['code' => 'us_priority', 'label' => 'Priority Mail',   'cents' => 1800, 'estimate' => '5-7 business days'],
    ],

    'nav' => [
        ['label' => 'i3x.dev', 'href' => 'https://www.i3x.dev'],
        
    ],

    'copy' => [
        'tagline'               => 'Open by design',
        'hero_title'            => 'Is your swag conformant?',
        'hero_body'             => 'Industrial Information Interoperability eXchange - i3X merch is for everyone!',
        'hero_cta'              => 'Browse the shop',
        'catalog_title'         => 'Everything in the shop',
        'catalog_empty'         => 'Nothing here just yet — new items are on the way.',
        'cart_title'            => 'Your cart',
        'cart_empty'            => 'Your cart is empty.',
        'checkout_title'        => 'Checkout',
        'shipping_restriction'  => 'We ship within the United States only.',
        'checkout_reassurance'  => 'Payment is processed securely. Your card statement will show "I3X STORE".',
        'order_confirmed_title' => 'Order confirmed — thank you.',
        'order_confirmed_body'  => 'We’ll email tracking as soon as your order ships. Orders are packed by hand, usually within 10-15 business days.',
        'sold_out'              => 'Sold out',
        'last_one'              => 'Only one left',
        'footer_blurb'          => 'The i3X Store is not affliated with CESMII. Items are sold at near-cost, and as-is. No returns or exchanges.',
    ],
];
