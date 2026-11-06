/**
 * GERADO por design-system-vue/scripts/tokens.mjs a partir de src/styles/tokens.css. NÃO EDITE À MÃO.
 * sha256 do tokens.css (quebras de linha LF): d01990f16b79a51f020e021a4052c9d27d2b7dd08cb3005e9e2dfdc27b6fdee8
 * Para mudar um valor: edite tokens.config.json (ou o tokens.css, nas partes à mão) no design-system-vue,
 * rode `npm run tokens` lá e commite os dois repositórios com o mesmo nome de branch. Merge: feedback-layer primeiro.
 * Cores resolvidas (var() expandido), tema dark = `:root`, light = `[data-theme='light']`; compartilhados = `@theme`.
 */

/** Cores, tema dark. Nome do token do DS = nome da variável do host. */
export const COLORS_DARK = {
  bg: '#151517',
  'bg-raised': '#1b1b1c',
  surface: '#2c2c2e',
  'surface-2': '#353638',
  border: '#f9fafb1a',
  fg: '#f9fafb',
  'fg-muted': '#cfd3d6',
  'fg-subtle': '#adb2b8',
  accent: '#f5c518',
  'accent-hover': '#fcd152',
  'accent-fg': '#151517',
  'focus-ring': '#f5c518',
  danger: '#f87171',
  mark: '#38bdf8',
  'mark-fg': '#151517',
  success: '#4ade80',
} as const

/** Cores, tema light. */
export const COLORS_LIGHT: Record<keyof typeof COLORS_DARK, string> = {
  bg: '#ffffff',
  'bg-raised': '#f6f7f8',
  surface: '#eceef0',
  'surface-2': '#e1e4e7',
  border: '#15151720',
  fg: '#151517',
  'fg-muted': '#3d4146',
  'fg-subtle': '#656b72',
  accent: '#f5c518',
  'accent-hover': '#b28e04',
  'accent-fg': '#151517',
  'focus-ring': '#80660d',
  danger: '#b91c1c',
  mark: '#0369a1',
  'mark-fg': '#ffffff',
  success: '#166534',
}

/** Tokens iguais nos dois temas: nome `--fl-*` -> variável do host + fallback. */
export const SHARED: Record<string, { host: string; value: string }> = {
  'font-sans': { host: 'font-sans', value: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" },
  'font-mono': { host: 'font-mono', value: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  't-caption': { host: 'text-caption', value: '0.697rem' },
  't-body': { host: 'text-body', value: '0.7862rem' },
  't-body-lg': { host: 'text-body-lg', value: '0.8867rem' },
  't-title': { host: 'text-title', value: '1.1278rem' },
  'inner-sm': { host: 'spacing-inner-sm', value: '0.7862rem' },
  inner: { host: 'spacing-inner', value: '1rem' },
  group: { host: 'spacing-group', value: '2.0582rem' },
  touch: { host: 'spacing-touch', value: '2.75rem' },
  floating: { host: 'spacing-floating', value: '9rem' },
  'r-control': { host: 'radius-control', value: '0.4859rem' },
  'r-card': { host: 'radius-card', value: '0.7862rem' },
  'r-pill': { host: 'radius-pill', value: '999px' },
}
