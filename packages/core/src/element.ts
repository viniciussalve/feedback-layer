import { buildNote, uuidv4, type ProjectInfo } from './build.js'
import { captureTarget, detectTheme, installConsoleCapture, isSensitive, selectorFor } from './capture.js'
import { NARROW_MAX, SHARED } from './fallback-tokens.js'
import { toMarkdown } from './markdown.js'
import { messages as M } from './messages.js'
import { sanitizeNote } from './sanitize.js'
import { KINDS, LIMITS, SEVERITIES, type FeedbackNote, type FeedbackTarget, type Kind, type Severity } from './schema.js'
import { STYLES } from './styles.js'
import { copyText, httpTransport, type SendResult, type Transport } from './transport.js'

export const TAG = 'feedback-layer'

export interface LayerConfig {
  project?: ProjectInfo
  from?: string
  to?: string
  replyTo?: string
  getRoute?: () => string
  /** `null` desliga o envio (só "Copiar"). Padrão: bridge do atributo `bridge`, se houver. */
  transport?: Transport | null
}

const CORNERS = ['br', 'bl', 'tl', 'tr'] as const
type Corner = (typeof CORNERS)[number]

const STORAGE_KEY = 'feedback-layer:corner'
const DEFAULT_SHORTCUT = 'Alt+Shift+F'
const DRAG_THRESHOLD = 4 // px de tela: abaixo disso é clique
const PAD = 16 // margem de viewport ao posicionar o popover (espelha --spacing-inner)
const DODGE_GAP = 8
const DRAFT_MS = 60_000
const COPIED_MS = 2000

const ICON = {
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  pick: '<path d="M5 3l14 7-6 2-2 6z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
}
const svg = (k: keyof typeof ICON, cls = '') => `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${ICON[k]}</svg>`

function radios<T extends string>(name: string, values: readonly T[], labels: Record<T, string>, selected: T): string {
  return values
    .map((v) => `<label><input type="radio" name="${name}" value="${v}"${v === selected ? ' checked' : ''}>${labels[v]}</label>`)
    .join('')
}

const TEMPLATE = `
<div class="root">
  <div class="sr live" role="status" aria-live="polite"></div>
  <div class="hl" hidden></div>
  <div class="chip" hidden><span class="sel"></span><span class="dim"></span></div>
  <div class="dock" data-corner="br">
    <button type="button" class="fab" aria-expanded="false" aria-controls="toolbar" aria-label="${M.open}">${svg('chat')}</button>
    <div class="toolbar" id="toolbar" role="toolbar" aria-label="${M.toolbar}" hidden>
      <button type="button" class="tbtn" data-act="pick" aria-pressed="false" aria-label="${M.toolElement}" title="${M.toolElement}">${svg('pick')}</button>
    </div>
    <div class="hint" role="status" hidden></div>
  </div>
  <div class="popover" role="dialog" aria-modal="false" aria-labelledby="pt" hidden>
    <form novalidate data-view="form">
      <div class="head">
        <h2 class="title" id="pt">${M.newNote}</h2>
        <button type="button" class="iconbtn" data-act="close" aria-label="${M.closeDialog}">${svg('close')}</button>
      </div>
      <div class="body">
        <div class="field">
          <span class="label">${M.element}</span>
          <div class="chipro">
            <span class="sel" data-ref="sel"></span><span class="note" data-ref="note"></span>
            <button type="button" class="iconbtn" data-act="untarget" aria-label="${M.removeTarget}" title="${M.removeTarget}">${svg('close', 'sm')}</button>
          </div>
        </div>
        <div class="field">
          <label class="label" for="comment">${M.comment}</label>
          <textarea id="comment" name="comment" rows="4" maxlength="${LIMITS.comment}" placeholder="${M.commentPlaceholder}" aria-describedby="cerr"></textarea>
          <p class="err" id="cerr" role="alert" hidden>${svg('alert', 'sm')}<span></span></p>
        </div>
        <fieldset>
          <legend>${M.kind}</legend>
          <div class="seg" role="radiogroup" aria-label="${M.kind}">${radios<Kind>('kind', KINDS, M.kinds, 'bug')}</div>
        </fieldset>
        <fieldset>
          <legend>${M.severity}</legend>
          <div class="seg" role="radiogroup" aria-label="${M.severity}">${radios<Severity>('severity', SEVERITIES, M.severities, 'medium')}</div>
        </fieldset>
        <details data-ref="ctxbox">
          <summary>${M.context}${svg('chevron', 'sm')}</summary>
          <ul class="ctx" data-ref="ctx"></ul>
          <p class="lock">${svg('lock', 'sm')}${M.contextNever}</p>
        </details>
        <details data-ref="prevbox">
          <summary>${M.preview}${svg('chevron', 'sm')}</summary>
          <p class="warn">${M.previewWarn}</p>
          <pre class="preview" data-ref="preview" tabindex="0" role="region" aria-label="${M.previewLabel}"></pre>
        </details>
        <div class="banner" role="alert" data-ref="errbanner" hidden>${svg('alert')}<div><strong>${M.sendFailed}</strong><span data-ref="errmsg"></span> ${M.errorKeep}<br><button type="button" class="btn" data-act="retry">${M.retry}</button></div></div>
        <div class="banner" role="status" data-ref="offbanner" hidden>${svg('alert')}<div><strong>${M.offlineTitle}</strong>${M.offlineText}<br><button type="button" class="btn" data-act="recheck">${M.retry}</button></div></div>
      </div>
      <div class="foot">
        <p class="status" role="status" data-ref="status"></p>
        <button type="button" class="btn" data-act="copy">${M.copy}</button>
        <button type="submit" class="btn primary" data-ref="send">${M.send}</button>
      </div>
    </form>
    <div class="sent" data-view="sent" hidden>
      <div class="head">
        <h2 class="title" id="st" tabindex="-1">${M.sentTitle}</h2>
        <button type="button" class="iconbtn" data-act="close" aria-label="${M.closeDialog}">${svg('close')}</button>
      </div>
      <div class="body" role="status">
        <p class="ok">${svg('check')}<span data-ref="sentto"></span></p>
        <p class="where" data-ref="where"></p>
      </div>
      <div class="foot">
        <button type="button" class="btn" data-act="new">${M.newNote}</button>
        <button type="button" class="btn" data-act="close" data-ref="sentclose">${M.closeDialog}</button>
      </div>
    </div>
  </div>
</div>`

interface Draft {
  comment: string
  kind: Kind
  severity: Severity
  target: FeedbackTarget | null
  sensitive: boolean
  id: string
}

/** `Alt+Shift+F` → compara por `event.code` (independe de layout/idioma e do caractere que Alt gera). */
function matchShortcut(e: KeyboardEvent, spec: string): boolean {
  const parts = spec.split('+').map((s) => s.trim()).filter(Boolean)
  const key = parts.pop()
  if (!key) return false
  const mods = new Set(parts.map((p) => p.toLowerCase()))
  const code = /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : /^\d$/.test(key) ? `Digit${key}` : key
  return (
    e.code === code &&
    e.altKey === mods.has('alt') &&
    e.shiftKey === mods.has('shift') &&
    e.ctrlKey === (mods.has('ctrl') || mods.has('control')) &&
    e.metaKey === (mods.has('meta') || mods.has('cmd'))
  )
}

export class FeedbackLayerElement extends HTMLElement {
  private readonly sh: ShadowRoot
  private cfg: LayerConfig = {}

  private readonly root: HTMLElement
  private readonly live: HTMLElement
  private readonly hl: HTMLElement
  private readonly chip: HTMLElement
  private readonly dock: HTMLElement
  private readonly fab: HTMLButtonElement
  private readonly toolbar: HTMLElement
  private readonly pickBtn: HTMLButtonElement
  private readonly hint: HTMLElement
  private readonly pop: HTMLElement
  private readonly form: HTMLFormElement
  private readonly sentView: HTMLElement
  private readonly ta: HTMLTextAreaElement

  private visible = true
  private panelOpen = false
  private picking = false
  private hover: Element | null = null
  private target: FeedbackTarget | null = null
  private targetSensitive = false
  private draft: Draft | null = null
  private draftTimer: ReturnType<typeof setTimeout> | undefined
  private draftId = uuidv4()
  private offline = false
  private sending = false
  private checkToken = 0
  private userCorner = false
  private drag: { id: number; sx: number; sy: number; moved: boolean } | null = null
  private suppressClick = false
  private copiedTimer: ReturnType<typeof setTimeout> | undefined
  private raf = 0
  private dodgeRaf = 0
  private spacer: HTMLElement | null = null
  private observers: Array<{ disconnect(): void }> = []
  private cleanups: Array<() => void> = []

  constructor() {
    super()
    this.sh = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = STYLES
    const tpl = document.createElement('template')
    tpl.innerHTML = TEMPLATE
    this.sh.append(style, tpl.content)

    this.root = this.q('.root')
    this.live = this.q('.live')
    this.hl = this.q('.hl')
    this.chip = this.q('.chip')
    this.dock = this.q('.dock')
    this.fab = this.q('.fab')
    this.toolbar = this.q('.toolbar')
    this.pickBtn = this.q('[data-act="pick"]')
    this.hint = this.q('.hint')
    this.pop = this.q('.popover')
    this.form = this.q('form')
    this.sentView = this.q('.sent')
    this.ta = this.q('textarea')
    this.wire()
  }

  // ---------------------------------------------------------------- API pública

  configure(cfg: LayerConfig): void {
    this.cfg = { ...this.cfg, ...cfg }
    this.applyMode()
  }

  get isVisible(): boolean {
    return this.visible
  }

  show(): void {
    if (this.visible && !this.root.classList.contains('off')) return
    this.visible = true
    this.root.classList.remove('off')
    this.markHtml(true)
    this.ensureSpacer()
    this.announce(M.shownAnnounce)
    this.scheduleDodge()
  }

  hide(announce = true): void {
    const wasVisible = this.visible
    this.visible = false
    this.cancelPick(false)
    this.closePopover({ save: true, focus: false })
    this.setPanel(false, false)
    this.root.classList.add('off')
    this.markHtml(false)
    this.removeSpacer()
    if (announce && wasVisible) this.announce(M.hiddenAnnounce(this.shortcut()))
  }

  startPick(): void {
    if (this.picking) return
    this.setPanel(true, false)
    this.closePopover({ save: true, focus: false })
    this.picking = true
    this.hover = null
    this.pickBtn.setAttribute('aria-pressed', 'true')
    this.hint.textContent = M.hintElement
    this.hint.hidden = false
    const on = (type: string, fn: (e: never) => void, opts: AddEventListenerOptions = { capture: true }) => {
      window.addEventListener(type, fn as EventListener, opts)
      this.pickCleanups.push(() => window.removeEventListener(type, fn as EventListener, opts))
    }
    on('pointermove', this.onPickMove)
    on('pointerdown', this.onPickSwallow)
    on('mousedown', this.onPickSwallow)
    on('mouseup', this.onPickSwallow)
    on('click', this.onPickClick)
    on('keydown', this.onPickKey)
    on('focusin', this.onPickFocus)
    on('scroll', this.onPickScroll, { capture: true, passive: true })
    on('resize', this.onPickScroll, { passive: true })
  }

  cancelPick(focusTool = true): void {
    if (!this.picking) return
    this.picking = false
    for (const c of this.pickCleanups.splice(0)) c()
    this.hover = null
    this.hl.hidden = true
    this.chip.hidden = true
    this.hint.hidden = true
    this.hint.textContent = ''
    this.pickBtn.setAttribute('aria-pressed', 'false')
    if (focusTool) this.pickBtn.focus({ preventScroll: true })
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    installConsoleCapture()
    this.syncTheme()
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && (CORNERS as readonly string[]).includes(saved)) {
        this.dock.dataset.corner = saved
        this.userCorner = true
      }
    } catch {
      // sem localStorage: segue com o padrão
    }
    this.startObservers()
    if (this.hasAttribute('start-hidden')) {
      this.hide(false)
    } else {
      this.markHtml(true)
      this.ensureSpacer()
    }
    this.applyMode()
    this.scheduleDodge()
  }

  disconnectedCallback(): void {
    this.cancelPick(false)
    for (const o of this.observers.splice(0)) o.disconnect()
    for (const c of this.cleanups.splice(0)) c()
    cancelAnimationFrame(this.raf)
    cancelAnimationFrame(this.dodgeRaf)
    clearTimeout(this.draftTimer)
    clearTimeout(this.copiedTimer)
    this.markHtml(false)
    this.removeSpacer()
  }

  // ---------------------------------------------------------------- helpers

  private pickCleanups: Array<() => void> = []

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    const el = this.sh.querySelector<T>(sel)
    if (!el) throw new Error(`feedback-layer: ${sel} ausente no template`)
    return el
  }

  private ref<T extends HTMLElement = HTMLElement>(name: string): T {
    return this.q<T>(`[data-ref="${name}"]`)
  }

  private shortcut(): string {
    return this.getAttribute('shortcut') || DEFAULT_SHORTCUT
  }

  private announce(text: string): void {
    this.live.textContent = ''
    setTimeout(() => {
      this.live.textContent = text
    }, 50)
  }

  private markHtml(on: boolean): void {
    const html = document.documentElement
    if (on) html.setAttribute('data-feedback-layer', 'visible')
    else html.removeAttribute('data-feedback-layer')
  }

  private ensureSpacer(): void {
    if (this.hasAttribute('no-safe-area') || !document.body) return
    if (!this.spacer) {
      const s = document.createElement('div')
      s.setAttribute('data-feedback-layer-spacer', '')
      s.setAttribute('aria-hidden', 'true')
      s.style.height = `var(--spacing-floating, ${SHARED.floating?.value ?? '9rem'})`
      this.spacer = s
    }
    if (document.body.lastElementChild !== this.spacer) document.body.appendChild(this.spacer)
  }

  private removeSpacer(): void {
    this.spacer?.remove()
    this.spacer = null
  }

  private syncTheme(): void {
    this.setAttribute('data-fl-theme', detectTheme() === 'light' ? 'light' : 'dark')
  }

  private project(): ProjectInfo {
    if (this.cfg.project) return this.cfg.project
    const p: ProjectInfo = { name: this.getAttribute('project') || location.hostname || 'app' }
    const v = this.getAttribute('project-version')
    const c = this.getAttribute('project-commit')
    if (v) p.version = v
    if (c) p.commit = c
    return p
  }

  private transport(): Transport | null {
    if (this.cfg.transport !== undefined) return this.cfg.transport
    const url = this.getAttribute('bridge')
    return url ? httpTransport({ url }) : null
  }

  // ---------------------------------------------------------------- ligações

  private wire(): void {
    // botão flutuante: clique, arrasto, Shift+setas
    this.fab.addEventListener('click', () => {
      if (this.suppressClick) return
      this.setPanel(!this.panelOpen, false)
    })
    this.fab.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      this.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false }
      try {
        this.fab.setPointerCapture(e.pointerId) // sem isso o mouse sai do botão e perde os pointermove
      } catch {
        // pointer sintético ou já encerrado
      }
    })
    this.fab.addEventListener('pointermove', (e) => this.onDragMove(e))
    this.fab.addEventListener('pointerup', (e) => this.onDragEnd(e))
    this.fab.addEventListener('pointercancel', (e) => this.onDragEnd(e))
    this.fab.addEventListener('keydown', (e) => {
      if (!e.shiftKey || !e.key.startsWith('Arrow')) return
      e.preventDefault()
      const c = this.dock.dataset.corner ?? 'br'
      let v = c[0] as 'b' | 't'
      let h = c[1] as 'l' | 'r'
      if (e.key === 'ArrowLeft') h = 'l'
      if (e.key === 'ArrowRight') h = 'r'
      if (e.key === 'ArrowUp') v = 't'
      if (e.key === 'ArrowDown') v = 'b'
      this.setCorner(`${v}${h}` as Corner, true)
    })

    this.pickBtn.addEventListener('click', () => (this.picking ? this.cancelPick(false) : this.startPick()))

    // popover
    this.form.addEventListener('submit', (e) => {
      e.preventDefault()
      void this.submit()
    })
    this.pop.addEventListener('click', (e) => {
      const act = (e.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act
      if (act === 'close') this.closePopover({ save: true, focus: true })
      else if (act === 'untarget') this.setTarget(null, false)
      else if (act === 'copy') void this.copyNote()
      else if (act === 'retry') void this.submit()
      else if (act === 'recheck') void this.refreshOffline()
      else if (act === 'new') this.newNote()
    })
    this.ta.addEventListener('input', () => {
      this.clearEmpty()
      this.refreshDetails()
    })
    this.form.addEventListener('change', () => this.refreshDetails())
    this.ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        this.form.requestSubmit()
      }
    })
    for (const name of ['ctxbox', 'prevbox']) this.ref(name).addEventListener('toggle', () => this.refreshDetails())

    // Esc: fecha popover (foco volta ao botão) ou a barra
    this.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (!this.pop.hidden) {
        e.preventDefault()
        this.closePopover({ save: true, focus: true })
      } else if (this.panelOpen && !this.picking) {
        e.preventDefault()
        this.setPanel(false, true)
      }
    })
  }

  private startObservers(): void {
    const onKey = (e: KeyboardEvent) => {
      const spec = this.shortcut()
      if (spec === 'none' || e.repeat || !matchShortcut(e, spec)) return
      e.preventDefault()
      if (this.visible) this.hide()
      else this.show()
    }
    window.addEventListener('keydown', onKey, true)
    this.cleanups.push(() => window.removeEventListener('keydown', onKey, true))

    const onResize = () => {
      this.placePopover()
      this.scheduleDodge()
    }
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('scroll', onResize)
    this.cleanups.push(() => {
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('scroll', onResize)
    })

    const mo = new MutationObserver(() => this.syncTheme())
    const opts = { attributes: true, attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'style'] }
    mo.observe(document.documentElement, opts)
    if (document.body) mo.observe(document.body, opts)
    this.observers.push(mo)
    const mq = window.matchMedia?.('(prefers-color-scheme: light)')
    if (mq) {
      const f = () => this.syncTheme()
      mq.addEventListener('change', f)
      this.cleanups.push(() => mq.removeEventListener('change', f))
    }

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.scheduleDodge())
      ro.observe(document.documentElement)
      if (document.body) ro.observe(document.body)
      this.observers.push(ro)
      const pro = new ResizeObserver(() => this.placePopover())
      pro.observe(this.pop)
      this.observers.push(pro)
    }
    window.addEventListener('load', () => this.scheduleDodge(), { once: true })
  }

  // ---------------------------------------------------------------- barra e botão

  private setPanel(open: boolean, focusFab: boolean): void {
    if (open === this.panelOpen) {
      if (focusFab) this.fab.focus({ preventScroll: true })
      return
    }
    this.panelOpen = open
    this.toolbar.hidden = !open
    this.fab.setAttribute('aria-expanded', String(open))
    this.fab.setAttribute('aria-label', open ? M.close : M.open)
    if (!open) {
      this.cancelPick(false)
      this.closePopover({ save: true, focus: false })
    }
    if (focusFab) this.fab.focus({ preventScroll: true })
    this.scheduleDodge()
  }

  private setCorner(c: Corner, user: boolean): void {
    this.dock.dataset.corner = c
    this.dock.style.removeProperty('--fl-lift')
    if (user) {
      this.userCorner = true
      try {
        localStorage.setItem(STORAGE_KEY, c)
      } catch {
        // sem localStorage
      }
    }
    this.placePopover()
  }

  private onDragMove(e: PointerEvent): void {
    const d = this.drag
    if (!d || e.pointerId !== d.id) return
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) <= DRAG_THRESHOLD) return
      d.moved = true
      this.setPanel(false, false)
      this.dock.style.removeProperty('--fl-lift')
      this.dock.dataset.dragging = 'true'
    }
    const r = this.fab.getBoundingClientRect()
    this.dock.style.setProperty('--fl-x', String(e.clientX - r.width / 2))
    this.dock.style.setProperty('--fl-y', String(e.clientY - r.height / 2))
  }

  private onDragEnd(e: PointerEvent): void {
    const d = this.drag
    if (!d || e.pointerId !== d.id) return
    this.drag = null
    if (!d.moved) return
    delete this.dock.dataset.dragging
    this.dock.style.removeProperty('--fl-x')
    this.dock.style.removeProperty('--fl-y')
    const v = e.clientY < window.innerHeight / 2 ? 't' : 'b'
    const h = e.clientX < window.innerWidth / 2 ? 'l' : 'r'
    this.setCorner(`${v}${h}` as Corner, true)
    this.suppressClick = true
    setTimeout(() => (this.suppressClick = false), 0)
  }

  /** Desvia de elementos fixos do host (barras, chats) sem mover quem já escolheu um canto. */
  private scheduleDodge(): void {
    cancelAnimationFrame(this.dodgeRaf)
    this.dodgeRaf = requestAnimationFrame(() => this.dodge())
  }

  private dodge(): void {
    this.dock.style.removeProperty('--fl-lift')
    const corner = this.dock.dataset.corner
    if (this.userCorner || !this.visible || (corner !== 'br' && corner !== 'bl')) return
    if (typeof document.elementsFromPoint !== 'function') return
    const f = this.fab.getBoundingClientRect()
    if (!f.width) return
    const xs = [f.left + 2, f.left + f.width / 2, f.right - 2]
    const ys = [f.top + 2, f.top + f.height / 2, f.bottom - 2]
    const vh = window.innerHeight
    const vw = window.innerWidth
    let need = 0
    const seen = new Set<Element>()
    for (const x of xs) {
      for (const y of ys) {
        for (const el of document.elementsFromPoint(x, y)) {
          if (el === this || el === this.spacer || seen.has(el)) continue
          seen.add(el)
          const fixed = this.fixedAncestor(el)
          if (!fixed) continue
          const r = fixed.getBoundingClientRect()
          if (r.width * r.height > vw * vh * 0.5) continue // fundo de modal: não dá para desviar
          if (r.right < f.left || r.left > f.right || r.bottom < f.top || r.top > f.bottom) continue
          need = Math.max(need, f.bottom - r.top + DODGE_GAP)
        }
      }
    }
    if (need > 0 && need < vh / 2) this.dock.style.setProperty('--fl-lift', `calc(${Math.ceil(need)} * var(--fl-unit))`)
  }

  private fixedAncestor(el: Element): Element | null {
    for (let n: Element | null = el; n && n !== document.documentElement && n !== document.body; n = n.parentElement) {
      const p = getComputedStyle(n).position
      if (p === 'fixed' || p === 'sticky') return n
    }
    return null
  }

  // ---------------------------------------------------------------- seleção de elemento

  private isOurs(e: Event): boolean {
    return e.composedPath().includes(this)
  }

  private elementAt(x: number, y: number): Element | null {
    const el = document.elementFromPoint(x, y)
    return el && el !== this && !this.contains(el) ? el : null
  }

  private readonly onPickMove = (e: PointerEvent): void => {
    this.setHover(this.elementAt(e.clientX, e.clientY))
  }

  /** Impede que o app reaja ao início do clique de seleção; não toca em wheel/touchmove (rolagem segue). */
  private readonly onPickSwallow = (e: Event): void => {
    if (this.isOurs(e)) return
    e.stopPropagation()
    if (e.type === 'pointerdown' && e instanceof PointerEvent) this.setHover(this.elementAt(e.clientX, e.clientY))
  }

  private readonly onPickClick = (e: MouseEvent): void => {
    if (this.isOurs(e)) return
    e.preventDefault()
    e.stopImmediatePropagation()
    const el = e.target instanceof Element ? e.target : null
    if (el && el !== document.documentElement) this.choose(el)
  }

  private readonly onPickKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      this.cancelPick(true)
      return
    }
    if (this.isOurs(e) || e.key !== 'Enter') return
    const el = document.activeElement
    if (!el || el === document.body || el === document.documentElement || el === this) return
    e.preventDefault()
    e.stopPropagation()
    this.choose(el)
  }

  private readonly onPickFocus = (e: FocusEvent): void => {
    if (this.isOurs(e)) return
    if (e.target instanceof Element) this.setHover(e.target)
  }

  private readonly onPickScroll = (): void => {
    if (this.hover) this.paintHover()
  }

  private setHover(el: Element | null): void {
    this.hover = el
    this.paintHover()
  }

  private paintHover(): void {
    const el = this.hover
    if (!el || !el.isConnected) {
      this.hl.hidden = true
      this.chip.hidden = true
      return
    }
    cancelAnimationFrame(this.raf)
    this.raf = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect()
      this.paintBox(r)
      const sel = this.chip.querySelector<HTMLElement>('.sel')
      const dim = this.chip.querySelector<HTMLElement>('.dim')
      if (sel) sel.textContent = selectorFor(el)
      const size = `${Math.round(r.width)}×${Math.round(r.height)}`
      if (dim) dim.textContent = isSensitive(el) ? `${M.protectedValue} · ${size}` : size
      this.chip.hidden = false
      const cw = this.chip.offsetWidth
      const ch = this.chip.offsetHeight
      const x = Math.min(Math.max(r.left, 0), Math.max(window.innerWidth - cw, 0))
      const above = r.top - ch - 4
      const y = above >= 0 ? above : Math.min(r.bottom + 4, Math.max(window.innerHeight - ch, 0))
      this.chip.style.setProperty('--fl-cx', String(x))
      this.chip.style.setProperty('--fl-cy', String(y))
    })
  }

  private paintBox(r: DOMRect): void {
    this.hl.hidden = false
    this.hl.style.setProperty('--fl-hx', String(r.left))
    this.hl.style.setProperty('--fl-hy', String(r.top))
    this.hl.style.setProperty('--fl-hw', String(r.width))
    this.hl.style.setProperty('--fl-hh', String(r.height))
  }

  private choose(el: Element): void {
    const t = captureTarget(el)
    const sensitive = isSensitive(el)
    this.cancelPick(false)
    this.openPopover({ target: t, sensitive })
  }

  // ---------------------------------------------------------------- popover

  private openPopover(opts: { target?: FeedbackTarget | null; sensitive?: boolean } = {}): void {
    const d = this.draft
    this.pop.hidden = false
    this.sentView.hidden = true
    this.form.hidden = false
    this.pop.setAttribute('aria-labelledby', 'pt')
    this.sending = false
    this.setBusy(false)
    this.hideError()
    this.clearEmpty()
    if (d) {
      this.ta.value = d.comment
      this.checkRadio('kind', d.kind)
      this.checkRadio('severity', d.severity)
      this.draftId = d.id
    }
    if (opts.target !== undefined) this.setTarget(opts.target, opts.sensitive ?? false)
    else if (d) this.setTarget(d.target, d.sensitive)
    else this.setTarget(null, false)
    this.draft = null
    clearTimeout(this.draftTimer)
    this.refreshDetails()
    this.applyMode()
    this.place()
    this.ta.focus({ preventScroll: true })
    void this.refreshOffline()
  }

  private closePopover(o: { save: boolean; focus: boolean }): void {
    if (this.pop.hidden) return
    const inSent = !this.sentView.hidden
    if (o.save && !inSent && this.ta.value.trim()) {
      this.draft = {
        comment: this.ta.value,
        kind: this.checked('kind') as Kind,
        severity: this.checked('severity') as Severity,
        target: this.target,
        sensitive: this.targetSensitive,
        id: this.draftId,
      }
      clearTimeout(this.draftTimer)
      this.draftTimer = setTimeout(() => (this.draft = null), DRAFT_MS)
    }
    this.pop.hidden = true
    delete this.root.dataset.sheet
    this.hl.hidden = true
    this.chip.hidden = true
    if (o.focus) this.fab.focus({ preventScroll: true })
    this.scheduleDodge()
  }

  private newNote(): void {
    this.draft = null
    this.ta.value = ''
    this.draftId = uuidv4()
    this.openPopover({ target: null })
  }

  private setTarget(t: FeedbackTarget | null, sensitive: boolean): void {
    this.target = t
    this.targetSensitive = t ? sensitive : false
    const sel = this.ref('sel')
    const note = this.ref('note')
    const clear = this.q('[data-act="untarget"]')
    if (t) {
      sel.textContent = t.selector
      note.textContent = this.targetSensitive ? M.protectedValue : ''
      clear.hidden = false
      const r = { left: t.box.x - window.scrollX, top: t.box.y - window.scrollY }
      this.paintBox(new DOMRect(r.left, r.top, t.box.w, t.box.h))
    } else {
      sel.textContent = ''
      note.textContent = M.noElement
      clear.hidden = true
      this.hl.hidden = true
    }
    this.chip.hidden = true
    this.refreshDetails()
  }

  /** Posição do popover: junto ao dock em telas largas, bottom sheet em telas estreitas. */
  private place(): void {
    this.placePopover()
  }

  private placePopover(): void {
    if (this.pop.hidden) return
    const narrow = window.innerWidth <= NARROW_MAX
    this.pop.classList.toggle('sheet', narrow)
    this.root.toggleAttribute('data-sheet', narrow)
    if (narrow) {
      const vv = window.visualViewport
      const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0
      this.pop.style.setProperty('--fl-kb', String(kb))
      return
    }
    const d = this.dock.getBoundingClientRect()
    const w = this.pop.offsetWidth
    const h = this.pop.offsetHeight
    const c = this.dock.dataset.corner ?? 'br'
    const left = c.endsWith('r') ? d.right - w : d.left
    const top = c.startsWith('b') ? d.top - PAD - h : d.bottom + PAD
    const x = Math.min(Math.max(left, PAD), Math.max(window.innerWidth - w - PAD, PAD))
    const y = Math.min(Math.max(top, PAD), Math.max(window.innerHeight - h - PAD, PAD))
    this.pop.style.setProperty('--fl-px', String(x))
    this.pop.style.setProperty('--fl-py', String(y))
  }

  // ---------------------------------------------------------------- formulário

  private checked(name: string): string {
    return this.form.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? ''
  }

  private checkRadio(name: string, value: string): void {
    const r = this.form.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)
    if (r) r.checked = true
  }

  /** Nota completa e sanitizada: a MESMA que prévia, clipboard e bridge usam. */
  private composeNote(): FeedbackNote {
    const input: { kind: Kind; severity: Severity; comment: string; replyTo?: string } = {
      kind: (this.checked('kind') || 'bug') as Kind,
      severity: (this.checked('severity') || 'medium') as Severity,
      comment: this.ta.value,
    }
    if (this.cfg.replyTo) input.replyTo = this.cfg.replyTo
    const ctx: Parameters<typeof buildNote>[0] = { project: this.project() }
    if (this.cfg.from ?? this.getAttribute('from')) ctx.from = (this.cfg.from ?? this.getAttribute('from')) as string
    if (this.cfg.to ?? this.getAttribute('to')) ctx.to = (this.cfg.to ?? this.getAttribute('to')) as string
    if (this.cfg.getRoute) ctx.getRoute = this.cfg.getRoute
    const note = buildNote(ctx, input, this.target)
    return sanitizeNote({ ...note, id: this.draftId })
  }

  /** Atualiza "Contexto enviado" e "Prévia" a partir da nota já sanitizada (só textContent). */
  private refreshDetails(): void {
    const ctxOpen = (this.ref('ctxbox') as HTMLDetailsElement).open
    const prevOpen = (this.ref('prevbox') as HTMLDetailsElement).open
    if (!ctxOpen && !prevOpen) return
    const note = this.composeNote()
    if (ctxOpen) this.renderContext(note)
    if (prevOpen) {
      this.ref('preview').textContent = this.ta.value.trim() ? toMarkdown(note) : M.previewEmpty
    }
  }

  private renderContext(note: FeedbackNote): void {
    const L = M.ctx
    const rows: Array<[string, string]> = []
    rows.push([L.project, [note.project.name, note.project.version].filter(Boolean).join(' ')])
    if (note.from || note.to) rows.push([`${L.from} → ${L.to}`, `${note.from ?? M.noneValue} → ${note.to ?? M.noneValue}`])
    rows.push([L.page, `${note.page.route} (${note.page.title})`])
    rows.push([L.viewport, `${note.page.viewport.w}×${note.page.viewport.h} @${note.page.viewport.dpr}x`])
    rows.push([L.theme, note.page.theme])
    const t = note.target
    if (t) {
      rows.push([L.element, t.selector])
      rows.push([L.box, `${t.box.w}×${t.box.h} em ${t.box.x},${t.box.y}`])
      if (t.vue) rows.push([L.component, t.vue.name])
      if (t.text) rows.push(['Texto', t.text])
      rows.push([L.styles, Object.keys(t.styles ?? {}).join(', ')])
    }
    rows.push([L.errors, String(note.consoleErrors.length)])
    const ul = this.ref('ctx')
    ul.replaceChildren(
      ...rows.map(([k, v]) => {
        const li = document.createElement('li')
        const b = document.createElement('b')
        b.textContent = `${k}: `
        li.append(b, document.createTextNode(v))
        return li
      }),
    )
  }

  private clearEmpty(): void {
    this.ta.removeAttribute('aria-invalid')
    this.q('#cerr').hidden = true
  }

  private flagEmpty(): void {
    this.ta.setAttribute('aria-invalid', 'true')
    const p = this.q('#cerr')
    const span = p.querySelector('span')
    if (span) span.textContent = M.emptyError
    p.hidden = false
    this.ta.focus({ preventScroll: true })
  }

  private hideError(): void {
    this.ref('errbanner').hidden = true
  }

  private setBusy(busy: boolean): void {
    const btn = this.ref<HTMLButtonElement>('send')
    btn.disabled = busy
    if (busy) btn.setAttribute('aria-busy', 'true')
    else btn.removeAttribute('aria-busy')
    this.ta.readOnly = busy
    for (const r of this.form.querySelectorAll<HTMLInputElement>('input[type="radio"]')) r.disabled = busy
    this.q<HTMLButtonElement>('[data-act="copy"]').disabled = busy
    if (busy) {
      btn.innerHTML = `<span class="spin" aria-hidden="true"></span>${M.sending}`
    } else {
      this.applyMode()
    }
  }

  /** Botão principal: "Enviar" com transporte disponível; senão vira "Copiar nota". */
  private applyMode(): void {
    if (this.sending) return
    const canSend = !!this.transport() && !this.offline
    const btn = this.ref<HTMLButtonElement>('send')
    btn.textContent = canSend ? M.send : M.copyNote
    this.q('[data-act="copy"]').hidden = !canSend
    this.ref('offbanner').hidden = !(this.transport() && this.offline)
  }

  private async refreshOffline(): Promise<void> {
    const t = this.transport()
    const token = ++this.checkToken
    if (!t || !t.check) {
      this.offline = false
      this.applyMode()
      return
    }
    let ok = false
    try {
      ok = await t.check()
    } catch {
      ok = false
    }
    if (token !== this.checkToken) return
    this.offline = !ok
    this.applyMode()
  }

  private async submit(): Promise<void> {
    if (this.sending) return
    if (!this.ta.value.trim()) {
      this.flagEmpty()
      return
    }
    this.clearEmpty()
    this.hideError()
    const t = this.transport()
    if (!t || this.offline) {
      await this.copyNote()
      return
    }
    const note = this.composeNote()
    this.sending = true
    this.setBusy(true)
    let res: SendResult
    try {
      res = await t.send(note)
    } catch {
      res = { ok: false, message: M.unexpected }
    }
    this.sending = false
    this.setBusy(false)
    if (res.ok) this.showSent(t, res, note)
    else this.showError(res.message)
  }

  private showError(message?: string): void {
    this.ref('errmsg').textContent = message ? `${message}. ` : ''
    const b = this.ref('errbanner')
    b.hidden = false
    b.querySelector<HTMLElement>('[data-act="retry"]')?.focus({ preventScroll: true })
  }

  private showSent(t: Transport, res: SendResult, note: FeedbackNote): void {
    this.form.hidden = true
    this.sentView.hidden = false
    this.pop.setAttribute('aria-labelledby', 'st')
    this.ref('sentto').textContent = M.sentTo(t.destination ?? t.name)
    this.ref('where').textContent = res.detail ?? ''
    this.draft = null
    this.draftId = uuidv4()
    this.ta.value = ''
    this.hl.hidden = true
    this.placePopover()
    // Sem fechamento automático: o estado permanece até "Fechar" (Esc também), então nunca some
    // enquanto o foco ou o mouse estão dentro.
    this.ref<HTMLButtonElement>('sentclose').focus({ preventScroll: true })
    this.dispatchEvent(new CustomEvent('feedback-sent', { detail: { note, result: res }, bubbles: true, composed: true }))
  }

  private async copyNote(): Promise<void> {
    if (!this.ta.value.trim()) {
      this.flagEmpty()
      return
    }
    const note = this.composeNote()
    const ok = await copyText(toMarkdown(note))
    const status = this.ref('status')
    status.textContent = ok ? M.copied : M.unexpected
    clearTimeout(this.copiedTimer)
    const copyBtn = this.q('[data-act="copy"]')
    const main = this.ref('send')
    const canSend = !!this.transport() && !this.offline
    const target = canSend ? copyBtn : main
    const label = canSend ? M.copy : M.copyNote
    if (ok) target.textContent = M.copied
    this.copiedTimer = setTimeout(() => {
      status.textContent = ''
      target.textContent = label
    }, COPIED_MS)
    if (ok) this.dispatchEvent(new CustomEvent('feedback-copied', { detail: { note }, bubbles: true, composed: true }))
  }
}

export function register(): void {
  if (!customElements.get(TAG)) customElements.define(TAG, FeedbackLayerElement)
}
