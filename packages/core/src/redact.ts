/**
 * Redação e limpeza de texto. Todas as funções são puras e idempotentes
 * (f(f(x)) === f(x)); o teste em test/sanitize.test.ts confere isso.
 */

const JWT_RE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.?[A-Za-z0-9_-]*/g
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi
const KEY_VALUE_RE = /\b(token|secret|password|passwd|pwd|api[_-]?key|access[_-]?key|authorization|auth|session|sid)=([^&\s]+)/gi
const HEX_RE = /\b[0-9a-fA-F]{32,}\b/g
// sequência longa com letras e dígitos (base64url, chaves de API)
const LONG_TOKEN_RE = /(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}/g
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g

const CONTROL_ALL = /[\u0000-\u001F\u007F-\u009F]/g
const CONTROL_KEEP_NL = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g
const BIDI = /[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g

/** Repete `fn` até estabilizar: garante idempotência mesmo quando uma etapa cria padrão para outra. */
export function fixpoint(s: string, fn: (x: string) => string): string {
  let cur = s
  for (let i = 0; i < 10; i++) {
    const next = fn(cur)
    if (next === cur) return next
    cur = next
  }
  return cur
}

/** Só segredos (JWT, Bearer, chave=valor, hex/base64 longos). Usada também no `comment`. */
export function redactSecrets(s: string): string {
  return s
    .replace(JWT_RE, '[jwt]')
    .replace(BEARER_RE, 'Bearer [redacted]')
    .replace(KEY_VALUE_RE, '$1=[redacted]')
    .replace(HEX_RE, '[token]')
    .replace(LONG_TOKEN_RE, '[token]')
}

/** Segredos + e-mail. Para url, route, title, text, selector e erros do console. */
export function redact(s: string): string {
  return redactSecrets(s).replace(EMAIL_RE, '[email]')
}

/** Remove marcadores que poderiam forjar o rodapé do Markdown ou fechar comentário HTML. */
export function stripMarkers(s: string): string {
  return fixpoint(s, (x) => x.replace(/feedback-note:/gi, '').replace(/<!--/g, '').replace(/--!?>/g, ''))
}

/** Uma linha: quebras viram espaço; sem controle nem bidi. */
export function oneLine(s: string): string {
  return s
    .replace(/[\r\n\t\u2028\u2029]+/g, ' ')
    .replace(CONTROL_ALL, '')
    .replace(BIDI, '')
    .replace(/ {2,}/g, ' ')
}

/** Várias linhas (comment): CRLF vira LF; tab vira espaço; sem controle (exceto LF) nem bidi. */
export function multiLine(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/\u2028|\u2029/g, '\n')
    .replace(/\t/g, ' ')
    .replace(CONTROL_KEEP_NL, '')
    .replace(BIDI, '')
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  let t = s.slice(0, max)
  const last = t.charCodeAt(t.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) t = t.slice(0, -1) // não deixa meio par substituto
  return t
}

const UUID_SEG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Segmento que parece id/token: UUID, número longo, hex longo, sequência longa mista. */
function looksLikeId(seg: string): boolean {
  if (UUID_SEG.test(seg)) return true
  if (/^\d{5,}$/.test(seg)) return true
  if (/^[0-9a-f]{16,}$/i.test(seg)) return true
  if (seg.length >= 20 && /\d/.test(seg) && /[A-Za-z]/.test(seg) && /^[A-Za-z0-9_-]+$/.test(seg)) return true
  return false
}

/** `/reset/<token>/x` -> `/reset/:id/x`. Não mexe em query/hash (use `stripQueryHash` antes). */
export function maskRoute(path: string): string {
  return path
    .split('/')
    .map((seg) => (looksLikeId(seg) ? ':id' : seg))
    .join('/')
}

export function stripQueryHash(s: string): string {
  const i = s.search(/[?#]/)
  return i === -1 ? s : s.slice(0, i)
}

/** `url(...)` em valores de CSS vira `[img]`. */
export function maskCssUrls(s: string): string {
  return s.replace(/url\s*\([^)]*\)?/gi, '[img]')
}
