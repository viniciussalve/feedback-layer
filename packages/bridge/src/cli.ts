#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { startBridge } from './server.js'

const HELP = `feedback-bridge: recebe notas do Feedback Layer e grava em inbox/

Uso: feedback-bridge [--port 7777] [--inbox ./inbox] [--origin http://localhost:5173]... [--no-anonymous]

  --port        porta em 127.0.0.1 (padrão 7777)
  --inbox       pasta de saída (padrão ./inbox)
  --origin      origem permitida; repita ou separe por vírgula.
                Padrão: http://localhost:5173, http://127.0.0.1:5173, http://localhost:4173, http://127.0.0.1:4173
                (também FEEDBACK_BRIDGE_ORIGINS)
  --no-anonymous  recusa requisições sem Origin (curl/agentes)
`

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '7777' },
    inbox: { type: 'string', default: 'inbox' },
    origin: { type: 'string', multiple: true },
    'no-anonymous': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

if (values.help) {
  console.log(HELP)
  process.exit(0)
}

const fromEnv = (process.env.FEEDBACK_BRIDGE_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const given = (values.origin ?? []).flatMap((o) => o.split(',')).map((s) => s.trim()).filter(Boolean)
const origins = given.length
  ? given
  : fromEnv.length
    ? fromEnv
    : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']

const port = Number(values.port)
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('--port inválida')
  process.exit(1)
}

const inboxDir = resolve(values.inbox!)
const bridge = await startBridge({ inboxDir, origins, port, allowNoOrigin: !values['no-anonymous'] })
console.log(`feedback-bridge em http://127.0.0.1:${bridge.port}  inbox=${inboxDir}`)
console.log(`origens permitidas: ${origins.join(', ')}${values['no-anonymous'] ? '' : '  (+ requisições sem Origin)'}`)
