import { defineConfig } from 'astro/config'
import node from '@astrojs/node'
import preact from '@astrojs/preact'

const tenant = process.env.TENANT ?? 'i3x'
const site = tenant === 'webos' ? 'https://shop.webosarchive.org' : 'https://shop.i3x.dev'

// One codebase, one build per store. Each deploy contains exactly one
// tenant's copy, theme, and assets -- a shared bundle would ship the other
// store's strings to every visitor, which is the seam we are avoiding.
export default defineConfig({
  site,
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [preact()],
  outDir: `./dist-${tenant}`,
  build: { assets: `_${tenant}` },
  vite: {
    define: { 'import.meta.env.PUBLIC_TENANT': JSON.stringify(tenant) },
  },
  server: { port: tenant === 'webos' ? 4322 : 4321 },
})
