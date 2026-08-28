/**
 * The tenant contract.
 *
 * This type is the entire surface on which the two storefronts are allowed to
 * differ. If a behaviour is not expressible here, it is shared code and must
 * behave identically in both stores. If a store needs to differ in a way this
 * type cannot express, extend the type -- do not branch on `tenant.id` inside
 * feature code. Branching on tenant id is how a "framework" quietly becomes
 * two applications wearing a trench coat.
 */

export type TenantId = 'i3x' | 'webos'

/** Design tokens. Emitted as CSS custom properties on :root at build time. */
export interface ThemeTokens {
  /** Base surface + ink. Both light and dark values are required. */
  color: {
    bg: string
    bgElevated: string
    ink: string
    inkMuted: string
    accent: string
    /** Hover/active state for accent surfaces. Some brands shift hue here. */
    accentHover: string
    accentInk: string
    line: string
    danger: string
    ok: string
  }
  colorDark: Partial<ThemeTokens['color']>
  font: {
    /** Full CSS font-family stack. Must end in a generic family. */
    sans: string
    display: string
    mono: string
    /** Google Fonts href, or null to ship no external font request. */
    googleFontsHref: string | null
  }
  radius: { sm: string; md: string; lg: string; pill: string }
  space: { unit: string }
  /** Extra raw CSS appended after tokens -- for textures, gradients, scanlines. */
  extraCss?: string
}

/** Every user-visible string that differs between stores. */
export interface TenantCopy {
  tagline: string
  heroTitle: string
  heroBody: string
  heroCta: string
  catalogTitle: string
  catalogEmpty: string
  cartTitle: string
  cartEmpty: string
  checkoutTitle: string
  /** Shown under the payment form. Sets expectations about the charge. */
  checkoutReassurance: string
  orderConfirmedTitle: string
  orderConfirmedBody: string
  soldOut: string
  lastOne: string
  /** Footer blurb. Deliberately NOT a place to mention the other store. */
  footerBlurb: string
  nav: { label: string; href: string }[]
}

/**
 * Which product attributes this store's catalog actually uses.
 * Drives faceting, the variant picker UI, and the product detail layout.
 */
export interface CatalogShape {
  /** Attribute keys shown as filters, in order. */
  facets: string[]
  /** Attribute keys forming the variant selector, in order. */
  variantAxes: string[]
  /** Show condition grade, serial, and per-unit photos (used/refurb goods). */
  showConditionDetail: boolean
  /** Treat stock as authoritative and show exact counts under this threshold. */
  scarcityThreshold: number
}

export interface ShippingRate {
  code: string
  label: string
  /** Minor units, in the store currency. */
  amount: number
  /** Free above this subtotal in minor units; null disables the threshold. */
  freeAbove: number | null
  /** ISO-3166-1 alpha-2 codes this rate serves. */
  countries: string[]
  estimate: string
}

export interface TenantConfig {
  id: TenantId
  /** Canonical public origin. Used for absolute URLs and CSP. */
  origin: string
  /** Shown in the UI. Never contains the other store's name. */
  storeName: string
  /**
   * Appended to the cardholder's statement. Stripe allows 22 chars total
   * including the account prefix, [A-Za-z0-9 .-] only. This is the single
   * most-overlooked place two stores leak a shared operator.
   */
  statementDescriptorSuffix: string
  currency: 'usd'
  /**
   * Cookie name for the cart session. MUST be unique per tenant so a person
   * browsing both stores in one browser never carries a cart across, and so
   * the cookie name itself is not a shared fingerprint.
   */
  cartCookie: string
  mail: {
    fromName: string
    fromAddress: string
    replyTo: string
    /** Postal address printed in the receipt footer. Legally required. */
    postalAddress: string
  }
  support: {
    email: string
    /** Path to the returns policy page within this store. */
    returnsPath: string
  }
  theme: ThemeTokens
  /**
   * Brand assets.
   *
   * Tokens carry colour and type; they cannot carry identity. A store with a
   * perfectly correct palette and no wordmark or icon still reads as generic,
   * and a browser tab with no favicon reads as unfinished. Every field is
   * nullable so a store can decline one without the layout breaking.
   */
  brand: {
    /** Masthead wordmark. null falls back to storeName in the display face. */
    wordmark: { src: string; alt: string; height: string } | null
    /** Compact mark shown beside the wordmark. Usually the icon form. */
    mark: { src: string; alt: string; size: string } | null
    /** Browser tab icon. PNG; every current browser accepts one. */
    favicon: string | null
    /** Square icon for an iOS home screen. 180px or larger. */
    appleTouchIcon: string | null
  }
  copy: TenantCopy
  catalog: CatalogShape
  shipping: ShippingRate[]
  /** Per-store analytics. Two stores must never share a measurement id. */
  analytics: { provider: 'none' | 'plausible'; domain?: string } 
}
