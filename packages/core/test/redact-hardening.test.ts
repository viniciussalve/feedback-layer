import { describe, expect, it } from 'vitest'
import { redact, redactConsole, redactSecrets } from '../src/redact.js'
import { sanitizeNote } from '../src/sanitize.js'
import { makeNote } from './fixtures.js'

const fns: Array<[string, (s: string) => string]> = [
  ['redactSecrets', redactSecrets],
  ['redact', redact],
  ['redactConsole', redactConsole],
]

// Tempo medido por chamada, com folga grande: no ambiente do Dev a redação de 40.000 caracteres leva poucos ms.
const LIMIT_MS = 100
function ms(fn: () => unknown): number {
  const t = performance.now()
  fn()
  return performance.now() - t
}

describe('custo da redação não cresce com a entrada', () => {
  for (const ch of ['-', '_', 'a', '0', '-a', '_1']) {
    for (const [name, fn] of fns) {
      it(`${name}: 40.000 × "${ch}" em menos de ${LIMIT_MS} ms`, () => {
        const input = ch.repeat(40_000 / ch.length)
        const t = ms(() => fn(input))
        console.info(`  ${name} 40k "${ch}": ${t.toFixed(1)} ms`)
        expect(t).toBeLessThan(LIMIT_MS)
      })
    }
  }

  it('entradas com muitos separadores e nomes parecidos também ficam lineares', () => {
    for (const input of ['password='.repeat(5000), 'a-'.repeat(20_000) + 'token=x', 'cookie: '.repeat(5000), '1 '.repeat(20_000)]) {
      for (const [, fn] of fns) expect(ms(() => fn(input))).toBeLessThan(LIMIT_MS * 3)
    }
  })

  it('sanitizeNote com erro de console gigante de - e _ em menos de 100 ms', () => {
    const base = makeNote()
    const note = {
      ...base,
      comment: '-'.repeat(40_000),
      consoleErrors: [
        { ts: '2026-11-05T17:00:00.000Z', message: '-'.repeat(40_000) },
        { ts: '2026-11-05T17:00:01.000Z', message: '_'.repeat(40_000) },
      ],
      page: { ...base.page, title: '_'.repeat(40_000) },
    }
    let out = note
    const t = ms(() => (out = sanitizeNote(note)))
    console.info(`  sanitizeNote com entradas de 40k: ${t.toFixed(1)} ms`)
    expect(t).toBeLessThan(LIMIT_MS)
    expect(out.consoleErrors[0].message.length).toBeLessThanOrEqual(300)
    expect(out.comment.length).toBeLessThanOrEqual(2000)
    expect(sanitizeNote(out)).toEqual(out) // continua idempotente
  })
})

describe('nomes em português e chaves Stripe', () => {
  it('senha, segredo, pass e chave', () => {
    for (const fn of [redactSecrets, redact, redactConsole]) {
      expect(fn('senha=abc123')).toBe('senha=[redacted]')
      expect(fn('nova_senha=abc123')).toBe('nova_senha=[redacted]')
      expect(fn('segredo=abc123')).toBe('segredo=[redacted]')
      expect(fn('pass=abc123')).toBe('pass=[redacted]')
      expect(fn('chave=abc123')).toBe('chave=[redacted]')
      expect(fn('{"senha":"abc123"}')).toBe('{"senha":"[redacted]"}')
    }
    for (const fn of [redact, redactConsole]) {
      expect(fn('senha: abc123')).toBe('senha: [redacted]')
    }
  })

  it('pass e chave só como nome inteiro: compass e chaveiro ficam', () => {
    for (const fn of [redactSecrets, redact, redactConsole]) {
      expect(fn('compass=norte')).toBe('compass=norte')
      expect(fn('chaveiro=Ze')).toBe('chaveiro=Ze')
      expect(fn('bypass=true')).toBe('bypass=true')
      expect(fn('passo=3')).toBe('passo=3')
    }
  })

  it('comment: "senha: obrigatória" continua texto', () => {
    expect(redactSecrets('senha: obrigatória')).toBe('senha: obrigatória')
  })

  it('sk_live_ e sk_test_', () => {
    for (const fn of [redactSecrets, redact, redactConsole]) {
      expect(fn('stripe sk_live_' + '51Hh8s9KjLm fim')).toBe('stripe [token] fim')
      expect(fn('stripe sk_test_' + '51Hh8s9KjLm fim')).toBe('stripe [token] fim')
      expect(fn('sk_live_' + 'abc')).toBe('sk_live_abc') // curto demais para ser chave
    }
  })
})

describe('cookie: o valor vai até o fim da linha', () => {
  it('Cookie: a=1; b=2 não deixa o segundo valor', () => {
    for (const fn of [redact, redactConsole]) {
      const out = fn('req Cookie: a=1; b=segundo')
      expect(out).toBe('req Cookie: [redacted]')
      expect(fn('Set-Cookie: sid=abc; Path=/; HttpOnly')).toBe('Set-Cookie: [redacted]')
      expect(fn(out)).toBe(out)
    }
  })

  it('cookie= funciona em todos os modos, inclusive no comment', () => {
    for (const fn of [redactSecrets, redact, redactConsole]) {
      expect(fn('cookie=a=1; b=segundo')).toBe('cookie=[redacted]')
    }
  })

  it('comment: "cookie: ..." solto é texto comum', () => {
    expect(redactSecrets('o cookie: banner some')).toBe('o cookie: banner some')
  })
})

describe('não coberto (documentado em redactSecrets e no README)', () => {
  it('só registra o comportamento atual: array, Digest e usuário vazio', () => {
    // Não é uma garantia: se um dia for coberto, atualize este teste e o README.
    expect(redactConsole('redis://:senha@host')).toContain('senha')
    expect(redactConsole('Authorization: Digest username="x", response="abc"')).toContain('response')
  })
})
