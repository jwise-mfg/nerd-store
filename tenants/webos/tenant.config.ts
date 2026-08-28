import type { TenantConfig } from '../../packages/core/src/tenant/types.ts'

/**
 * shop.webosarchive.org
 *
 * Anchored on what webosarchive.org actually uses -- #101110 ground, white
 * ink, lavender links, Verdana -- then pushed toward the Palm/HP webOS device
 * UI it archives: the Prelude-ish geometric display face substituted with a
 * safe stack, the webOS blue used for interactive affordances, and card-like
 * elevated surfaces with generous corner radii, the way the TouchPad's card
 * view rendered running apps.
 */
export const webos: TenantConfig = {
  id: 'webos',
  origin: 'https://shop.webosarchive.org',
  storeName: 'webOS Archive Shop',
  statementDescriptorSuffix: 'WEBOS SHOP',
  currency: 'usd',
  cartCookie: 'woa_cart',

  mail: {
    fromName: 'webOS Archive Shop',
    fromAddress: 'shop@webosarchive.org',
    replyTo: 'shop@webosarchive.org',
    postalAddress: 'JW LLC — 5387 Avion Park Dr., Highland Heights, OH 44143',
  },
  support: { email: 'shop@webosarchive.org', returnsPath: '/policies/returns' },

  theme: {
    color: {
      bg: '#101110',
      bgElevated: '#1b1d1c',
      ink: '#ffffff',
      inkMuted: '#8a8f8c',        // the site's `dimgray`, lifted for contrast
      accent: '#e6e6fa',          // lavender, the archive's link colour
      accentHover: '#ffffff',
      accentInk: '#101110',
      line: '#2c2f2e',
      danger: '#ff6b5e',
      ok: '#7ed957',
    },
    // Already dark; a light preference gets a softened dark rather than an
    // inverted theme, because inverting it would lose the device-UI feel.
    colorDark: {},
    font: {
      sans: "Verdana, Geneva, 'DejaVu Sans', sans-serif",
      display: "'Prelude', 'Futura', 'Century Gothic', Verdana, sans-serif",
      mono: "'Courier New', ui-monospace, monospace",
      googleFontsHref: null,      // matches the archive: no external font request
    },
    radius: { sm: '6px', md: '12px', lg: '20px', pill: '999px' },
    space: { unit: '8px' },
    extraCss: `
      /* The glow behind the masthead, as on webosarchive.org's landing page. */
      body {
        background-image: radial-gradient(
          ellipse 900px 380px at 50% -60px,
          rgba(120,140,220,.20), transparent 70%
        );
        background-repeat: no-repeat;
        background-attachment: fixed;
      }
      /* Product tiles as webOS "cards": elevated, deeply rounded, and they
         lift on hover the way a card did when you flicked through them. */
      .product-card {
        background: var(--c-bg-elevated);
        border-radius: var(--r-lg);
        box-shadow: 0 2px 0 rgba(0,0,0,.5), 0 8px 24px rgba(0,0,0,.45);
        transition: transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .18s ease;
      }
      .product-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 4px 0 rgba(0,0,0,.5), 0 16px 36px rgba(0,0,0,.55);
      }
      /* Condition grade chip -- webOS Archive only. */
      .grade { font-family: var(--f-mono); letter-spacing: .06em; text-transform: uppercase; }
    `,
  },

  // No brand assets supplied yet -- the wordmark falls back to storeName and
  // the tab shows the browser default until an icon is added.
  brand: { wordmark: null, mark: null, favicon: null, appleTouchIcon: null },

  copy: {
    tagline: 'Keeping webOS alive.',
    heroTitle: 'New old stock, still sealed.',
    heroBody:
      'Touchstone chargers, cases, styluses, and cables that never left the warehouse — plus tested, graded TouchPads, Pres, and Pixis for people still running the best mobile OS nobody bought.',
    heroCta: 'See what’s in stock',
    catalogTitle: 'In stock now',
    catalogEmpty: 'Everything’s spoken for right now. Check back — stock moves in batches.',
    cartTitle: 'Your cart',
    cartEmpty: 'Nothing in your cart yet.',
    checkoutTitle: 'Checkout',
    shippingRestriction: 'We ship within the United States only.',
    checkoutReassurance:
      'Payment is processed securely. Your card statement will show "WEBOS SHOP".',
    orderConfirmedTitle: 'Order confirmed.',
    orderConfirmedBody:
      'Devices are packed with care and shipped with tracking. Every unit is tested before it goes out — if something arrives wrong, reply to the confirmation email and we’ll sort it.',
    soldOut: 'Sold',
    lastOne: 'Last one',
    footerBlurb:
      'The webOS Archive Shop funds hosting, preservation, and the app museum. Devices are used unless marked new old stock; every listing shows photographs of the actual unit you receive.',
    nav: [
      { label: 'Shop', href: '/shop' },
      { label: 'Devices', href: '/shop?kind=device' },
      { label: 'Accessories', href: '/shop?kind=accessory' },
      { label: 'webosarchive.org', href: 'https://www.webosarchive.org' },
    ],
  },

  catalog: {
    // Retro hardware buyers filter on condition and capacity, not size/colour.
    facets: ['kind', 'condition', 'storage', 'model'],
    variantAxes: ['storage', 'color', 'condition'],
    showConditionDetail: true,
    // Most listings are genuinely quantity-1, so surface the count early.
    scarcityThreshold: 2,
  },

  shipping: [
    { code: 'us_ground', label: 'Ground (tracked)', amount: 800, freeAbove: null,
      countries: ['US'], estimate: '5-10 business days' },
    { code: 'us_expedited', label: 'Expedited', amount: 1800, freeAbove: null,
      countries: ['US'], estimate: '3-5 business days' },
  ],

  // The archive already self-hosts Matomo. Reuse the instance, but NEVER the
  // site id used by www -- and never point the other store at this host.
  analytics: { provider: 'plausible', domain: 'shop.webosarchive.org' },
}
