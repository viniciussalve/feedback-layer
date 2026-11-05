import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { AddressInfo } from 'node:net'
import { LIMITS, sanitizeNote, toJSON, toMarkdown, validateNote } from '@feedback-layer/core/note'

/**
 * Bridge local: recebe `POST /notes` (JSON) do navegador e grava em `inbox/`.
 * Contrato: PLANS/FEEDBACK_NOTE_V1.md. Segurança:
 *  - escuta só em 127.0.0.1;
 *  - valida `Host` (anti DNS rebinding) e `Origin` (lista configurada);
 *  - corpo máx. 64 KB; validação estrita; `sanitizeNote` roda aqui também (não confia no cliente);
 *  - o Markdown é gerado aqui com a mesma `toMarkdown` do core;
 *  - nome de arquivo = horário do servidor + 8 hex do id; nunca grava fora de `inbox/`.
 */

export interface BridgeOptions {
  inboxDir: string
  /** Origens permitidas (ex.: `http://localhost:5173`). */
  origins: string[]
  /** Aceita requisições sem `Origin` (curl, agentes). `Host` ainda precisa ser local. Padrão: true. */
  allowNoOrigin?: boolean
  port?: number
  maxBodyBytes?: number
  now?: () => Date
}

export interface RunningBridge {
  server: Server
  port: number
  close(): Promise<void>
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])
const FILE_RE = /^[0-9TZ-]+_[0-9a-f]{8}\.(md|json)$/

function hostnameOf(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null
  if (hostHeader.startsWith('[')) return null // IPv6 literal: não é um host local permitido
  return hostHeader.split(':')[0]!.toLowerCase()
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    ...headers,
  })
  res.end(data)
}

class TooLarge extends Error {}
const DRAIN_LIMIT = 1024 * 1024

function readBody(req: IncomingMessage, max: number): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const declared = Number(req.headers['content-length'])
    if (Number.isFinite(declared) && declared > max) return reject(new TooLarge())
    const chunks: Buffer[] = []
    let size = 0
    let rejected = false
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > max) {
        if (!rejected) {
          rejected = true
          reject(new TooLarge())
        }
        if (size > max + DRAIN_LIMIT) req.destroy() // descarta o resto (com teto) para o cliente receber o 413
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function createBridge(opts: BridgeOptions): Server {
  const inbox = resolve(opts.inboxDir)
  const origins = new Set(opts.origins)
  const allowNoOrigin = opts.allowNoOrigin ?? true
  const maxBody = opts.maxBodyBytes ?? LIMITS.bodyBytes
  const now = opts.now ?? (() => new Date())
  const inflight = new Set<string>()

  async function exists(id: string): Promise<boolean> {
    const id8 = id.slice(0, 8).toLowerCase()
    for (const f of await readdir(inbox)) {
      if (!f.endsWith(`_${id8}.json`)) continue
      try {
        const prev = JSON.parse(await readFile(join(inbox, f), 'utf8')) as { id?: string }
        if (prev.id?.toLowerCase() === id.toLowerCase()) return true
      } catch {
        // arquivo ilegível: ignora
      }
    }
    return false
  }

  async function atomicWrite(name: string, content: string): Promise<void> {
    if (!FILE_RE.test(name)) throw new Error('nome de arquivo inválido')
    const target = resolve(inbox, name)
    if (dirname(target) !== inbox) throw new Error('caminho fora do inbox')
    const tmp = resolve(inbox, `.${name}.tmp`)
    await writeFile(tmp, content, { encoding: 'utf8', flag: 'w' })
    await rename(tmp, target)
  }

  return createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) send(res, 500, { error: 'erro interno' })
      else res.end()
    })
  })

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // 1. Host (anti DNS rebinding)
    const host = hostnameOf(req.headers.host)
    if (!host || !LOCAL_HOSTS.has(host)) return send(res, 403, { error: 'host não permitido' })

    // 2. Origin
    const origin = req.headers.origin
    const cors: Record<string, string> = { Vary: 'Origin' }
    if (origin !== undefined) {
      if (!origins.has(origin)) return send(res, 403, { error: 'origin não permitida' }, cors)
      cors['Access-Control-Allow-Origin'] = origin
      cors['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
      cors['Access-Control-Allow-Headers'] = 'Content-Type'
      cors['Access-Control-Max-Age'] = '600'
      if (req.headers['access-control-request-private-network']) cors['Access-Control-Allow-Private-Network'] = 'true'
    } else if (!allowNoOrigin) {
      return send(res, 403, { error: 'origin ausente' }, cors)
    }

    const path = (req.url ?? '').split('?')[0]
    if (path === '/health' && req.method === 'GET') return send(res, 200, { ok: true }, cors)
    if (path !== '/notes') return send(res, 404, { error: 'não encontrado' }, cors)
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors)
      return void res.end()
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'método não permitido' }, { ...cors, Allow: 'POST, OPTIONS' })

    // 3. Content-Type: só application/json (text/plain não exige preflight de CORS)
    const ctype = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    if (ctype !== 'application/json') {
      req.resume()
      return send(res, 415, { error: 'Content-Type deve ser application/json' }, cors)
    }

    // 3b. corpo
    let body: string
    try {
      body = await readBody(req, maxBody)
    } catch (e) {
      if (e instanceof TooLarge) {
        return send(res, 413, { error: `corpo acima de ${maxBody} bytes` }, { ...cors, Connection: 'close' })
      }
      return send(res, 400, { error: 'corpo ilegível' }, cors)
    }
    let raw: unknown
    try {
      raw = JSON.parse(body)
    } catch {
      return send(res, 400, { error: 'JSON inválido' }, cors)
    }

    // 4. validação estrita (chaves desconhecidas, tipos, limites, uma linha, UUID, ISO) e sanitização
    const checked = validateNote(raw)
    if (!checked.ok) return send(res, 400, { error: 'nota inválida', errors: checked.errors.slice(0, 20) }, cors)
    const note = sanitizeNote(checked.note)

    // 5. grava em inbox/
    await mkdir(inbox, { recursive: true })
    const key = note.id.toLowerCase()
    if (inflight.has(key)) return send(res, 409, { error: 'id repetido' }, cors)
    inflight.add(key) // síncrono, antes de qualquer await: dois POSTs simultâneos com o mesmo id, só o primeiro grava
    try {
      if (await exists(note.id)) return send(res, 409, { error: 'id repetido' }, cors)
      const stamp = now().toISOString().replace(/[:.]/g, '')
      const base = `${stamp}_${note.id.slice(0, 8).toLowerCase()}`
      await atomicWrite(`${base}.json`, toJSON(note))
      await atomicWrite(`${base}.md`, toMarkdown(note))
      send(res, 201, { ok: true, id: note.id, file: `${base}.md` }, cors)
    } finally {
      inflight.delete(key)
    }
  }
}

export async function startBridge(opts: BridgeOptions): Promise<RunningBridge> {
  const server = createBridge(opts)
  await new Promise<void>((ok, fail) => {
    server.once('error', fail)
    server.listen(opts.port ?? 0, '127.0.0.1', () => ok())
  })
  const port = (server.address() as AddressInfo).port
  return {
    server,
    port,
    close: () =>
      new Promise<void>((ok, fail) => {
        server.close((err) => (err ? fail(err) : ok()))
        server.closeAllConnections?.()
      }),
  }
}
