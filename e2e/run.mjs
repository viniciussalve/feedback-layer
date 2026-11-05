// E2E do Feedback Layer: navegador real (Edge via Playwright), bridge real, página com CSS agressivo.
//   npm run build && npm run e2e
// Saídas: e2e/screenshots/*.png. Falha (exit 1) se qualquer verificação falhar.
import assert from 'node:assert/strict'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { startBridge } from '../packages/bridge/dist/server.js'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SHOTS = join(ROOT, 'e2e', 'screenshots')
const TMP = join(ROOT, 'e2e', '.tmp')
const PORT = 4173
const BRIDGE_PORT = 7777
const PAGE = `http://localhost:${PORT}/examples/plain-html/index.html`
const SECRETS = ['hunter2-senha', 'segredo-do-textarea', 'opcao-secreta', 'texto-editavel-privado', 'conteudo-ignorado', 'ana@exemplo.com']

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' }
const web = createServer((req, res) => {
  const p = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^([/\\])+/, '')
  const file = resolve(ROOT, p)
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end('nope')
    return
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})

let bridge
let inbox
async function startBridgeFresh() {
  inbox = join(TMP, `inbox-${Date.now()}`)
  bridge = await startBridge({ inboxDir: inbox, origins: [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`], port: BRIDGE_PORT })
}
const files = async () => {
  try {
    return (await readdir(inbox)).sort()
  } catch {
    return []
  }
}
async function until(fn, ms = 4000) {
  const t = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() - t > ms) throw new Error('timeout esperando condição')
    await new Promise((r) => setTimeout(r, 50))
  }
}

const results = []
let browser
async function test(name, opts, fn) {
  const ctx = await browser.newContext({
    viewport: { width: opts.w ?? 1280, height: opts.h ?? 800 },
    deviceScaleFactor: opts.dpr ?? 1,
    hasTouch: !!opts.touch,
    isMobile: !!opts.touch,
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  try {
    const q = `${opts.theme ? `theme=${opts.theme}` : ''}${opts.dodge ? '&dodge=1' : ''}`
    await page.goto(`${PAGE}?${q}`)
    await page.locator('.fab').waitFor({ state: 'visible' })
    await fn(page, ctx)
    assert.deepEqual(errors, [], 'erros de página inesperados')
    results.push({ name, ok: true })
    console.log(`  ok   ${name}`)
  } catch (e) {
    results.push({ name, ok: false, error: e })
    console.log(`  FAIL ${name}\n       ${String(e?.message ?? e).split('\n').join('\n       ')}`)
    await page.screenshot({ path: join(SHOTS, `FAIL-${name.replace(/\W+/g, '-')}.png`) }).catch(() => {})
  } finally {
    await ctx.close()
  }
}

const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) })
const rectOf = (page, sel) => page.locator(sel).first().evaluate((el) => {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
})
const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
const overlaps = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
const shadowActive = (page) =>
  page.evaluate(() => {
    const a = document.querySelector('feedback-layer')?.shadowRoot?.activeElement
    return a ? { tag: a.tagName, cls: a.className, act: a.getAttribute('data-act'), ref: a.getAttribute('data-ref') } : null
  })

async function pickAt(page, selector, position) {
  if (!(await page.locator('.toolbar').isVisible())) await page.locator('.fab').click()
  if ((await page.locator('[data-act="pick"]').getAttribute('aria-pressed')) !== 'true') await page.locator('[data-act="pick"]').click()
  await page.locator(selector).click(position ? { position } : {})
  await page.locator('.popover').waitFor({ state: 'visible' })
}

async function latestNote() {
  const names = (await files()).filter((f) => f.endsWith('.json'))
  const last = names[names.length - 1]
  const base = last.replace(/\.json$/, '')
  return {
    json: JSON.parse(await readFile(join(inbox, `${base}.json`), 'utf8')),
    jsonText: await readFile(join(inbox, `${base}.json`), 'utf8'),
    md: await readFile(join(inbox, `${base}.md`), 'utf8'),
    base,
  }
}

async function main() {
  await rm(SHOTS, { recursive: true, force: true })
  await rm(TMP, { recursive: true, force: true })
  await mkdir(SHOTS, { recursive: true })
  await new Promise((r) => web.listen(PORT, '127.0.0.1', r))
  await startBridgeFresh()
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  console.log('Feedback Layer e2e (Edge)')

  await test('desktop escuro: fluxo completo até o inbox', { theme: 'dark' }, async (page) => {
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-feedback-layer')), 'visible')
    await shot(page, '01-desktop-dark-fechado')
    await page.locator('.fab').click()
    assert.equal(await page.locator('.fab').getAttribute('aria-expanded'), 'true')
    await shot(page, '02-desktop-dark-barra')
    await page.locator('[data-act="pick"]').click()
    assert.equal(await page.locator('[data-act="pick"]').getAttribute('aria-pressed'), 'true')
    await page.evaluate(() => document.getElementById('item-3').scrollIntoView({ block: 'center' }))
    const item = await rectOf(page, '#item-3')
    await page.mouse.move(center(item).x, center(item).y)
    await page.locator('.hl').waitFor({ state: 'visible' })
    await page.locator('.chip').waitFor({ state: 'visible' })
    assert.match(await page.locator('.chip .sel').textContent(), /item-3/)
    await shot(page, '03-desktop-dark-realce')
    await page.mouse.click(center(item).x, center(item).y)
    await page.locator('.popover').waitFor({ state: 'visible' })
    assert.match(await page.locator('[data-ref="sel"]').textContent(), /item-3/)
    assert.equal((await shadowActive(page)).tag, 'TEXTAREA')
    await page.keyboard.type('O item 3 está desalinhado em relação ao título.')
    await page.locator('[data-ref="ctxbox"] summary').click()
    await page.locator('[data-ref="prevbox"] summary').click()
    await until(async () => /item-3/.test(await page.locator('[data-ref="preview"]').textContent()))
    const preview = await page.locator('[data-ref="preview"]').textContent()
    for (const s of SECRETS) assert.ok(!preview.includes(s), `prévia vaza ${s}`)
    const pop = await rectOf(page, '.popover')
    assert.ok(pop.left >= 0 && pop.top >= 0 && pop.right <= 1280 && pop.bottom <= 800, `popover fora da tela ${JSON.stringify(pop)}`)
    await shot(page, '04-desktop-dark-popover')
    await page.locator('[data-ref="send"]').click()
    await page.locator('.sent').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-ref="sentto"]').textContent(), 'Enviado para inbox')
    await shot(page, '05-desktop-dark-enviado')
    const n = await latestNote()
    assert.equal(n.json.schema, 'feedback-note/v1')
    assert.equal(n.json.project.name, 'plain-html-example')
    assert.equal(n.json.from, 'vini')
    assert.match(n.json.target.selector, /item-3/)
    assert.equal(n.json.page.theme, 'dark')
    assert.equal(n.json.page.viewport.w, 1280)
    assert.ok(n.json.consoleErrors.some((e) => e.message.includes('Falha de exemplo')), 'erro de console ausente')
    assert.ok(n.json.target.styles && n.json.target.box.w > 0, 'estilos/caixa ausentes')
    assert.ok(n.md.includes('O item 3 está desalinhado'))
    assert.ok(n.md.trimEnd().endsWith(`<!-- feedback-note:v1 id=${n.json.id} -->`))
    // o Markdown do inbox é o que a prévia mostrou, a menos de id/hora (mesma função, mesma nota)
    assert.equal(n.md.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'T'), preview.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'T').replace(/id=[0-9a-f-]{36}/, `id=${n.json.id}`))
  })

  await test('privacidade: container com campos sensíveis não vaza nada para o .json/.md', { theme: 'dark' }, async (page) => {
    await pickAt(page, '#signup', { x: 2, y: 2 })
    assert.match(await page.locator('[data-ref="sel"]').textContent(), /signup/)
    await page.keyboard.type('revisar o formulário')
    await page.locator('[data-ref="send"]').click()
    await page.locator('.sent').waitFor({ state: 'visible' })
    const n = await latestNote()
    for (const s of SECRETS) {
      assert.ok(!n.jsonText.includes(s), `.json vaza ${s}`)
      assert.ok(!n.md.includes(s), `.md vaza ${s}`)
    }
    assert.match(n.json.target.text, /Cadastro/)
    // alvo = campo de senha: texto vazio e "valor protegido"
    await page.locator('[data-ref="sentclose"]').click()
    await pickAt(page, '#pw')
    assert.equal(await page.locator('[data-ref="note"]').textContent(), 'valor protegido')
    await page.keyboard.type('campo de senha')
    await page.locator('[data-ref="send"]').click()
    await page.locator('.sent').waitFor({ state: 'visible' })
    const p = await latestNote()
    assert.equal(p.json.target.text ?? '', '')
    for (const s of SECRETS) assert.ok(!p.jsonText.includes(s) && !p.md.includes(s), `senha: vaza ${s}`)
    // alvo dentro de data-feedback-ignore
    await page.locator('[data-ref="sentclose"]').click()
    await pickAt(page, '#ignored-inner')
    assert.equal(await page.locator('[data-ref="note"]').textContent(), 'valor protegido')
  })

  await test('rolagem continua durante a seleção; item abaixo da dobra do painel é selecionável', { theme: 'dark' }, async (page) => {
    await page.evaluate(() => document.getElementById('panel').scrollIntoView({ block: 'center' }))
    const panel = await rectOf(page, '#panel')
    const before = await rectOf(page, '#item-25')
    assert.ok(before.top > panel.bottom, 'item-25 deveria estar abaixo da dobra')
    await page.locator('.fab').click()
    await page.locator('[data-act="pick"]').click()
    const pc = center(panel)
    await page.mouse.move(pc.x, pc.y)
    let moved = 0
    await until(async () => {
      await page.mouse.wheel(0, 100)
      moved = await page.locator('#panel').evaluate((el) => el.scrollTop)
      const r = await rectOf(page, '#item-25')
      return r.top >= panel.top && r.bottom <= panel.bottom
    }, 8000)
    assert.ok(moved > 0, 'o painel não rolou durante a seleção')
    const r = await rectOf(page, '#item-25')
    await page.mouse.click(center(r).x, center(r).y)
    await page.locator('.popover').waitFor({ state: 'visible' })
    assert.match(await page.locator('[data-ref="sel"]').textContent(), /item-25/)
    assert.equal(await page.evaluate(() => document.querySelectorAll('feedback-layer').length), 1)
  })

  await test('isolamento: CSS agressivo do host não altera o botão nem o popover (e vice-versa)', { theme: 'dark' }, async (page) => {
    const styleCount = await page.evaluate(() => document.querySelectorAll('style').length)
    const hostBtnBefore = await page.locator('#buy').evaluate((el) => getComputedStyle(el).borderTopWidth)
    const fab = await page.locator('.fab').evaluate((el) => {
      const s = getComputedStyle(el)
      return { bg: s.backgroundColor, color: s.color, font: s.fontFamily, bw: s.borderTopWidth, w: s.width, tt: s.textTransform, ls: s.letterSpacing, tr: s.transform, op: s.opacity, content: getComputedStyle(el, '::before').content }
    })
    assert.equal(fab.bg, 'rgb(249, 250, 251)', `fundo do botão (inverso do tema escuro): ${fab.bg}`)
    assert.equal(fab.color, 'rgb(21, 21, 23)')
    assert.ok(!/comic/i.test(fab.font), fab.font)
    assert.equal(fab.bw, '1px')
    assert.equal(fab.w, '44px')
    assert.equal(fab.tt, 'none')
    assert.equal(fab.ls, 'normal')
    assert.equal(fab.tr, 'none')
    assert.equal(fab.op, '1')
    assert.ok(fab.content === 'none' || fab.content === 'normal', fab.content)
    await pickAt(page, '#buy')
    const pop = await page.locator('.popover').evaluate((el) => {
      const s = getComputedStyle(el)
      const ta = getComputedStyle(el.querySelector('textarea'))
      const btn = getComputedStyle(el.querySelector('.btn.primary'))
      return { w: s.width, font: ta.fontFamily, taBorder: ta.borderTopStyle, primary: btn.backgroundColor, primaryBorder: btn.borderTopStyle, tt: btn.textTransform }
    })
    assert.ok(parseFloat(pop.w) <= 352, pop.w)
    assert.ok(!/comic/i.test(pop.font), pop.font)
    assert.equal(pop.taBorder, 'solid')
    assert.notEqual(pop.primary, 'rgb(255, 0, 0)')
    assert.equal(pop.primary, 'rgb(168, 85, 247)', 'primário usa o --accent do host')
    assert.equal(pop.tt, 'none')
    assert.equal(await page.locator('#buy').evaluate((el) => getComputedStyle(el).borderTopWidth), hostBtnBefore, 'a camada alterou o CSS do host')
    assert.equal(await page.evaluate(() => document.querySelectorAll('style').length), styleCount, 'a camada injetou <style> no documento')
    assert.equal(await page.evaluate(() => document.querySelectorAll('button').length), 2 + 0, 'botões da camada vazaram para o light DOM')
    await shot(page, '06-isolamento-popover')
  })

  await test('360px claro: bottom sheet, espaçador, Esc devolve o foco', { w: 360, h: 740, dpr: 2, theme: 'light', touch: true }, async (page) => {
    await shot(page, '07-mobile-light-fechado')
    // o conteúdo final não fica atrás do botão
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const last = await rectOf(page, '#last')
    const fab = await rectOf(page, '.fab')
    assert.ok(!overlaps(last, fab), `botão cobre o último conteúdo: ${JSON.stringify({ last, fab })}`)
    await page.locator('.fab').tap()
    await page.locator('[data-act="pick"]').tap()
    await page.evaluate(() => window.scrollTo(0, 0))
    const buy = await rectOf(page, '#buy')
    await page.touchscreen.tap(Math.min(center(buy).x, 200), center(buy).y)
    await page.locator('.popover').waitFor({ state: 'visible' })
    assert.ok(await page.locator('.popover').evaluate((el) => el.classList.contains('sheet')), 'esperava bottom sheet')
    const pop = await rectOf(page, '.popover')
    assert.ok(pop.left >= 0 && pop.right <= 360 && pop.bottom <= 740 && pop.top >= 0, `popover fora da tela: ${JSON.stringify(pop)}`)
    assert.ok((await page.locator('#comment').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))) >= 16, 'textarea < 16px dá zoom no iOS')
    await shot(page, '08-mobile-light-sheet')
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.popover').isHidden(), true)
    assert.equal((await shadowActive(page)).cls, 'fab')
    assert.equal(await page.locator('.dock').evaluate((el) => getComputedStyle(el).visibility), 'visible', 'botão deve voltar a aparecer')
    const widthWith = await page.evaluate(() => document.documentElement.scrollWidth)
    await page.evaluate(() => document.querySelector('feedback-layer').hide())
    const widthWithout = await page.evaluate(() => document.documentElement.scrollWidth)
    await page.evaluate(() => document.querySelector('feedback-layer').show())
    assert.equal(widthWith, widthWithout, 'a camada causou rolagem horizontal')
    await shot(page, '09-mobile-light-apos-esc')
  })

  await test('só teclado: Tab até o botão, anel de foco, seleção por Enter, envio, Esc volta o foco', { theme: 'dark' }, async (page) => {
    await page.evaluate(() => document.activeElement?.blur?.())
    await until(async () => {
      await page.keyboard.press('Tab')
      return page.evaluate(() => document.activeElement?.tagName === 'FEEDBACK-LAYER')
    }, 8000)
    assert.equal((await shadowActive(page)).cls, 'fab')
    const ring = await page.locator('.fab').evaluate((el) => {
      const s = getComputedStyle(el)
      return { style: s.outlineStyle, w: s.outlineWidth, color: s.outlineColor }
    })
    assert.equal(ring.style, 'solid', 'sem anel de foco visível')
    assert.notEqual(ring.w, '0px')
    await shot(page, '10-teclado-foco-fab')
    await page.keyboard.press('Enter')
    assert.equal(await page.locator('.toolbar').isVisible(), true)
    await page.keyboard.press('Tab')
    assert.equal((await shadowActive(page)).act, 'pick')
    await page.keyboard.press('Enter')
    assert.equal(await page.locator('[data-act="pick"]').getAttribute('aria-pressed'), 'true')
    // volta para um elemento da página e seleciona com Enter
    await page.keyboard.press('Shift+Tab') // fab
    await page.keyboard.press('Shift+Tab') // último focável da página
    const target = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)
    assert.notEqual(target, 'FEEDBACK-LAYER')
    await page.locator('.hl').waitFor({ state: 'visible' })
    await shot(page, '11-teclado-realce')
    await page.keyboard.press('Enter')
    await page.locator('.popover').waitFor({ state: 'visible' })
    assert.equal((await shadowActive(page)).tag, 'TEXTAREA')
    await page.keyboard.type('feito só com o teclado')
    await page.keyboard.press('Control+Enter')
    await page.locator('.sent').waitFor({ state: 'visible' })
    assert.equal((await shadowActive(page)).ref, 'sentclose')
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.popover').isHidden(), true)
    assert.equal((await shadowActive(page)).cls, 'fab')
    const n = await latestNote()
    assert.ok(n.md.includes('feito só com o teclado'))
  })

  await test('atalho Alt+Shift+F esconde/mostra, tira o atributo do <html> e anuncia', { theme: 'dark' }, async (page) => {
    await page.keyboard.press('Alt+Shift+F')
    await page.locator('.fab').waitFor({ state: 'hidden' })
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-feedback-layer')), false)
    assert.equal(await page.evaluate(() => !!document.querySelector('[data-feedback-layer-spacer]')), false)
    await until(async () => (await page.locator('.live').textContent()).includes('Atalho para mostrar: Alt+Shift+F'))
    await page.keyboard.press('Alt+Shift+F')
    await page.locator('.fab').waitFor({ state: 'visible' })
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-feedback-layer')), 'visible')
    await page.evaluate(() => document.querySelector('feedback-layer').hide())
    await page.locator('.fab').waitFor({ state: 'hidden' })
    await page.evaluate(() => document.querySelector('feedback-layer').show())
    await page.locator('.fab').waitFor({ state: 'visible' })
  })

  await test('desvio automático de barra fixa do host; escolha do usuário não é desfeita', { theme: 'dark', dodge: true }, async (page) => {
    const bar = await rectOf(page, '#bar')
    const fab = await rectOf(page, '.fab')
    assert.ok(!overlaps(bar, fab), `botão sobre a barra do host: ${JSON.stringify({ bar, fab })}`)
    await page.setViewportSize({ width: 900, height: 600 })
    await page.waitForTimeout(150)
    const bar2 = await rectOf(page, '#bar')
    const fab2 = await rectOf(page, '.fab')
    assert.ok(!overlaps(bar2, fab2), `depois de redimensionar: ${JSON.stringify({ bar2, fab2 })}`)
    await shot(page, '12-desvio-barra-fixa')
    await page.locator('.fab').focus()
    await page.keyboard.press('Shift+ArrowUp')
    await page.keyboard.press('Shift+ArrowLeft')
    const moved = await rectOf(page, '.fab')
    assert.ok(moved.left < 100 && moved.top < 100, `esperava canto superior esquerdo: ${JSON.stringify(moved)}`)
    await page.setViewportSize({ width: 1000, height: 700 })
    await page.waitForTimeout(150)
    const still = await rectOf(page, '.fab')
    assert.ok(still.left < 100 && still.top < 100, 'o desvio moveu um botão que o usuário já posicionou')
    await page.reload()
    await page.locator('.fab').waitFor({ state: 'visible' })
    const persisted = await rectOf(page, '.fab')
    assert.ok(persisted.left < 100 && persisted.top < 100, 'posição escolhida não persistiu')
  })

  await test('arrastar o botão com limiar de 4 px; clique curto abre a barra', { theme: 'dark' }, async (page) => {
    const f = center(await rectOf(page, '.fab'))
    await page.mouse.move(f.x, f.y)
    await page.mouse.down()
    await page.mouse.move(f.x + 2, f.y + 2)
    await page.mouse.up()
    assert.equal(await page.locator('.toolbar').isVisible(), true, 'movimento < 4px deve contar como clique')
    await page.locator('.fab').click()
    const g = center(await rectOf(page, '.fab'))
    await page.mouse.move(g.x, g.y)
    await page.mouse.down()
    await page.mouse.move(80, 80, { steps: 8 })
    await page.mouse.up()
    assert.equal(await page.locator('.dock').getAttribute('data-corner'), 'tl')
    assert.equal(await page.locator('.toolbar').isVisible(), false, 'arrastar não deve abrir a barra')
  })

  await test('bridge offline: botão principal vira "Copiar nota" e o clipboard recebe o Markdown', { theme: 'dark' }, async (page) => {
    await bridge.close()
    try {
      await pickAt(page, '#buy')
      await until(async () => (await page.locator('[data-ref="send"]').textContent()) === 'Copiar nota')
      assert.equal(await page.locator('[data-ref="offbanner"]').isVisible(), true)
      assert.equal(await page.locator('[data-act="copy"]').isHidden(), true)
      await shot(page, '13-bridge-offline')
      await page.keyboard.type('sem bridge')
      await page.locator('[data-ref="send"]').click()
      await until(async () => (await page.locator('[data-ref="status"]').textContent()) === 'Copiado')
      // o Windows devolve a área de transferência com CRLF; o texto copiado usa LF
      const clip = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')
      assert.ok(clip.includes('sem bridge'))
      assert.match(clip, /<!-- feedback-note:v1 id=[0-9a-f-]{36} -->\n$/)
      for (const s of SECRETS) assert.ok(!clip.includes(s))
    } finally {
      await startBridgeFresh()
    }
  })

  await browser.close()
  await new Promise((r) => web.close(r))
  await bridge.close().catch(() => {})
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} cenários passaram. Capturas em e2e/screenshots/`)
  process.exit(failed.length ? 1 : 0)
}

main().catch(async (e) => {
  console.error(e)
  await browser?.close().catch(() => {})
  process.exit(1)
})
