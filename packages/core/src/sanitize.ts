import {
  fixpoint, maskCssUrls, maskRoute, multiLine, oneLine, redact, redactConsole, redactSecrets, stripMarkers, stripQueryHash, truncate,
} from './redact.js'
import {
  LIMITS, SCHEMA_ID, STYLE_KEYS, THEMES, UUID_V4_RE,
  type FeedbackNote, type FeedbackTarget, type StyleKey, type Theme,
} from './schema.js'

/**
 * `sanitizeNote` é a função única do contrato (revisão 3): roda no cliente antes da prévia,
 * do clipboard e do envio, e no bridge antes de gravar o .json e gerar o .md.
 * Idempotente: sanitizeNote(sanitizeNote(x)) deep-equals sanitizeNote(x).
 * Devolve uma cópia só com as chaves conhecidas; campos opcionais vazios são omitidos.
 */

const s = (v: unknown): string => (typeof v === 'string' ? v : '')

const CUT_MARGIN = 64

/** Entrada limitada a 2x o máximo antes de qualquer regex: o custo da redação não cresce com o tamanho da entrada. */
const capped = (v: unknown, max: number): string => {
  const x = s(v)
  const cap = max * 2
  // Se houve corte, descarta os ultimos CUT_MARGIN caracteres: um segredo cortado ao meio nao deixa prefixo
  // (um prefixo curto demais para a redacao reconhecer) caso a redacao encurte o texto abaixo do maximo.
  return x.length > cap ? truncate(x, cap - CUT_MARGIN) : x
}

/** Uma linha, sem redação de e-mail: from, to, project.*, vue.*. */
const line = (v: unknown, max: number) =>
  fixpoint(capped(v, max), (x) => truncate(stripMarkers(oneLine(x)), max).trim())

/** Uma linha com redação completa: url, route, title, text, selector, erros. */
const redLine = (v: unknown, max: number, pre: (x: string) => string = (x) => x, red = redact) =>
  fixpoint(capped(v, max), (x) => truncate(stripMarkers(red(pre(oneLine(x)))), max).trim())

const style = (v: unknown) =>
  fixpoint(capped(v, LIMITS.style), (x) => truncate(stripMarkers(maskCssUrls(oneLine(x))), LIMITS.style).trim())

function sanitizeComment(v: unknown): string {
  // só segredos: e-mail e texto comum ficam, o usuário os escreve de propósito
  return fixpoint(capped(v, LIMITS.comment), (x) => truncate(stripMarkers(redactSecrets(multiLine(x))), LIMITS.comment).trim())
}

const finiteInt = (v: unknown, min: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.round(v)) : 0

const opt = <T extends object, K extends string>(obj: T, key: K, value: string) => {
  if (value !== '') (obj as Record<string, unknown>)[key] = value
}

function sanitizeTarget(t: FeedbackTarget): FeedbackTarget {
  const out: FeedbackTarget = {
    mode: 'element',
    selector: redLine(t.selector, LIMITS.selector),
    box: {
      x: finiteInt(t.box?.x, -1e9),
      y: finiteInt(t.box?.y, -1e9),
      w: finiteInt(t.box?.w, 0),
      h: finiteInt(t.box?.h, 0),
    },
  }
  opt(out, 'text', redLine(t.text, LIMITS.text))
  const styles: Partial<Record<StyleKey, string>> = {}
  for (const k of STYLE_KEYS) {
    const val = style(t.styles?.[k])
    if (val) styles[k] = val
  }
  if (Object.keys(styles).length) out.styles = styles
  if (t.vue && s(t.vue.name)) {
    const vue: { name: string; file?: string } = { name: line(t.vue.name, LIMITS.short) }
    opt(vue, 'file', line(t.vue.file, LIMITS.vueFile))
    if (vue.name) out.vue = vue
  }
  return out
}

/** Lança se `id` não for UUID v4: o id vai para o rodapé do Markdown e para o nome do arquivo, nunca é limpo em silêncio. */
export function sanitizeNote(note: FeedbackNote): FeedbackNote {
  if (typeof note?.id !== 'string' || !UUID_V4_RE.test(note.id)) throw new TypeError('sanitizeNote: id deve ser UUID v4')
  const project: FeedbackNote['project'] = { name: line(note.project?.name, LIMITS.short) }
  opt(project, 'version', line(note.project?.version, LIMITS.short))
  opt(project, 'commit', line(note.project?.commit, LIMITS.short))

  const page = note.page
  const theme: Theme = THEMES.includes(page?.theme) ? page.theme : 'unknown'
  const dpr = typeof page?.viewport?.dpr === 'number' && Number.isFinite(page.viewport.dpr) && page.viewport.dpr > 0
    ? Math.round(page.viewport.dpr * 100) / 100
    : 1

  const out: FeedbackNote = {
    schema: SCHEMA_ID,
    id: note.id,
    createdAt: note.createdAt,
    project,
    kind: note.kind,
    severity: note.severity,
    comment: sanitizeComment(note.comment),
    target: note.target ? sanitizeTarget(note.target) : null,
    page: {
      url: redLine(stripQueryHash(s(page?.url)), LIMITS.url, (x) => maskUrlPath(x)),
      route: redLine(stripQueryHash(s(page?.route)), LIMITS.route, maskRoute),
      title: redLine(page?.title, LIMITS.title),
      viewport: { w: finiteInt(page?.viewport?.w, 0), h: finiteInt(page?.viewport?.h, 0), dpr },
      scrollY: finiteInt(page?.scrollY, 0),
      theme,
    },
    consoleErrors: (Array.isArray(note.consoleErrors) ? note.consoleErrors : [])
      .slice(-LIMITS.consoleErrors)
      .map((e) => ({ ts: s(e?.ts), message: redLine(e?.message, LIMITS.consoleMessage, undefined, redactConsole) }))
      .filter((e) => e.message !== ''),
  }
  // chaves opcionais no fim, em ordem estável
  const withOpt: FeedbackNote = { ...out }
  const from = line(note.from, LIMITS.short)
  const to = line(note.to, LIMITS.short)
  const replyTo = s(note.replyTo)
  const ordered: Record<string, unknown> = {}
  for (const k of ['schema', 'id', 'createdAt', 'project'] as const) ordered[k] = withOpt[k]
  if (from) ordered.from = from
  if (to) ordered.to = to
  if (replyTo) ordered.replyTo = replyTo
  for (const k of ['kind', 'severity', 'comment', 'target', 'page', 'consoleErrors'] as const) ordered[k] = withOpt[k]
  return ordered as unknown as FeedbackNote
}

/** Mascara segmentos de caminho de uma URL absoluta sem tocar em host e porta. */
function maskUrlPath(url: string): string {
  const m = /^([a-z][a-z0-9+.-]*:\/\/[^/]*)(\/.*)?$/i.exec(url)
  if (!m) return maskRoute(url)
  return (m[1] ?? '') + maskRoute(m[2] ?? '')
}
