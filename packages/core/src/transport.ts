import { toJSON, toMarkdown } from './markdown.js'
import type { FeedbackNote } from './schema.js'

export interface SendResult {
  ok: boolean
  /** Texto curto para o usuário (erro ou confirmação). */
  message?: string
  /** Onde a nota foi parar (ex.: nome do arquivo no inbox). */
  detail?: string
}

export interface Transport {
  name: string
  /** Para onde vai, em palavras ("inbox"). Aparece em "Enviado para …". */
  destination?: string
  send(note: FeedbackNote): Promise<SendResult>
  /** Opcional: o destino está acessível agora? Falso = a UI oferece só "Copiar nota". */
  check?(): Promise<boolean>
}

/** Copia texto: Clipboard API; se indisponível (http, permissão), cai para `execCommand`. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // tenta o fallback
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  ta.remove()
  return ok
}

/** Plano B: copia o Markdown da nota. */
export const clipboardTransport: Transport = {
  name: 'clipboard',
  async send(note) {
    const ok = await copyText(toMarkdown(note))
    return ok ? { ok: true, message: 'Copiado.' } : { ok: false, message: 'Não foi possível copiar.' }
  },
}

export interface HttpTransportOptions {
  /** Base do bridge, ex.: `http://127.0.0.1:7777`. A nota vai em `POST <url>/notes`. */
  url: string
  fetch?: typeof fetch
}

/** Envia só o JSON; o bridge valida, sanitiza e gera o .md. */
export function httpTransport(opts: HttpTransportOptions): Transport {
  const endpoint = `${opts.url.replace(/\/+$/, '')}/notes`
  return {
    name: 'bridge',
    destination: 'inbox',
    async check() {
      const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis)
      try {
        const ctl = new AbortController()
        const t = setTimeout(() => ctl.abort(), 1500)
        const res = await doFetch(`${opts.url.replace(/\/+$/, '')}/health`, { signal: ctl.signal })
        clearTimeout(t)
        return res.ok
      } catch {
        return false
      }
    },
    async send(note) {
      const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis)
      let res: Response
      try {
        res = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: toJSON(note),
        })
      } catch {
        return { ok: false, message: 'Bridge indisponível. Confira se está rodando.' }
      }
      if (res.ok) {
        let file: string | undefined
        try {
          file = ((await res.json()) as { file?: string }).file
        } catch {
          // sem corpo
        }
        return file ? { ok: true, message: 'Enviado.', detail: file } : { ok: true, message: 'Enviado.' }
      }
      if (res.status === 409) return { ok: true, message: 'Nota ja recebida.' } // reenvio de um id que o bridge ja gravou
      let detail = ''
      try {
        const body = (await res.json()) as { error?: string; errors?: string[] }
        detail = body.errors?.slice(0, 3).join('; ') ?? body.error ?? ''
      } catch {
        // corpo não é JSON
      }
      return { ok: false, message: `Bridge recusou (${res.status})${detail ? `: ${detail}` : ''}` }
    },
  }
}
