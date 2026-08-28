import type { TenantConfig, ThemeTokens } from '@store/core'

/**
 * Tokens -> CSS custom properties.
 *
 * Every component in the app styles itself from these variables and never
 * from a tenant id. That constraint is what makes a third store a config
 * file rather than a refactor -- and it is what stops one store's visual
 * decisions leaking into the other's stylesheet.
 */
export function themeCss(t: TenantConfig): string {
  const c = t.theme.color
  const dark = { ...c, ...t.theme.colorDark } as ThemeTokens['color']
  const vars = (v: ThemeTokens['color']) => `
    --c-bg: ${v.bg};
    --c-bg-elevated: ${v.bgElevated};
    --c-ink: ${v.ink};
    --c-ink-muted: ${v.inkMuted};
    --c-accent: ${v.accent};
    --c-accent-hover: ${v.accentHover};
    --c-accent-ink: ${v.accentInk};
    --c-line: ${v.line};
    --c-danger: ${v.danger};
    --c-ok: ${v.ok};`

  return `
:root {${vars(c)}
  --f-sans: ${t.theme.font.sans};
  --f-display: ${t.theme.font.display};
  --f-mono: ${t.theme.font.mono};
  --r-sm: ${t.theme.radius.sm};
  --r-md: ${t.theme.radius.md};
  --r-lg: ${t.theme.radius.lg};
  --r-pill: ${t.theme.radius.pill};
  --s: ${t.theme.space.unit};
}
${Object.keys(t.theme.colorDark).length
  ? `@media (prefers-color-scheme: dark) { :root {${vars(dark)} } }`
  : ''}
${t.theme.extraCss ?? ''}
`.trim()
}
