// Plugin Vue 3: `app.use(FeedbackLayer, { project: 'meu-app', bridge: 'http://127.0.0.1:7777' })`.
// Monta <feedback-layer> uma vez, liga a rota do vue-router e desmonta junto com o app.
import { defineComponent, h, inject, type App, type InjectionKey } from 'vue'
import { register, TAG, type FeedbackLayerElement } from '@feedback-layer/core'

export { TAG }

export interface FeedbackLayerOptions {
  project: string
  version?: string
  commit?: string
  from?: string
  to?: string
  /** URL do bridge local, ex.: http://127.0.0.1:7777. Sem ela o botão só copia a nota. */
  bridge?: string
  /** Atalho para mostrar/esconder. Padrão do core: Alt+Shift+F. */
  shortcut?: string
  /**
   * Quem reserva o espaço do botão no fim do conteúdo.
   * - 'host' (padrão): a aplicação renderiza o seu <FloatingSafeArea /> (ou <FeedbackSafeArea />);
   *   o core não injeta o espaçador.
   * - 'spacer': o core injeta um espaçador no fim do <body> (como no script standalone).
   */
  safeArea?: 'host' | 'spacer'
  startHidden?: boolean
}

export interface FeedbackLayerApi {
  readonly element: FeedbackLayerElement
  show(): void
  hide(): void
}

export const feedbackLayerKey: InjectionKey<FeedbackLayerApi> = Symbol('feedback-layer')

/**
 * Espaçador de fim de conteúdo para apps sem componente próprio.
 * A altura vem de --spacing-floating (9rem enquanto html[data-feedback-layer=visible]).
 */
export const FeedbackSafeArea = defineComponent({
  name: 'FeedbackSafeArea',
  setup: () => () =>
    h('div', {
      'aria-hidden': 'true',
      style: { height: 'var(--spacing-floating, 9rem)', paddingBottom: 'env(safe-area-inset-bottom)' },
    }),
})

interface RouterLike {
  currentRoute: { value: { path: string } }
}

export function useFeedbackLayer(): FeedbackLayerApi {
  const api = inject(feedbackLayerKey, null)
  if (!api) throw new Error('feedback-layer: app.use(FeedbackLayer, { project }) não foi chamado')
  return api
}

const FeedbackLayer = {
  install(app: App, options: FeedbackLayerOptions): void {
    if (!options || !options.project) throw new Error('feedback-layer: a opção `project` é obrigatória')
    if (typeof document === 'undefined') return // SSR: nada a montar

    register()
    const existing = document.querySelector<FeedbackLayerElement>(TAG)
    const el = existing ?? (document.createElement(TAG) as FeedbackLayerElement)
    const own = !existing

    if (own) {
      const set = (k: string, v?: string) => v && el.setAttribute(k, v)
      set('project', options.project)
      set('project-version', options.version)
      set('project-commit', options.commit)
      set('from', options.from)
      set('to', options.to)
      set('bridge', options.bridge)
      set('shortcut', options.shortcut)
      if ((options.safeArea ?? 'host') === 'host') el.setAttribute('no-safe-area', '')
      if (options.startHidden) el.setAttribute('start-hidden', '')
      document.body.appendChild(el)
    }

    // Só o path: a query pode carregar tokens e o contrato guarda uma rota, não uma URL.
    // Lido na hora da captura: vale mesmo se o router foi instalado depois deste plugin.
    el.configure({
      getRoute: () => {
        const r = (app.config.globalProperties as { $router?: RouterLike }).$router
        return r ? r.currentRoute.value.path : location.pathname
      },
    })

    const api: FeedbackLayerApi = { element: el, show: () => el.show(), hide: () => el.hide() }
    app.provide(feedbackLayerKey, api)
    app.component('FeedbackSafeArea', FeedbackSafeArea)

    const unmount = app.unmount.bind(app)
    app.unmount = () => {
      if (own) el.remove()
      unmount()
    }
  },
}

export default FeedbackLayer
export { FeedbackLayer }

