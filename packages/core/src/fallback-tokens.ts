/**
 * ÚNICO arquivo com valores literais de design (#hex, px, rem).
 *
 * Espelho de `design-system-vue/src/styles/tokens.css`. Serve só para a lib funcionar em projetos
 * SEM o design system (script avulso em HTML puro). Quando o host define o token (`--bg`,
 * `--spacing-inner`...), o `var()` usa o valor do host e este arquivo não tem efeito.
 *
 * O CSS do componente só lê `--fl-*`, definidos no `:host` por `tokensCss()` como
 * `--fl-bg: var(--bg, <fallback>)`. Nada de #hex ou px fora deste arquivo.
 * Faltou um valor? Crie o token aqui (e em tokens.css + `/design-system` se for do DS).
 *
 * Valores alinhados ao `tokens.css` do `design-system-vue` `master` em `47ab4eb`: primária #F5C518
 * (accent-500), texto escuro sobre o acento, `mark` azul e escalas áureas (φ) de tipografia,
 * espaçamento e raios. `--spacing-touch` (44px) fica fora da escala.
 * O teste `test/fallback-tokens.test.ts` compara esta cópia com `test/fixtures/ds-tokens-*.css`:
 * ao atualizar o DS, atualize o fixture e este arquivo juntos.
 */

/** Cores, tema dark (valores de `:root`). Nome do token do DS = nome da variável do host. */
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

/** Cores, tema light (valores de `[data-theme='light']`). */
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
  't-caption': { host: 'text-caption', value: '0.6972rem' },
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

/** Tokens próprios da lib (sem equivalente no DS). */
export const OWN: Record<string, string> = {
  unit: '1px', // unidade p/ posições calculadas em JS: calc(var(--fl-x) * var(--fl-unit))
  hairline: '1px',
  ring: '2px', // anel de foco e anel externo do botão
  'active-ring': '1.5px', // contorno interno de item ativo/selecionado
  'hl-outline': '2px',
  'hl-halo': '4px',
  gap: '0.5rem', // dentro de um grupo (barra, dock)
  icon: '1.25rem',
  'icon-sm': '1rem',
  'popover-w': '22rem',
  'chip-w': '22rem',
  'textarea-min-h': '6rem',
  'textarea-max-h': '12rem',
  'preview-max-h': '7rem',
  z: '2147483000',
  shadow: '0 0.5rem 1.5rem #0000004d',
  'mark-tint': '15%',
  'raised-alpha': '95%',
  blur: '8px',
  motion: '150ms',
  spin: '0.8s',
}

/** Largura (px de viewport) até a qual o popover vira bottom sheet. Valor numérico usado em JS. */
export const NARROW_MAX = 480

const colorDecls = (set: Record<string, string>, forced: boolean) =>
  Object.entries(set)
    .map(([k, v]) => `--fl-${k}: ${forced ? v : `var(--${k}, ${v})`};`)
    .join(' ')

/** CSS do `:host` com todas as variáveis `--fl-*`. Única fonte de valores para o resto do CSS. */
export function tokensCss(): string {
  const shared = Object.entries(SHARED)
    .map(([k, t]) => `--fl-${k}: var(--${t.host}, ${t.value});`)
    .join(' ')
  const own = Object.entries(OWN)
    .map(([k, v]) => `--fl-${k}: ${v};`)
    .join(' ')
  return `
:host { ${shared} ${own} ${colorDecls(COLORS_DARK, false)} }
:host([data-fl-theme='light']) { ${colorDecls(COLORS_LIGHT, false)} }
:host([isolate-tokens]) { ${colorDecls(COLORS_DARK, true)} }
:host([isolate-tokens][data-fl-theme='light']) { ${colorDecls(COLORS_LIGHT, true)} }`
}
