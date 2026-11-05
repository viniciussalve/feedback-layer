/**
 * FeedbackNote v1: tipos, limites e validação estrita.
 * Contrato: PLANS/FEEDBACK_NOTE_V1.md (dono: Merlin). Mudança de schema = bump de versão.
 * Módulo puro (sem DOM): também é usado pelo bridge em Node.
 */

export const SCHEMA_ID = 'feedback-note/v1' as const

export const KINDS = ['bug', 'idea', 'question'] as const
export const SEVERITIES = ['low', 'medium', 'high', 'blocker'] as const
export const THEMES = ['dark', 'light', 'unknown'] as const

export type Kind = (typeof KINDS)[number]
export type Severity = (typeof SEVERITIES)[number]
export type Theme = (typeof THEMES)[number]

export const LIMITS = {
  short: 80, // project.*, from, to, vue.name
  comment: 2000,
  selector: 300,
  text: 200,
  style: 100,
  vueFile: 200,
  url: 500,
  route: 200,
  title: 200,
  consoleMessage: 300,
  consoleErrors: 10,
  bodyBytes: 64 * 1024,
} as const

export const STYLE_KEYS = ['color', 'background', 'fontFamily', 'fontSize', 'padding', 'margin', 'gap'] as const
export type StyleKey = (typeof STYLE_KEYS)[number]

export interface FeedbackTarget {
  mode: 'element'
  selector: string
  text?: string
  box: { x: number; y: number; w: number; h: number }
  styles?: Partial<Record<StyleKey, string>>
  vue?: { name: string; file?: string }
}

export interface FeedbackNote {
  schema: typeof SCHEMA_ID
  id: string
  createdAt: string
  project: { name: string; version?: string; commit?: string }
  from?: string
  to?: string
  replyTo?: string
  kind: Kind
  severity: Severity
  comment: string
  target: FeedbackTarget | null
  page: {
    url: string
    route: string
    title: string
    viewport: { w: number; h: number; dpr: number }
    scrollY: number
    theme: Theme
  }
  consoleErrors: { ts: string; message: string }[]
}

// ---------------------------------------------------------------- caracteres proibidos

/** Controle (C0, DEL, C1). `\n` é tratado à parte no `comment`. */
export const CONTROL_RE = /[\u0000-\u001F\u007F-\u009F]/
/** Bidi: U+202A–202E, U+2066–2069 (contrato) + LRM/RLM. */
export const BIDI_RE = /[\u202A-\u202E\u2066-\u2069\u200E\u200F]/
const LINE_BREAK_RE = /[\u2028\u2029]/

export const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const ISO_STRICT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

export function isStrictIso(s: string): boolean {
  if (!ISO_STRICT_RE.test(s)) return false
  const t = Date.parse(s)
  return Number.isFinite(t) && new Date(t).toISOString() === s
}

// ---------------------------------------------------------------- validação

export type ValidationResult = { ok: true; note: FeedbackNote } | { ok: false; errors: string[] }

type Obj = Record<string, unknown>

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

class Checker {
  errors: string[] = []
  fail(path: string, msg: string) {
    this.errors.push(`${path}: ${msg}`)
  }

  /** Só chaves permitidas; qualquer outra (inclusive `__proto__`) é erro. */
  keys(o: Obj, path: string, allowed: readonly string[]) {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) this.fail(path ? `${path}.${k}` : k, 'chave desconhecida')
  }

  obj(v: unknown, path: string): Obj | null {
    if (!isObj(v)) {
      this.fail(path, 'deve ser objeto')
      return null
    }
    return v
  }

  /** `kind`: 'line' = uma linha sem controle/bidi; 'text' = pode ter `\n`. */
  str(v: unknown, path: string, max: number, kind: 'line' | 'text', opts: { required?: boolean; nonEmpty?: boolean } = {}) {
    if (v === undefined) {
      if (opts.required) this.fail(path, 'obrigatório')
      return
    }
    if (typeof v !== 'string') return this.fail(path, 'deve ser texto')
    if (v.length > max) this.fail(path, `máx ${max} caracteres`)
    if (opts.nonEmpty && v.trim() === '') this.fail(path, 'não pode ser vazio')
    const probe = kind === 'text' ? v.replace(/\n/g, '') : v
    if (CONTROL_RE.test(probe) || BIDI_RE.test(probe) || LINE_BREAK_RE.test(probe)) {
      this.fail(path, kind === 'line' ? 'deve ser uma linha sem controle nem bidi' : 'contém controle ou bidi')
    }
  }

  oneOf<T extends string>(v: unknown, path: string, values: readonly T[]) {
    if (typeof v !== 'string' || !values.includes(v as T)) this.fail(path, `deve ser um de: ${values.join(', ')}`)
  }

  int(v: unknown, path: string, min = -1e9) {
    if (typeof v !== 'number' || !Number.isSafeInteger(v)) return this.fail(path, 'deve ser inteiro finito')
    if (v < min) this.fail(path, `deve ser >= ${min}`)
  }
}

export function validateNote(raw: unknown): ValidationResult {
  const c = new Checker()
  const n = c.obj(raw, 'note')
  if (!n) return { ok: false, errors: c.errors }

  c.keys(n, '', [
    'schema', 'id', 'createdAt', 'project', 'from', 'to', 'replyTo', 'kind', 'severity',
    'comment', 'target', 'page', 'consoleErrors',
  ])
  if (n.schema !== SCHEMA_ID) c.fail('schema', `deve ser "${SCHEMA_ID}"`)
  if (typeof n.id !== 'string' || !UUID_V4_RE.test(n.id)) c.fail('id', 'deve ser UUID v4')
  if (typeof n.createdAt !== 'string' || !isStrictIso(n.createdAt)) c.fail('createdAt', 'deve ser ISO 8601 UTC estrito (YYYY-MM-DDTHH:mm:ss.sssZ)')

  const project = c.obj(n.project, 'project')
  if (project) {
    c.keys(project, 'project', ['name', 'version', 'commit'])
    c.str(project.name, 'project.name', LIMITS.short, 'line', { required: true, nonEmpty: true })
    c.str(project.version, 'project.version', LIMITS.short, 'line')
    c.str(project.commit, 'project.commit', LIMITS.short, 'line')
  }
  c.str(n.from, 'from', LIMITS.short, 'line')
  c.str(n.to, 'to', LIMITS.short, 'line')
  if (n.replyTo !== undefined && (typeof n.replyTo !== 'string' || !UUID_RE.test(n.replyTo))) c.fail('replyTo', 'deve ser UUID')
  c.oneOf(n.kind, 'kind', KINDS)
  c.oneOf(n.severity, 'severity', SEVERITIES)
  c.str(n.comment, 'comment', LIMITS.comment, 'text', { required: true, nonEmpty: true })

  if (n.target === undefined) c.fail('target', 'obrigatório (null para comentário geral)')
  else if (n.target !== null) {
    const t = c.obj(n.target, 'target')
    if (t) {
      c.keys(t, 'target', ['mode', 'selector', 'text', 'box', 'styles', 'vue'])
      if (t.mode !== 'element') c.fail('target.mode', 'deve ser "element"')
      c.str(t.selector, 'target.selector', LIMITS.selector, 'line', { required: true, nonEmpty: true })
      c.str(t.text, 'target.text', LIMITS.text, 'text')
      const box = c.obj(t.box, 'target.box')
      if (box) {
        c.keys(box, 'target.box', ['x', 'y', 'w', 'h'])
        c.int(box.x, 'target.box.x')
        c.int(box.y, 'target.box.y')
        c.int(box.w, 'target.box.w', 0)
        c.int(box.h, 'target.box.h', 0)
      }
      if (t.styles !== undefined) {
        const s = c.obj(t.styles, 'target.styles')
        if (s) {
          c.keys(s, 'target.styles', STYLE_KEYS)
          for (const k of STYLE_KEYS) c.str(s[k], `target.styles.${k}`, LIMITS.style, 'line')
        }
      }
      if (t.vue !== undefined) {
        const v = c.obj(t.vue, 'target.vue')
        if (v) {
          c.keys(v, 'target.vue', ['name', 'file'])
          c.str(v.name, 'target.vue.name', LIMITS.short, 'line', { required: true, nonEmpty: true })
          c.str(v.file, 'target.vue.file', LIMITS.vueFile, 'line')
        }
      }
    }
  }

  const page = c.obj(n.page, 'page')
  if (page) {
    c.keys(page, 'page', ['url', 'route', 'title', 'viewport', 'scrollY', 'theme'])
    c.str(page.url, 'page.url', LIMITS.url, 'line', { required: true })
    if (typeof page.url === 'string' && /[?#]/.test(page.url)) c.fail('page.url', 'não pode ter query nem hash')
    c.str(page.route, 'page.route', LIMITS.route, 'line', { required: true })
    c.str(page.title, 'page.title', LIMITS.title, 'text', { required: true })
    const vp = c.obj(page.viewport, 'page.viewport')
    if (vp) {
      c.keys(vp, 'page.viewport', ['w', 'h', 'dpr'])
      c.int(vp.w, 'page.viewport.w', 0)
      c.int(vp.h, 'page.viewport.h', 0)
      if (typeof vp.dpr !== 'number' || !Number.isFinite(vp.dpr) || vp.dpr <= 0 || vp.dpr > 100) c.fail('page.viewport.dpr', 'deve ser número finito > 0')
    }
    c.int(page.scrollY, 'page.scrollY', 0)
    c.str(page.theme, 'page.theme', LIMITS.short, 'line', { required: true })
    if (typeof page.theme === 'string') c.oneOf(page.theme, 'page.theme', THEMES)
  }

  if (!Array.isArray(n.consoleErrors)) c.fail('consoleErrors', 'deve ser lista')
  else {
    if (n.consoleErrors.length > LIMITS.consoleErrors) c.fail('consoleErrors', `máx ${LIMITS.consoleErrors} itens`)
    n.consoleErrors.slice(0, LIMITS.consoleErrors + 1).forEach((e, i) => {
      const p = `consoleErrors[${i}]`
      const o = c.obj(e, p)
      if (!o) return
      c.keys(o, p, ['ts', 'message'])
      if (typeof o.ts !== 'string' || !isStrictIso(o.ts)) c.fail(`${p}.ts`, 'deve ser ISO estrito')
      c.str(o.message, `${p}.message`, LIMITS.consoleMessage, 'text', { required: true })
    })
  }

  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, note: raw as FeedbackNote }
}
