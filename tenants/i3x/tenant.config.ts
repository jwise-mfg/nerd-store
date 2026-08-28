import type { TenantConfig } from '../../packages/core/src/tenant/types.ts'

/**
 * shop.i3x.dev
 *
 * Taken from www.i3x.dev by the role each colour plays in its stylesheet,
 * not by how often the hex appears:
 *
 *     body            background #17171d   color #eeeeee
 *     .button         background #00a009   color #ffffff
 *     .button:hover   background #00367f
 *
 * So: a near-black ground with light text, green as the primary action, and
 * navy only as the hover state. Set in Lato with Work Sans for display, and
 * carrying the same white wordmark the parent site uses.
 */
export const i3x: TenantConfig = {
  id: 'i3x',
  origin: 'https://shop.i3x.dev',
  storeName: 'i3X Store',
  statementDescriptorSuffix: 'I3X STORE',
  currency: 'usd',
  cartCookie: 'i3x_cart',

  mail: {
    fromName: 'i3X Store',
    fromAddress: 'store@i3x.dev',
    replyTo: 'store@i3x.dev',
    postalAddress: 'i3X Store — [postal address required on commercial email]',
  },
  support: { email: 'store@i3x.dev', returnsPath: '/policies/returns' },

  theme: {
    color: {
      bg: '#17171d',          // body background on i3x.dev
      bgElevated: '#20202a',
      ink: '#eeeeee',         // body colour on i3x.dev
      inkMuted: '#9b9ca6',    // lightened from #494A52 for contrast on the dark ground
      accent: '#00a009',      // .button background
      accentHover: '#00367f', // .button:hover background
      accentInk: '#ffffff',
      line: '#2f2f3a',
      danger: '#e14d43',
      ok: '#00a009',
    },
    // The site is dark by design, not by preference. A light-mode inversion
    // would not look like i3x.dev, so there is nothing to swap.
    colorDark: {},
    font: {
      sans: "Lato, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      display: "'Work Sans', Lato, -apple-system, sans-serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
      googleFontsHref:
        'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Work+Sans:wght@500;600;700&display=swap',
    },
    radius: { sm: '4px', md: '8px', lg: '14px', pill: '999px' },
    space: { unit: '8px' },
    extraCss: `
      /* Green rule under the masthead, as on i3x.dev. */
      .masthead { border-bottom: 2px solid var(--c-accent); }
      .product-card { transition: border-color .15s ease, transform .15s ease; }
      .product-card:hover { border-color: var(--c-accent); transform: translateY(-2px); }
      /* Buttons shift green -> navy on hover, matching the parent site. */
      .btn:hover:not(:disabled) { background: var(--c-accent-hover); }
    `,
  },

  brand: {
    wordmark: { src: '/brand/i3x-logo-white.png', alt: 'i3X — Industrial Information Interoperability eXchange', height: '30px' },
    mark: { src: '/brand/i3x-orb-64.png', alt: '', size: '30px' },
    favicon: '/brand/i3x-orb-32.png',
    appleTouchIcon: '/brand/i3x-orb-256.png',
  },

  copy: {
    tagline: 'Open by design.',
    heroTitle: 'Wear the standard.',
    heroBody:
      'Swag for Industrial Information Interoperability eXchange. Show off the standard - i3X is for everyone!',
    heroCta: 'Browse the shop',
    catalogTitle: 'Everything in the shop',
    catalogEmpty: 'Nothing here just yet — new items are on the way.',
    cartTitle: 'Your cart',
    cartEmpty: 'Your cart is empty.',
    checkoutTitle: 'Checkout',
    shippingRestriction: 'We ship within the United States only.',
    checkoutReassurance:
      'Payment is processed securely. Your card statement will show "I3X STORE".',
    orderConfirmedTitle: 'Order confirmed — thank you.',
    orderConfirmedBody:
      'We’ll email tracking as soon as your order ships. Orders are packed by hand, usually within 7-10 business days.',
    soldOut: 'Sold out',
    lastOne: 'Only one left',
    footerBlurb:
      'The i3X Store is operated in support of the i3X open API initiative. Proceeds fund specification work, conformance tooling, and community outreach.',
    nav: [
      { label: 'i3x.dev', href: 'https://www.i3x.dev' },
      { label: 'Shop', href: '/shop' },
    ],
  },

  catalog: {
    facets: ['kind', 'size', 'color'],
    variantAxes: ['size', 'color'],
    showConditionDetail: false,
    // Merch is restocked; exact counts only matter at the very bottom.
    scarcityThreshold: 3,
  },

  shipping: [
    { code: 'us_standard', label: 'Standard (USPS)', amount: 500, freeAbove: 7500,
      countries: ['US'], estimate: '3–7 business days' },
    { code: 'us_priority', label: 'Priority Mail', amount: 1200, freeAbove: null,
      countries: ['US'], estimate: '2–3 business days' },
  ],

  // Distinct from the other store's analytics. A shared measurement id is the
  // single easiest way to connect two sites from the outside.
  analytics: { provider: 'none' },
}
