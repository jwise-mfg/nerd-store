import { defineConfig } from 'astro/config'
import node from '@astrojs/node'
import preact from '@astrojs/preact'
import { stageImages } from '../../packages/core/src/catalog/index.ts'
import { tenantById } from '../../packages/core/src/tenant/index.ts'

/**
 * Copy product images from products/<tenant>/<slug>/ into the store's public
 * directory before the build reads it. Keeping the originals beside
 * product.json means one folder holds everything about a product; this is
 * what gets them shipped.
 */
const stageProductImages = {
  name: 'stage-product-images',
  hooks: {
    'astro:build:start': () => {
      const n = stageImages(tenantById(process.env.TENANT ?? 'i3x'))
      if (n) console.log(`  staged ${n} product image(s)`)
    },
  },
}

const tenant = process.env.TENANT ?? 'i3x'
const site = tenant === 'webos' ? 'https://shop.webosarchive.org' : 'https://shop.i3x.dev'

// One codebase, one build per store. Each deploy contains exactly one
// tenant's copy, theme, and assets -- a shared bundle would ship the other
// store's strings to every visitor, which is the seam we are avoiding.
export default defineConfig({
  site,
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [preact(), stageProductImages],
  outDir: `./dist-${tenant}`,
  // Per-store static assets. Astro copies publicDir wholesale into the build,
  // so a single shared ./public would put every store's logos and product
  // photographs into every other store's output -- shop.webosarchive.org would
  // serve the i3X logo, which is a direct link between them.
  publicDir: `./public-${tenant}`,
  build: { assets: `_${tenant}` },
  vite: {
    define: { 'import.meta.env.PUBLIC_TENANT': JSON.stringify(tenant) },
  },
  server: { port: tenant === 'webos' ? 4322 : 4321 },
})
