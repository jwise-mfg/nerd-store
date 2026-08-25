import type { TenantConfig } from '../../packages/core/src/tenant/types.ts'

/**
 * shop.i3x.dev
 *
 * Palette and type lifted from www.i3x.dev: white ground, near-black ink
 * (#17171D), the deep navy #00367F as primary and #00a009 as the affirmative
 * accent, set in Lato with Work Sans for display. Light, high-contrast, and
 * deliberately plain -- it should read as an extension of a standards body,
 * not as a merch store that happens to share a logo.
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
      bg: '#ffffff',
      bgElevated: '#f6f7f9',
      ink: '#17171d',
      inkMuted: '#5b5f6b',
      accent: '#00367f',
      accentInk: '#ffffff',
      line: '#dfe3ea',
      danger: '#e14d43',
      ok: '#00a009',
    },
    colorDark: {
      bg: '#0f1116',
      bgElevated: '#171a21',
      ink: '#f4f5f7',
      inkMuted: '#9aa1b0',
      accent: '#5b9bf0',
      accentInk: '#0f1116',
      line: '#262b36',
    },
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
      /* Thin rule under the masthead, echoing the spec-document feel of i3x.dev */
      .masthead { border-bottom: 2px solid var(--c-accent); }
      .product-card { transition: border-color .15s ease, transform .15s ease; }
      .product-card:hover { border-color: var(--c-accent); transform: translateY(-2px); }
    `,
  },

  copy: {
    tagline: 'Open by design.',
    heroTitle: 'Wear the standard.',
    heroBody:
      'A children’s book, shirts, and stickers from the team behind the Industrial Information Interoperability eXchange. Every order helps keep the specification open and freely implementable.',
    heroCta: 'Browse the shop',
    catalogTitle: 'Everything in the shop',
    catalogEmpty: 'Nothing here just yet — new items are on the way.',
    cartTitle: 'Your cart',
    cartEmpty: 'Your cart is empty.',
    checkoutTitle: 'Checkout',
    checkoutReassurance:
      'Payment is processed securely. Your card statement will show "I3X STORE".',
    orderConfirmedTitle: 'Order confirmed — thank you.',
    orderConfirmedBody:
      'We’ll email tracking as soon as your order ships. Orders are packed by hand, usually within two business days.',
    soldOut: 'Sold out',
    lastOne: 'Only one left',
    footerBlurb:
      'The i3X Store is operated in support of the i3X open API initiative. Proceeds fund specification work, conformance tooling, and community outreach.',
    nav: [
      { label: 'Shop', href: '/shop' },
      { label: 'The Book', href: '/shop?kind=book' },
      { label: 'i3x.dev', href: 'https://www.i3x.dev' },
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
    { code: 'intl_standard', label: 'International', amount: 2200, freeAbove: null,
      countries: ['CA', 'GB', 'DE', 'FR', 'NL', 'SE', 'AU', 'JP'], estimate: '10–21 business days' },
  ],

  // Distinct from the other store's analytics. A shared measurement id is the
  // single easiest way to connect two sites from the outside.
  analytics: { provider: 'none' },
}
