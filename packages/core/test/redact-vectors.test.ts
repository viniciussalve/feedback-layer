import { describe, expect, it } from 'vitest'
import { redact, redactConsole, redactSecrets } from '../src/redact.js'

// Número de cartão de teste (Visa), válido no Luhn.
const CARD = '4111 1111 1111 1111'
const AWS = 'AKIA' + 'IOSFODNN7EXAMPLE'
const SLACK = 'xoxb-' + '123456789012-abcdefghij'
const GH = 'ghp_' + 'abcdefghijklmnopqrstuvwxyz0123456789'
const SK = 'sk-proj-' + 'abcdEFGH1234'

/** Entradas onde um segredo NÃO pode sobreviver, em todas as funções (exceto onde indicado). */
const EVERYWHERE: Array<[string, string]> = [
  ['JSON com aspas', '{"password":"hunter2"}'],
  ['JSON token', 'x {"token":"abc123"} y'],
  ['JSON com espaços', '{ "password" : "hunter2 com espaço" }'],
  ['JSON escapado dentro de string', '{\\"password\\":\\"hunter2\\"}'],
  ['igual com aspas simples', "password='hunter2'"],
  ['access_token=', 'access_token=abc123def'],
  ['refresh_token=', 'refresh_token=abc123def'],
  ['client_secret=', 'client_secret=abc123def'],
  ['sufixo camelCase', 'dbPassword=abc123def'],
  ['api_key=', 'api_key=sk-abc'],
  ['apikey=', 'apikey=abc123'],
  ['cookie=', 'cookie=sessionvalue123'],
  ['Authorization Basic (=)', 'authorization=Basic dXNlcjpwYXNz'],
  ['url com credenciais', 'falha em postgres://admin:s3nha@db.interno/x'],
  ['sk-', `chave ${SK} fim`],
  ['ghp_', `token ${GH} fim`],
  ['xoxb-', `slack ${SLACK} fim`],
  ['AKIA', `aws ${AWS} fim`],
  ['cartão com espaços', `cartão ${CARD} fim`],
  ['cartão com hífen', 'cartão 4111-1111-1111-1111 fim'],
  ['cartão sem separador', 'cartão 4111111111111111 fim'],
]

const SECRET_PARTS = ['hunter2', 'abc123', 'abc123def', 'sk-abc', 'sessionvalue123', 'dXNlcjpwYXNz', 's3nha', SK, GH, SLACK, AWS, '4111']

const fns: Array<[string, (s: string) => string]> = [
  ['redactSecrets', redactSecrets],
  ['redact', redact],
  ['redactConsole', redactConsole],
]

describe('redação: vetores do Aprovador', () => {
  for (const [fname, fn] of fns) {
    for (const [name, input] of EVERYWHERE) {
      it(`${fname}: ${name}`, () => {
        const out = fn(input)
        for (const part of SECRET_PARTS) {
          if (input.includes(part)) expect(out, `"${part}" sobrou em: ${out}`).not.toContain(part)
        }
        expect(fn(out)).toBe(out) // idempotente
      })
    }
  }

  it('dois-pontos solto: redigido fora do comment (text/console)', () => {
    for (const fn of [redact, redactConsole]) {
      expect(fn('password: hunter2')).not.toContain('hunter2')
      expect(fn('api_key: sk-abc')).not.toContain('sk-abc')
      expect(fn('Authorization: Basic dXNlcjpwYXNz')).not.toContain('dXNlcjpwYXNz')
      expect(fn('Authorization: Basic dXNlcjpwYXNz')).toContain('Basic')
      expect(fn('"token":"abc123"')).not.toContain('abc123')
    }
  })

  it('Authorization: <esquema> <valor> também no comment (cabeçalho completo)', () => {
    const out = redactSecrets('Authorization: Basic dXNlcjpwYXNz')
    expect(out).not.toContain('dXNlcjpwYXNz')
    expect(out).toContain('Basic')
  })

  it('comment: dois-pontos solto é texto comum', () => {
    expect(redactSecrets('senha: obrigatória')).toBe('senha: obrigatória')
    expect(redactSecrets('password: obrigatório')).toBe('password: obrigatório')
    expect(redactSecrets('o token: expira cedo')).toBe('o token: expira cedo')
  })

  it('comment: = e JSON entre aspas continuam redigidos', () => {
    expect(redactSecrets('password=hunter2')).toBe('password=[redacted]')
    expect(redactSecrets('{"password":"hunter2"}')).toBe('{"password":"[redacted]"}')
  })

  it('code: só no console e em query string; no comment e no texto comum fica', () => {
    expect(redactConsole('oauth falhou code=4/0AbCdEf')).toBe('oauth falhou code=[redacted]')
    expect(redactConsole('{"code":"4/0AbCdEf"}')).not.toContain('4/0AbCdEf')
    expect(redact('https://x.dev/cb?state=1&code=4/0AbCdEf')).not.toContain('4/0AbCdEf')
    expect(redactConsole('https://x.dev/cb?code=abc')).toBe('https://x.dev/cb?code=[redacted]')
    expect(redactSecrets('code=200')).toBe('code=200')
    expect(redact('status code: 200')).toBe('status code: 200')
    expect(redactSecrets('o code=404 apareceu')).toBe('o code=404 apareceu')
    expect(redactConsole('barcode=12345')).toBe('barcode=12345')
  })

  it('cartão: só com Luhn válido; timestamp, id e telefone ficam', () => {
    expect(redactSecrets(`cartão ${CARD}`)).toBe('cartão [card]')
    expect(redactSecrets('ts 1730828400123 ok')).toBe('ts 1730828400123 ok') // 13 dígitos, Luhn inválido
    expect(redactSecrets('pedido 1234567890123456 ok')).toBe('pedido 1234567890123456 ok')
    expect(redactSecrets('tel 11 98765-4321')).toBe('tel 11 98765-4321')
    expect(redact('ts 1730828400123')).toBe('ts 1730828400123')
  })

  it('não redige texto comum nem nomes parecidos', () => {
    expect(redact('Botão Play desalinhado')).toBe('Botão Play desalinhado')
    expect(redact('Status: ok')).toBe('Status: ok')
    expect(redact('Tokenizer=on')).toBe('Tokenizer=on')
    expect(redact('Autor: Ana')).toBe('Autor: Ana')
    expect(redactSecrets('https://exemplo.com/a:b')).toBe('https://exemplo.com/a:b')
    expect(redactSecrets('http://localhost:5173/x')).toBe('http://localhost:5173/x')
  })

  it('console.error({password, token}) serializado não vaza', () => {
    const msg = JSON.stringify({ password: 'hunter2', token: 'abc123', ok: true })
    const out = redactConsole(msg)
    expect(out).not.toContain('hunter2')
    expect(out).not.toContain('abc123')
    expect(out).toContain('"ok":true')
  })
})
