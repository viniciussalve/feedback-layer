// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedbackLayerElement, register, TAG } from '../src/element.js'
import { validateNote, type FeedbackNote } from '../src/schema.js'
import type { Transport } from '../src/transport.js'

register()

let layer: FeedbackLayerElement
const sh = () => layer.shadowRoot!
const q = <T extends HTMLElement>(s: string) => sh().querySelector<T>(s)!
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

function fakeTransport(over: Partial<Transport> = {}): Transport & { sent: FeedbackNote[] } {
  const sent: FeedbackNote[] = []
  return {
    name: 'fake',
    destination: 'inbox',
    sent,
    async send(note) {
      sent.push(note)
      return { ok: true, detail: 'arquivo.md' }
    },
    ...over,
  }
}

function mountLayer(t: Transport | null = fakeTransport(), attrs: Record<string, string> = {}) {
  layer = document.createElement(TAG) as FeedbackLayerElement
  layer.setAttribute('project', 'demo')
  for (const [k, v] of Object.entries(attrs)) layer.setAttribute(k, v)
  document.body.appendChild(layer)
  layer.configure({ transport: t })
  return t
}

function pickPageElement(el: Element) {
  q('.fab').click()
  q<HTMLButtonElement>('[data-act="pick"]').click()
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }))
}

const key = (target: EventTarget, k: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init }))

const store = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
})

beforeEach(() => {
  document.body.innerHTML = '<main><button id="host-btn">Comprar</button><input id="pw" type="password" value="s3cr3t-pw"></main>'
  document.documentElement.removeAttribute('data-feedback-layer')
  localStorage.clear()
})
afterEach(() => {
  layer?.remove()
})

describe('<feedback-layer>', () => {
  it('monta com Shadow DOM aberto, marca <html> e injeta o espaçador ao fim do body', () => {
    mountLayer()
    expect(layer.shadowRoot).toBeTruthy()
    expect(document.documentElement.getAttribute('data-feedback-layer')).toBe('visible')
    expect(document.body.lastElementChild?.hasAttribute('data-feedback-layer-spacer')).toBe(true)
  })

  it('no-safe-area não injeta espaçador', () => {
    mountLayer(null, { 'no-safe-area': '' })
    expect(document.querySelector('[data-feedback-layer-spacer]')).toBeNull()
  })

  it('atributo em <html>: remove ao esconder e ao destruir, volta ao mostrar', () => {
    mountLayer()
    layer.hide()
    expect(document.documentElement.hasAttribute('data-feedback-layer')).toBe(false)
    expect(document.querySelector('[data-feedback-layer-spacer]')).toBeNull()
    layer.show()
    expect(document.documentElement.getAttribute('data-feedback-layer')).toBe('visible')
    layer.remove()
    expect(document.documentElement.hasAttribute('data-feedback-layer')).toBe(false)
  })

  it('atalho Alt+Shift+F (por event.code) alterna e anuncia como mostrar de novo', async () => {
    mountLayer()
    // `key` vira "Ƒ"/"F" conforme layout; só o code importa
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'Ï', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
    expect(layer.isVisible).toBe(false)
    await tick(80)
    expect(q('.live').textContent).toBe('Feedback Layer escondido. Atalho para mostrar: Alt+Shift+F')
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', altKey: true, shiftKey: true, bubbles: true }))
    expect(layer.isVisible).toBe(true)
    // sem os modificadores certos, nada
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', altKey: true, bubbles: true }))
    expect(layer.isVisible).toBe(true)
  })

  it('atalho configurável por atributo', () => {
    mountLayer(null, { shortcut: 'Ctrl+Alt+K' })
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', altKey: true, shiftKey: true, bubbles: true }))
    expect(layer.isVisible).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', altKey: true, ctrlKey: true, bubbles: true }))
    expect(layer.isVisible).toBe(false)
  })

  it('fab alterna a barra (aria-expanded) e o botão Elemento usa aria-pressed', () => {
    mountLayer()
    const fab = q<HTMLButtonElement>('.fab')
    expect(fab.getAttribute('aria-expanded')).toBe('false')
    expect(q('.toolbar').hidden).toBe(true)
    fab.click()
    expect(fab.getAttribute('aria-expanded')).toBe('true')
    expect(q('.toolbar').getAttribute('role')).toBe('toolbar')
    q<HTMLButtonElement>('[data-act="pick"]').click()
    expect(q('[data-act="pick"]').getAttribute('aria-pressed')).toBe('true')
    expect(q('.hint').textContent).toBe('Elemento: clique num item da tela, ou use Tab e Enter. Esc cancela.')
  })

  it('a região viva .hint fica sempre no DOM, sem hidden; só o texto muda', () => {
    mountLayer()
    const hint = q('.hint')
    expect(hint.getAttribute('role')).toBe('status')
    expect(hint.hasAttribute('hidden')).toBe(false)
    expect(hint.textContent).toBe('')
    q<HTMLButtonElement>('.fab').click()
    q<HTMLButtonElement>('[data-act="pick"]').click()
    expect(q('.hint')).toBe(hint) // mesmo nó
    expect(hint.hasAttribute('hidden')).toBe(false)
    expect(hint.textContent).not.toBe('')
    sh().host.dispatchEvent(new Event('x')) // sem efeito; garante que o host continua montado
    ;(window as Window).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(q('.hint')).toBe(hint)
    expect(hint.hasAttribute('hidden')).toBe(false)
    expect(hint.textContent).toBe('')
  })

  it('seleção: o clique no item não chega ao app, abre o popover com alvo e foco no comentário', () => {
    mountLayer()
    const hostClick = vi.fn()
    document.getElementById('host-btn')!.addEventListener('click', hostClick)
    pickPageElement(document.getElementById('host-btn')!)
    expect(hostClick).not.toHaveBeenCalled()
    expect(q('.popover').hidden).toBe(false)
    expect(q('.popover').getAttribute('aria-modal')).toBe('false')
    expect(q('[data-ref="sel"]').textContent).toBe('#host-btn')
    expect(sh().activeElement).toBe(q('textarea'))
  })

  it('fora do modo seleção o clique no app passa normalmente', () => {
    mountLayer()
    const hostClick = vi.fn()
    document.getElementById('host-btn')!.addEventListener('click', hostClick)
    document.getElementById('host-btn')!.click()
    expect(hostClick).toHaveBeenCalledTimes(1)
  })

  it('wheel e touchmove não são interceptados durante a seleção (rolagem continua)', () => {
    mountLayer()
    q('.fab').click()
    q<HTMLButtonElement>('[data-act="pick"]').click()
    for (const type of ['wheel', 'touchmove', 'scroll']) {
      const ev = new Event(type, { bubbles: true, cancelable: true })
      document.getElementById('host-btn')!.dispatchEvent(ev)
      expect(ev.defaultPrevented, type).toBe(false)
    }
    // não há overlay de tela cheia: nada no host intercepta eventos fora da UI
    // (o comportamento real é conferido no e2e; aqui, a regra de CSS que garante isso)
    const css = sh().querySelector('style')!.textContent!
    expect(css).toMatch(/\.root \{[^}]*pointer-events: none/)
    expect(css).toMatch(/\.root > \* \{ pointer-events: auto; \}/)
  })

  it('Esc cancela a seleção e devolve o foco ao botão Elemento', () => {
    mountLayer()
    q('.fab').click()
    q<HTMLButtonElement>('[data-act="pick"]').click()
    key(document.body, 'Escape')
    expect(q('[data-act="pick"]').getAttribute('aria-pressed')).toBe('false')
    expect(q('.popover').hidden).toBe(true)
    expect(sh().activeElement).toBe(q('[data-act="pick"]'))
  })

  it('teclado: foco num item + Enter seleciona', () => {
    mountLayer()
    q('.fab').click()
    q<HTMLButtonElement>('[data-act="pick"]').click()
    const btn = document.getElementById('host-btn') as HTMLButtonElement
    btn.focus()
    key(btn, 'Enter')
    expect(q('.popover').hidden).toBe(false)
    expect(q('[data-ref="sel"]').textContent).toBe('#host-btn')
  })

  it('Esc no popover fecha e devolve o foco ao botão flutuante', () => {
    mountLayer()
    pickPageElement(document.getElementById('host-btn')!)
    key(q('textarea'), 'Escape')
    expect(q('.popover').hidden).toBe(true)
    expect(sh().activeElement).toBe(q('.fab'))
  })

  it('comentário vazio: erro com role=alert, aria-invalid, nada enviado', async () => {
    const t = mountLayer() as ReturnType<typeof fakeTransport>
    pickPageElement(document.getElementById('host-btn')!)
    q<HTMLButtonElement>('[data-ref="send"]').click()
    await tick()
    expect(q('#cerr').hidden).toBe(false)
    expect(q('#cerr').getAttribute('role')).toBe('alert')
    expect(q('#cerr').textContent).toContain('Escreva um comentário para enviar.')
    expect(q('textarea').getAttribute('aria-invalid')).toBe('true')
    expect(t.sent).toHaveLength(0)
    // os botões nunca ficam desabilitados por estarem vazios
    expect(q<HTMLButtonElement>('[data-ref="send"]').disabled).toBe(false)
  })

  it('envia nota válida e sanitizada; mostra "Enviado" sem fechar sozinho', async () => {
    const t = mountLayer() as ReturnType<typeof fakeTransport>
    pickPageElement(document.getElementById('host-btn')!)
    q<HTMLTextAreaElement>('textarea').value = 'o botão está torto, token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwx'
    q<HTMLButtonElement>('[data-ref="send"]').click()
    await tick(10)
    expect(t.sent).toHaveLength(1)
    const note = t.sent[0]!
    expect(validateNote(note).ok).toBe(true)
    expect(note.comment).not.toContain('eyJhbGci')
    expect(note.target?.selector).toBe('#host-btn')
    expect(q('.sent').hidden).toBe(false)
    expect(q('[data-ref="sentto"]').textContent).toBe('Enviado para inbox')
    expect(q('[data-ref="where"]').textContent).toBe('arquivo.md')
    // foco dentro do estado Enviado e sem timer de fechamento
    expect(sh().activeElement).toBe(q('[data-ref="sentclose"]'))
    await tick(100)
    expect(q('.popover').hidden).toBe(false)
  })

  it('erro de envio: banner com "Tentar de novo", nota preservada, retry reaproveita o mesmo id', async () => {
    let fail = true
    const ids: string[] = []
    const t = fakeTransport({
      async send(note) {
        ids.push(note.id)
        return fail ? { ok: false, message: 'Bridge recusou (500)' } : { ok: true }
      },
    })
    mountLayer(t)
    pickPageElement(document.getElementById('host-btn')!)
    q<HTMLTextAreaElement>('textarea').value = 'texto'
    q<HTMLButtonElement>('[data-ref="send"]').click()
    await tick(10)
    expect(q('[data-ref="errbanner"]').hidden).toBe(false)
    expect(q('[data-ref="errmsg"]').textContent).toContain('Bridge recusou (500)')
    expect(q<HTMLTextAreaElement>('textarea').value).toBe('texto')
    fail = false
    q<HTMLButtonElement>('[data-act="retry"]').click()
    await tick(10)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
    expect(q('.sent').hidden).toBe(false)
  })

  it('bridge offline: botão principal vira "Copiar nota" e o envio não é tentado', async () => {
    const t = fakeTransport({ check: async () => false })
    mountLayer(t)
    pickPageElement(document.getElementById('host-btn')!)
    await tick(10)
    expect(q('[data-ref="send"]').textContent).toBe('Copiar nota')
    expect(q('[data-act="copy"]').hidden).toBe(true)
    expect(q('[data-ref="offbanner"]').hidden).toBe(false)
  })

  it('sem transporte: só copiar; o clipboard recebe o mesmo Markdown da nota', async () => {
    const written: string[] = []
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (s: string) => void written.push(s) } })
    mountLayer(null)
    pickPageElement(document.getElementById('host-btn')!)
    q<HTMLTextAreaElement>('textarea').value = 'comentário `com` crase'
    expect(q('[data-ref="send"]').textContent).toBe('Copiar nota')
    q<HTMLButtonElement>('[data-ref="send"]').click()
    await tick(10)
    expect(written).toHaveLength(1)
    expect(written[0]).toMatch(/<!-- feedback-note:v1 id=[0-9a-f-]{36} -->\n$/)
    expect(written[0]).toContain('#host-btn')
    expect(q('[data-ref="status"]').textContent).toBe('Copiado')
  })

  it('prévia e contexto saem da nota sanitizada (textContent), nunca de HTML', async () => {
    mountLayer()
    document.getElementById('host-btn')!.textContent = '<img src=x onerror=alert(1)>'
    pickPageElement(document.getElementById('host-btn')!)
    const ta = q<HTMLTextAreaElement>('textarea')
    ta.value = '<script>alert(1)</script> Bearer abcdef1234567890abcdef1234567890'
    ;(q('[data-ref="prevbox"]') as HTMLDetailsElement).open = true
    ;(q('[data-ref="ctxbox"]') as HTMLDetailsElement).open = true
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    const pre = q('[data-ref="preview"]')
    expect(pre.textContent).toContain('<script>alert(1)</script>')
    expect(pre.textContent).not.toContain('abcdef1234567890abcdef1234567890')
    expect(sh().querySelector('script, img')).toBeNull()
    expect(q('[data-ref="ctx"]').querySelector('img, script')).toBeNull()
    expect(q('[data-ref="ctx"]').textContent).toContain('demo')
    expect(pre.textContent).toMatch(/<!-- feedback-note:v1 id=[0-9a-f-]{36} -->\n$/)
  })

  it('alvo sensível: o popover mostra "valor protegido" e a nota não leva o valor', async () => {
    const t = mountLayer() as ReturnType<typeof fakeTransport>
    pickPageElement(document.getElementById('pw')!)
    expect(q('[data-ref="note"]').textContent).toBe('valor protegido')
    q<HTMLTextAreaElement>('textarea').value = 'campo estranho'
    q<HTMLButtonElement>('[data-ref="send"]').click()
    await tick(10)
    expect(JSON.stringify(t.sent[0])).not.toContain('s3cr3t-pw')
    expect(t.sent[0]!.target?.text ?? '').toBe('')
  })

  it('rascunho fica 60 s em memória: Esc e nova seleção restauram o comentário', () => {
    mountLayer()
    pickPageElement(document.getElementById('host-btn')!)
    q<HTMLTextAreaElement>('textarea').value = 'rascunho importante'
    key(q('textarea'), 'Escape')
    pickPageElement(document.getElementById('host-btn')!)
    expect(q<HTMLTextAreaElement>('textarea').value).toBe('rascunho importante')
  })

  it('remover o alvo vira comentário geral (target null)', async () => {
    const t = mountLayer() as ReturnType<typeof fakeTransport>
    pickPageElement(document.getElementById('host-btn')!)
    q<HTMLButtonElement>('[data-act="untarget"]').click()
    expect(q('[data-ref="note"]').textContent).toBe('Sem elemento: comentário geral')
    q<HTMLTextAreaElement>('textarea').value = 'geral'
    q<HTMLButtonElement>('[data-ref="send"]').click()
    await tick(10)
    expect(t.sent[0]!.target).toBeNull()
  })

  it('Shift+setas no botão troca de canto e guarda a escolha', () => {
    mountLayer()
    const fab = q<HTMLButtonElement>('.fab')
    expect(q('.dock').dataset.corner).toBe('br')
    key(fab, 'ArrowLeft', { shiftKey: true })
    expect(q('.dock').dataset.corner).toBe('bl')
    key(fab, 'ArrowUp', { shiftKey: true })
    expect(q('.dock').dataset.corner).toBe('tl')
    expect(localStorage.getItem('feedback-layer:corner')).toBe('tl')
  })

  it('CSS do shadow não tem cores hex nem px fora dos tokens de fallback', async () => {
    const { STYLES } = await import('../src/styles.js')
    const body = STYLES.slice(STYLES.indexOf(':host { all: initial'))
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(body).not.toMatch(/\b\d+(\.\d+)?px\b/)
  })
})
