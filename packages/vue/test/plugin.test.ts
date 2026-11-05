import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import FeedbackLayer, { FeedbackSafeArea, useFeedbackLayer, TAG, type FeedbackLayerOptions } from '../src/index.js'
import type { FeedbackLayerElement } from '@feedback-layer/core'

const store = new Map<string, string>()
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
}

let host: HTMLElement

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  store.clear()
  document.body.innerHTML = '<div id="app"></div>'
  host = document.getElementById('app') as HTMLElement
})

afterEach(() => {
  document.querySelectorAll(TAG).forEach((n) => n.remove())
  document.documentElement.removeAttribute('data-feedback-layer')
})

function mountApp(opts: FeedbackLayerOptions, withRouter = false) {
  const Root = defineComponent({ render: () => h('main', [h(FeedbackSafeArea)]) })
  const app = createApp(Root)
  if (withRouter) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/a/:id', component: { render: () => h('i') } }],
    })
    app.use(FeedbackLayer, opts) // propositalmente antes do router
    app.use(router)
    void router.push('/a/7?token=segredo')
    return { app, router }
  }
  app.use(FeedbackLayer, opts)
  app.mount(host)
  return { app }
}

describe('plugin Vue', () => {
  it('exige project', () => {
    const app = createApp({ render: () => h('i') })
    expect(() => app.use(FeedbackLayer, {} as FeedbackLayerOptions)).toThrow(/project/)
  })

  it('monta <feedback-layer> uma vez, com atributos, e o atributo no <html>', () => {
    const { app } = mountApp({ project: 'meu-app', version: '1.2.3', from: 'vini', to: 'meu-app', bridge: 'http://127.0.0.1:7777' })
    const els = document.querySelectorAll(TAG)
    expect(els).toHaveLength(1)
    const el = els[0] as FeedbackLayerElement
    expect(el.getAttribute('project')).toBe('meu-app')
    expect(el.getAttribute('project-version')).toBe('1.2.3')
    expect(el.getAttribute('bridge')).toBe('http://127.0.0.1:7777')
    expect(document.documentElement.getAttribute('data-feedback-layer')).toBe('visible')
    app.unmount()
  })

  it('um segundo app.use reaproveita o elemento existente', () => {
    const a = mountApp({ project: 'p' })
    const b = mountApp({ project: 'p' })
    expect(document.querySelectorAll(TAG)).toHaveLength(1)
    a.app.unmount()
    b.app.unmount()
  })

  it('safeArea "host" (padrão) não injeta espaçador; "spacer" injeta', () => {
    const a = mountApp({ project: 'p' })
    expect(document.querySelector('[data-feedback-layer-spacer]')).toBeNull()
    expect(document.querySelector(TAG)!.hasAttribute('no-safe-area')).toBe(true)
    a.app.unmount()
    const b = mountApp({ project: 'p', safeArea: 'spacer' })
    expect(document.querySelector('[data-feedback-layer-spacer]')).not.toBeNull()
    b.app.unmount()
  })

  it('FeedbackSafeArea é aria-hidden e lê --spacing-floating', () => {
    const { app } = mountApp({ project: 'p' })
    const div = host.querySelector('main > div') as HTMLElement
    expect(div.getAttribute('aria-hidden')).toBe('true')
    expect(div.style.height).toContain('--spacing-floating')
    app.unmount()
  })

  it('show()/hide() pelo composable controlam o atributo no <html>', () => {
    let api!: ReturnType<typeof useFeedbackLayer>
    const Root = defineComponent({
      setup() {
        api = useFeedbackLayer()
        return () => h('main')
      },
    })
    const app = createApp(Root)
    app.use(FeedbackLayer, { project: 'p' })
    app.mount(host)
    api.hide()
    expect(document.documentElement.hasAttribute('data-feedback-layer')).toBe(false)
    api.show()
    expect(document.documentElement.getAttribute('data-feedback-layer')).toBe('visible')
    app.unmount()
  })

  it('app.unmount remove o elemento e o atributo do <html>', () => {
    const { app } = mountApp({ project: 'p' })
    app.unmount()
    expect(document.querySelector(TAG)).toBeNull()
    expect(document.documentElement.hasAttribute('data-feedback-layer')).toBe(false)
  })

  it('a rota vem do vue-router, só o path, mesmo instalado depois do plugin', async () => {
    const { app, router } = mountApp({ project: 'p' }, true)
    await router!.isReady()
    app.mount(host)
    const el = document.querySelector(TAG) as FeedbackLayerElement
    el.show()
    const cfg = (el as unknown as { cfg: { getRoute?: () => string } }).cfg
    expect(cfg.getRoute?.()).toBe('/a/7')
    app.unmount()
  })
})
