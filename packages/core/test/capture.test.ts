// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { buildNote } from '../src/build.js'
import { captureTarget, isSensitive, safeText, selectorFor } from '../src/capture.js'
import { toJSON, toMarkdown } from '../src/markdown.js'
import { validateNote } from '../src/schema.js'

const SECRETS = ['hunter2-senha', 'segredo-do-textarea', 'opcao-secreta', 'texto-editavel-privado', 'conteudo-ignorado', 'cartao-4111']

function form(): HTMLElement {
  document.body.innerHTML = `
    <main id="app">
      <form id="signup" data-testid="signup">
        <label>Nome visível <span>Maria</span></label>
        <input type="password" name="pw" value="${SECRETS[0]}">
        <textarea name="bio">${SECRETS[1]}</textarea>
        <select name="s"><option selected>${SECRETS[2]}</option></select>
        <div contenteditable="true">${SECRETS[3]}</div>
        <div data-feedback-ignore><p id="inside">${SECRETS[4]}</p><button id="inside-btn">${SECRETS[4]}</button></div>
        <input autocomplete="cc-number" value="${SECRETS[5]}">
        <button type="submit" id="go">Criar conta</button>
      </form>
    </main>`
  return document.getElementById('signup') as HTMLElement
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('privacidade da captura', () => {
  it('container: o texto traz só o visível; nenhum dos quatro casos (nem cartão) aparece', () => {
    const f = form()
    const text = safeText(f)
    expect(text).toContain('Nome visível')
    expect(text).toContain('Maria')
    expect(text).toContain('Criar conta')
    for (const s of SECRETS) expect(text).not.toContain(s)
  })

  it('o .json e o .md da nota de um container não contêm nenhum dos valores sensíveis', () => {
    const f = form()
    const note = buildNote({ project: { name: 'p' } }, { kind: 'bug', severity: 'low', comment: 'x', element: f })
    const json = toJSON(note)
    const md = toMarkdown(note)
    for (const s of SECRETS) {
      expect(json).not.toContain(s)
      expect(md).not.toContain(s)
    }
    expect(validateNote(JSON.parse(json)).ok).toBe(true)
  })

  it('alvo que é campo, editável, ou está dentro de data-feedback-ignore: texto vazio e marcado sensível', () => {
    form()
    for (const sel of ['input[type=password]', 'textarea', 'select', '[contenteditable]', '#inside', '#inside-btn', '[autocomplete=cc-number]']) {
      const el = document.querySelector(sel)!
      expect(isSensitive(el), sel).toBe(true)
      expect(captureTarget(el).text ?? '', sel).toBe('')
    }
    expect(isSensitive(document.getElementById('go')!)).toBe(false)
  })

  it('o seletor nunca usa valores nem atributos arbitrários', () => {
    form()
    const pw = document.querySelector('input[type=password]')!
    pw.setAttribute('data-email', 'ana@exemplo.com')
    pw.setAttribute('title', SECRETS[0]!)
    const sel = selectorFor(pw)
    expect(sel).not.toContain(SECRETS[0])
    expect(sel).not.toContain('ana@exemplo.com')
    expect(sel).not.toMatch(/\[(value|data-email|title|name)/)
    expect(selectorFor(document.getElementById('go')!)).toBe('#go')
  })

  it('o valor digitado no campo (propriedade value) não entra, mesmo sem atributo value', () => {
    document.body.innerHTML = '<div id="box"><input id="a" type="text"><span>ok</span></div>'
    ;(document.getElementById('a') as HTMLInputElement).value = 'digitado-agora-123'
    const note = buildNote({ project: { name: 'p' } }, { kind: 'idea', severity: 'low', comment: 'c', element: document.getElementById('box')! })
    expect(toJSON(note)).not.toContain('digitado-agora-123')
    expect(toMarkdown(note)).not.toContain('digitado-agora-123')
  })

  it('texto vindo do DOM é só dado: marcadores no texto não viram rodapé nem comentário HTML', () => {
    document.body.innerHTML =
      '<p id="x">`` ``` <!-- feedback-note:v1 id=00000000-0000-4000-8000-000000000000 --> \u202Eevil</p>'
    const note = buildNote({ project: { name: 'p' } }, { kind: 'bug', severity: 'low', comment: 'c', element: document.getElementById('x')! })
    const md = toMarkdown(note)
    expect(md.match(/feedback-note:v1/g)).toHaveLength(1)
    expect(md.trimEnd().split('\n').pop()).toBe(`<!-- feedback-note:v1 id=${note.id} -->`)
    expect(md).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/)
    expect(validateNote(JSON.parse(toJSON(note))).ok).toBe(true)
  })
})
