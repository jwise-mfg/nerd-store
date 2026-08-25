import { readFileSync, existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { z } from 'zod'

/**
 * Application configuration.
 *
 * Everything an operator edits lives in one JSON file. Only genuinely
 * process-level values stay in the environment, because systemd owns them:
 * TENANT (which store this process serves), HOST and PORT (where it binds),
 * and CONFIG_PATH (where to find this file).
 *
 * The file is gitignored. `config.example.json` is committed and holds stubs.
 */

const ConfigSchema = z.object({
  stripe: z.object({
    /** Server-side key. Never reaches the browser. */
    secretKey: z.string().min(1, 'stripe.secretKey is required'),
    /** Inlined into the checkout page at build time. Safe to expose. */
    publishableKey: z.string().min(1, 'stripe.publishableKey is required'),
    /** Signs incoming webhooks. Without it, payment events cannot be trusted. */
    webhookSecret: z.string().min(1, 'stripe.webhookSecret is required'),
  }),
  mail: z.object({
    /** POST target for receipts. null logs them instead, which is right in dev. */
    webhookUrl: z.string().url().nullable().default(null),
  }).default({ webhookUrl: null }),
  storage: z.object({
    /** Directory holding one SQLite file per store. */
    dataDir: z.string().default('./data'),
    /** Optional per-tenant overrides, e.g. to use a separate volume. */
    databasePaths: z.record(z.string()).default({}),
  }).default({ dataDir: './data', databasePaths: {} }),
})

export type Config = z.infer<typeof ConfigSchema>

/** Repository root, found by walking up from cwd for this workspace. */
function findRepoRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 8; i++) {
    const pkg = join(dir, 'package.json')
    if (existsSync(pkg)) {
      try {
        const parsed = JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string }
        if (parsed.name === 'nerd-store') return dir
      } catch { /* unreadable; keep walking */ }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

export const REPO_ROOT = findRepoRoot()

export function configPath(): string {
  const p = process.env.CONFIG_PATH ?? 'config.json'
  return isAbsolute(p) ? p : resolve(REPO_ROOT, p)
}

/**
 * Strip // and block comments so the file can be annotated the way
 * tsconfig.json is. String contents are preserved, so a URL containing "//"
 * survives intact.
 */
function stripJsonComments(input: string): string {
  let out = ''
  let inString = false
  let inLine = false
  let inBlock = false
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!
    const next = input[i + 1]
    if (inLine) { if (c === '\n') { inLine = false; out += c } ; continue }
    if (inBlock) { if (c === '*' && next === '/') { inBlock = false; i++ } ; continue }
    if (inString) {
      out += c
      if (c === '\\') { out += input[++i] ?? '' ; continue }
      if (c === '"') inString = false
      continue
    }
    if (c === '"') { inString = true; out += c; continue }
    if (c === '/' && next === '/') { inLine = true; i++; continue }
    if (c === '/' && next === '*') { inBlock = true; i++; continue }
    out += c
  }
  return out
}

let cached: Config | null = null

export function config(): Config {
  if (cached) return cached
  const path = configPath()

  if (!existsSync(path)) {
    throw new Error(
      `No configuration file at ${path}.\n` +
      `  Copy the example and fill in your values:\n` +
      `      cp config.example.json config.json\n` +
      `  Or point CONFIG_PATH at an existing file.`,
    )
  }

  let raw: unknown
  try {
    raw = JSON.parse(stripJsonComments(readFileSync(path, 'utf8')))
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${(e as Error).message}`)
  }

  const parsed = ConfigSchema.safeParse(raw)
  if (!parsed.success) {
    // Name every problem at once, with its path, rather than failing on the
    // first one and making the operator run this five times.
    const issues = parsed.error.issues
      .map((i) => `      ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(`${path} is not valid:\n${issues}`)
  }

  // Reject the shipped stubs explicitly: a copied-but-unedited file otherwise
  // fails later, inside Stripe, with a much less helpful message.
  const stubs = Object.entries(parsed.data.stripe)
    .filter(([, v]) => v.includes('REPLACE_ME'))
    .map(([k]) => `stripe.${k}`)
  if (stubs.length > 0) {
    throw new Error(
      `${path} still contains example values: ${stubs.join(', ')}.\n` +
      `  Replace them with your real Stripe keys.`,
    )
  }

  cached = parsed.data
  return cached
}

/** Absolute path to a tenant's database file. */
export function tenantDbPath(tenant: string): string {
  const c = config()
  const override = c.storage.databasePaths[tenant]
  const raw = override ?? join(c.storage.dataDir, `${tenant}.db`)
  return isAbsolute(raw) ? raw : resolve(REPO_ROOT, raw)
}

/** Test seam: let tooling inject config without touching the filesystem. */
export function __setConfigForTesting(c: Config | null): void {
  cached = c
}
