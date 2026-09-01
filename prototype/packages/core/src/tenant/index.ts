import type { TenantConfig, TenantId } from './types.ts'
import { i3x } from '../../../../tenants/i3x/tenant.config.ts'
import { webos } from '../../../../tenants/webos/tenant.config.ts'

export * from './types.ts'

const REGISTRY: Record<TenantId, TenantConfig> = { i3x, webos }

/** Hostname -> tenant. Includes local dev ports so `astro dev` behaves. */
const HOSTS: Record<string, TenantId> = {
  'shop.i3x.dev': 'i3x',
  'localhost:4321': 'i3x',
  'shop.webosarchive.org': 'webos',
  'localhost:4322': 'webos',
}

export function tenantById(id: string): TenantConfig {
  const t = REGISTRY[id as TenantId]
  if (!t) throw new Error(`Unknown tenant: ${id}`)
  return t
}

/**
 * The build-time tenant. Each storefront deploy is built with TENANT set, so
 * one bundle only ever contains one store's copy, theme, and assets. This is
 * deliberate: a shared bundle would ship the other store's strings to every
 * visitor, which is exactly the seam we are trying not to have.
 */
export function buildTenant(): TenantConfig {
  const id = process.env.TENANT ?? 'i3x'
  return tenantById(id)
}

/**
 * Request-time tenant, resolved from Host. Used by API routes as an
 * independent check: even in a single-deploy configuration, a request for
 * store A can never read or mutate store B's data.
 */
export function tenantFromHost(host: string | null | undefined): TenantConfig | null {
  if (!host) return null
  const id = HOSTS[host.toLowerCase()] ?? HOSTS[host.toLowerCase().split(':')[0]!]
  return id ? REGISTRY[id] : null
}

export function allTenants(): TenantConfig[] {
  return Object.values(REGISTRY)
}
