import type { FeedbackTarget, StyleKey, Theme } from './schema.js'

/**
 * Captura de contexto no navegador. Nada daqui sai da página: o resultado passa por
 * `sanitizeNote` (redação) antes de ir para prévia, clipboard ou transporte.
 * Privacidade: valores de campos (input/textarea/select/contenteditable/password/cc-*)
 * e elementos `[data-feedback-ignore]` nunca entram.
 */

// ---------------------------------------------------------------- erros do console

export interface ConsoleEntry {
  ts: string
  message: string
}

const BUFFER_MAX = 10
const buffer: ConsoleEntry[] = []
let installed = false

const MESSAGE_MAX = 2000 // um erro gigante não entra inteiro no buffer (a nota guarda 300 de qualquer jeito)

function push(message: string) {
  buffer.push({ ts: new Date().toISOString(), message: message.length > MESSAGE_MAX ? message.slice(0, MESSAGE_MAX) : message })
  while (buffer.length > BUFFER_MAX) buffer.shift()
}

function describe(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`
  if (typeof arg === 'string') return arg.slice(0, MESSAGE_MAX)
  try {
    return (JSON.stringify(arg) ?? String(arg)).slice(0, MESSAGE_MAX)
  } catch {
    return String(arg).slice(0, MESSAGE_MAX)
  }
}

/** Idempotente. Guarda só os últimos erros (console.error, window.onerror, promise rejeitada). */
export function installConsoleCapture(win: Window & typeof globalThis = window): void {
  if (installed) return
  installed = true
  const original = win.console.error.bind(win.console)
  win.console.error = (...args: unknown[]) => {
    push(args.map(describe).join(' '))
    original(...args)
  }
  win.addEventListener('error', (e) => {
    push(`${e.message}${e.filename ? ` (${e.filename}:${e.lineno})` : ''}`)
  })
  win.addEventListener('unhandledrejection', (e) => {
    push(`Unhandled rejection: ${describe(e.reason)}`)
  })
}

export function getConsoleErrors(): ConsoleEntry[] {
  return buffer.map((e) => ({ ...e }))
}

export function clearConsoleErrors(): void {
  buffer.length = 0
}

// ---------------------------------------------------------------- privacidade

const SKIP_TEXT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'SELECT', 'INPUT', 'OPTION', 'OPTGROUP', 'DATALIST'])

function isEditable(el: Element): boolean {
  const ce = el.getAttribute('contenteditable')
  return ce !== null && ce.toLowerCase() !== 'false'
}

/** Elemento cujo conteúdo nunca pode ser lido. */
export function isSensitive(el: Element): boolean {
  if (el.closest('[data-feedback-ignore]')) return true
  if (el.closest('feedback-layer')) return true
  if (SKIP_TEXT_TAGS.has(el.tagName)) return true
  const ac = (el.getAttribute('autocomplete') ?? '').toLowerCase()
  if (ac.startsWith('cc-')) return true
  for (let cur: Element | null = el; cur; cur = cur.parentElement) if (isEditable(cur)) return true
  return false
}

/** Texto visível do elemento, sem valores de campos nem subárvores sensíveis. */
export function safeText(el: Element, max = 400): string {
  if (isSensitive(el)) return ''
  const parts: string[] = []
  let len = 0
  const walk = (node: Node) => {
    if (len > max) return
    if (node.nodeType === 3) {
      const t = node.nodeValue ?? ''
      parts.push(t)
      len += t.length
    } else if (node.nodeType === 1) {
      const e = node as Element
      if (SKIP_TEXT_TAGS.has(e.tagName) || e.hasAttribute('data-feedback-ignore') || isEditable(e)) return
      if ((e.getAttribute('autocomplete') ?? '').toLowerCase().startsWith('cc-')) return
      if (e.tagName.toLowerCase() === 'feedback-layer') return
      e.childNodes.forEach(walk)
    }
  }
  el.childNodes.forEach(walk)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------- seletor

function cssEscape(s: string): string {
  const native = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS?.escape
  if (native) return native(s)
  return s.replace(/^\d/, (d) => `\\3${d} `).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)
}

function attrValue(v: string): string {
  return /^[A-Za-z0-9_-]+$/.test(v) ? v : `"${v.replace(/["\\]/g, '\\$&')}"`
}

function root(el: Element): ParentNode {
  const r = el.getRootNode()
  return r instanceof ShadowRoot || r instanceof Document ? r : el.ownerDocument
}

function matchesOnly(scope: ParentNode, selector: string, el: Element): boolean {
  try {
    const found = scope.querySelectorAll(selector)
    return found.length === 1 && found[0] === el
  } catch {
    return false
  }
}

/**
 * Seletor curto e estável. Só usa `data-testid`, `id`, tags e `:nth-of-type`
 * (nunca `[value=…]`, `[data-email=…]` etc.). Classes não entram: em projetos com
 * Tailwind são ruído; o caminho de tags ancorado em testid/id basta.
 */
export function selectorFor(el: Element): string {
  const scope = root(el)
  const segs: string[] = []
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const testid = cur.getAttribute('data-testid')
    if (testid) {
      const sel = `[data-testid=${attrValue(testid)}]`
      segs.unshift(sel)
      if (matchesOnly(scope, segs.join(' > '), el)) break
      continue
    }
    if (cur.id) {
      const sel = `#${cssEscape(cur.id)}`
      segs.unshift(sel)
      if (matchesOnly(scope, segs.join(' > '), el)) break
      continue
    }
    const tag = cur.tagName.toLowerCase()
    if (tag === 'html' || tag === 'body') {
      segs.unshift(tag)
      break
    }
    const same = cur.parentElement ? Array.from(cur.parentElement.children).filter((c) => c.tagName === cur!.tagName) : []
    segs.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(cur) + 1})` : tag)
    if (matchesOnly(scope, segs.join(' > '), el)) break
  }
  return segs.join(' > ')
}

// ---------------------------------------------------------------- Vue

interface VueInstanceLike {
  type?: { name?: string; __name?: string; __file?: string }
  parent?: VueInstanceLike | null
}

/** Caminho do arquivo sem o diretório do usuário: a partir de `src/`, senão só o nome. */
function relativeFile(file: string): string {
  const f = file.replace(/\\/g, '/')
  const i = f.lastIndexOf('/src/')
  return i >= 0 ? f.slice(i + 1) : f.slice(f.lastIndexOf('/') + 1)
}

export function vueInfo(el: Element): FeedbackTarget['vue'] | undefined {
  let inst: VueInstanceLike | null | undefined = (el as unknown as { __vueParentComponent?: VueInstanceLike }).__vueParentComponent
  while (inst) {
    const name = inst.type?.name || inst.type?.__name
    if (name) {
      const file = inst.type?.__file
      return file ? { name, file: relativeFile(file) } : { name }
    }
    inst = inst.parent
  }
  return undefined
}

// ---------------------------------------------------------------- alvo e página

export function captureTarget(el: Element): FeedbackTarget {
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const raw: Record<StyleKey, string> = {
    color: cs.color,
    background: cs.backgroundColor,
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    padding: cs.padding,
    margin: cs.margin,
    gap: cs.gap,
  }
  const styles: Partial<Record<StyleKey, string>> = {}
  for (const [k, v] of Object.entries(raw)) if (v && v !== 'normal') styles[k as StyleKey] = v
  const target: FeedbackTarget = {
    mode: 'element',
    selector: selectorFor(el),
    text: safeText(el),
    box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    styles,
  }
  const vue = vueInfo(el)
  if (vue) target.vue = vue
  return target
}

export function detectTheme(doc: Document = document): Theme {
  const attr = doc.documentElement.getAttribute('data-theme')
  if (attr === 'dark' || attr === 'light') return attr
  const scheme = getComputedStyle(doc.documentElement).colorScheme.split(' ')[0]
  return scheme === 'dark' || scheme === 'light' ? scheme : 'unknown'
}

export interface PageContext {
  url: string
  route: string
  title: string
  viewport: { w: number; h: number; dpr: number }
  scrollY: number
  theme: Theme
}

export function capturePage(getRoute?: () => string): PageContext {
  const loc = window.location
  const hashRoute = loc.hash.startsWith('#/') ? loc.hash.slice(1) : ''
  return {
    url: `${loc.origin}${loc.pathname}`,
    route: getRoute?.() ?? (hashRoute || loc.pathname),
    title: document.title,
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    scrollY: Math.max(0, Math.round(window.scrollY)),
    theme: detectTheme(),
  }
}
