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

  // Contraste calculado dos próprios hex do arquivo gerado (WCAG 2.x, sRGB). Não depende do DS: uma edição à mão
  // que quebre o acento, o hover ou o foco falha aqui, no CI do próprio feedback-layer.
  describe('contraste (mínimos iguais aos do gerador do DS)', () => {
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const ratio = (a: string, b: string) => {
      const x = lum(a), y = lum(b)
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
    }
    const FG_ON_ACCENT_MIN = 4.5
    const FOCUS_MIN = 3
    const SURFACES = ['bg', 'bg-raised', 'surface', 'surface-2'] as const
    const themes: Array<[string, Record<string, string>]> = [
      ['dark', COLORS_DARK],
      ['light', COLORS_LIGHT],
    ]

    it('o cálculo reproduz valores conhecidos (guarda do próprio teste)', () => {
      expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 5)
      expect(ratio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
      expect(ratio('#f5c518', '#151517')).toBeCloseTo(11.19, 1)
    })

    for (const [theme, set] of themes) {
      it(`${theme}: accent-fg × accent >= ${FG_ON_ACCENT_MIN}`, () => {
        expect(ratio(set['accent-fg'], set.accent)).toBeGreaterThanOrEqual(FG_ON_ACCENT_MIN)
      })
      it(`${theme}: accent-fg × accent-hover >= ${FG_ON_ACCENT_MIN}`, () => {
        expect(ratio(set['accent-fg'], set['accent-hover'])).toBeGreaterThanOrEqual(FG_ON_ACCENT_MIN)
      })
      for (const surface of SURFACES) {
        it(`${theme}: focus-ring × ${surface} >= ${FOCUS_MIN}`, () => {
          expect(ratio(set['focus-ring'], set[surface])).toBeGreaterThanOrEqual(FOCUS_MIN)
        })
      }
    }
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
