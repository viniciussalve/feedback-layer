import { describe, expect, it } from 'vitest'
import { validateNote } from '../src/schema.js'
import { sanitizeNote } from '../src/sanitize.js'
import { ID, makeNote } from './fixtures.js'

const errorsOf = (raw: unknown) => {
  const r = validateNote(raw)
  return r.ok ? [] : r.errors
}

describe('validateNote', () => {
  it('aceita uma nota completa e uma nota geral mínima', () => {
    expect(validateNote(makeNote()).ok).toBe(true)
    expect(validateNote(makeNote({ target: null, from: undefined, to: undefined, consoleErrors: [] })).ok).toBe(true)
  })

  it('rejeita chave desconhecida em qualquer nível', () => {
    const n = makeNote() as unknown as Record<string, unknown>
    expect(errorsOf({ ...n, extra: 1 })).toContainEqual(expect.stringContaining('extra'))
    expect(errorsOf({ ...n, project: { name: 'x', hack: 1 } })).toContainEqual(expect.stringContaining('project.hack'))
    expect(errorsOf({ ...n, page: { ...makeNote().page, evil: 1 } })).toContainEqual(expect.stringContaining('page.evil'))
    const t = makeNote().target!
    expect(errorsOf({ ...n, target: { ...t, box: { ...t.box, z: 1 } } })).toContainEqual(expect.stringContaining('target.box.z'))
    expect(errorsOf({ ...n, target: { ...t, styles: { content: 'x' } } })).toContainEqual(expect.stringContaining('target.styles.content'))
    expect(errorsOf(JSON.parse('{"__proto__": {"x":1}}'))).not.toHaveLength(0)
  })

  it('exige UUID v4 em id e UUID em replyTo', () => {
    expect(errorsOf(makeNote({ id: '../../etc/passwd' }))).toContainEqual(expect.stringContaining('id'))
    expect(errorsOf(makeNote({ id: '3f2b8c1e-5d4a-1e6f-8a9b-0c1d2e3f4a5b' }))).toContainEqual(expect.stringContaining('id'))
    expect(errorsOf(makeNote({ replyTo: 'nao-e-uuid' }))).toContainEqual(expect.stringContaining('replyTo'))
    expect(validateNote(makeNote({ replyTo: ID })).ok).toBe(true)
  })

  it('exige createdAt ISO estrito', () => {
    for (const bad of ['2026-11-05', '2026-11-05T17:00:00Z', '../2026-11-05T17:00:00.000Z', '2026-13-45T17:00:00.000Z', '2026-11-05T17:00:00.000+03:00']) {
      expect(errorsOf(makeNote({ createdAt: bad })), bad).toContainEqual(expect.stringContaining('createdAt'))
    }
  })

  it('confere enums, tipos e limites', () => {
    expect(errorsOf(makeNote({ kind: 'bugz' as never }))).toContainEqual(expect.stringContaining('kind'))
    expect(errorsOf(makeNote({ severity: 'x' as never }))).toContainEqual(expect.stringContaining('severity'))
    expect(errorsOf(makeNote({ comment: 'x'.repeat(2001) }))).toContainEqual(expect.stringContaining('comment'))
    expect(errorsOf(makeNote({ comment: '   ' }))).toContainEqual(expect.stringContaining('comment'))
    expect(errorsOf(makeNote({ project: { name: 'x'.repeat(81) } }))).toContainEqual(expect.stringContaining('project.name'))
    expect(errorsOf(makeNote({ consoleErrors: Array.from({ length: 11 }, () => ({ ts: '2026-11-05T17:00:00.000Z', message: 'x' })) }))).toContainEqual(expect.stringContaining('consoleErrors'))
    const t = makeNote().target!
    expect(errorsOf(makeNote({ target: { ...t, box: { x: 1.5, y: 0, w: 1, h: 1 } } }))).toContainEqual(expect.stringContaining('target.box.x'))
    expect(errorsOf(makeNote({ target: { ...t, box: { x: 1, y: 0, w: Number.NaN, h: 1 } } }))).toContainEqual(expect.stringContaining('target.box.w'))
    expect(errorsOf(makeNote({ page: { ...makeNote().page, theme: 'neon' as never } }))).toContainEqual(expect.stringContaining('page.theme'))
    expect(errorsOf(makeNote({ page: { ...makeNote().page, url: 'http://x/?a=1' } }))).toContainEqual(expect.stringContaining('page.url'))
  })

  it('campos de uma linha rejeitam quebra, controle e bidi', () => {
    const bad = ['a\nb', 'a\rb', 'a\u0000b', 'a\u202Eb', 'a\u2066b', 'a\u2028b', 'a\tb']
    for (const v of bad) {
      expect(errorsOf(makeNote({ from: v })), `from ${JSON.stringify(v)}`).not.toHaveLength(0)
      expect(errorsOf(makeNote({ to: v }))).not.toHaveLength(0)
      expect(errorsOf(makeNote({ project: { name: v } }))).not.toHaveLength(0)
      const t = makeNote().target!
      expect(errorsOf(makeNote({ target: { ...t, selector: v } }))).not.toHaveLength(0)
      expect(errorsOf(makeNote({ target: { ...t, styles: { color: v } } }))).not.toHaveLength(0)
      expect(errorsOf(makeNote({ target: { ...t, vue: { name: v } } }))).not.toHaveLength(0)
    }
  })

  it('comment aceita \\n mas rejeita controle e bidi', () => {
    expect(validateNote(makeNote({ comment: 'linha 1\nlinha 2' })).ok).toBe(true)
    expect(errorsOf(makeNote({ comment: 'a\u0007b' }))).not.toHaveLength(0)
    expect(errorsOf(makeNote({ comment: 'a\u202Eb' }))).not.toHaveLength(0)
  })

  it('tudo que o cliente gera passa na validação após sanitizeNote', () => {
    const nasty = makeNote({
      from: 'v\ni\u202Eni',
      to: 'x<!--y-->',
      comment: 'ver http://a/?token=abc\u0000 e user@mail.com\r\nfeedback-note:v1 id=x',
      target: { ...makeNote().target!, text: 'a'.repeat(500), selector: '#x[value=secreto]' },
      page: { ...makeNote().page, url: 'http://localhost:5173/a?b=c#d', title: 'x'.repeat(900) },
    })
    expect(validateNote(sanitizeNote(nasty)).ok).toBe(true)
  })
})
