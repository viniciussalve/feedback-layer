/**
 * Valores literais de design da lib (#hex, px, rem): este arquivo + `fallback-tokens.generated.ts`.
 *
 * Os valores que espelham o design system (`COLORS_DARK`, `COLORS_LIGHT`, `SHARED`) vêm de
 * `fallback-tokens.generated.ts`, GERADO por `design-system-vue/scripts/tokens.mjs` a partir do `tokens.css`
 * do DS. Não edite o gerado à mão: edite `tokens.config.json` no DS e rode `npm run tokens` lá.
 * Serve só para a lib funcionar em projetos SEM o design system (script avulso em HTML puro). Quando o host
 * define o token (`--bg`, `--spacing-inner`...), o `var()` usa o valor do host e o fallback não tem efeito.
 *
 * Aqui ficam só os tokens próprios da lib (`OWN`, sem equivalente no DS) e o CSS do `:host`.
 * O CSS do componente só lê `--fl-*`, definidos no `:host` por `tokensCss()` como
 * `--fl-bg: var(--bg, <fallback>)`. Nada de #hex ou px fora destes dois arquivos.
 */

import { COLORS_DARK, COLORS_LIGHT, SHARED } from './fallback-tokens.generated.js'

export { COLORS_DARK, COLORS_LIGHT, SHARED }

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
