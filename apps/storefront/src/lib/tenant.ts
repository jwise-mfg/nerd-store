import { buildTenant, tenantFromHost, type TenantConfig } from '@store/core'

/** The tenant this bundle was built for. Constant for the life of the deploy. */
export const TENANT: TenantConfig = buildTenant()

/**
 * Tenant for a server-rendered request, resolved from Host and then checked
 * against the build tenant.
 *
 * Belt and braces: the build already pins the tenant, but API routes verify
 * the Host header agrees. If this deploy is ever put behind a shared domain,
 * or a request arrives with a spoofed Host, the mismatch fails closed rather
 * than quietly serving one store's data under the other's name.
 */
export function requestTenant(request: Request): TenantConfig {
  const host = new URL(request.url).host
  const resolved = tenantFromHost(host)
  if (resolved && resolved.id !== TENANT.id) {
    throw new Response('Not found', { status: 404 })
  }
  return TENANT
}
