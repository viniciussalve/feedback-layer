// Entrada do build IIFE (<script src="feedback-layer.iife.js">).
// Uma linha instala o botão:
//   <script src="feedback-layer.iife.js" data-project="meu-projeto" data-bridge="http://127.0.0.1:7777"></script>
import { FeedbackLayerElement, TAG, register } from './element.js'
import { installConsoleCapture } from './capture.js'

export { FeedbackLayerElement, register }
export * from './note.js'
export { httpTransport, clipboardTransport } from './transport.js'

export interface MountOptions {
  project?: string
  version?: string
  commit?: string
  from?: string
  to?: string
  bridge?: string
}

/** Cria e anexa `<feedback-layer>` (uma única vez por página). */
export function mount(opts: MountOptions = {}): FeedbackLayerElement {
  register()
  const existing = document.querySelector<FeedbackLayerElement>(TAG)
  if (existing) return existing
  const el = document.createElement(TAG) as FeedbackLayerElement
  const set = (k: string, v?: string) => v && el.setAttribute(k, v)
  set('project', opts.project)
  set('project-version', opts.version)
  set('project-commit', opts.commit)
  set('from', opts.from)
  set('to', opts.to)
  set('bridge', opts.bridge)
  document.body.appendChild(el)
  return el
}

installConsoleCapture() // o mais cedo possível: erros anteriores ao clique entram na nota

const script = document.currentScript as HTMLScriptElement | null
if (script && script.dataset.project !== undefined) {
  const run = () => {
    const d = script.dataset
    const o: MountOptions = {}
    if (d.project) o.project = d.project
    if (d.version) o.version = d.version
    if (d.commit) o.commit = d.commit
    if (d.from) o.from = d.from
    if (d.to) o.to = d.to
    if (d.bridge) o.bridge = d.bridge
    mount(o)
  }
  if (document.body) run()
  else document.addEventListener('DOMContentLoaded', run, { once: true })
}
