import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COLORS_DARK, COLORS_LIGHT, NARROW_MAX, OWN, SHARED, tokensCss } from '../src/fallback-tokens.js'

/**
 * Forma do espelho gerado (`fallback-tokens.generated.ts`). Os VALORES vêm do `tokens.css` do design-system-vue
 * pelo gerador (`npm run tokens` lá; `npm run tokens:check` confere). Aqui só se garante que o arquivo tem o
 * formato que a lib espera, para uma geração quebrada não passar em silêncio.
 */

const COLOR_KEYS = [
  'accent', 'accent-fg', 'accent-hover', 'bg', 'bg-raised', 'border', 'danger', 'fg', 'fg-muted',
  'fg-subtle', 'focus-ring', 'mark', 'mark-fg', 'success', 'surface', 'surface-2',
]
const SHARED_KEYS = [
  'floating', 'font-mono', 'font-sans', 'group', 'inner', 'inner-sm', 'r-card', 'r-control', 'r-pill',
  't-body', 't-body-lg', 't-caption', 't-title', 'touch',
]
const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/
const REM = /^\d+(\.\d+)?rem$/

describe('fallback-tokens (espelho gerado)', () => {
  it('dark e light têm as mesmas chaves, as esperadas pela lib', () => {
    expect(Object.keys(COLORS_DARK).sort()).toEqual(COLOR_KEYS)
    expect(Object.keys(COLORS_LIGHT).sort()).toEqual(COLOR_KEYS)
  })

  it('toda cor é hex minúsculo (#rrggbb ou #rrggbbaa), sem var()', () => {
    for (const set of [COLORS_DARK, COLORS_LIGHT]) {
      for (const [name, value] of Object.entries<string>(set)) expect(value, name).toMatch(HEX)
    }
  })

  it('o texto sobre o acento e o acento nunca são o mesmo valor', () => {
    for (const set of [COLORS_DARK, COLORS_LIGHT]) expect(set['accent-fg']).not.toBe(set.accent)
  })

  it('compartilhados: chaves esperadas, host único e valores no formato rem/px/lista de fontes', () => {
    expect(Object.keys(SHARED).sort()).toEqual(SHARED_KEYS)
    const hosts = Object.values(SHARED).map((t) => t.host)
    expect(new Set(hosts).size).toBe(hosts.length)
    for (const [name, t] of Object.entries(SHARED)) {
      expect(t.host, name).toMatch(/^[a-z][a-z0-9-]*$/)
      if (name.startsWith('font-')) expect(t.value, name).toMatch(/,/)
      else if (name === 'r-pill') expect(t.value, name).toMatch(/^\d+px$/)
      else expect(t.value, name).toMatch(REM)
    }
  })

  it('o gerado tem o cabeçalho "NÃO EDITE" e o sha256 do tokens.css', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'fallback-tokens.generated.ts'), 'utf8')
    expect(src).toMatch(/GERADO por design-system-vue\/scripts\/tokens\.mjs/)
    expect(src).toMatch(/sha256 do tokens\.css .*: [0-9a-f]{64}/)
  })

  it('tokensCss() emite as quatro regras do :host com var() do host e fallback', () => {
    const css = tokensCss()
    expect(css).toContain(`--fl-bg: var(--bg, ${COLORS_DARK.bg});`)
    expect(css).toContain(`--fl-bg: var(--bg, ${COLORS_LIGHT.bg});`)
    expect(css).toContain(`--fl-inner: var(--${SHARED.inner.host}, ${SHARED.inner.value});`)
    expect(css).toContain(`:host([isolate-tokens]) { --fl-bg: ${COLORS_DARK.bg};`)
    expect(css.match(/^:host/gm)).toHaveLength(4)
  })

  it('tokens próprios e largura estreita seguem definidos', () => {
    expect(OWN.z).toBeTruthy()
    expect(NARROW_MAX).toBeGreaterThan(0)
  })
})
