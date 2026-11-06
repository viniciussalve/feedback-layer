import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COLORS_DARK, COLORS_LIGHT, SHARED } from '../src/fallback-tokens.js'

/**
 * Compara `fallback-tokens.ts` com uma cópia versionada do `tokens.css` do design-system-vue.
 * Ao atualizar o DS: copie o novo `tokens.css` para `fixtures/`, ajuste o nome e o import abaixo
 * e atualize `fallback-tokens.ts`.
 */
const css = readFileSync(join(__dirname, 'fixtures', 'ds-tokens-47ab4eb.css'), 'utf8')

type Vars = Record<string, string>

/** Blocos `seletor { --a: b; }` sem aninhamento (os blocos de tokens do DS são planos). */
function blocks(source: string): Array<{ selector: string; vars: Vars }> {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Array<{ selector: string; vars: Vars }> = []
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const vars: Vars = {}
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[d[1].slice(2)] = d[2].trim()
    if (Object.keys(vars).length) out.push({ selector: m[1].trim(), vars })
  }
  return out
}

const all = blocks(css)
const pick = (test: (selector: string) => boolean): Vars =>
  Object.assign({}, ...all.filter((b) => test(b.selector)).map((b) => b.vars))

const rootVars = pick((s) => s.startsWith(':root'))
const lightVars = pick((s) => s === "[data-theme='light']")
const themeVars = pick((s) => s === '@theme')
const floatingVisible = pick((s) => s === "html[data-feedback-layer='visible']")

function resolve(name: string, vars: Vars): string {
  let v = vars[name]
  if (v === undefined) throw new Error(`token --${name} ausente no tokens.css`)
  for (let i = 0; i < 5; i++) {
    const m = v.match(/^var\(--([\w-]+)\)$/)
    if (!m) return v.toLowerCase()
    v = vars[m[1]]
    if (v === undefined) throw new Error(`token --${m[1]} ausente no tokens.css`)
  }
  throw new Error(`var() em ciclo em --${name}`)
}

const darkAll: Vars = { ...rootVars }
const lightAll: Vars = { ...rootVars, ...lightVars }
const sharedAll: Vars = { ...themeVars, ...floatingVisible }

describe('fallback-tokens espelha o tokens.css do DS', () => {
  for (const [name, value] of Object.entries<string>(COLORS_DARK)) {
    it(`dark --${name}`, () => {
      expect(value.toLowerCase()).toBe(resolve(name, darkAll))
    })
  }

  for (const [name, value] of Object.entries<string>(COLORS_LIGHT)) {
    it(`light --${name}`, () => {
      expect(value.toLowerCase()).toBe(resolve(name, lightAll))
    })
  }

  for (const [name, t] of Object.entries(SHARED)) {
    // `--spacing-floating`: o DS usa 6.5rem sem o layer e 9rem com ele visível (o fixture traz os dois).
    it(`compartilhado --fl-${name} (--${t.host})`, () => {
      expect(t.value.toLowerCase()).toBe(resolve(t.host, sharedAll))
    })
  }

  it('o acento é #F5C518 nos dois temas e o texto sobre ele é escuro', () => {
    for (const set of [COLORS_DARK, COLORS_LIGHT]) {
      expect(set.accent).toBe('#f5c518')
      expect(set['accent-fg']).toBe('#151517')
    }
  })

  it('todo token do DS é espelhado ou está na lista de exceções', () => {
    const mirrored = new Set<string>([
      ...Object.keys(COLORS_DARK),
      ...Object.values(SHARED).map((t) => t.host),
    ])
    const notMirrored = [...new Set([...Object.keys(rootVars), ...Object.keys(lightVars), ...Object.keys(themeVars)])]
      .filter((n) => !mirrored.has(n))
      .sort()
    // Novo token no DS? Espelhe em fallback-tokens.ts ou inclua aqui de propósito.
    // Escala accent-50…900 e text-micro/heading/display/placeholder: o layer não usa.
    expect(notMirrored).toEqual(
      [
        'accent-50', 'accent-100', 'accent-200', 'accent-300', 'accent-400',
        'accent-500', 'accent-600', 'accent-700', 'accent-800', 'accent-900',
        'placeholder', 'text-display', 'text-heading', 'text-micro',
      ].sort(),
    )
  })
})
