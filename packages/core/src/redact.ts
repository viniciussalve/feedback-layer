/**
 * Redação e limpeza de texto. Todas as funções são puras e idempotentes
 * (f(f(x)) === f(x)); o teste em test/sanitize.test.ts confere isso.
 */

const JWT_RE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.?[A-Za-z0-9_-]*/g
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi

// --- chave/valor ---------------------------------------------------------------------------------
// Nomes sensíveis casados como SUFIXO (access_token, client_secret, dbPassword) ou como nome exato.
const NAME_SUFFIX = 'token|secret|password|passwd|pwd|senha|segredo|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credentials?'
// `pass` e `chave` só como nome inteiro (não pegam `compass` nem `chaveiro`)
const NAME_EXACT = 'authorization|auth|session|session[_-]?id|sessionid|sid|cookie|set-cookie|pass|chave'
// Prefixo limitado a 48 caracteres: sem isso, uma sequência longa de `-`/`_` custa tempo quadrático.
const NAME = `(?<![A-Za-z0-9])((?:[A-Za-z0-9_.-]{0,48}(?:${NAME_SUFFIX})|${NAME_EXACT}))`
const QUOTE = '(?:\\\\?["\'])'
// valor: entre aspas (inclusive escapadas, de JSON dentro de string) ou até espaço, & , ; aspas ou }
const VAL_QUOTED = '"(?:[^"\\\\]|\\\\.)*"|\'[^\']*\'|\\\\"[^"\\\\]*\\\\"'
const SCHEME = '(?:Basic|Bearer|Digest|Negotiate|Token)'
const VAL_BARE = `(?!${SCHEME}[ \\t])[^\\s&,;"'}]+`
const EQ_RE = new RegExp(`${NAME}(${QUOTE}?[ \\t]*=[ \\t]*)(${VAL_QUOTED}|${VAL_BARE})`, 'gi')
const COLON_RE = new RegExp(`${NAME}(${QUOTE}?[ \\t]*:[ \\t]*)(${VAL_QUOTED}|${VAL_BARE})`, 'gi')
const JSON_RE = new RegExp(`${NAME}(${QUOTE}[ \\t]*:[ \\t]*)(${VAL_QUOTED})`, 'gi')
// `Authorization: <esquema> <valor>`: mantém o esquema, redige o valor
const AUTH_HDR_RE = new RegExp(
  `(?<![A-Za-z0-9])((?:proxy-)?authorization)(${QUOTE}?[ \\t]*[:=][ \\t]*)(?!(?:${SCHEME}[ \\t]+)?\\[redacted\\])(${SCHEME}[ \\t]+)?[^\\s&,;"'}]+`,
  'gi',
)
// `cookie` e `set-cookie`: o valor vai até o fim da linha (`Cookie: a=1; b=2` inteiro)
const COOKIE_EQ_RE = new RegExp(`(?<![A-Za-z0-9])((?:set-)?cookie)(${QUOTE}?[ \\t]*=[ \\t]*)[^\\n]+`, 'gi')
const COOKIE_COLON_RE = new RegExp(`(?<![A-Za-z0-9])((?:set-)?cookie)(${QUOTE}?[ \\t]*:[ \\t]*)[^\\n]+`, 'gi')
// `code` (OAuth) só onde `comment` não chega: console e query string
const CODE_RE = new RegExp(`(?<![A-Za-z0-9_.-])(code)(${QUOTE}?[ \\t]*[=:][ \\t]*)(${VAL_QUOTED}|${VAL_BARE})`, 'gi')
const QUERY_CODE_RE = /([?&]code=)[^&\s#]+/gi
const URL_CREDS_RE = /(?<![a-z0-9+.-])([a-z][a-z0-9+.-]{0,31}:\/\/)[^\s/@:?#]+:[^\s/@]+@/gi
const KNOWN_KEY_RE =
  /\b(?:sk-[A-Za-z0-9_-]{8,}|[sr]k_(?:live|test)_[A-Za-z0-9]{8,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{8,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})/g
const CARD_RE = /(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g

const hideValue = (v: string): string =>
  v.startsWith('\\"') ? '\\"[redacted]\\"' : v.startsWith('"') ? '"[redacted]"' : v.startsWith("'") ? "'[redacted]'" : '[redacted]'
const kv = (_m: string, name: string, sep: string, val: string) => `${name}${sep}${hideValue(val)}`

function luhn(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

function redactCards(s: string): string {
  return s.replace(CARD_RE, (m) => {
    const digits = m.replace(/\D/g, '')
    return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? '[card]' : m
  })
}

const HEX_RE = /\b[0-9a-fA-F]{32,}\b/g
// sequência longa com letras e dígitos (base64url, chaves de API)
const LONG_TOKEN_RE = /(?<![A-Za-z0-9_-])(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}/g
const EMAIL_RE = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g

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

type Mode = 'comment' | 'text' | 'console'

function scrub(s: string, mode: Mode): string {
  let out = s
    .replace(JWT_RE, '[jwt]')
    .replace(AUTH_HDR_RE, (_m, name: string, sep: string, scheme?: string) => `${name}${sep}${scheme ?? ''}[redacted]`)
    .replace(BEARER_RE, 'Bearer [redacted]')
    .replace(URL_CREDS_RE, '$1[redacted]@')
    .replace(COOKIE_EQ_RE, '$1$2[redacted]')
    .replace(EQ_RE, kv)
    .replace(JSON_RE, kv)
  if (mode !== 'comment') out = out.replace(COOKIE_COLON_RE, '$1$2[redacted]').replace(COLON_RE, kv)
  if (mode !== 'comment') out = out.replace(QUERY_CODE_RE, '$1[redacted]')
  if (mode === 'console') out = out.replace(CODE_RE, kv)
  return redactCards(out.replace(KNOWN_KEY_RE, '[token]'))
    .replace(HEX_RE, '[token]')
    .replace(LONG_TOKEN_RE, '[token]')
}

/**
 * Só segredos, para o `comment`: JWT, Bearer, `Authorization: <esquema> <valor>`, `chave=valor` e JSON entre aspas,
 * credenciais em URL, chaves conhecidas, cartão (Luhn), hex e sequências longas.
 * Não casa `chave: valor` solto nem `code` ("senha: obrigatória" e "code=200" são texto comum).
 * É melhor esforço: não garante que nenhum segredo passe. NÃO cobertos (decisão da v1): valores em array
 * (`password:["a"]`), `Authorization: Digest username="x", response="abc"` e URL com usuário vazio (`redis://:senha@host`).
 */
export function redactSecrets(s: string): string {
  return scrub(s, 'comment')
}

/** Segredos (inclui `chave: valor` e `?code=`) + e-mail. Para url, route, title, text e selector. */
export function redact(s: string): string {
  return scrub(s, 'text').replace(EMAIL_RE, '[email]')
}

/** Como `redact`, e também `code=`/`code:` (OAuth). Para as mensagens do console. */
export function redactConsole(s: string): string {
  return scrub(s, 'console').replace(EMAIL_RE, '[email]')
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
