import { capturePage, captureTarget, getConsoleErrors } from './capture.js'
import { sanitizeNote } from './sanitize.js'
import { SCHEMA_ID, type FeedbackNote, type Kind, type Severity } from './schema.js'

export interface ProjectInfo {
  name: string
  version?: string
  commit?: string
}

export interface NoteInput {
  kind: Kind
  severity: Severity
  comment: string
  /** Elemento clicado; `null`/ausente = comentário geral. */
  element?: Element | null
  replyTo?: string
}

export interface ContextOptions {
  project: ProjectInfo
  from?: string
  to?: string
  getRoute?: () => string
}

/** UUID v4. `randomUUID` só existe em contexto seguro; `getRandomValues` funciona em qualquer um. */
export function uuidv4(): string {
  const c = globalThis.crypto
  if (typeof c.randomUUID === 'function') return c.randomUUID()
  const b = c.getRandomValues(new Uint8Array(16))
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/**
 * Monta a nota com o contexto atual da página e já devolve sanitizada
 * (é isso que vai para prévia, clipboard e transporte).
 */
export function buildNote(ctx: ContextOptions, input: NoteInput, target = input.element ? captureTarget(input.element) : null): FeedbackNote {
  const note: FeedbackNote = {
    schema: SCHEMA_ID,
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    project: { ...ctx.project },
    kind: input.kind,
    severity: input.severity,
    comment: input.comment,
    target,
    page: capturePage(ctx.getRoute),
    consoleErrors: getConsoleErrors(),
  }
  if (ctx.from) note.from = ctx.from
  if (ctx.to) note.to = ctx.to
  if (input.replyTo) note.replyTo = input.replyTo
  return sanitizeNote(note)
}
